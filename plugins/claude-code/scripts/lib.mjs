// Shared helpers for the Mole Claude Code hooks (node >= 22, no dependencies).
// Hook I/O follows https://code.claude.com/docs/en/hooks : JSON on stdin (session_id, cwd, hook_event_name, ...), JSON on
// stdout on exit 0. A hook never fails the session: any problem = exit 0 with no output (and a line on stderr, which Claude
// Code only writes to its debug log for exit 0).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
/** Claude Code caps additionalContext / systemMessage at 10,000 characters. */
export const MAX_CHARS = 9500;

export function readInput() {
  try {
    const raw = readFileSync(0, 'utf8').trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function git(cwd, args) {
  try {
    return execFileSync('git', ['-C', cwd, '-c', 'log.showSignature=false', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return undefined;
  }
}

/** The repository root of `cwd`, or undefined outside git. */
export function repoRoot(cwd) {
  return git(cwd, ['rev-parse', '--show-toplevel'])?.trim() || undefined;
}

const isFile = (p) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};

/**
 * How the hooks find the Mole CLI, first match wins:
 *   1. MOLE_BIN: a path to the CLI (a .js/.cjs/.mjs file runs with this node; anything else is executed). Set but missing = no CLI.
 *   2. `mole` on PATH (npm link / a global install of @mole/daemon).
 *   3. packages/daemon/dist/cli.js in the session's repository (working on Mole itself) or next to this plugin (plugin used from a Mole checkout).
 * Returns [command, prefixArgs] or undefined.
 */
export function findMole(root) {
  const asCmd = (p) => (/\.[cm]?js$/.test(p) ? [process.execPath, ['--no-warnings', p]] : [p, []]);
  if (process.env.MOLE_BIN !== undefined && process.env.MOLE_BIN !== '') return isFile(process.env.MOLE_BIN) ? asCmd(resolve(process.env.MOLE_BIN)) : undefined;
  for (const dir of (process.env.PATH ?? '').split(delimiter)) if (dir && isFile(join(dir, 'mole'))) return [join(dir, 'mole'), []];
  for (const p of [root && join(root, 'packages/daemon/dist/cli.js'), resolve(here, '../../../packages/daemon/dist/cli.js')]) if (p && isFile(p)) return asCmd(p);
  return undefined;
}

/** Run the Mole CLI and parse its --json output; undefined on any failure. */
export function moleJson(mole, root, args, timeoutMs = 45_000) {
  try {
    const out = execFileSync(mole[0], [...mole[1], ...args, '--root', root], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
    return JSON.parse(out);
  } catch (e) {
    process.stderr.write(`mole hook: ${args[0]} failed: ${String(e.message ?? e).split('\n')[0]}\n`);
    return undefined;
  }
}

/** Where a session's start state lives: CLAUDE_PLUGIN_DATA (persistent plugin dir) else $TMPDIR/mole-claude-code. */
export function sessionFile(sessionId) {
  const dir = join(process.env.CLAUDE_PLUGIN_DATA || join(tmpdir(), 'mole-claude-code'), 'sessions');
  return join(dir, `${String(sessionId || 'unknown').replace(/[^\w.-]/g, '_')}.json`);
}

export function saveSession(sessionId, data) {
  try {
    const f = sessionFile(sessionId);
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, JSON.stringify(data));
  } catch {
    // no state = Stop falls back to the working tree vs HEAD
  }
}

export function loadSession(sessionId) {
  try {
    const f = sessionFile(sessionId);
    return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : undefined;
  } catch {
    return undefined;
  }
}

export const clip = (s, n = MAX_CHARS) => (s.length > n ? `${s.slice(0, n - 40)}\n… (cut at ${n} chars: run mole for the rest)` : s);

/** Print one JSON object for Claude Code and exit 0. */
export function emit(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

// ---------------------------------------------------------------- T21: parallel-agent collisions for this session
const hhmm = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};
const via = (p) => (p.path?.length ? p.path.join(', ') : `shared ${p.shared.join(', ')}`);

/**
 * The repo root written the way Claude Code writes paths for this session (its cwd), not git's resolved form: transcripts
 * record cwd + file paths as the session saw them (/var/... vs git's /private/var/..., or a symlinked project folder), and
 * mole collisions matches runs to the repo by path prefix.
 */
export function sameFormRoot(root, cwd) {
  try {
    if (!cwd) return root;
    const rel = relative(root, realpathSync(cwd));
    if (rel.startsWith('..')) return root;
    const parts = rel ? rel.split('/').length : 0;
    let r = resolve(cwd);
    for (let i = 0; i < parts; i++) r = dirname(r);
    return realpathSync(r) === realpathSync(root) ? r : root;
  } catch {
    return root;
  }
}

/**
 * `mole collisions --json --run <session>` for the last few hours; undefined when the CLI fails or the session is unknown.
 * Only when the session's transcript already has a tool call: a session with no steps of its own can't collide, and the
 * CLI call (reads every harness's recent runs) is skipped. timeoutMs = this call's own budget inside the hook's Claude Code
 * timeout (MOLE_COLLISIONS_TIMEOUT_MS overrides); on timeout nothing is printed for collisions.
 */
export function sessionCollisions(mole, root, input, timeoutMs, hours = 4) {
  const sessionId = input.session_id;
  if (!sessionId || !input.transcript_path) return undefined;
  try {
    if (!readFileSync(input.transcript_path, 'utf8').includes('"tool_use"')) return undefined;
  } catch {
    return undefined;
  }
  const budget = Number(process.env.MOLE_COLLISIONS_TIMEOUT_MS) > 0 ? Number(process.env.MOLE_COLLISIONS_TIMEOUT_MS) : timeoutMs;
  const r = moleJson(mole, sameFormRoot(root, input.cwd), ['collisions', '--json', '--run', String(sessionId), '--since', String(hours)], budget);
  return r && Array.isArray(r.pairs) ? r : undefined;
}

/** SessionStart: other parallel runs whose work meets this session's (max 3 pairs). '' when none. */
export function collisionsStartText(r, sessionId) {
  const pairs = (r?.pairs ?? []).filter((p) => p.a.run === sessionId || p.b.run === sessionId);
  if (!pairs.length) return '';
  const out = [`mole: ${pairs.length} parallel run${pairs.length === 1 ? ' touches' : 's touch'} code near yours (mole collisions):`];
  for (const p of pairs.slice(0, 3)) {
    const other = p.a.run === sessionId ? p.b : p.a;
    const did = p.changes.filter((c) => c.run === other.run).map((c) => `${c.how === 'edit' ? 'edited' : 'read'} ${c.symbol} ${hhmm(c.time)}`);
    out.push(`- ${other.harness} ${other.run}${other.title ? ` (${other.title})` : ''}: ${did.join('; ') || 'related code'}`, `  path: ${via(p)}`);
  }
  if (pairs.length > 3) out.push(`(${pairs.length - 3} more: mole collisions --run ${sessionId})`);
  return out.join('\n');
}

/** Stop: what THIS session edited that another parallel run relies on, + its edits under notes. '' when none. */
export function collisionsStopText(r, sessionId) {
  const out = [];
  for (const p of r?.pairs ?? []) {
    if (p.a.run !== sessionId && p.b.run !== sessionId) continue;
    const other = p.a.run === sessionId ? p.b : p.a;
    // the other run relies on an edit of mine when it touched the same function, or its code calls (via the chain) the
    // function I edited: the chain's LAST node. A chain starting at my edit = I call into its code, not the other way round.
    const end = p.path?.length ? p.path.at(-1).split(' -> ').at(-1) : undefined;
    const theirs = new Set(p.changes.filter((c) => c.run === other.run).map((c) => c.symbol));
    const start = p.path?.length ? p.path[0].split(' -> ')[0] : undefined;
    for (const c of p.changes.filter((c) => c.run === sessionId && c.how === 'edit')) {
      const relies = p.shared.includes(c.symbol) || (end === c.symbol && start !== undefined && theirs.has(start));
      if (relies) out.push(`mole: you changed ${c.symbol}; ${other.harness} ${other.run} relies on it (${via(p)})`);
    }
  }
  for (const n of r?.notes ?? []) if (n.run === sessionId) out.push(`mole: you edited ${n.symbol} under note ${n.note}`);
  return [...new Set(out)].join('\n');
}

// ---------------------------------------------------------------- T37: the decisions behind the code, for the agent plugin
// Mole's plugin carries the PEOPLE's decisions (.mole/decisions/*.md, .mole/tenets.md) to the agent, and reports the
// agent's effect on them back to the person (Raymond 10-29 15:30). Parsed here with a plain regex, not @mole/decisions:
// the plugin scripts stay dependency-free (see the file header), and this only needs id/title/status/approver/scope,
// never the full citator graph. Flags (red/yellow/green/grey) still come from the real engine via `mole decisions --json`.
const SCOPE_BUDGET = 1500; // M31a: the governing-decisions block's id/title/status/owner lines fit in 1,500 characters
// T43: each decision's full rationale (Decision + Context/Rationale + Consequences, MADR/Nygard section
// names -- the vocabulary graph.ts's loadAdrDir already recognizes for status) gets its own, separate,
// documented budget per decision, added after the one-liner. Kept well under MAX_CHARS (9500, Claude Code's
// additionalContext/systemMessage cap) even with several decisions in play; decisionsBlock's outer clip()
// in the hook scripts is the absolute last-resort cutoff, this budget is what should make that rare.
const RATIONALE_BUDGET_PER_DECISION = 1200;

function parseFrontMatterField(text, key) {
  const m = new RegExp(`^${key}:\\s*'?([^'\\n]*)'?\\s*$`, 'm').exec(text);
  return m ? m[1].trim() : undefined;
}

/** Dependency-free MADR/Nygard/adr-tools section extraction (mirrors packages/decisions/src/rationale.ts's
 * sectionsOf exactly in spirit -- kept as a separate, duplicated implementation here on purpose, since
 * these hook scripts stay dependency-free, see the file header comment above). Returns {} with the whole
 * stripped body as `decision` when no recognized '##'/'###' heading is found. */
function stripFrontMatterBody(text) {
  const lines = text.split(/\r?\n/);
  if ((lines[0] ?? '').trim() !== '---') return text;
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  return end < 0 ? text : lines.slice(end + 1).join('\n');
}

function bucketOf(heading) {
  const h = heading.toLowerCase();
  if (/^decision\b/.test(h) || /^decision outcome\b/.test(h)) return 'decision';
  if (/^consequences\b/.test(h)) return 'consequences';
  if (/^context\b/.test(h) || /^rationale\b/.test(h) || /^decision drivers\b/.test(h) || /^considered options\b/.test(h)) return 'context';
  return undefined;
}

function sectionsOfText(text) {
  const body = stripFrontMatterBody(text);
  const lines = body.split(/\r?\n/);
  const idx = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^#{2,3}\s+(.+?)\s*$/.exec(lines[i] ?? '');
    if (m) idx.push({ line: i, heading: m[1] });
  }
  if (idx.length === 0) {
    const whole = body.trim();
    return whole ? { decision: whole } : {};
  }
  const out = {};
  for (let n = 0; n < idx.length; n++) {
    const bucket = bucketOf(idx[n].heading);
    if (!bucket) continue;
    const end = idx[n + 1]?.line ?? lines.length;
    const content = lines.slice(idx[n].line + 1, end).join('\n').trim();
    if (!content) continue;
    out[bucket] = out[bucket] ? `${out[bucket]}\n\n${content}` : content;
  }
  if (Object.keys(out).length === 0) {
    const whole = body.trim();
    return whole ? { decision: whole } : {};
  }
  return out;
}

function clipWords(s, n) {
  if (s.length <= n) return s;
  const cut = s.slice(0, Math.max(0, n - 1));
  const space = cut.lastIndexOf(' ');
  return `${(space > n * 0.6 ? cut.slice(0, space) : cut).trim()}\u2026`;
}

/** Named sections, Decision first (never truncated while Context/Consequences still have budget to give up
 * -- "never mid-Decision"), within `budget` characters total. '' when there is nothing to say. */
function formatSectionsText(s, budget) {
  const order = [['Decision', s.decision], ['Context/Rationale', s.context], ['Consequences', s.consequences]].filter(([, v]) => v);
  if (!order.length) return '';
  const parts = [];
  let remaining = budget;
  for (const [label, text] of order) {
    if (remaining <= 0) {
      parts.push(`(${label} omitted: budget exhausted)`);
      continue;
    }
    const line = `${label}: ${text}`;
    if (line.length <= remaining) {
      parts.push(line);
      remaining -= line.length + 2;
    } else {
      const keep = Math.max(0, remaining - `${label}: `.length);
      parts.push(`${label}: ${clipWords(text, keep)}`);
      remaining = 0;
    }
  }
  return parts.join('\n\n');
}

/** .mole/decisions/*.md, parsed by hand: id, title, status, approver, scope file list (symbol/folder tail dropped),
 * plus (T43) its full rationale text, named by section and bounded by RATIONALE_BUDGET_PER_DECISION. */
export function readDecisionRecords(root) {
  const dir = join(root, '.mole', 'decisions');
  const out = [];
  let names;
  try {
    names = readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
  } catch {
    return out;
  }
  for (const name of names) {
    let text;
    try {
      text = readFileSync(join(dir, name), 'utf8');
    } catch {
      continue;
    }
    const id = parseFrontMatterField(text, 'id');
    if (!id) continue;
    const scopeBlock = /^scope:\n((?:\s+-.*\n)+)/m.exec(text);
    const files = new Set();
    if (scopeBlock) {
      for (const line of scopeBlock[1].split('\n')) {
        const item = line.trim().replace(/^-\s*/, '').replace(/^['"]|['"]$/g, '');
        if (!item) continue;
        files.add(item.split('#')[0]);
      }
    }
    out.push({
      id,
      title: parseFrontMatterField(text, 'title') ?? id,
      status: parseFrontMatterField(text, 'status') ?? 'unknown',
      approver: parseFrontMatterField(text, 'approver'),
      file: `.mole/decisions/${name}`,
      files, // repo-relative paths (folder targets keep their trailing '/')
      rationale: formatSectionsText(sectionsOfText(text), RATIONALE_BUDGET_PER_DECISION), // T43, '' when none
    });
  }
  return out;
}

/** A decision's scope file matches a changed file: exact path, or the changed file sits under a scope folder ('dir/'). */
function scopeMatches(scopeFile, changed) {
  if (scopeFile === changed) return true;
  if (scopeFile.endsWith('/')) return changed === scopeFile.slice(0, -1) || changed.startsWith(scopeFile);
  return false;
}

/** Decisions (hand-parsed, see readDecisionRecords) whose scope covers any of `files`. `liveFlags: true` enriches each
 * with its CURRENT citator flag via `mole decisions --json` (tenet-3 / decision 0013: heavy work stays out of the fast
 * path -- `mole decisions --json` walks git history for every scope anchor and can take seconds on a repo with a long
 * history, so SessionStart and PreToolUse (M31a's p95 <= 2 s budget) use the record's own `status` as a fast, honest
 * proxy for the flag instead; Stop, which has no such budget, asks for the live flag so drift is visible there). */
export function governingDecisions(mole, root, files, { liveFlags = false } = {}) {
  const records = readDecisionRecords(root).filter((d) => [...d.files].some((f) => [...files].some((c) => scopeMatches(f, c))));
  if (records.length === 0) return [];
  let flags = new Map();
  if (liveFlags && mole) {
    const r = moleJson(mole, root, ['decisions', '--json'], 15_000);
    if (r && Array.isArray(r.decisions)) flags = new Map(r.decisions.map((d) => [d.id, d.flag]));
  }
  return records.map((d) => ({ ...d, flag: flags.get(d.id) })).sort((a, b) => a.id.localeCompare(b.id));
}

/** One rule line per decision (M31a: "each as a rule to follow with its flag and owner"), clipped to SCOPE_BUDGET
 * chars; then (T43) each decision that made the cut gets its own full-rationale block appended, named by section
 * (Decision/Context-Rationale/Consequences) and bounded by RATIONALE_BUDGET_PER_DECISION each -- never mid-Decision,
 * and never replacing the one-liner summary above it (done-when 2: the compact line still always comes through). */
export function decisionsBlock(decisions, header = 'Mole decisions governing the files in play') {
  if (!decisions.length) return '';
  const lines = decisions.map((d) => `- ${d.id} [${d.flag ?? d.status}] ${d.status} \u2014 ${d.title} \u2014 owner: ${d.approver ?? 'unassigned'} (${d.file})`);
  let kept = decisions;
  let out = `${header} (${decisions.length}):\n${lines.join('\n')}`;
  if (out.length > SCOPE_BUDGET) {
    // keep as many whole rule lines as fit, then say how many were cut (never truncate a line mid-decision)
    const head = `${header} (${decisions.length}):`;
    const keptLines = [];
    kept = [];
    let len = head.length;
    for (let i = 0; i < lines.length; i++) {
      if (len + 1 + lines[i].length > SCOPE_BUDGET - 24) break;
      keptLines.push(lines[i]);
      kept.push(decisions[i]);
      len += 1 + lines[i].length;
    }
    const cut = lines.length - keptLines.length;
    out = `${head}\n${keptLines.join('\n')}${cut > 0 ? `\n(${cut} more: mole decisions --json)` : ''}`;
  }
  const rationaleBlocks = kept.filter((d) => d.rationale).map((d) => `why ${d.id}:\n${d.rationale}`);
  return rationaleBlocks.length ? `${out}\n\n${rationaleBlocks.join('\n\n')}` : out;
}

/** Decisions touched by a diff's files, with their CURRENT flag (Stop: "decisions the session's diff touched"). */
export function decisionsDiffText(mole, root, files) {
  const list = governingDecisions(mole, root, files, { liveFlags: true });
  if (!list.length) return '';
  return decisionsBlock(list, 'mole: decisions this session touched');
}

/** T35 weak spots (packages/coverage, `mole coverage --weak --json`) for the files in play, when that task has landed
 * on main; 'not available yet' otherwise (T35 may still be running). Only called when there is a decisions block to
 * attach it to, so a repo with nothing to say about decisions also says nothing about weak spots. Checks the package
 * exists before spawning the CLI: `mole coverage` isn't a real subcommand until T35 lands, and a spawn-and-fail per
 * session would cost ~300-500 ms it doesn't need to (M31a's p95 budget). */
export function weakSpotsLine(mole, root, files) {
  if (!mole || !existsSync(join(root, 'packages', 'coverage'))) return '(weak spots from T35: not available yet)';
  const r = moleJson(mole, root, ['coverage', '--weak', '--json'], 5_000);
  if (!r || !Array.isArray(r.files)) return '(weak spots from T35: not available yet)';
  const set = new Set(files);
  const hits = r.files.filter((f) => set.has(f.file) && f.weak?.is);
  if (!hits.length) return '';
  const reasons = hits.flatMap((f) => (f.weak.reasons ?? []).map((why) => `${f.file}: ${why}`));
  return `weak spots (T35, no guarding test / no recent human read / governed by a red-yellow decision):\n${reasons.slice(0, 5).map((l) => `- ${l}`).join('\n')}`;
}

/** T27 rule violations (`mole rules --json`) whose file is among `files`, each citing its decision id. '' when none,
 * silent on a clean diff (M31b) and on a repo with no rules (checkRules returns 0 rules, 0 violations). `mole rules`
 * intentionally exits 1 when it finds a violation (packages/decisions/src/rules/cli.ts), so this calls the CLI
 * directly and reads stdout on BOTH exit 0 and exit 1 -- moleJson() in this file treats any non-zero exit as a
 * failure and would silently drop every real violation otherwise. */
export function ruleViolationsText(mole, root, files) {
  if (!mole || !existsSync(join(root, '.mole', 'decisions'))) return ''; // no decisions dir: nothing could have a rules: list
  let out;
  try {
    out = execFileSync(mole[0], [...mole[1], 'rules', '--json', '--root', root], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 20_000, maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    out = typeof e.stdout === 'string' ? e.stdout : undefined; // exit 1 (violations found) still has valid JSON on stdout
  }
  let r;
  try {
    r = out ? JSON.parse(out) : undefined;
  } catch {
    return '';
  }
  if (!r || !Array.isArray(r.violations) || !r.violations.length) return '';
  const set = new Set(files);
  const hits = r.violations.filter((v) => set.has(v.file));
  if (!hits.length) return '';
  const lines = hits.map((v) => `- ${v.file}:${v.line} ${v.kind} ${v.target} breaks ${v.decision.id} "${v.decision.title}"${v.decision.flag ? ` (${v.decision.flag})` : ''}${v.decision.why ? ` \u2014 ${v.decision.why}` : ''}`);
  return `mole: decision-rule violations in this session's diff (${hits.length}, T27 \`mole rules\`):\n${lines.join('\n')}`;
}

/** PreToolUse: decisions already added as context this session, so each is added at most once (never a second time, never a block). */
function addedDecisionsFile(sessionId) {
  return join(process.env.CLAUDE_PLUGIN_DATA || join(tmpdir(), 'mole-claude-code'), 'sessions', `${String(sessionId || 'unknown').replace(/[^\w.-]/g, '_')}.decisions.json`);
}

export function loadAddedDecisions(sessionId) {
  try {
    const f = addedDecisionsFile(sessionId);
    return existsSync(f) ? new Set(JSON.parse(readFileSync(f, 'utf8'))) : new Set();
  } catch {
    return new Set();
  }
}

export function saveAddedDecisions(sessionId, set) {
  try {
    const f = addedDecisionsFile(sessionId);
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, JSON.stringify([...set]));
  } catch {
    // best effort: a decision may be re-added once more next call, never a crash
  }
}
