// One tool call -> one Step: kind, OTel GenAI operation, command text, outcome, files read/edited, commits created.
import { isAbsolute, resolve } from 'node:path';
import type { RawCall, RawRun } from './sources.js';
import type { Operation, Outcome, StepKind } from './types.js';

const SHELL = new Set(['terminal', 'Bash', 'Monitor', 'shell', 'exec_command', 'local_shell_call', 'container.exec']);
const CODE = new Set(['execute_code', 'exec']); // code that runs programs (Hermes python, Codex JS tool scripts)
const EDIT = new Set(['write_file', 'patch', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'apply_patch']);
const READ = new Set(['read_file', 'Read', 'NotebookRead']);
const AGENT = new Set(['delegate_task', 'Agent', 'Task', 'spawn_agent']);
const PLAN = new Set(['todo', 'todo_list', 'TodoWrite', 'update_plan', 'ExitPlanMode']);

const TEST_RE =
  /\b(pytest|unittest|vitest|jest|mocha|tsc|node --check|(?:ba|z)sh -n|git diff --check|npm (?:run )?(?:test|check|lint)|npx (?:vitest|jest|tsc)|selftest|install-check|run-check|loop_status)\b|\b[\w./-]*(?:check|verify|validate|eval|test)[\w-]*\.(?:sh|py|mjs|js|ts)\b/;
const FAIL_SIGNS = /\b[1-9]\d* (?:failed|failing|errors?)\b|^\s*FAIL\b|\bFAILED\b|error TS\d+|Traceback \(most recent call last\)|AssertionError|\bexit=[1-9]\d*/m;

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** the command text an agent ran, as it issued it */
export function commandOf(c: RawCall): string | null {
  if (SHELL.has(c.name)) {
    const cmd = c.args.command ?? c.args.cmd;
    if (typeof cmd === 'string') return cmd;
    if (Array.isArray(cmd)) {
      const parts = cmd.map(String);
      return parts.length >= 3 && /(^|\/)(ba|z)?sh$/.test(parts[0]!) && /^-l?c$/.test(parts[1]!) ? parts.slice(2).join(' ') : parts.join(' ');
    }
    return null;
  }
  if (CODE.has(c.name)) return str(c.args.code) ?? str(c.args.input) ?? (c.argsText || null);
  return null;
}

export function kindOf(c: RawCall, command: string | null): StepKind {
  if (command !== null) return isTest(command, c.name) ? 'test' : 'command';
  if (EDIT.has(c.name)) return 'edit';
  if (READ.has(c.name)) return 'read';
  if (AGENT.has(c.name)) return 'subagent';
  return 'other';
}

/** tests/checks actually run; inside code (execute_code) only the shell commands it passes on count */
export function isTest(command: string, tool: string): boolean {
  if (CODE.has(tool)) {
    const inner = [...command.matchAll(/(?:terminal|run|check_output|check_call|call|Popen|system|exec_command)\(\s*(?:command\s*=\s*)?(?:\[([^\]]*)\]|f?(["']{1,3})([\s\S]*?)\2)/g)].map((m) => m[1] ?? m[3] ?? '');
    return inner.some((s) => testText(s));
  }
  return testText(command);
}
function testText(s: string): boolean {
  // a mention in a commit message / ledger --checks value is not a run
  const stripped = s.replace(/(--checks(?:-result)?|--goal|--report|-m)\s+("([^"\\]|\\.)*"|'[^']*')/g, '');
  if (/--dry-run/.test(stripped)) return false;
  return TEST_RE.test(stripped);
}

export function operationOf(c: RawCall, kind: StepKind): Operation {
  if (kind === 'subagent') return 'invoke_agent';
  if (PLAN.has(c.name)) return 'plan';
  return 'execute_tool';
}

const parse = (s: string | undefined): Record<string, unknown> | undefined => {
  if (!s) return undefined;
  try {
    const v = JSON.parse(s) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
};

const BENIGN = /^\s*(?:cd [^&;]+&&\s*)?(?:grep|rg|egrep|fgrep|git diff|diff|cmp|test|\[|pgrep|which|command -v)\b/;

/** pass | fail | unknown from the tool result. Tests that exit 0 but print failures fail; grep-with-no-match is not a failure. */
export function outcomeOf(c: RawCall, kind: StepKind, command: string | null, run: RawRun): Outcome {
  const text = c.resultText;
  if (text === undefined) return 'unknown';
  const res = parse(text);
  if (c.name === 'Monitor') return 'unknown';
  if (run.summary.harness === 'claude-code') {
    const ex = c.extra ?? {};
    if (ex.backgroundTaskId !== undefined || c.args.run_in_background === true) return 'unknown';
    if (c.resultError) return 'fail';
    if (ex.interrupted === true) return 'fail';
    const out = `${str(ex.stdout) ?? ''}\n${str(ex.stderr) ?? ''}\n${text}`;
    return kind === 'test' && FAIL_SIGNS.test(out) ? 'fail' : 'pass';
  }
  if (kind === 'edit') {
    if (!res) return /^(error|\[?blocked)/i.test(text.trim()) ? 'fail' : 'pass';
    if (res.success === false || (typeof res.error === 'string' && res.error.length > 0)) return 'fail';
    return 'pass';
  }
  if (run.summary.harness === 'codex') {
    const meta = parse(str(res?.output) ?? '') ?? res;
    const code = Number(asNum(asObjOf(meta?.metadata).exit_code) ?? asNum(/(?:exit(?:ed)?(?: with)?(?: code)?|Exit code)[: ]+(-?\d+)/i.exec(text)?.[1]));
    if (Number.isFinite(code)) return code === 0 ? (kind === 'test' && FAIL_SIGNS.test(text) ? 'fail' : 'pass') : 'fail';
    if (/Script failed|\berror\b/i.test(text.slice(0, 200))) return 'fail';
    return /Script completed/.test(text) ? (kind === 'test' && FAIL_SIGNS.test(text) ? 'fail' : 'pass') : 'unknown';
  }
  // hermes
  if (!res) {
    if (text.startsWith('[Duplicate tool output')) return 'unknown';
    return /^(error|\[?blocked|tool error)/i.test(text.trim()) ? 'fail' : 'unknown';
  }
  const status = str(res.status);
  if (CODE.has(c.name)) {
    if (status === 'success') return kind === 'test' && FAIL_SIGNS.test(str(res.output) ?? '') ? 'fail' : 'pass';
    if (status) return 'fail';
  }
  if (status === 'blocked' || status === 'error' || status === 'timeout') return 'fail';
  const output = str(res.output) ?? '';
  if (typeof res.session_id === 'string' && /background/i.test(output)) return background(res.session_id, c, run, kind);
  const code = asNum(res.exit_code);
  if (code === undefined) return typeof res.error === 'string' && res.error ? 'fail' : 'unknown';
  if (code === 0) return kind === 'test' && FAIL_SIGNS.test(output) ? 'fail' : 'pass';
  if (kind !== 'test' && code === 1 && command && BENIGN.test(command)) return 'pass';
  return 'fail';
}

function background(proc: string, c: RawCall, run: RawRun, kind: StepKind): Outcome {
  for (const [order, text] of run.notices) {
    if (order <= c.order || !text.includes(proc)) continue;
    const m = /exit(?:ed)?(?: with)?(?: code)?[\s:=]+(-?\d+)/i.exec(text.slice(text.indexOf(proc)));
    if (m) return Number(m[1]) === 0 ? (kind === 'test' && FAIL_SIGNS.test(text) ? 'fail' : 'pass') : 'fail';
  }
  return 'unknown';
}

const asNum = (v: unknown): number | undefined => (typeof v === 'number' ? v : typeof v === 'string' && /^-?\d+$/.test(v) ? Number(v) : undefined);
const asObjOf = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

const abs = (p: string, cwd: string | null): string => (isAbsolute(p) || !cwd ? p : resolve(cwd, p.replace(/^~(?=\/)/, process.env.HOME ?? '~')));

/** files the call edited (absolute when the cwd is known). Hermes results name the resolved paths. */
export function editedFiles(c: RawCall, cwd: string | null): string[] {
  if (!EDIT.has(c.name)) return [];
  const out = new Set<string>();
  const res = parse(c.resultText);
  if (res && Array.isArray(res.files_modified)) for (const f of res.files_modified) if (typeof f === 'string') out.add(f);
  if (res && typeof res.resolved_path === 'string' && out.size === 0) out.add(res.resolved_path);
  for (const k of ['path', 'file_path', 'notebook_path']) {
    const v = c.args[k];
    if (typeof v === 'string' && v) out.add(abs(v, cwd));
  }
  const patchText = str(c.args.patch) ?? str(c.args.input) ?? (c.name === 'apply_patch' ? c.argsText : undefined);
  if (patchText) for (const m of patchText.matchAll(/^\*\*\* (?:Update|Add|Delete) File: (.+)$/gm)) out.add(abs(m[1]!.trim(), cwd));
  return [...out];
}

export function readFiles(c: RawCall, command: string | null, cwd: string | null): string[] {
  const out: string[] = [];
  if (READ.has(c.name)) for (const k of ['path', 'file_path', 'notebook_path']) {
    const v = c.args[k];
    if (typeof v === 'string' && v) out.push(abs(v, cwd));
  }
  // a shell read of a Mole note (cat .mole/notes/x.md) counts: notes are what 'stale context' is about
  if (command) for (const m of command.matchAll(/(?:^|[\s"'=])((?:[^\s"';|&]*\/)?\.mole\/notes\/[^\s"';|&]+\.md)/g)) out.push(abs(m[1]!, cwd));
  return out;
}

const COMMIT_CMD = /\bgit\b[\s\S]*?\b(commit|merge|cherry-pick|revert|am|rebase)\b|\bledger\b/;
/** short shas this call's command created (git commit '[branch abc1234] msg', ledger 'commit abc1234') */
export function commitsOf(c: RawCall, command: string | null): string[] {
  if (!command || !c.resultText || !COMMIT_CMD.test(command)) return [];
  const res = parse(c.resultText);
  const text = str(res?.output) ?? c.resultText;
  const out = new Set<string>();
  for (const m of text.matchAll(/^\[[^\]\s]+(?: \([^)]*\))? ([0-9a-f]{7,40})\]/gm)) out.add(m[1]!);
  for (const m of text.matchAll(/^commit ([0-9a-f]{7,40})\b/gm)) out.add(m[1]!);
  return [...out];
}
export const isCommitCommand = (command: string | null): boolean => !!command && COMMIT_CMD.test(command);
export const isEditTool = (name: string): boolean => EDIT.has(name);
