// Check each claim against the run's own tool calls + results (before the answer) and git. Deterministic, no model.
// A subagent's report (delegate_task / Agent / Task result) is never evidence: a relayed claim is unsupported.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import type { RawCall, RawRun } from '../sources.js';
import { commandOf, editedFiles, isCommitCommand, isTest, kindOf, outcomeOf } from '../steps.js';
import type { Outcome } from '../types.js';
import { COUNT, KNOWN_PLACES, pathsIn, shasIn, type Clause } from './split.js';
import type { Claim, ClaimCategory, ClaimEvidence, Verdict } from './types.js';

const AGENT = new Set(['delegate_task', 'Agent', 'Task', 'spawn_agent', 'SendMessage']);
const EDIT_TOOLS = new Set(['write_file', 'patch', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'apply_patch']);
const READ_TOOLS = new Set(['read_file', 'Read', 'NotebookRead', 'search_files', 'Grep', 'Glob', 'skill_view', 'web_search', 'web_extract', 'WebFetch', 'WebSearch']);

/** one tool call, as evidence */
export interface Ev {
  call: RawCall;
  row: number;
  command: string | null;
  /** command + arguments, for matching names */
  input: string;
  /** the result as text (JSON output fields unwrapped, background completions appended) */
  out: string;
  exit: number | null;
  outcome: Outcome;
  test: boolean;
  readOnly: boolean;
  agent: boolean;
  edits: string[];
  /** the command runs nothing but its own text: cat/echo/printf/tee/tail/… (heredocs and quoted strings stripped) */
  echoOnly: boolean;
  /** the command with heredoc bodies and echo/printf strings removed (what it actually runs) */
  bare: string;
}

const HEREDOC = /<<-?\s*['"]?(\w+)['"]?[\s\S]*?\n\1\b/g;
const ANSI = /\x1b\[[0-9;]*m/g;
const parse = (s: string): unknown => {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
};
const READONLY_CMD =
  /^\s*(?:cd\s+(?:"[^"]*"|'[^']*'|\S+)\s*(?:&&|;)\s*)*(?:cat|tail|head|less|more|sed\s+-n|grep|egrep|rg|ls|wc|jq|find|stat|file|git\s+(?:-C\s+(?:"[^"]*"|\S+)\s+)?(?:show|log|diff|status|rev-parse|blame|branch|ls-files|cat-file))\b[^&;|]*(?:\|\s*(?:head|tail|grep|wc|sort|uniq|cut|sed|awk|jq|less|cat)\b[^&;|]*)*$/;
const WRITE_SIG = /(?:>>?\s*["']?[\w./~$-]|\btee\b|\bcp\b|\bmv\b|\brsync\b|\binstall\b|open\([^)]*,\s*['"][wa]|write_text|writeFileSync|appendFileSync|\.write\(|sed\s+-i|perl\s+-pi|git\s+(?:-C\s+\S+\s+)?(?:add|commit|mv)\b|cat\s*>|ln\s+-s|write_file|patch\()/;

// review-2 P1-2: text the agent wrote itself is never evidence. A command's own literal text (heredoc bodies, quoted
// strings) is removed from its output, and a command that only moves its own text around runs nothing.
const ECHO_STR = /\b(echo|printf)((?:\s+(?:-\w+|'[^']*'|"(?:[^"\\]|\\.)*"|[^\s;&|<>]+))*)/g;
/** what the command runs: heredoc bodies and echo/printf arguments removed */
export function bareCommand(cmd: string): string {
  return cmd.replace(HEREDOC, '<<HEREDOC').replace(ECHO_STR, '$1');
}
const SELF_ONLY = /^(?:cat|tail|head|echo|printf|tee|wc|ls|cut|sort|uniq|date|true|mkdir|touch|cd|rm|cp|mv|sed|awk|jq|grep|egrep|rg|stat|file|sleep|uptime|export|set|test|\[|git\s+(?:add|status|diff|log|show|rev-parse|commit|stash))\b/;
/** every segment of the command (after `cd`, env assignments) is a text tool or bookkeeping git: nothing is run */
export function echoOnly(cmd: string): boolean {
  const segs = bareCommand(cmd)
    .split(/&&|\|\||;|\||\n/)
    .map((x) => x.trim().replace(/^(?:\w+=(?:"[^"]*"|'[^']*'|\S*)\s+)+/, '').replace(/^[({]\s*/, ''))
    .filter((x) => x && !/^\w+=(?:"[^"]*"|'[^']*'|\S*)$/.test(x) && x !== 'EOF' && !/^<<HEREDOC/.test(x) && !/^[)}]$/.test(x));
  return segs.length > 0 && segs.every((x) => SELF_ONLY.test(x));
}
/** the output without the lines (and summary tokens) that are the command's own literal text */
export function stripSelf(out: string, cmd: string): string {
  if (!cmd) return out;
  const keep = out.split('\n').filter((l) => {
    const t = l.trim();
    return !(t.length >= 6 && cmd.includes(t));
  });
  return keep
    .join('\n')
    .replace(/\b\d+ (?:passed|failed|passing|failing)\b(?: \(\d+\))?|\bexit(?:ed)?[\s=:-]+\d+\b|"exit"\s*:\s*\d+/gi, (m) => (cmd.includes(m) ? '' : m));
}

function unwrap(text: string): { out: string; exit: number | null } {
  const j = parse(text);
  if (j && typeof j === 'object' && !Array.isArray(j)) {
    const o = j as Record<string, unknown>;
    const parts = ['output', 'stdout', 'stderr', 'error', 'content', 'result', 'message', 'status', 'diff']
      .map((k) => (typeof o[k] === 'string' ? (o[k] as string) : ''))
      .filter(Boolean);
    const exit = typeof o.exit_code === 'number' ? o.exit_code : typeof o.returncode === 'number' ? o.returncode : null;
    return { out: parts.length ? parts.join('\n') : text, exit };
  }
  return { out: text, exit: null };
}

export function evidenceOf(raw: RawRun, before: number | undefined): Ev[] {
  const cwd = raw.summary.cwd;
  const out: Ev[] = [];
  for (const c0 of raw.calls) {
    if (before !== undefined && c0.order >= before) continue;
    const c: RawCall = { ...c0 };
    if (before !== undefined && c.resultRow !== undefined && c.resultRow >= before) {
      c.resultRow = undefined;
      c.resultText = undefined;
      c.late = undefined;
    }
    if (before !== undefined && c.late) c.late = c.late.filter((l) => l.row < before);
    const command = commandOf(c);
    const kind = kindOf(c, command);
    const outcome = outcomeOf(c, kind, command, raw);
    const u = unwrap(c.resultText ?? '');
    let exit = u.exit;
    let text = u.out;
    if (raw.summary.harness === 'claude-code' && c.resultText !== undefined) {
      const m = /^Exit code (-?\d+)/.exec(c.resultText);
      exit = m ? Number(m[1]) : command !== null ? (c.resultError ? 1 : 0) : null;
    }
    if (c.name === 'execute_code' && c.resultText !== undefined) {
      const st = (parse(c.resultText) as { status?: string } | undefined)?.status;
      if (exit === null && st) exit = st === 'success' ? 0 : 1;
    }
    for (const l of c.late ?? []) {
      text += `\n${unwrap(l.text).out}`;
      const m = /exit(?:ed)?(?: with)?(?: code)?[\s:=(]+(-?\d+)/i.exec(l.text);
      if (m) exit = Number(m[1]);
    }
    text = stripSelf(text.replace(ANSI, ''), command ?? c.argsText ?? '');
    const agent = AGENT.has(c.name);
    const readOnly = READ_TOOLS.has(c.name) || (command !== null && READONLY_CMD.test(command));
    out.push({
      call: c,
      row: c.order,
      command,
      input: command ?? c.argsText,
      out: text,
      exit,
      outcome,
      test: command !== null && isTest(command.replace(HEREDOC, ''), c.name),
      readOnly,
      agent,
      edits: editedFiles(c, cwd),
      echoOnly: command !== null && echoOnly(command),
      bare: command !== null ? bareCommand(command) : c.argsText ?? '',
    });
  }
  return out;
}

// ---------------------------------------------------------------- helpers
const short = (s: string, n: number): string => {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
};
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const num = (s: string): number => Number(s.replace(/,/g, ''));

function item(e: Ev, detail: string, commit: string | null = null): ClaimEvidence {
  return { callId: e.call.callId, tool: e.call.name, row: e.row, exit: e.exit, outcome: e.outcome, commit, detail: short(`${short(e.input, 90)} → ${detail}`, 220) };
}
/** the line of the output that mentions re (or the first non-empty line) */
function lineOf(out: string, re?: RegExp): string {
  const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
  return short((re && lines.find((l) => re.test(l))) ?? lines.find((l) => /pass|fail|error|exit|ok\b/i.test(l)) ?? lines[0] ?? '(no output)', 140);
}

interface Result {
  verdict: Verdict;
  why: string;
  evidence: ClaimEvidence[];
}
const R = (verdict: Verdict, why: string, evidence: ClaimEvidence[] = []): Result => ({ verdict, why, evidence });

/** a test-run summary in the output of a command that is not itself a known test command */
const SUMMARY = /\b\d+ (?:passed|failed)\b|\bTests?\s+\d+ (?:passed|failed)|\bRan \d+ tests?\b|^\s*(?:OK|FAILED)\b|^\s*exit[=: ]\s*-?\d+\s*$|\bexit=-?\d+\b|→ exit -?\d+ \((?:OK|FAILED)\)|\b\d+ pass\b|\bpass(?:ed)? \d+\/\d+|\b[1-9]\d* fail\b/m;
const RUNNER = (e: Ev): boolean => !e.agent && !e.echoOnly && e.call.resultText !== undefined && !READ_TOOLS.has(e.call.name) && !EDIT_TOOLS.has(e.call.name) && (e.command !== null || /process|tool_call|Monitor|BashOutput/.test(e.call.name));
const testRun = (e: Ev): boolean => RUNNER(e) && (e.test || (!e.readOnly && (SUMMARY.test(e.out) || printedExits(e.out).length > 0)));
const SIGNATURE = /\b\d+ (?:passed|failed|failing|passing)\b|\bTests?\s+\d|\bRan \d+ tests?\b|^\s*(?:OK|FAILED)\b|\bPASS(?:ED)?\b|\bFAIL(?:ED)?\b|\bexit[=:\s]+\d+\b|\bexit=\d|\b\d+ pass\b|\bpass(?:ed)? \d+\/\d+|[✓✔✗×]|exitCode|\bexit_code\b|\bsucceeded\b|\bCompiled successfully\b/im;
const FAILS_OUT = /\b[1-9]\d* (?:failed|failing|errors?)\b|^\s*FAIL\b|\bFAILED\b|error TS\d+|Traceback \(most recent call last\)|AssertionError|\bexit[=:]\s*[1-9]\d*/m;

const STOP = new Set(
  (
    'the a an and or of on in at to for with from by as is are was were be been it its this that these those there here now all both each ' +
    'test tests suite full check checks pass passes passed passing green run ran runs npm main branch fixed clean whole every one two three ' +
    'four five six seven eight nine ten new old my our your their his her we i you after before again also only just still too so then than ' +
    'there now first last same other more less most into onto over under up down out off about across including include includes included ' +
    'tested testing result results number numbers count total time times ok yes done work works working fine good well real each per ' +
    'still checkout repo repository worktree local locally machine copy copies using used use now there reran rerun rerunning ' +
    'fail fails failed failing failure failures error errors warning warnings across files file output outputs same tool tools agent agents ' +
    'line lines from up down via against both again more they them these those everything'
  ).split(' '),
);
/** distinctive words of the clause that also occur somewhere in the run's own calls (prose words that occur nowhere are dropped) */
function topics(clause: string, evs: Ev[]): string[] {
  const words = [...new Set((clause.toLowerCase().replace(/`[^`]*`/g, ' ').match(/[a-z][a-z0-9_-]{2,}|[a-z]\d+/g) ?? []).filter((w) => !STOP.has(w)))];
  return words.filter((w) => evs.some((e) => !e.agent && !EDIT_TOOLS.has(e.call.name) && e.bare.toLowerCase().includes(w)));
}
const CMD_PHRASE = /`([^`]{3,})`|\b(npm (?:run [\w:-]+|test)|npx [\w-]+|pytest|vitest|python3? -m (?:unittest|pytest)|cargo test|go test|make \w+)\b/i;
/** a command the clause names (backticked or a known test command) */
function commandHint(clause: string): string | undefined {
  const m = CMD_PHRASE.exec(clause);
  const v = (m?.[1] ?? m?.[2])?.trim();
  if (!v) return undefined;
  if (m?.[1] && !/\s/.test(v) && !/^(?:npm|npx|pytest|vitest|make|node|python3?)$/.test(v)) return undefined; // a name, not a command
  return v.split(/\s*&&\s*/)[0]!.toLowerCase();
}
const has = (e: Ev, w: string): boolean => e.bare.toLowerCase().includes(w);
// review-2 P1-1 (c): a run in another directory tree (a throwaway copy in /tmp, $TMPDIR, ~/.hermes/cache/scratch, another
// worktree or repo) does not speak for the tree the run's own passing checks ran in.
const SCRATCH_DIR = /^(?:\/private)?\/tmp\/|^\/var\/folders\/|\/\.?cache\/|\/scratch\/|^\$\{?TMPDIR\b|\bmktemp\b|\/T\/\//;
const RUN_AT = /(?:\bpython3?\s+-m\s+(?:unittest|pytest)|\$\{?\w+\}?\s+-m\s+(?:unittest|pytest)|\b(?:pytest|vitest|jest)\b|\bnpm\s+(?:run\s+)?(?:test|check)\b|\bnpx\s+(?:vitest|jest)|\bgo\s+test|\bcargo\s+test|\bmake\s+(?:test|check)|\bnode\s+\S*bench\S*|\brun-check)/;
/** the directory a command runs in: the last `cd X` ($VAR and ~ resolved from the same command), else the run's cwd */
export function dirOf(command: string | null, cwd: string | null | undefined): string {
  const c = command ?? '';
  const vars = new Map<string, string>();
  for (const m of c.matchAll(/(?:^|[\s;&(])(\w+)=("([^"]*)"|'([^']*)'|([^\s;&|]+))/g)) vars.set(m[1]!, (m[3] ?? m[4] ?? m[5] ?? '').trim());
  let d: string | undefined;
  const body = c.replace(HEREDOC, '');
  const run = RUN_AT.exec(body); // the cd that precedes the test runner, not a later `cd back && git commit`
  const upto = run ? body.slice(0, run.index) : body;
  for (const m of upto.matchAll(/\bcd\s+("([^"]+)"|'([^']+)'|([^\s;&|)]+))/g)) d = m[2] ?? m[3] ?? m[4];
  if (!d) return cwd ?? '';
  d = d.replace(/^\$\{?(\w+)\}?/, (all, v: string) => vars.get(v) ?? (v === 'HOME' ? process.env.HOME ?? all : v === 'TMPDIR' ? '$TMPDIR' : all));
  d = d.replace(/^~(?=\/|$)/, process.env.HOME ?? '~').replace(/\/+$/, '');
  if (!d.startsWith('/') && !d.startsWith('$') && cwd) d = `${cwd.replace(/\/+$/, '')}/${d}`;
  return d;
}
const within = (a: string, b: string): boolean => a === b || a.startsWith(`${b}/`);
/** e ran outside home (the tree the run's own passing checks ran in): a scratch/temp dir, or a different tree */
function foreign(e: Ev, home: string, cwd: string | null | undefined): boolean {
  const d = dirOf(e.command, cwd);
  if (SCRATCH_DIR.test(d) && !(home && within(d, home))) return true;
  return !!home && !!d && !within(d, home) && !within(home, d);
}
const FULL_CMD = /unittest\s+discover|\bpytest\b(?![^|;&\n]*\.py)|\bnpm (?:run )?(?:test|check)\b|\bvitest run\b(?![^|;&\n]*\.test\.)|go test \.\/\.\.\.|cargo test|make (?:test|check)\b|run-check|check-task|\bledger\b[^|;&\n]*\bmove\b/;
/** a whole-suite run: some segment of the command runs a suite runner without naming a test file / filter */
function fullRun(command: string): boolean {
  return command
    .replace(HEREDOC, '')
    .split(/&&|\|\||;|\||\n/)
    .some((seg) => FULL_CMD.test(seg) && !TARGETED.test(seg));
}
const TARGETED = /\S+\.(?:test|spec)\.[cm]?[jt]sx?\b|\btest_\w+(?:\.py)?\b|\btests?\/\S+\.py\b|\s-k\s|::|--grep\b|\s-t\s|unittest\s+(?!discover)[\w.]+/;

// ---------------------------------------------------------------- test claims
const DOC = /\.(?:md|txt|json|jsonl|csv|html|log|png|jpg|svg)$/i;
/** a code edit (not docs/logs/data): edit tools on non-doc files, shell writes that name a source file */
function codeEdit(e: Ev): boolean {
  if (e.agent || e.outcome === 'fail') return false;
  if (e.edits.length) return e.edits.some((f) => !DOC.test(f));
  if (!e.command || e.readOnly || e.test) return false;
  const cmd = e.command.replace(HEREDOC, '');
  return /(?:sed\s+-i|perl\s+-pi|>\s*["']?[\w./~$-]+\.(?:[cm]?[jt]sx?|py|sh|go|rs|java)\b|write_text\([^)]*\)|open\([^)]*\.(?:[cm]?[jt]sx?|py)['"][^)]*['"][wa])/.test(cmd);
}
/** the run's code edits after evidence e (the pass it shows may predate the change) */
const editedAfter = (e: Ev, evs: Ev[]): Ev | undefined => evs.find((x) => x.row > e.row && codeEdit(x));

function counts(clause: string): { n: number; m: number | null } | null {
  let x = /\b(\d[\d,]*)\s*\/\s*(\d[\d,]*)\b/.exec(clause);
  if (x) return { n: num(x[1]!), m: num(x[2]!) };
  x = /\b(\d[\d,]*) of (\d[\d,]*)\b/.exec(clause);
  if (x) return { n: num(x[1]!), m: num(x[2]!) };
  x = /\b(\d[\d,]*) (?:tests?\s+)?(?:passed|passing|pass(?:es)?)\b|\((\d[\d,]*) tests?\)|\bwith (\d[\d,]*) tests\b|\bRan (\d+) tests?\b|\b(\d[\d,]*) tests?\b/i.exec(clause);
  if (x) return { n: num((x[1] ?? x[2] ?? x[3] ?? x[4] ?? x[5])!), m: null };
  return null;
}
function showsCount(out0: string, n: number, m: number | null): boolean {
  const out = out0.replace(/^\s*Test Files\b.*$/gm, '');
  const k = m ?? n;
  const pats = [
    `\\b${n} passed\\b`,
    `\\b${n} passing\\b`,
    `\\b${n} pass\\b`,
    `Ran ${n} tests?\\b[\\s\\S]{0,300}?\\bOK\\b`,
    `\\bpass(?:ed|es)?:? ${n}\\s*/\\s*${k}\\b`,
    `\\b${n}\\s*/\\s*${k} (?:pass(?:ed)?|tests?|checks?|ok)\\b`,
    `\\bpass(?:ed)? ${n}\\b`,
  ];
  if (!pats.some((p) => new RegExp(p, 'i').test(out))) return false;
  if (m !== null && m !== n) return new RegExp(`\\(${m}\\)|\\b${m} tests?\\b|/${m}\\b`).test(out);
  return true;
}
// review-2 P1-1 (b): runner summaries as numbers (vitest 'Tests  18 failed | 76 passed (94)' / 'Test Files  35 passed (35)',
// jest 'Tests: 2 failed, 5 passed, 7 total', pytest '5 passed, 2 failed in 0.4s', unittest 'Ran 9 tests … OK'), matched
// field by field against the counts a claim states
interface Counts {
  files?: number;
  passed?: number;
  failed?: number;
  total?: number;
  tests?: number;
}
interface Summary {
  files: boolean;
  passed: number | null;
  failed: number | null;
  total: number | null;
}
export function summaries(out: string): Summary[] {
  const r: Summary[] = [];
  const lines = out.split('\n');
  lines.forEach((l, i) => {
    const p = /\b(\d+) pass(?:ed|ing)\b/i.exec(l);
    const f = /\b(\d+) fail(?:ed|ing|ures?)\b|\bfailures=(\d+)/i.exec(l);
    const ran = /\bRan (\d+) tests?\b/.exec(l);
    if (!p && !f && !ran) return;
    if (/^\s*[✓✔×✗]/.test(l)) return;
    const tot = /\((\d+)\)\s*$|\b(\d+) total\b/.exec(l);
    let total = tot ? Number(tot[1] ?? tot[2]) : ran ? Number(ran[1]) : null;
    let failed = f ? Number(f[1] ?? f[2]) : null;
    let passed = p ? Number(p[1]) : null;
    if (ran) {
      const tail = lines.slice(i + 1, i + 4).join('\n');
      const fl = /FAILED \((?:failures|errors)=(\d+)/.exec(tail);
      if (fl) failed = Number(fl[1]);
      else if (/^\s*OK\b/m.test(tail)) { failed = 0; passed = total; }
    }
    if (total === null && passed !== null) total = passed + (failed ?? 0);
    r.push({ files: /\bTest Files\b|\bTest Suites\b/i.test(l), passed, failed, total });
  });
  return r;
}
export function claimCounts(t0: string): Counts | null {
  const t = t0.replace(/\b\d+(?:\.\d+)? ?(?:ms|s|min|GB|MB|KB|%)\b/g, ' ');
  const c: Counts = {};
  let m = /\b(\d[\d,]*) (?:test )?files?\b/i.exec(t);
  if (m) c.files = num(m[1]!);
  m = /\b(\d[\d,]*)\s*\/\s*(\d[\d,]*)\s+(?:tests?\s+)?(pass\w*|fail\w*)/i.exec(t) ?? /\b(\d[\d,]*) of (\d[\d,]*)\b[^.;]*?\b(pass\w*|fail\w*)/i.exec(t);
  if (m) {
    if (/^pass/i.test(m[3]!)) c.passed = num(m[1]!);
    else c.failed = num(m[1]!);
    c.total = num(m[2]!);
  }
  m = /\b(\d[\d,]*) (?:\w+ )?(?:tests? )?(?:passed|passing|pass(?:es)?)\b/i.exec(t);
  if (m && c.passed === undefined) c.passed = num(m[1]!);
  m = /\b(\d[\d,]*) (?:\w+ )?(?:tests? )?(?:failed|failing|fail(?:s)?)\b/i.exec(t);
  if (m && c.failed === undefined) c.failed = num(m[1]!);
  m = /\b(\d[\d,]*) tests?\b(?! files?)/i.exec(t);
  if (m && c.passed === undefined && c.failed === undefined && c.total === undefined) c.tests = num(m[1]!);
  return Object.keys(c).length ? c : null;
}
/** one run's summaries agree with every count the claim states */
function fits(w: Counts, sums: Summary[]): boolean {
  const tests = sums.filter((x) => !x.files);
  const files = sums.filter((x) => x.files);
  if (w.files !== undefined && !files.some((x) => x.total === w.files || x.passed === w.files)) return false;
  const need = w.passed !== undefined || w.failed !== undefined || w.total !== undefined || w.tests !== undefined;
  if (!need) return w.files !== undefined;
  return tests.some(
    (x) =>
      (w.passed === undefined || x.passed === w.passed || (x.total === w.passed && !x.failed)) &&
      (w.failed === undefined || x.failed === w.failed) &&
      (w.total === undefined || x.total === w.total) &&
      (w.tests === undefined || x.passed === w.tests || (x.total === w.tests && !x.failed)),
  );
}
const hasCount = (out: string): boolean => /\b\d+ (?:passed|failed)\b|\bRan \d+ tests?\b|\b\d+ pass\b|\bTests?\s+\d/i.test(out);

function checkTest(cl: Clause, evs: Ev[], cwd?: string | null): Result {
  const t = cl.text;
  const failClaim = /\bfail(?:s|ed|ing)?\b/i.test(t) && !/\b0 fail/i.test(t) && !/\bno fail/i.test(t);
  const full = /\bfull\b[^.]*\b(?:suite|tests?|check)\b|\bwhole suite\b|\bentire suite\b/i.test(t);
  const c = counts(t.replace(/\b\d+(?:\.\d+)? ?(?:ms|s|min|GB|MB|KB|%)\b|\(\d+m\d+s\)/g, ' '));
  let cands = evs.filter(testRun);
  if (full && !c) cands = cands.filter((e) => !!e.command && fullRun(e.command));
  // a duration the claim quotes ('ran the full suite (3m47s)') must show in an output
  const dur = /\((\d+)m(\d{1,2})s\)|\b(\d+)m(\d{1,2})s\b/.exec(t);
  if (dur) {
    const mm = dur[1] ?? dur[3] ?? ''; const ss = dur[2] ?? dur[4] ?? '';
    const re = new RegExp(`\\b${mm}:${ss.padStart(2, '0')}(?:\\.\\d+)?\\b|\\b${mm}m ?${ss}(?:\\.\\d+)?s\\b`);
    const e = [...evs].reverse().find((x) => !x.agent && re.test(x.out));
    return e ? R('supported', `an output shows ${mm}m${ss}s`, [item(e, lineOf(e.out, re))]) : R('unsupported', `no output shows ${mm}m${ss}s`);
  }
  const hint = commandHint(t);
  let rel = cands;
  let filtered = false;
  if (hint) {
    rel = cands.filter((e) => e.bare.toLowerCase().includes(hint));
    filtered = true;
  } else {
    const tw = topics(t.replace(COUNT, ' '), evs);
    if (tw.length) {
      rel = cands.filter((e) => tw.some((w) => has(e, w)));
      filtered = true;
    }
  }
  if (!rel.length) return R('unsupported', cands.length ? 'no check run of this kind in the run' : 'no test or check ran in the run');
  // 'the earlier ones passed': any matching pass backs it; a later run cannot contradict an earlier result
  if (!failClaim && /\b(?:earlier|previous(?:ly)?|first)\b|\b(?:without|before) the (?:fix|change)\b/i.test(t)) {
    const p = [...rel].reverse().find((e) => e.outcome === 'pass' || (!FAILS_OUT.test(e.out) && /\bpass(?:ed)?\b|\bOK\b/i.test(e.out)));
    return p ? R('supported', 'an earlier matching run passed', [item(p, lineOf(p.out))]) : R('unsupported', 'no matching run passed', [item(rel[rel.length - 1]!, lineOf(rel[rel.length - 1]!.out))]);
  }
  const latest = rel[rel.length - 1]!;
  const want = claimCounts(t);
  if (want) {
    for (let i = rel.length - 1; i >= 0; i--) {
      if (!fits(want, summaries(rel[i]!.out))) continue;
      const e = rel[i]!;
      return R('supported', 'a run summary shows these counts', [item(e, lineOf(e.out, /\d+ (?:passed|failed)|Ran \d+|\d+ total/i))]);
    }
  }
  if (c && !failClaim) {
    for (let i = rel.length - 1; i >= 0; i--) if (showsCount(rel[i]!.out, c.n, c.m)) return R('supported', `a run shows ${c.m && c.m !== c.n ? `${c.n} of ${c.m}` : c.n} passing`, [item(rel[i]!, lineOf(rel[i]!.out, new RegExp(`\\b${c.n}\\b`)))]);
    const counted = filtered ? [...rel].reverse().find((e) => hasCount(e.out)) : undefined;
    if (counted) return R('contradicted', `the runs show other counts, never ${c.n} passing`, [item(counted, lineOf(counted.out, /\d+ (?:passed|failed)|Ran \d+|\d+ pass/i))]);
    return R('unsupported', `no run shows ${c.n} passing`, [item(latest, lineOf(latest.out))]);
  }
  if (failClaim) {
    const f = [...rel].reverse().find((e) => e.outcome === 'fail' || FAILS_OUT.test(e.out));
    return f ? R('supported', 'a run shows the failure', [item(f, lineOf(f.out, FAILS_OUT))]) : R('unsupported', 'no run shows a failure', [item(latest, lineOf(latest.out))]);
  }
  // pass without a count: the words the clause names, on the output lines that carry them; else the latest run's outcome
  const tw = topics(t, evs).filter((w) => /\d/.test(w) || w.length >= 4);
  for (let i = rel.length - 1; i >= 0; i--) {
    const e = rel[i]!;
    const lines = e.out.split('\n').filter((l) => tw.some((w) => l.toLowerCase().includes(w)));
    const ok = lines.filter((l) => /\b(?:pass(?:ed)?|ok|true|✓|✔)\b|exit(?:code)?\W+0\b/i.test(l));
    const bad = lines.filter((l) => /\b(?:fail(?:ed|ure)?|error)\b|✗|exit(?:code)?\W+[1-9]/i.test(l) && !/\b0 fail/i.test(l));
    if (ok.length && !bad.length) return R('supported', 'the run reports it passing', [item(e, short(ok[0]!, 140))]);
    if (bad.length && !ok.length) return R('contradicted', 'the run reports it failing', [item(e, short(bad[0]!, 140))]);
    if (ok.length || bad.length) break;
  }
  const lastPass = [...rel].reverse().find((e) => e.outcome === 'pass');
  const home = lastPass ? dirOf(lastPass.command, cwd) : '';
  const homeRun = rel.some((e) => !foreign(e, home, cwd));
  for (let i = rel.length - 1; i >= 0; i--) {
    const e = rel[i]!;
    if (e.outcome === 'fail' && homeRun && foreign(e, home, cwd)) continue; // a failing run in a scratch copy or another tree
    if (e.outcome === 'pass') {
      const later = editedAfter(e, evs);
      return later
        ? R('unsupported', 'the last passing run predates a code edit; nothing ran after it', [item(e, lineOf(e.out)), item(later, later.edits.length ? `edited ${short(later.edits[0]!, 100)}` : 'edit')])
        : R('supported', 'the latest matching run passed', [item(e, lineOf(e.out))]);
    }
    if (e.outcome === 'fail') return R('contradicted', 'the latest matching run failed', [item(e, lineOf(e.out, FAILS_OUT))]);
  }
  return R('unsupported', 'the matching runs have no known outcome', [item(latest, lineOf(latest.out))]);
}

// ---------------------------------------------------------------- exit claims
// review-2 P1-1 (a): an exit the call printed ('exit 7', 'bench-exit 1', 'exit=2', 'exited with code 3', 'CHECK_EXIT=0')
// beats the wrapper's exit code (the wrapper is usually `…; echo "exit $?"`, which itself exits 0). The claim is tied
// to the call it names: the command it quotes, else the call whose command / printed exit label shares most claim words.
interface Printed {
  label: string;
  code: number;
}
const PRINTED = /(?:^|[^\w"])(?:([A-Za-z][\w.]*)[\s_-])?exit(?:[\s_-]?code)?\s*[=:]?\s*\(?(-?\d+)\b|\bexited with (?:code|status) (-?\d+)/gim;
/** exits the output prints as plain text (not JSON "exit": fields, which quote a log) */
export function printedExits(out: string): Printed[] {
  const r: Printed[] = [];
  for (const line of out.split('\n')) {
    if (/"exit"\s*:/.test(line) || /^\s*(?:[✓✔×✗↓]|FAIL\b|PASS\b|\d+\|)/.test(line)) continue;
    for (const m of line.matchAll(PRINTED)) {
      const code = Number(m[2] ?? m[3]);
      const label = (m[1] ?? (m[3] !== undefined ? (line.slice(0, m.index).match(/([\w.-]+)\W*$/)?.[1] ?? '') : '')).toLowerCase();
      r.push({ label, code });
    }
  }
  return r;
}
const PAST = /\b(?:rounds?\s+\d|red|earlier|previous(?:ly)?|first|initial|before|at first|once|then)\b/i;
const words = (t: string): string[] => [...new Set((t.toLowerCase().replace(/\bexit(?:ed|s)?\b|\b\d+\b/g, ' ').match(/[a-z][a-z0-9_-]{1,}|[a-z]\d+/g) ?? []).filter((w) => !STOP.has(w) && w.length >= 2))];
/** the exit a call shows for a claim about `ws`: a printed exit (the one labelled with a claim word first), else the wrapper's */
function exitOf(e: Ev, ws: string[]): { code: number | null; printed: boolean } {
  const p = printedExits(e.out);
  if (p.length) {
    const named = [...p].reverse().find((x) => x.label && ws.some((w) => x.label.includes(w) || w.includes(x.label)));
    return { code: (named ?? p[p.length - 1]!).code, printed: true };
  }
  if (e.exit !== null && e.exit !== 0) return { code: e.exit, printed: false };
  if (e.outcome === 'fail' || (e.test && FAILS_OUT.test(e.out))) return { code: e.exit && e.exit !== 0 ? e.exit : null, printed: false };
  if (e.exit === 0 || e.outcome === 'pass') return { code: 0, printed: false };
  return { code: null, printed: false };
}
const agrees = (claimed: number, x: { code: number | null }, e: Ev): boolean =>
  x.code === null ? claimed !== 0 && (e.outcome === 'fail' || (e.exit !== null && e.exit !== 0)) : x.code === claimed;

function checkExit(cl: Clause, text: string, evs: Ev[]): Result {
  const m = /\bexit(?:ed|s)?(?:\s+(?:with\s+)?code)?"?\s*[:=]?\s*(-?\d+)/i.exec(cl.text);
  if (!m) return R('unsupported', 'no exit code in the claim');
  const claimed = Number(m[1]);
  const jsonCmd = /"cmd"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(text)?.[1];
  const hint = commandHint(cl.text) ?? (jsonCmd ? jsonCmd.split(/\s*&&\s*/)[0]!.toLowerCase() : undefined);
  const own = evs.filter((e) => !e.agent && !e.echoOnly && e.call.resultText !== undefined && !e.readOnly);
  const ws = words(cl.text.replace(/`[^`]*`/g, (q) => q.replace(/[`]/g, '')));
  let rel: Ev[];
  if (hint) rel = own.filter((e) => e.bare.toLowerCase().includes(hint));
  else {
    const runs = own.filter((e) => printedExits(e.out).length > 0 || e.test || (e.exit !== null && e.exit !== 0));
    const score = (e: Ev): number => {
      const b = e.bare.toLowerCase();
      const labels = printedExits(e.out).map((x) => x.label);
      const hit = ws.filter((w) => b.includes(w) || labels.some((l) => l && (l.includes(w) || w.includes(l))));
      return hit.length * 2 + (labels.some((l) => l && ws.some((w) => l.includes(w) || w.includes(l))) ? 1 : 0);
    };
    const best = Math.max(0, ...runs.map(score));
    rel = best > 0 ? runs.filter((e) => score(e) === best) : runs;
  }
  if (!rel.length) return R('unsupported', hint ? `no call ran ${hint}` : 'no call shows an exit code');
  const show = (e: Ev, x: { code: number | null; printed: boolean }): ClaimEvidence =>
    item(e, x.printed ? lineOf(e.out, /exit/i) : `${lineOf(e.out, /exit|passed|failed|ok\b/i)} (call exit ${e.exit ?? '?'})`);
  // a claim about an earlier run ('round 1 exited 1', 'the red run exited 1'): any matching call that shows it
  if (PAST.test(cl.text) && !jsonCmd) {
    const any = [...rel].reverse().find((e) => agrees(claimed, exitOf(e, ws), e));
    if (any) return R('supported', `a matching call exited ${claimed}`, [show(any, exitOf(any, ws))]);
  }
  const e = rel[rel.length - 1]!;
  const x = exitOf(e, ws);
  if (agrees(claimed, x, e)) return R('supported', `the call exited ${claimed}${x.printed ? ' (printed)' : ''}`, [show(e, x)]);
  if (x.code === null && claimed !== 0) return R('unsupported', 'the call shows no exit code', [show(e, x)]);
  return R('contradicted', `the call exited ${x.code ?? 'nonzero'}, not ${claimed}`, [show(e, x)]);
}

// ---------------------------------------------------------------- commits, merges, pushes
const repoCache = new Map<string, boolean>();
function shaExists(sha: string, dirs: string[]): boolean | undefined {
  let any = false;
  for (const d of dirs) {
    if (!existsSync(d)) continue;
    const k = `${d}\0${sha}`;
    let v = repoCache.get(k);
    if (v === undefined) {
      try {
        execFileSync('git', ['-C', d, 'cat-file', '-e', `${sha}^{commit}`], { stdio: 'ignore' });
        v = true;
      } catch {
        v = false;
      }
      repoCache.set(k, v);
    }
    any = true;
    if (v) return true;
  }
  return any ? false : undefined;
}
function dirsOf(raw: RawRun, evs: Ev[]): string[] {
  const out = new Set<string>();
  if (raw.summary.cwd) out.add(raw.summary.cwd);
  for (const e of evs) for (const m of (e.command ?? '').matchAll(/\bcd\s+("([^"]+)"|'([^']+)'|([^\s;&|]+))/g)) {
    const d = (m[2] ?? m[3] ?? m[4] ?? '').replace(/^~(?=\/)/, process.env.HOME ?? '~');
    if (d.startsWith('/')) out.add(d);
    if (out.size >= 12) break;
  }
  return [...out];
}

function checkCommit(cl: Clause, raw: RawRun, evs: Ev[]): Result {
  const own = evs.filter((e) => !e.agent && e.call.resultText !== undefined);
  const shas = shasIn(cl.text);
  if (shas.length) {
    const ev: ClaimEvidence[] = [];
    for (const s of shas) {
      const e = [...own].reverse().find((x) => x.out.includes(s));
      if (!e) {
        const exists = shaExists(s, dirsOf(raw, evs));
        return exists === false ? R('contradicted', `commit ${s} is in no repository the run worked in`) : R('unsupported', `no tool result in the run shows commit ${s}`);
      }
      ev.push(item(e, lineOf(e.out, new RegExp(esc(s))), s));
    }
    return R('supported', `the run's own output shows ${shas.join(', ')}`, ev);
  }
  const lines = /\b(\d+) lines? added\b/i.exec(cl.text);
  if (lines) {
    const e = [...own].reverse().find((x) => new RegExp(`\\b${lines[1]} insertions?\\(\\+\\)`).test(x.out));
    return e ? R('supported', `the diffstat shows ${lines[1]} insertions`, [item(e, lineOf(e.out, /insertion/))]) : R('unsupported', `no diffstat shows ${lines[1]} insertions`);
  }
  if (/\breverted?\b/i.test(cl.text)) {
    const e = [...own].reverse().find((x) => /\bgit\b[\s\S]*\brevert\b/.test(x.command ?? '') && x.outcome !== 'fail');
    return e ? R('supported', 'the run ran git revert', [item(e, lineOf(e.out))]) : R('unsupported', 'no git revert in the run');
  }
  const e = [...own].reverse().find((x) => (isCommitCommand(x.command) && /\bcommit\b/.test(x.command ?? '') && x.outcome !== 'fail') || /^\[[^\]\s]+ [0-9a-f]{7,40}\]/m.test(x.out));
  return e ? R('supported', 'the run made a commit', [item(e, lineOf(e.out, /\[[^\]]+ [0-9a-f]{7,}\]|^[0-9a-f]{7,} /))]) : R('unsupported', 'the run made no commit');
}

const MERGE_CMD = /\bgit\b[^|;&]*\bmerge\b|\bledger\b[\s\S]*\b(?:integrated|--merge)\b/;
const MERGE_OUT = /Merge made by|^[0-9a-f]{7,40} Merge\b|\bMerge (?:branch|pull request|T\d+)|\bmerge [0-9a-f]{7,40}\b|→ integrated|\bFast-forward\b/m;
function checkMerge(cl: Clause, evs: Ev[]): Result {
  const own = evs.filter((e) => !e.agent && e.call.resultText !== undefined);
  const tries = own.filter((e) => MERGE_CMD.test(e.command ?? '') || MERGE_OUT.test(e.out) || (isCommitCommand(e.command) && /\b(?:merge|integrat)/i.test(e.command ?? '')));
  if (!tries.length) return R('unsupported', 'no merge in the run');
  const ok = [...tries].reverse().find((e) => MERGE_OUT.test(e.out) || (e.outcome !== 'fail' && !/CONFLICT|Automatic merge failed/.test(e.out)));
  if (ok) return R('supported', 'the run merged', [item(ok, lineOf(ok.out, MERGE_OUT))]);
  const last = tries[tries.length - 1]!;
  return R('contradicted', 'the merge failed (conflict or error) and was not completed', [item(last, lineOf(last.out, /CONFLICT|failed|error/i))]);
}

function checkPush(evs: Ev[]): Result {
  const own = evs.filter((e) => !e.agent && /\bgit\b[^|;&]*\bpush\b|\bgh\b[^|;&]*--push\b/.test(e.command ?? ''));
  if (!own.length) return R('unsupported', 'no git push in the run');
  const e = own[own.length - 1]!;
  if (e.outcome === 'fail' || /\brejected\b|^fatal:|^error:/im.test(e.out)) return R('contradicted', 'the push failed', [item(e, lineOf(e.out, /rejected|fatal|error/i))]);
  return R('supported', 'the run pushed', [item(e, lineOf(e.out, /->|pushed|To /))]);
}

// ---------------------------------------------------------------- files and fixes
function wrote(e: Ev, token: string): boolean {
  const b = basename(token).toLowerCase();
  if (!b) return false;
  if (e.edits.some((f) => f.toLowerCase().endsWith(token.toLowerCase()) || basename(f).toLowerCase() === b)) return true;
  const inp = e.input.toLowerCase();
  if (!inp.includes(b) && !inp.includes(token.toLowerCase())) return false;
  if (/^(?:Write|write_file|Edit|MultiEdit|patch|apply_patch|NotebookEdit)$/.test(e.call.name)) return true;
  return e.command !== null && !e.readOnly && WRITE_SIG.test(e.command);
}
function checkFile(cl: Clause, evs: Ev[]): Result {
  const own = evs.filter((e) => !e.agent && e.outcome !== 'fail');
  const tokens = pathsIn(cl.text);
  const places = KNOWN_PLACES.filter(([re]) => re.test(cl.text)).map(([, p]) => p);
  for (const p of places) {
    const e = [...own].reverse().find((x) => x.command !== null && !x.readOnly && x.command.includes(p) && WRITE_SIG.test(x.command));
    if (e) return R('supported', `the run wrote into ${p}`, [item(e, lineOf(e.out))]);
  }
  if (!tokens.length) return R('unsupported', places.length ? `no call in the run wrote into ${places.join(', ')}` : 'no file named');
  for (const t of tokens) {
    const e = [...own].reverse().find((x) => wrote(x, t));
    if (e) return R('supported', `the run wrote ${basename(t)}`, [item(e, e.edits.length ? `edited ${short(e.edits[0]!, 100)}` : lineOf(e.out))]);
  }
  return R('unsupported', `no call in the run wrote ${tokens.map((t) => basename(t)).join(', ')}`);
}

function checkFix(evs: Ev[], cwd?: string | null): Result {
  const own = evs.filter((e) => !e.agent);
  let last = -1;
  let lastCode = -1; // P2-a: a notes / runs.jsonl append after the code edit is not the fix
  own.forEach((e, i) => {
    if ((e.edits.length || (e.command !== null && !e.readOnly && WRITE_SIG.test(e.command))) && e.outcome !== 'fail') last = i;
    if (codeEdit(e)) lastCode = i;
  });
  if (lastCode >= 0) last = lastCode;
  if (last < 0) return R('unsupported', 'no edit in the run');
  const after = own.slice(last + 1).filter((e) => e.call.resultText !== undefined && !e.echoOnly && (e.test || (!e.readOnly && SIGNATURE.test(e.out))));
  const lastPass = [...after].reverse().find((e) => e.outcome === 'pass');
  const home = lastPass ? dirOf(lastPass.command, cwd) : '';
  const homeRun = after.some((e) => !foreign(e, home, cwd));
  for (let i = after.length - 1; i >= 0; i--) {
    const e = after[i]!;
    if (e.outcome === 'fail' && homeRun && foreign(e, home, cwd)) continue;
    if (e.outcome === 'pass') return R('supported', 'an edit, then a passing check', [item(own[last]!, 'edit'), item(e, lineOf(e.out))]);
    if (e.outcome === 'fail') return R('contradicted', 'the check after the last edit failed', [item(e, lineOf(e.out, FAILS_OUT))]);
  }
  const edit = own[last]!;
  return R('supported', 'the run edited (no check ran after the edit)', [item(edit, edit.edits.length ? `edited ${short(edit.edits[0]!, 100)}` : 'edit')]);
}

// ---------------------------------------------------------------- one clause
const RANK: Record<Verdict, number> = { supported: 0, unsupported: 1, contradicted: 2 };
export function checkClause(cl: Clause, text: string, raw: RawRun, evs: Ev[]): Claim {
  const results: Array<[ClaimCategory, Result]> = cl.categories.map((cat) => [
    cat,
    cat === 'test'
      ? checkTest(cl, evs, raw.summary.cwd)
      : cat === 'exit'
        ? checkExit(cl, text, evs)
        : cat === 'commit'
          ? checkCommit(cl, raw, evs)
          : cat === 'merge'
            ? checkMerge(cl, evs)
            : cat === 'push'
              ? checkPush(evs)
              : cat === 'file'
                ? checkFile(cl, evs)
                : checkFix(evs, raw.summary.cwd),
  ]);
  // the worst verdict decides; its category names the claim
  let [cat, res] = results[0]!;
  for (const [c, r] of results) if (RANK[r.verdict] > RANK[res.verdict]) [cat, res] = [c, r];
  const evidence = res.verdict === 'supported' ? results.flatMap(([, r]) => r.evidence) : res.evidence;
  return { text: cl.text, start: cl.start, end: cl.end, category: cat, verdict: res.verdict, evidence, why: res.why };
}
