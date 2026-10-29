// M20 (T28): runtime flows from tests. Key = packages/flows/bench/m20-key.json, written by hand before the recorder existed.
//   recovery  = key dynamic edges that tests exercise and the static graph (@mole/indexer calls edges) misses, recorded at runtime
//   invented  = recorded edges equal to a key non-edge, or naming an id that is not a node of the repo's static graph
//   overhead  = median wall time of the instrumented vitest run / the plain run on the same test files, per repo (3 + 3 runs)
// Usage: node packages/flows/dist/bench/m20.js [--runs N] [--repo mole|excalidraw] [--metrics-out F] [--details F]
// Excalidraw: $MOLE_EXCALIDRAW or the shared read-only clone; never written to (configs, caches and flows go to .mole/local).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TsIndexer } from '@mole/indexer';
import { loadFlows, recordFlows, type RecordResult } from '../src/index.js';

interface KeyEdge {
  id: string;
  repo: 'mole' | 'excalidraw';
  from: string;
  to: string;
  kind: 'dynamic' | 'static';
  mechanism: string;
  exercised: boolean;
  tests: string[];
  evidence: string;
}
interface NonEdge {
  id: string;
  repo: 'mole' | 'excalidraw';
  from: string;
  to: string;
  why: string;
}
interface Key {
  written: string;
  repos: Record<'mole' | 'excalidraw', { sha: string; graph: { tsconfig: string; srcDir: string }; tests: string[] }>;
  edges: KeyEdge[];
  nonEdges: NonEdge[];
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
const keyPath = join(repoRoot, 'packages/flows/bench/m20-key.json');
const DEFAULT_EXCALIDRAW = '/Users/a1/.hermes/cache/scratch/mole-builder-5/excalidraw';

const argv = process.argv.slice(2);
const arg = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const RUNS = Math.max(1, Number(arg('runs') ?? 3));
const onlyRepo = arg('repo');
const metricsOut = arg('metrics-out');
const detailsOut = arg('details') ?? join(repoRoot, '.mole/local/bench/m20-details.json');

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const pct = (a: number, b: number): string => (b === 0 ? 'n/a' : `${((100 * a) / b).toFixed(1)}%`);
const pair = (a: string, b: string): string => `${a}\t${b}`;

function fail(msg: string): never {
  const line = `FAIL ${msg}`;
  console.error(line);
  if (metricsOut) writeFileSync(metricsOut, JSON.stringify({ M20: line }));
  process.exit(1);
}

function headSha(root: string): string {
  try {
    return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unversioned';
  }
}

interface RepoResult {
  repo: 'mole' | 'excalidraw';
  root: string;
  nodes: Set<string>;
  calls: Set<string>;
  recorded: Map<string, { count: number; tests: Set<string> }>;
  plain: RecordResult[];
  instr: RecordResult[];
  overhead: number;
}

async function measure(repo: 'mole' | 'excalidraw', key: Key): Promise<RepoResult> {
  const spec = key.repos[repo];
  const root = repo === 'mole' ? repoRoot : resolve(process.env.MOLE_EXCALIDRAW ?? DEFAULT_EXCALIDRAW);
  if (!existsSync(root)) fail(`${repo}: no checkout at ${root} (set MOLE_EXCALIDRAW)`);
  if (repo === 'excalidraw') {
    if (!existsSync(join(root, 'node_modules/vitest'))) fail(`excalidraw: dependencies not installed at ${root}`);
    const sha = headSha(root);
    if (sha !== spec.sha) fail(`excalidraw: clone is at ${sha}, the key was labelled at ${spec.sha}`);
  }
  // static graph (the indexer the product uses), for "static misses it" and for the id check
  const t0 = performance.now();
  const ix = new TsIndexer({ root, tsconfig: repo === 'mole' ? join(repoRoot, spec.graph.tsconfig) : spec.graph.tsconfig, srcDir: spec.graph.srcDir });
  ix.indexAll();
  const nodes = new Set(ix.db.prepare('SELECT id FROM nodes').all().map((r) => String(r.id)));
  const calls = new Set(ix.db.prepare("SELECT from_id, to_id FROM edges WHERE kind = 'calls'").all().map((r) => pair(String(r.from_id), String(r.to_id))));
  ix.close();
  console.log(`${repo}: static graph ${nodes.size} nodes, ${calls.size} calls edges (${((performance.now() - t0) / 1000).toFixed(1)} s)`);

  // interleaved plain / instrumented runs on the same files, same wrapper config
  const base = join(repoRoot, '.mole/local/flows/bench', repo);
  rmSync(base, { recursive: true, force: true });
  mkdirSync(base, { recursive: true });
  const plain: RecordResult[] = [];
  const instr: RecordResult[] = [];
  for (let i = 0; i < RUNS; i++) {
    const p = await recordFlows({ root, files: spec.tests, out: join(base, `plain-${i}`), instrument: false });
    plain.push(p);
    const r = await recordFlows({ root, files: spec.tests, out: join(base, `flows-${i}`), instrument: true });
    instr.push(r);
    console.log(`${repo} run ${i + 1}/${RUNS}: plain ${(p.wallMs / 1000).toFixed(1)} s (exit ${p.exit}, ${p.tests.passed} passed / ${p.tests.failed} failed) · instrumented ${(r.wallMs / 1000).toFixed(1)} s (exit ${r.exit}, ${r.tests.passed} passed / ${r.tests.failed} failed, ${r.flows} test flows)`);
  }
  // union of the recorded edges over the instrumented runs (stricter for the invented check)
  const recorded = new Map<string, { count: number; tests: Set<string> }>();
  for (const r of instr) {
    for (const t of loadFlows(r.out).tests) {
      for (const [a, b, c] of t.edges) {
        const k = pair(a, b);
        const cur = recorded.get(k) ?? { count: 0, tests: new Set<string>() };
        cur.count += c;
        cur.tests.add(`${t.file} > ${t.test}`);
        recorded.set(k, cur);
      }
    }
  }
  const overhead = median(instr.map((r) => r.wallMs)) / median(plain.map((r) => r.wallMs));
  return { repo, root, nodes, calls, recorded, plain, instr, overhead };
}

async function main(): Promise<void> {
  if (!existsSync(keyPath)) fail(`no key at ${keyPath}`);
  const key = JSON.parse(readFileSync(keyPath, 'utf8')) as Key;
  const written = Date.parse(key.written);
  if (!Number.isFinite(written) || written > Date.now()) fail(`key 'written' is missing or in the future: ${key.written}`);
  const dyn = key.edges.filter((e) => e.kind === 'dynamic');
  if (key.edges.length !== 50) fail(`key has ${key.edges.length} edges, the contract says 50`);
  if (dyn.length < 20 || dyn.length > 30) fail(`key has ${dyn.length} dynamic edges, expected about half of 50`);

  const repos = (['mole', 'excalidraw'] as const).filter((r) => !onlyRepo || r === onlyRepo);
  const results = new Map<string, RepoResult>();
  try {
    for (const r of repos) results.set(r, await measure(r, key));
  } catch (e) {
    fail(e instanceof Error ? e.message.split('\n')[0]! : String(e));
  }

  // ---- recovery
  const target = dyn.filter((e) => results.has(e.repo) && e.exercised && !results.get(e.repo)!.calls.has(pair(e.from, e.to)));
  const staticHas = dyn.filter((e) => results.has(e.repo) && results.get(e.repo)!.calls.has(pair(e.from, e.to)));
  const recovered = target.filter((e) => results.get(e.repo)!.recorded.has(pair(e.from, e.to)));
  const missed = target.filter((e) => !recovered.includes(e));
  // informational: static key edges that tests exercise, seen at runtime too
  const statics = key.edges.filter((e) => e.kind === 'static' && e.exercised && results.has(e.repo));
  const staticSeen = statics.filter((e) => results.get(e.repo)!.recorded.has(pair(e.from, e.to)));
  const notExercisedButRecorded = key.edges.filter((e) => !e.exercised && results.has(e.repo) && results.get(e.repo)!.recorded.has(pair(e.from, e.to)));

  // ---- invented
  const nonEdgeHits = key.nonEdges.filter((n) => results.has(n.repo) && results.get(n.repo)!.recorded.has(pair(n.from, n.to)));
  const unknownIds: Array<{ repo: string; from: string; to: string }> = [];
  const unverified: Array<{ repo: string; from: string; to: string; count: number; tests: string[] }> = [];
  for (const res of results.values()) {
    const keySyms = new Set(key.edges.concat(key.nonEdges as unknown as KeyEdge[]).filter((e) => e.repo === res.repo).flatMap((e) => [e.from, e.to]));
    const keyPairs = new Set(key.edges.filter((e) => e.repo === res.repo).map((e) => pair(e.from, e.to)));
    for (const [k, v] of res.recorded) {
      const [a, b] = k.split('\t') as [string, string];
      if (!res.nodes.has(a) || !res.nodes.has(b)) unknownIds.push({ repo: res.repo, from: a, to: b });
      else if ((keySyms.has(a) || keySyms.has(b)) && !keyPairs.has(k) && !res.calls.has(k)) unverified.push({ repo: res.repo, from: a, to: b, count: v.count, tests: [...v.tests].slice(0, 3) });
    }
  }
  const invented = nonEdgeHits.length + unknownIds.length;

  // ---- overhead + test health
  const over = [...results.values()].map((r) => `${r.repo} ${r.overhead.toFixed(2)}x`);
  const broken = [...results.values()].filter((r) => r.instr.some((x, i) => x.tests.failed > r.plain[i]!.tests.failed || x.tests.passed < r.plain[i]!.tests.passed));
  const noFlows = [...results.values()].filter((r) => r.instr.some((x) => x.flows === 0));

  const rec = target.length ? recovered.length / target.length : 0;
  const okRecovery = target.length > 0 && rec >= 0.8;
  const okInvented = invented === 0;
  const okOverhead = [...results.values()].every((r) => r.overhead <= 2);
  const ok = okRecovery && okInvented && okOverhead && broken.length === 0 && noFlows.length === 0 && repos.length === 2;

  const M20 =
    `recovered ${recovered.length}/${target.length} (${pct(recovered.length, target.length)}) dynamic edges the static graph misses, target >= 80%` +
    ` · invented ${invented} (non-edge ${nonEdgeHits.length}, unknown id ${unknownIds.length}; ${unverified.length} unverified listed) target 0` +
    ` · overhead ${over.join(', ')} (median of ${RUNS}) target <= 2x` +
    ` · static key edges seen ${staticSeen.length}/${statics.length}` +
    (broken.length ? ` · instrumented runs broke tests in ${broken.map((r) => r.repo).join(', ')}` : '') +
    (noFlows.length ? ` · no flows recorded in ${noFlows.map((r) => r.repo).join(', ')}` : '') +
    (repos.length < 2 ? ` · only ${repos.join(',')} measured` : '');
  console.log(`\nM20 ${M20}`);
  for (const e of missed) console.log(`  missed   ${e.id} ${e.repo} ${e.from} -> ${e.to}  (${e.mechanism})`);
  for (const n of nonEdgeHits) console.log(`  INVENTED ${n.id} ${n.repo} ${n.from} -> ${n.to}  (${n.why})`);
  for (const u of unknownIds.slice(0, 20)) console.log(`  INVENTED unknown id ${u.repo} ${u.from} -> ${u.to}`);
  for (const e of staticHas) console.log(`  note     ${e.id} the static graph already has ${e.from} -> ${e.to}; not counted`);
  for (const e of notExercisedButRecorded) console.log(`  note     ${e.id} labelled not exercised but recorded: ${e.from} -> ${e.to}`);

  mkdirSync(dirname(detailsOut), { recursive: true });
  writeFileSync(
    detailsOut,
    JSON.stringify(
      {
        time: new Date().toISOString(),
        M20,
        recovered: recovered.map((e) => e.id),
        missed: missed.map((e) => ({ id: e.id, from: e.from, to: e.to })),
        staticHas: staticHas.map((e) => e.id),
        staticSeen: staticSeen.map((e) => e.id),
        staticNotSeen: statics.filter((e) => !staticSeen.includes(e)).map((e) => e.id),
        notExercisedButRecorded: notExercisedButRecorded.map((e) => e.id),
        nonEdgeHits,
        unknownIds,
        unverified,
        runs: Object.fromEntries([...results.values()].map((r) => [r.repo, { plainMs: r.plain.map((x) => Math.round(x.wallMs)), instrumentedMs: r.instr.map((x) => Math.round(x.wallMs)), overhead: r.overhead, recordedEdges: r.recorded.size, tests: r.instr.map((x) => x.tests) }])),
      },
      null,
      1,
    ),
  );
  console.log(`details: ${detailsOut}`);
  if (metricsOut) writeFileSync(metricsOut, JSON.stringify({ M20 }));
  process.exit(ok ? 0 : 1);
}

void main();
