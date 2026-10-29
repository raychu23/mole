// M21 bench: 20 planted changes over Mole's own .mole records and two public decision-record folders (backstage, govuk-aws).
// Each scenario runs in a temp git repo: copy the corpus, commit base, record confirmed = base sha, commit the planted change,
// recompute the flags, compare with the hand-written key (m21-key.json, frozen in the red commit).
// Targets: recall >= 90%, false flags <= 10%, recompute of 1,000 decisions after one commit p95 <= 1000 ms, 0 model calls.
// usage: node packages/decisions/dist/bench/m21.js [--details FILE] [--metrics-out FILE]
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeFlags, loadGraph, type Flag, type FlagResult } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const benchDir = resolve(here, '../../bench');
const srcDir = resolve(here, '../../src');
const repoRoot = resolve(here, '../../../..');
const keyPath = join(benchDir, 'm21-key.json');

type Op =
  | { type: 'edit'; file: string; find: string; replace: string }
  | { type: 'delete'; file: string }
  | { type: 'write'; file: string; text: string }
  | { type: 'append'; file: string; text: string }
  | { type: 'replaceDir'; dir: string; from: string }
  | { type: 'testReport'; failing: string[]; passing?: string[] }
  | { type: 'reconfirm'; record: string };

interface Scenario {
  id: string;
  corpus: string;
  change: string;
  ops: Op[];
  expect: Record<string, Flag>;
}
interface Corpus {
  copy: Array<[string, string]>;
  adrDirs: string[];
  confirm?: boolean;
  base: Record<string, Flag>;
}
interface Key {
  written: string;
  targets: { recallPct: number; falseFlagsPct: number; recomputeP95Ms: number; modelCalls: number };
  corpora: Record<string, Corpus>;
  scenarios: Scenario[];
}

// ---- model / network call counting (R6): every fetch during the bench is counted, and src may not import a network client
let fetchCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
  fetchCalls++;
  return realFetch(...args);
}) as typeof fetch;

function networkImports(dir: string): string[] {
  const hits: string[] = [];
  const bad = /\bfetch\s*\(|from\s+['"](?:node:)?(?:http|https|http2|net|tls|dgram|undici)['"]|import\(\s*['"](?:node:)?(?:http|https|http2|net|tls|dgram|undici)['"]|openai|anthropic|@ai-sdk|XMLHttpRequest|WebSocket/;
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.ts$/.test(e.name)) readFileSync(p, 'utf8').split('\n').forEach((l, i) => bad.test(l) && hits.push(`${p}:${i + 1}`));
    }
  };
  if (existsSync(dir)) walk(dir);
  return hits;
}

// ---- temp repos
const git = (root: string, ...args: string[]): string =>
  execFileSync('git', ['-C', root, '-c', 'user.name=m21', '-c', 'user.email=m21@example.com', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }).trim();

function put(root: string, rel: string, text: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}

const fromPath = (p: string) => (p.startsWith('@repo/') ? join(repoRoot, p.slice('@repo/'.length)) : join(benchDir, p));

/** set `confirmed: <sha>` in a record's front matter (replace or insert before the closing ---) */
function setConfirmed(file: string, sha: string): void {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  if (lines[0] !== '---') return;
  const end = lines.indexOf('---', 1);
  if (end < 0) return;
  const i = lines.findIndex((l, n) => n > 0 && n < end && /^confirmed\s*:/.test(l));
  if (i >= 0) lines[i] = `confirmed: ${sha}`;
  else lines.splice(end, 0, `confirmed: ${sha}`);
  writeFileSync(file, lines.join('\n'));
}

function recordFiles(root: string): string[] {
  const d = join(root, '.mole/decisions');
  return existsSync(d) ? readdirSync(d).filter((f) => f.endsWith('.md')).map((f) => join(d, f)) : [];
}

function findRecord(root: string, id: string): string | undefined {
  return recordFiles(root).find((f) => new RegExp(`^id:\\s*['"]?${id}['"]?\\s*$`, 'm').test(readFileSync(f, 'utf8')));
}

function vitestReport(root: string, failing: string[], passing: string[]): unknown {
  const byFile = new Map<string, Array<{ title: string; status: string }>>();
  for (const [list, status] of [[failing, 'failed'], [passing, 'passed']] as const)
    for (const t of list) {
      const i = t.indexOf('#');
      const file = t.slice(0, i);
      byFile.set(file, [...(byFile.get(file) ?? []), { title: t.slice(i + 1), status }]);
    }
  return {
    numFailedTests: failing.length,
    numPassedTests: passing.length,
    success: failing.length === 0,
    testResults: [...byFile].map(([file, tests]) => ({
      name: join(root, file),
      status: tests.some((t) => t.status === 'failed') ? 'failed' : 'passed',
      assertionResults: tests.map((t) => ({ ancestorTitles: [t.title], title: 'case', fullName: `${t.title} case`, status: t.status })),
    })),
  };
}

interface Outcome {
  scenario: string;
  corpus: string;
  expected: Record<string, Flag>;
  actual: Record<string, Flag>;
  reasons: Record<string, string[]>;
  error?: string;
}

function runScenario(key: Key, s: Scenario): Outcome {
  const corpus = key.corpora[s.corpus];
  if (!corpus) throw new Error(`${s.id}: unknown corpus ${s.corpus}`);
  const expected: Record<string, Flag> = { ...corpus.base, ...s.expect };
  const tmp = mkdtempSync(join(tmpdir(), 'mole-m21-'));
  const root = join(tmp, 'repo');
  mkdirSync(root);
  try {
    for (const [from, to] of corpus.copy) cpSync(fromPath(from), join(root, to), { recursive: true });
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'base');
    const base = git(root, 'rev-parse', 'HEAD');
    if (corpus.confirm) {
      for (const f of recordFiles(root)) setConfirmed(f, base);
      git(root, 'add', '-A');
      git(root, 'commit', '-q', '-m', 'approver confirms at base');
    }
    let testReport: unknown;
    const later: Op[] = [];
    for (const op of s.ops) {
      if (op.type === 'edit') {
        const p = join(root, op.file);
        const t = readFileSync(p, 'utf8');
        const n = t.split(op.find).length - 1;
        if (n !== 1) throw new Error(`${s.id}: edit target found ${n} times in ${op.file}`);
        writeFileSync(p, t.replace(op.find, () => op.replace));
      } else if (op.type === 'delete') rmSync(join(root, op.file));
      else if (op.type === 'write') put(root, op.file, op.text);
      else if (op.type === 'append') writeFileSync(join(root, op.file), readFileSync(join(root, op.file), 'utf8') + op.text);
      else if (op.type === 'replaceDir') {
        rmSync(join(root, op.dir), { recursive: true, force: true });
        cpSync(join(benchDir, op.from), join(root, op.dir), { recursive: true });
      } else if (op.type === 'testReport') testReport = vitestReport(root, op.failing, op.passing ?? []);
      else later.push(op);
    }
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '--allow-empty', '-m', `planted: ${s.change}`);
    for (const op of later) {
      if (op.type !== 'reconfirm') continue;
      const f = findRecord(root, op.record);
      if (!f) throw new Error(`${s.id}: record ${op.record} not found to re-confirm`);
      setConfirmed(f, git(root, 'rev-parse', 'HEAD'));
      git(root, 'add', '-A');
      git(root, 'commit', '-q', '-m', `approver re-confirms ${op.record}`);
    }
    let reportArg: string | undefined;
    if (testReport !== undefined) {
      reportArg = join(tmp, 'report.json');
      writeFileSync(reportArg, JSON.stringify(testReport));
    }
    const graph = loadGraph(root, { adrDirs: corpus.adrDirs });
    const flags = computeFlags(graph, { testReport: reportArg });
    return { scenario: s.id, corpus: s.corpus, expected, ...collect(flags) };
  } catch (e) {
    return { scenario: s.id, corpus: s.corpus, expected, actual: {}, reasons: {}, error: e instanceof Error ? e.message : String(e) };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function collect(flags: FlagResult[]): { actual: Record<string, Flag>; reasons: Record<string, string[]> } {
  const actual: Record<string, Flag> = {};
  const reasons: Record<string, string[]> = {};
  for (const f of flags) {
    if (f.kind !== 'decision' && f.kind !== 'tenet') continue;
    actual[f.id] = f.flag;
    reasons[f.id] = f.reasons.map((r) => `${r.flag} ${r.code} ${r.file}:${r.line}`);
  }
  return { actual, reasons };
}

const raised = (f: Flag | undefined) => f === 'red' || f === 'yellow';

// ---- recompute budget: 1,000 decisions after one commit
function recompute(runs: number): { p95: number; times: number[]; sanity: string } {
  const root = mkdtempSync(join(tmpdir(), 'mole-m21-perf-'));
  try {
    const FILES = 200;
    const FNS = 5;
    for (let i = 0; i < FILES; i++)
      put(root, `src/f${i}.ts`, Array.from({ length: FNS }, (_, j) => `export function fn${j}(x: number): number {\n  // step ${j}\n  return x * ${j + 1} + ${i};\n}\n`).join('\n'));
    put(root, 'test/f.test.ts', "it('works', () => {});\n");
    put(root, '.mole/tenets.md', '# tenets\n\n## tenet-1 · Generated tenet\n');
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'base');
    const base = git(root, 'rev-parse', 'HEAD');
    for (let k = 0; k < 1000; k++) {
      const id = String(k + 1).padStart(4, '0');
      const scope = [`src/f${k % FILES}.ts#fn${Math.floor(k / FILES) % FNS}`, ...(k % 7 === 0 ? [`src/f${(k + 1) % FILES}.ts`] : [])];
      const rel = k % 10 === 9 ? `overrides: ['${String(k).padStart(4, '0')}']\n` : '';
      const ev = k % 25 === 0 ? `evidence:\n  - test: test/f.test.ts#works\n` : '';
      put(
        root,
        `.mole/decisions/${id}-generated.md`,
        `---\nid: '${id}'\ntitle: Generated decision ${id}\nstatus: accepted\ndoor: two-way\ntraces_to: [tenet-1]\nscope:\n${scope.map((s) => `  - ${s}`).join('\n')}\n${rel}${ev}approver: m21\nconfirmed: ${base}\nsource: generated\n---\n\nBody ${id}.\n`,
      );
    }
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'decisions');
    // the one commit: change fn0 of f0 (scoped by 0001; 0001 is file-scoped by nothing else), whitespace-only edit in f1
    const f0 = readFileSync(join(root, 'src/f0.ts'), 'utf8').replace('return x * 1 + 0;', 'return x * 1 + 100;');
    put(root, 'src/f0.ts', f0);
    put(root, 'src/f1.ts', readFileSync(join(root, 'src/f1.ts'), 'utf8').replace(/\n {2}return/g, '\n    return'));
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'one commit');
    const times: number[] = [];
    let last: FlagResult[] = [];
    for (let r = 0; r < runs; r++) {
      const t0 = performance.now();
      last = computeFlags(loadGraph(root));
      times.push(performance.now() - t0);
    }
    const sorted = [...times].sort((a, b) => a - b);
    const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)] ?? Infinity;
    const dec = last.filter((f) => f.kind === 'decision');
    const y = dec.filter((f) => f.flag === 'yellow').map((f) => f.id);
    const ok = dec.length === 1000 && dec.find((f) => f.id === '0001')?.flag === 'yellow' && dec.find((f) => f.id === '0201')?.flag === 'green';
    return { p95, times, sanity: `${dec.length} decisions, ${y.length} yellow (${y.slice(0, 5).join(',')}…), 0001 yellow + 0201 green: ${ok ? 'ok' : 'WRONG'}` };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const pct = (a: number, b: number) => (b === 0 ? 0 : Math.round((1000 * a) / b) / 10);

function main(): number {
  const arg = (name: string) => {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const key = JSON.parse(readFileSync(keyPath, 'utf8')) as Key;
  const outcomes = key.scenarios.map((s) => runScenario(key, s));

  let expectedPairs = 0;
  let hits = 0;
  let raisedAll = 0;
  let falseRaised = 0;
  let records = 0;
  const misses: string[] = [];
  for (const o of outcomes) {
    if (o.error) misses.push(`${o.scenario}: ERROR ${o.error}`);
    const ids = new Set([...Object.keys(o.expected), ...Object.keys(o.actual)]);
    for (const id of ids) {
      const exp = o.expected[id];
      const act = o.actual[id];
      records++;
      if (raised(exp)) {
        expectedPairs++;
        if (act === exp) hits++;
        else misses.push(`${o.scenario} ${id}: expected ${exp}, got ${act ?? 'missing'} [${(o.reasons[id] ?? []).join('; ')}]`);
      }
      if (raised(act)) {
        raisedAll++;
        if (act !== exp) {
          falseRaised++;
          if (!raised(exp)) misses.push(`${o.scenario} ${id}: FALSE ${act} (expected ${exp ?? 'not raised'}) [${(o.reasons[id] ?? []).join('; ')}]`);
        }
      }
    }
  }
  const perf = recompute(7);
  const net = networkImports(srcDir);
  const modelCalls = fetchCalls + net.length;

  const recall = pct(hits, expectedPairs);
  const ff = pct(falseRaised, raisedAll);
  const p95 = Math.round(perf.p95);
  const summary = `recall ${recall}% (${hits}/${expectedPairs}), false flags ${ff}% (${falseRaised}/${raisedAll}), recompute 1,000 p95 ${p95} ms, model calls ${modelCalls}`;
  for (const m of misses) console.log(`miss  ${m}`);
  console.log(`recompute runs ms: ${perf.times.map((t) => Math.round(t)).join(', ')} · ${perf.sanity}`);
  if (net.length) console.log(`network imports in src: ${net.join(', ')}`);
  console.log(`false flags over all records: ${pct(falseRaised, records)}% (${falseRaised}/${records}) · ${outcomes.length} scenarios · key written ${key.written}`);
  console.log(`M21: ${summary}`);

  const details = arg('--details');
  if (details) writeFileSync(details, JSON.stringify(outcomes, null, 2));
  const metricsOut = arg('--metrics-out');
  if (metricsOut) writeFileSync(metricsOut, JSON.stringify({ M21: summary }));

  const t = key.targets;
  const pass =
    recall >= t.recallPct &&
    ff <= t.falseFlagsPct &&
    perf.p95 <= t.recomputeP95Ms &&
    modelCalls <= t.modelCalls &&
    perf.sanity.endsWith('ok') &&
    outcomes.every((o) => !o.error);
  if (!pass) console.log('M21: target missed');
  return pass ? 0 : 1;
}

try {
  process.exitCode = main();
} catch (e) {
  console.error(e instanceof Error ? e.stack : e);
  process.exitCode = 1;
}
