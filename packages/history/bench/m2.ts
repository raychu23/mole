// T12 bench (checks: `npm run check && node packages/history/dist/bench/m2.js`).
// Scores, in code, against the benchmark files copied unchanged into packages/history/bench/ (see bench/README.md):
//   M2  B1 m8-key.json R1-R5 (excalidraw) + R6 (Mole planted case) by the key's own rule
//   B3  planted-m8.diff on Mole at bdeff14: names 9e19c51, its reason, the daemon idle test
//   B2  past-fix-overlap.json recall: every change it counts as touching a fix gets >= 1 past fix
//   M5  p95 wall time per change over every benchmark change + model-call counter (must be 0)
//   C   contract checks for done-when 1 and 6 in temp git repos + the CLI (mole check)
// Exit 0 only when every target is met. Writes dist/bench/metrics.json for the run log.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, formatCheck, modelCalls, NO_PAST_FIXES, type Change, type CheckResult, type PastFix } from '../src/index.js';

const distBench = dirname(fileURLToPath(import.meta.url));
const benchDir = resolve(distBench, '../../bench');
const cliPath = resolve(distBench, '../../../daemon/dist/cli.js');
const moleRoot = execFileSync('git', ['-C', benchDir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const excalidraw = process.env.MOLE_BENCH_EXCALIDRAW ?? join(homedir(), '.hermes/cache/scratch/impact/excalidraw');

interface KeyFix { fix: string; subject: string; lines: string[]; reason: string }
interface KeyCase { id: string; repo: string; change: string; fixes: KeyFix[] }
const key = JSON.parse(readFileSync(join(benchDir, 'keys/m8-key.json'), 'utf8')) as { cases: KeyCase[] };
interface OverlapRow { commit: string; subject: string; fixCommitsStrict?: string[] }
const overlap = JSON.parse(readFileSync(join(benchDir, 'keys/past-fix-overlap.json'), 'utf8')) as {
  summary: Record<string, { fixRule: string }>;
  excalidraw: OverlapRow[];
  mole: OverlapRow[];
};
const repos: Record<string, string> = { excalidraw, mole: moleRoot };
const rules: Record<string, string> = { excalidraw: overlap.summary.excalidraw!.fixRule, mole: overlap.summary.mole!.fixRule };
const PLANTED = join(benchDir, 'fixtures/planted-m8.diff');

const timings: Array<{ id: string; ms: number }> = [];
async function run(id: string, repo: string, change: Change, fixRule?: string): Promise<CheckResult | Error> {
  const t0 = performance.now();
  try {
    const r = await check(repo, change, fixRule ? { fixRule } : {});
    return r;
  } catch (e) {
    return e instanceof Error ? e : new Error(String(e));
  } finally {
    timings.push({ id, ms: performance.now() - t0 });
  }
}
const fixesOf = (r: CheckResult | Error): PastFix[] => (r instanceof Error ? [] : r.hunks.flatMap((h) => h.pastFixes));
const samePrefix = (a: string, b: string): boolean => a.length > 0 && b.length > 0 && (a.startsWith(b) || b.startsWith(a));
const lineOk = (n: unknown): boolean => typeof n === 'number' && Number.isInteger(n) && n > 0;

/** key rule per fix: 1 = names the fix (sha or subject) or its reason + a clickable source (sha + file:line); 0.5 = one of the two; 0 = nothing */
function scoreFix(k: KeyFix, got: PastFix[]): { score: number; named: boolean; source: boolean; lineMatch: boolean } {
  const f = got.find((g) => samePrefix(g.sha, k.fix));
  if (!f) return { score: 0, named: false, source: false, lineMatch: false };
  const named = (f.shortSha.length >= 7 && samePrefix(f.sha, k.fix)) || f.subject === k.subject;
  const source = samePrefix(f.source?.sha ?? '', k.fix) && typeof f.source.file === 'string' && f.source.file.length > 0 && lineOk(f.source.line);
  // diagnostic only (not part of the key rule): does any fix entry point at a key line (fix-side or base-side numbering)?
  const keyLines = new Set(k.lines.map((l) => l.split(' ')[0]!));
  const all = got.filter((g) => samePrefix(g.sha, k.fix));
  const lineMatch = all.some(
    (g) => keyLines.has(`${g.source.file}:${g.source.line}`) || [...keyLines].some((kl) => kl.includes(g.source.file) && (g.lines.some((n) => kl.endsWith(`:${n}`)) || kl.includes(`:${g.source.line}`))),
  );
  return { score: named && source ? 1 : named || source ? 0.5 : 0, named, source, lineMatch };
}

async function main(): Promise<number> {
  const out: string[] = [];
  const fails: string[] = [];
  if (!existsSync(join(excalidraw, '.git')) && !existsSync(join(excalidraw, 'HEAD'))) {
    console.error(`bench: excalidraw clone not found at ${excalidraw} (set MOLE_BENCH_EXCALIDRAW)`);
    return 2;
  }

  // ---- M2 (B1) ----
  const m2: Array<{ id: string; strict: number; lenient: number; perFix: string[]; error?: string }> = [];
  let r6Result: CheckResult | Error | undefined;
  for (const c of key.cases) {
    const repo = repos[c.repo]!;
    const change: Change = c.id === 'R6' ? { diffFile: PLANTED, base: 'bdeff14' } : { sha: c.change };
    const r = await run(`B1 ${c.id}`, repo, change, rules[c.repo]);
    if (c.id === 'R6') r6Result = r;
    const got = fixesOf(r);
    const s = c.fixes.map((k) => ({ k, ...scoreFix(k, got) }));
    const strict = Math.min(...s.map((x) => x.score));
    const lenient = Math.max(...s.map((x) => x.score));
    m2.push({
      id: c.id,
      strict,
      lenient,
      perFix: s.map((x) => `${x.k.fix}=${x.score}${x.lineMatch ? '' : ' (no key line)'}`),
      error: r instanceof Error ? r.message : undefined,
    });
  }
  const r15 = m2.filter((x) => x.id !== 'R6');
  const m2Strict = r15.reduce((a, x) => a + x.strict, 0);
  const m2Lenient = r15.reduce((a, x) => a + x.lenient, 0);
  const r6 = m2.find((x) => x.id === 'R6')?.strict ?? 0;
  out.push(`M2 strict (every key fix named + source) R1-R5 ${m2Strict}/5, lenient (any key fix) ${m2Lenient}/5, R6 ${r6}`);
  for (const x of m2) out.push(`  ${x.id} strict ${x.strict} lenient ${x.lenient}  ${x.perFix.join(', ')}${x.error ? `  ERROR ${x.error}` : ''}`);
  if (m2Strict < 4) fails.push(`M2 R1-R5 ${m2Strict}/5 < 4`);
  if (r6 !== 1) fails.push(`M2 R6 ${r6} != 1`);

  // ---- B3 ----
  const f9 = fixesOf(r6Result ?? new Error('not run')).find((f) => f.sha.startsWith('9e19c51'));
  const b3 = {
    names9e19c51: !!f9,
    reasonEditing: !!f9 && f9.reason.includes('editing counts as use'),
    reasonIndex: !!f9 && /never idle|running index/.test(f9.reason),
    taskLinked: !!f9 && f9.reasonSources.some((s) => s.kind === 'task' && (s.path ?? '').startsWith('tasks/T9-')),
    idleTest: !!f9 && f9.tests.some((t) => t.file === 'packages/daemon/test/daemon.test.ts' && (t.names ?? []).includes('idle shutdown (T9)')),
    source: !!f9 && f9.source.file === 'packages/daemon/src/server.ts' && f9.source.line >= 211 && f9.source.line <= 217,
  };
  const b3ok = Object.values(b3).every(Boolean);
  out.push(`B3 ${b3ok ? 'pass' : 'FAIL'} ${JSON.stringify(b3)}`);
  if (!b3ok) fails.push('B3');

  // ---- B2 recall ----
  let b2hit = 0;
  let b2n = 0;
  let strictFound = 0;
  let strictTotal = 0;
  const b2miss: string[] = [];
  for (const repo of ['excalidraw', 'mole'] as const) {
    for (const row of overlap[repo]) {
      const r = await run(`B2 ${repo} ${row.commit}`, repos[repo]!, { sha: row.commit }, rules[repo]);
      const want = row.fixCommitsStrict ?? [];
      if (want.length === 0) continue;
      b2n++;
      const got = fixesOf(r);
      if (got.length > 0) b2hit++;
      else b2miss.push(`${repo} ${row.commit}${r instanceof Error ? ` (${r.message})` : ''}`);
      strictTotal += want.length;
      strictFound += want.filter((w) => got.some((g) => samePrefix(g.sha, w))).length;
    }
  }
  out.push(`B2 recall ${b2hit}/${b2n} changes get >= 1 past fix (listed fix shas found ${strictFound}/${strictTotal})${b2miss.length ? `; missed: ${b2miss.join(', ')}` : ''}`);
  if (b2n === 0 || b2hit < b2n) fails.push(`B2 ${b2hit}/${b2n}`);

  // ---- C: contract checks (done-when 1, 6) ----
  const contract = await contractChecks();
  out.push(`C contract ${contract.filter((c) => c.ok).length}/${contract.length}${contract.some((c) => !c.ok) ? `; failed: ${contract.filter((c) => !c.ok).map((c) => `${c.name} (${c.why})`).join('; ')}` : ''}`);
  if (contract.some((c) => !c.ok)) fails.push('contract');

  // ---- M5 ----
  const benchTimings = timings.filter((t) => t.id.startsWith('B'));
  const sorted = benchTimings.map((t) => t.ms).sort((a, b) => a - b);
  const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)]! : NaN;
  const slow = [...benchTimings].sort((a, b) => b.ms - a.ms).slice(0, 3).map((t) => `${t.id} ${t.ms.toFixed(0)}`);
  out.push(`M5 p95 ${p95.toFixed(0)} ms over ${sorted.length} changes (max ${sorted.at(-1)?.toFixed(0)} ms; slowest ${slow.join(', ')}), model calls ${modelCalls.count}`);
  if (!(p95 < 2000)) fails.push(`M5 p95 ${p95.toFixed(0)} ms`);
  if (modelCalls.count !== 0) fails.push(`model calls ${modelCalls.count}`);

  console.log(out.join('\n'));
  const metrics = {
    M2: `R1-R5 ${m2Strict}/5 (${r15.map((x) => `${x.id} ${x.strict}`).join(', ')}; lenient ${m2Lenient}/5), R6 ${r6}`,
    M5: `p95 ${p95.toFixed(0)} ms over ${sorted.length} changes, model calls ${modelCalls.count}`,
    B2: `${b2hit}/${b2n}`,
    B3: b3ok ? 'pass' : `fail ${JSON.stringify(b3)}`,
    contract: `${contract.filter((c) => c.ok).length}/${contract.length}`,
  };
  writeFileSync(join(distBench, 'metrics.json'), JSON.stringify(metrics) + '\n');
  console.log(fails.length ? `bench: FAIL (${fails.join('; ')})` : 'bench: all targets met');
  return fails.length ? 1 : 0;
}

// ---------- contract checks in temp repos (done-when 1 and 6) ----------
const ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (root: string, ...args: string[]): string => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', env: ENV }).trim();
function write(root: string, file: string, text: string): void {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), text);
}
function commit(root: string, msg: string): string {
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', msg);
  return git(root, 'rev-parse', 'HEAD');
}
const cli = (...args: string[]) => spawnSync(process.execPath, [cliPath, 'check', ...args], { encoding: 'utf8' });

async function contractChecks(): Promise<Array<{ name: string; ok: boolean; why: string }>> {
  const res: Array<{ name: string; ok: boolean; why: string }> = [];
  const tmp = mkdtempSync(join(tmpdir(), 'mole-history-bench-'));
  const t = async (name: string, f: () => Promise<string | true> | string | true) => {
    try {
      const r = await f();
      res.push({ name, ok: r === true, why: r === true ? '' : r });
    } catch (e) {
      res.push({ name, ok: false, why: e instanceof Error ? e.message.split('\n')[0]! : String(e) });
    }
  };
  try {
    const root = join(tmp, 'r1');
    mkdirSync(root);
    git(root, 'init', '-q', '-b', 'main');
    write(root, 'src/load.ts', 'export function load(x: string | null): string {\n  const v = x;\n  return v.trim();\n}\n');
    commit(root, 'feat: loader');
    write(root, 'src/load.ts', "export function load(x: string | null): string {\n  // null input used to crash the loader\n  const v = x ?? '';\n  return v.trim();\n}\n");
    write(root, 'test/load.test.ts', "describe('load (null input)', () => {\n  it('treats null as empty', () => {});\n});\n");
    const fix = commit(root, 'fix: loader crashed on null input\n\nA null config value reached trim().\n\nSigned-off-by: t <t@t>');
    write(root, 'src/load.ts', "export function load(x: string | null): string {\n  // null input used to crash the loader\n  const v = x ?? 'd';\n  return v.trim();\n}\n");
    const feat = commit(root, 'feat: default');

    await t('dw1 sha mode: fix + reason + test + source', async () => {
      const r = await check(root, { sha: feat });
      const f = r.hunks[0]?.pastFixes[0];
      if (!f || f.sha !== fix) return `fix not found: ${JSON.stringify(r.hunks)}`;
      if (!f.reason.includes('A null config value reached trim().') || f.reason.includes('Signed-off-by')) return `reason ${f.reason}`;
      if (!f.reason.includes('null input used to crash the loader')) return `no fix comment in reason: ${f.reason}`;
      if (!f.tests.some((x) => x.file === 'test/load.test.ts' && (x.names ?? []).includes('load (null input)'))) return `tests ${JSON.stringify(f.tests)}`;
      if (f.source.sha !== fix || f.source.file !== 'src/load.ts' || f.source.line !== 3) return `source ${JSON.stringify(f.source)}`;
      return true;
    });
    await t('dw1 CLI text + --json', () => {
      const a = cli(feat, '--root', root);
      if (a.status !== 0 || !a.stdout.includes(`source: ${fix} src/load.ts:3`) || !/why: /.test(a.stdout) || !/tests: .*load\.test\.ts/.test(a.stdout)) return `text exit ${a.status}: ${a.stdout}${a.stderr}`;
      const j = cli(feat, '--root', root, '--json');
      if (j.status !== 0) return `json exit ${j.status}: ${j.stderr}`;
      return (JSON.parse(j.stdout) as CheckResult).hunks[0]?.pastFixes[0]?.sha === fix ? true : 'json fix missing';
    });
    await t('dw1 worktree + diff-file modes', async () => {
      write(root, 'src/load.ts', 'export function load(x: string | null): string {\n  // null input used to crash the loader\n  const v = x;\n  return v.trim();\n}\n');
      const wt = await check(root, { worktree: true });
      const diffFile = join(tmp, 'wt.diff');
      writeFileSync(diffFile, git(root, 'diff', 'HEAD') + '\n');
      git(root, 'checkout', '-q', '--', '.');
      const d = await check(root, { diffFile, base: 'HEAD' });
      const c = cli('--worktree', '--root', root);
      if (c.status !== 0) return `cli --worktree exit ${c.status}`;
      const dc = cli('--diff', diffFile, '--base', 'HEAD', '--root', root);
      if (dc.status !== 0 || !dc.stdout.includes(fix.slice(0, 7))) return `cli --diff: ${dc.stdout}${dc.stderr}`;
      return fixesOf(wt).some((f) => f.sha === fix) && fixesOf(d).some((f) => f.sha === fix) ? true : 'fix missing in worktree/diff mode';
    });
    await t('dw1 fix rule option + .mole/config.json + --fix-rule', async () => {
      const none = cli(feat, '--root', root, '--fix-rule', '^nomatch$');
      if (none.status !== 0 || !none.stdout.includes(NO_PAST_FIXES)) return `--fix-rule: ${none.stdout}`;
      if (fixesOf(await check(root, { sha: feat }, { fixRule: /^nomatch$/ })).length) return 'RegExp rule ignored';
      write(root, '.mole/config.json', JSON.stringify({ fixRule: '^nomatch$' }));
      const n = fixesOf(await check(root, { sha: feat })).length;
      rmSync(join(root, '.mole'), { recursive: true, force: true });
      return n === 0 ? true : '.mole/config.json fixRule ignored';
    });
    await t('dw1 .mole note naming the fix is a reason source', async () => {
      write(root, '.mole/notes/loader.md', `${fix.slice(0, 7)}: keep the null guard, the CLI passes null\n`);
      const f = fixesOf(await check(root, { sha: feat }))[0];
      rmSync(join(root, '.mole'), { recursive: true, force: true });
      return f && f.reasonSources.some((s) => s.kind === 'note' && s.path === '.mole/notes/loader.md') && f.reason.includes('the CLI passes null') ? true : `note missing: ${JSON.stringify(f?.reasonSources)}`;
    });
    await t('dw6 brand-new lines: no past fixes, exit 0', async () => {
      write(root, 'src/new.ts', 'export const fresh = true;\n');
      const c = commit(root, 'feat: new file');
      const r = await check(root, { sha: c });
      const a = cli(c, '--root', root);
      if (!r.noPastFixes || !formatCheck(r).includes(NO_PAST_FIXES)) return 'fixes reported for a new file';
      return a.status === 0 && a.stdout.includes(NO_PAST_FIXES) ? true : `cli exit ${a.status}: ${a.stdout}`;
    });
    await t('dw6 repo with no fix commits: no past fixes, exit 0', async () => {
      const r2 = join(tmp, 'r2');
      mkdirSync(r2);
      git(r2, 'init', '-q', '-b', 'main');
      write(r2, 'a.ts', 'export const a = 1;\n');
      commit(r2, 'init');
      write(r2, 'a.ts', 'export const a = 2;\n');
      const c = commit(r2, 'change a');
      const r = await check(r2, { sha: c });
      const a = cli(c, '--root', r2);
      if (r.hunks.length !== 1 || !r.noPastFixes) return `unexpected ${JSON.stringify(r)}`;
      return a.status === 0 && a.stdout.includes(NO_PAST_FIXES) ? true : `cli exit ${a.status}: ${a.stdout}`;
    });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return res;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
