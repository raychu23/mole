#!/usr/bin/env node
// T37 M31 checks (loop rule R4 writes one runs.jsonl line per run). Frozen key: plugins/claude-code/bench/m31-key.json
// (dated 2026-10-29, built by a method independent of the hook/MCP code this script exercises -- see the key's "method").
// M31a: SessionStart on 10 replayed real sessions of this repo -> lists the governing decisions 10/10, <=1500 chars, p95 <=2s.
// M31b: Stop on 5 planted rule violations (fixture repo) -> reports 5/5 with the decision id; silent on 5 clean diffs.
// Also checks: PreToolUse adds a decision at most once per session; hooks never fail (bad input -> exit 0, no output).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const plugin = join(here, '..');
const repoRoot = join(plugin, '../..'); // packages/, .mole/, tasks/ live here (this worktree checkout)
const moleBin = join(repoRoot, 'packages/daemon/dist/cli.js');
const key = JSON.parse(readFileSync(join(plugin, 'bench/m31-key.json'), 'utf8'));

const fails = [];
const ok = (cond, msg) => {
  if (!cond) fails.push(msg);
};

function hook(script, input, env = {}) {
  const t0 = Date.now();
  let stdout = '';
  try {
    stdout = execFileSync(process.execPath, [join(plugin, 'scripts', `${script}.mjs`)], {
      input: JSON.stringify(input),
      encoding: 'utf8',
      env: { ...process.env, MOLE_BIN: moleBin, CLAUDE_PLUGIN_ROOT: plugin, ...env },
      timeout: 60_000,
    });
  } catch (e) {
    return { ms: Date.now() - t0, stdout: e.stdout ?? '', crashed: true, err: String(e.message ?? e) };
  }
  return { ms: Date.now() - t0, stdout, crashed: false, json: stdout.trim() ? JSON.parse(stdout) : undefined };
}

const g = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

// ---------------------------------------------------------------- M31a: SessionStart on 10 real replayed sessions
const m31aTimes = [];
let m31aHits = 0;
const scratchBase = mkdtempSync(join(tmpdir(), 'mole-m31a-'));
for (const s of key.m31a.sessions) {
  const wt = join(scratchBase, s.id);
  try {
    execFileSync('git', ['-C', repoRoot, 'worktree', 'add', '--detach', '--force', wt, s.branch], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    fails.push(`m31a ${s.id} (${s.task}): could not check out ${s.branch}: ${String(e.message ?? e).split('\n')[0]}`);
    continue;
  }
  // Stage this session's real touched files (from the real branch's real diff, see m31-key.json "method") as an
  // uncommitted edit, so SessionStart's existing filesInPlay() (git status half) finds them -- every surviving
  // candidate branch's tip is a merge commit, and `git log --name-only` does not diff a merge commit by default
  // (see tasks/T37-plugin-decisions-first/4 log/key-changes.md).
  for (const f of s.touch_files ?? []) {
    try {
      writeFileSync(join(wt, f), `${readFileSync(join(wt, f), 'utf8')}\n`);
    } catch (e) {
      fails.push(`m31a ${s.id}: could not touch ${f}: ${String(e.message ?? e).split('\n')[0]}`);
    }
  }
  const sid = `m31a-${s.id}`;
  const r = hook('session-start', { session_id: sid, cwd: wt, source: 'startup' });
  m31aTimes.push(r.ms);
  const ctx = r.json?.hookSpecificOutput?.additionalContext ?? '';
  const block = /Mole decisions governing[^]*?(?=\n\n|$)/.exec(ctx)?.[0] ?? '';
  const missing = s.expected_decisions.filter((id) => !block.includes(id));
  if (missing.length === 0 && block.length > 0) m31aHits++;
  else fails.push(`m31a ${s.id} (${s.task}): missing decisions ${JSON.stringify(missing)} in block (len ${block.length}): ${block.slice(0, 200)}`);
  ok(block.length <= key.m31a.target_chars, `m31a ${s.id}: decisions block ${block.length} chars > ${key.m31a.target_chars}`);
  try {
    execFileSync('git', ['-C', repoRoot, 'worktree', 'remove', '--force', wt], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    /* best-effort cleanup */
  }
}
rmSync(scratchBase, { recursive: true, force: true });
m31aTimes.sort((a, b) => a - b);
const p95 = m31aTimes.length ? m31aTimes[Math.min(m31aTimes.length - 1, Math.ceil(m31aTimes.length * 0.95) - 1)] : -1;
ok(p95 >= 0 && p95 <= key.m31a.target_p95_ms, `m31a p95 ${p95}ms > ${key.m31a.target_p95_ms}ms`);

// ---------------------------------------------------------------- M31b: Stop on 5 planted violations + 5 clean diffs
const FILES = { 'src/core/engine.ts': '// base\nexport function run(x: number): number {\n  return x * 2;\n}\n', 'src/cli.ts': "export function main(): void {\n  console.log('hi');\n}\n" };
const CASE_FILES = {
  v1: { 'src/core/engine.ts': "import { writeFileSync } from 'node:fs';\nexport function run(x: number): number {\n  writeFileSync('/tmp/out.txt', String(x));\n  return x * 2;\n}\n" },
  v2: { 'src/core/engine.ts': "import { readFileSync } from 'node:fs';\nexport function run(x: number): number {\n  const s = readFileSync('/tmp/in.txt', 'utf8');\n  return Number(s) * 2;\n}\n" },
  v3: { 'src/cli.ts': "import { parse } from 'yaml';\nexport function main(): void {\n  console.log(parse('a: 1'));\n}\n" },
  v4: { 'src/core/engine.ts': "import { thing } from '@app/util';\nexport function run(x: number): number {\n  return thing(x);\n}\n" },
  v5: { 'src/core/types.ts': "import type { Util } from '@app/util';\nexport type Engine = Util;\n" },
  c1: { 'src/core/engine.ts': '// nothing special here\nexport function run(x: number): number {\n  return x * 2;\n}\n' },
  c2: { 'src/core/engine.ts': "import { readFile } from 'node:fs';\nexport function run(x: number): number {\n  readFile('/tmp/in.txt', 'utf8', () => {});\n  return x * 2;\n}\n" },
  c3: { 'src/cli.ts': "import { z } from 'zod';\nexport function main(): void {\n  console.log(z.string().parse('hi'));\n}\n" },
  c4: { 'src/core/util.ts': 'export function helper(x: number): number {\n  return x + 1;\n}\n' },
  c5: { 'src/cli.ts': "// comment only\nexport function main(): void {\n  console.log('hi');\n}\n" },
};

let m31bHits = 0;
for (const c of key.m31b.cases) {
  const dir = mkdtempSync(join(tmpdir(), `mole-m31b-${c.id}-`));
  try {
    mkdirSync(join(dir, '.mole/decisions'), { recursive: true });
    mkdirSync(join(dir, 'src/core'), { recursive: true });
    for (const d of key.m31b.decisions) {
      const isCall = d.id === 'd1-no-sync-fs';
      const isLocal = d.id === 'd2-no-leftpad';
      const body = isCall
        ? `---\nid: ${d.id}\ntitle: ${d.title}\nstatus: accepted\napprover: raymond\nrules:\n  - forbid: call\n    callee: [writeFileSync, readFileSync, appendFileSync]\n    from: src/core/\n---\n## Decision\n${d.rule}\n`
        : isLocal
          ? `---\nid: ${d.id}\ntitle: ${d.title}\nstatus: accepted\napprover: raymond\nrules:\n  - forbid: import\n    from: src/cli.ts\n    to: [yaml]\n    dynamic: false\n---\n## Decision\n${d.rule}\n`
          : `---\nid: ${d.id}\ntitle: ${d.title}\nstatus: accepted\napprover: raymond\nrules:\n  - forbid: import\n    from: src/core/\n    to: ['@app/']\n    types: true\n---\n## Decision\n${d.rule}\n`;
      writeFileSync(join(dir, `.mole/decisions/${d.id}.md`), body);
    }
    for (const [p, content] of Object.entries(FILES)) writeFileSync(join(dir, p), content);
    writeFileSync(join(dir, 'package.json'), '{"name":"fixture","version":"0.0.0","private":true}\n');
    try {
      execFileSync('ln', ['-s', join(repoRoot, 'node_modules'), join(dir, 'node_modules')]);
    } catch {
      /* ignore */
    }
    g(dir, 'init', '-q', '-b', 'main');
    g(dir, '-c', 'user.name=Fixture', '-c', 'user.email=f@example.com', 'add', '-A');
    g(dir, '-c', 'user.name=Fixture', '-c', 'user.email=f@example.com', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'base');
    const sid = `m31b-${c.id}`;
    hook('session-start', { session_id: sid, cwd: dir, source: 'startup' });
    // the session's own edit, AFTER the recorded base commit: this is what the Stop hook's diff must see
    for (const [p, content] of Object.entries(CASE_FILES[c.id] ?? {})) {
      mkdirSync(dirname(join(dir, p)), { recursive: true });
      writeFileSync(join(dir, p), content);
    }
    g(dir, 'add', '-A');
    const r = hook('stop', { session_id: sid, cwd: dir, stop_hook_active: false });
    const msg = r.json?.systemMessage ?? '';
    if (c.kind === 'violation') {
      if (msg.includes(c.decision_id)) m31bHits++;
      else fails.push(`m31b ${c.id}: expected violation ${c.decision_id} in Stop systemMessage, got: ${msg.slice(0, 300)}`);
    } else {
      const mentionsAny = key.m31b.decisions.some((d) => msg.includes(d.id));
      if (!mentionsAny) m31bHits++;
      else fails.push(`m31b ${c.id}: expected silence (clean diff), Stop systemMessage mentioned a decision: ${msg.slice(0, 300)}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- PreToolUse: adds a decision at most once, never blocks
{
  const dir = mkdtempSync(join(tmpdir(), 'mole-pretool-'));
  try {
    mkdirSync(join(dir, '.mole/decisions'), { recursive: true });
    mkdirSync(join(dir, 'packages/daemon/src'), { recursive: true });
    writeFileSync(join(dir, '.mole/decisions/0007.md'), "---\nid: '0007'\ntitle: Stop the daemon after 30 idle minutes\nstatus: accepted\napprover: raymond\nscope:\n  - packages/daemon/src/cli.ts\n---\n## Decision\nIdle shutdown.\n");
    writeFileSync(join(dir, 'packages/daemon/src/cli.ts'), 'export function main() {}\n');
    writeFileSync(join(dir, 'package.json'), '{"name":"fixture","version":"0.0.0","private":true}\n');
    g(dir, 'init', '-q', '-b', 'main');
    g(dir, '-c', 'user.name=Fixture', '-c', 'user.email=f@example.com', 'add', '-A');
    g(dir, '-c', 'user.name=Fixture', '-c', 'user.email=f@example.com', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'base');
    const sid = `pretool-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    hook('session-start', { session_id: sid, cwd: dir, source: 'startup' });
    const input = { session_id: sid, cwd: dir, tool_name: 'Edit', tool_input: { file_path: join(dir, 'packages/daemon/src/cli.ts') } };
    const r1 = hook('pre-tool-use', input);
    const r2 = hook('pre-tool-use', input);
    ok(r1.json?.hookSpecificOutput?.permissionDecision === undefined || r1.json?.hookSpecificOutput?.permissionDecision === 'allow', `pre-tool-use must never deny/ask: got ${JSON.stringify(r1.json)}`);
    ok((r1.json?.hookSpecificOutput?.additionalContext ?? '').includes('0007'), `pre-tool-use (1st edit of a governed file) should add decision 0007, got: ${JSON.stringify(r1.json)}`);
    ok(!(r2.json?.hookSpecificOutput?.additionalContext ?? '').includes('0007'), `pre-tool-use (2nd edit, same session, same decision) must not add 0007 again, got: ${JSON.stringify(r2.json)}`);
    ok(r2.crashed === false, 'pre-tool-use must exit 0 even with no new context');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- hooks never fail the session
{
  for (const script of ['session-start', 'pre-tool-use', 'stop']) {
    for (const bad of ['not json', '{}', JSON.stringify({ session_id: 's', cwd: '/definitely/does/not/exist-mole-m31' })]) {
      let code = 0;
      let out = '';
      try {
        out = execFileSync(process.execPath, [join(plugin, 'scripts', `${script}.mjs`)], { input: bad, encoding: 'utf8', env: { ...process.env, MOLE_BIN: join(tmpdir(), 'no-such-mole-binary.js') }, timeout: 15_000 });
      } catch (e) {
        code = e.status ?? 1;
        out = e.stdout ?? '';
      }
      ok(code === 0, `${script}.mjs on bad input '${bad.slice(0, 30)}' must exit 0, got ${code}`);
      ok(out.trim() === '' || (() => { try { JSON.parse(out); return true; } catch { return false; } })(), `${script}.mjs on bad input must print nothing or valid JSON, got: ${out.slice(0, 200)}`);
    }
  }
}

// ---------------------------------------------------------------- summary + R4 runs.jsonl
const metrics = {
  M31a_recall: `${m31aHits}/${key.m31a.sessions.length}`,
  M31a_chars_target: key.m31a.target_chars,
  M31a_p95_ms: p95,
  M31b_hit_rate: `${m31bHits}/${key.m31b.cases.length}`,
};
console.log(`M31a: ${metrics.M31a_recall} sessions had their governing decisions listed, p95 ${p95}ms (target <= ${key.m31a.target_p95_ms}ms)`);
console.log(`M31b: ${metrics.M31b_hit_rate} cases correct (violations cited, clean silent)`);
if (fails.length) {
  console.log(`\n${fails.length} failure(s):`);
  for (const f of fails) console.log(`  - ${f}`);
}

let sha = 'unknown';
try {
  sha = execFileSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
} catch {
  /* ignore */
}
const exit = fails.length === 0 ? 0 : 1;
const runLine = { time: new Date().toISOString(), commit: sha, cmd: 'node plugins/claude-code/test/m31.mjs', exit, metrics };
const runsPath = join(repoRoot, 'tasks/T37-plugin-decisions-first/4 log/runs.jsonl');
mkdirSync(dirname(runsPath), { recursive: true });
writeFileSync(runsPath, `${existsSync(runsPath) ? readFileSync(runsPath, 'utf8') : ''}${JSON.stringify(runLine)}\n`);

process.exit(exit);
