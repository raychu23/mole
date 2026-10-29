// M9 HELD-OUT #2 bench (T19, D33 'try options' round, builder 3). A copy of bench/m9-heldout.ts (same scoring as bench/m9.ts)
// over bench/m9-heldout2-key.json: hand-labelled rename candidates from the honojs/hono src/ TS/TSX history (newest commits
// first), labelled BEFORE any re-anchor run, similarity score or new matcher option touched them. Replays each old symbol
// through the real re-anchor code: old tree = the parent commit (git, src/ only), new tree = the commit's src/ TS/TSX files
// extracted with git archive into a temp dir. Only change vs m9-heldout.ts: key path, repo name, and the thresholds check
// covers the three body-only constants of m9-key.json (options may add their own constants).
// Also reports the band check of ruling 1 §5: how many old symbols have their best key candidate at 0.40 <= similarity < 0.55
// (key measure: token-bigram Dice, own name -> $SELF, class -> $CLS; computed here from the key's candidate pairs).
// usage: node packages/memory/dist/bench/m9-heldout2.js [--details FILE] [--append-run RUNS.jsonl]
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirTree, gitTree, REANCHOR, reanchor, symbolsOfText, type Reanchor, type SourceTree } from '../src/index.js';
import { declsOfText, type SymbolDecl } from '../src/symbols.js';

const here = dirname(fileURLToPath(import.meta.url));
const keyPath = resolve(here, '../../bench/m9-heldout2-key.json');
const moleRoot = resolve(here, '../../../..');

type Label = 'rename' | 'rename+change' | 'not-rename';
interface Sym {
  path: string;
  tail: string;
  kind: string;
}
interface Case {
  id: string;
  repo: 'hono';
  commit: string;
  parent: string;
  subject: string;
  old: Sym;
  new: Sym;
  how: string;
  label: Label;
  reason: string;
}
interface Key {
  written: string;
  thresholds: { renamedChangedMin: number; tieEpsilon: number; minTokens: number };
  repos: { hono: { path: string; head: string; prefix: string } };
  cases: Case[];
}

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const key = JSON.parse(readFileSync(keyPath, 'utf8')) as Key;
const hRoot = process.env.MOLE_M9_HONO ?? key.repos.hono.path.replace(/^~/, homedir());
const prefix = key.repos.hono.prefix;
const git = (repo: string, args: string[]): string =>
  execFileSync('git', ['-C', repo, '-c', 'gc.auto=0', ...args], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });

let repoOk = existsSync(hRoot);
if (repoOk) {
  try {
    git(hRoot, ['cat-file', '-e', `${key.repos.hono.head}^{commit}`]);
  } catch {
    repoOk = false;
  }
}
if (!repoOk) {
  console.log(`M9 held-out 2: hono repo missing (${hRoot} at ${key.repos.hono.head.slice(0, 10)}): cannot replay`);
  process.exit(2);
}

const qn = (s: { path: string; tail: string }) => `${s.path}#${s.tail}`;
const pct = (a: number, b: number) => (b === 0 ? 0 : Math.round((1000 * a) / b) / 10);
const R = REANCHOR as unknown as Record<string, number | undefined>;
const thresholdsOk =
  R.renamedChangedMin === key.thresholds.renamedChangedMin &&
  R.tieEpsilon === key.thresholds.tieEpsilon &&
  R.minTokens === key.thresholds.minTokens;

// the old tree limited to src/ (the new tree is an extract of src/ only)
function sub(t: SourceTree): SourceTree {
  return {
    label: `${t.label} (${prefix})`,
    files: () => t.files().filter((f) => f.startsWith(prefix)),
    read: (p) => (p.startsWith(prefix) ? t.read(p) : undefined),
    ...(t.grep ? { grep: (w: string) => t.grep!(w).filter((f) => f.startsWith(prefix)) } : {}),
  };
}

// key similarity measure (bench/m9-key.json thresholds.similarity), used only for the band report
const lastSeg = (tail: string) => tail.slice(tail.lastIndexOf('.') + 1);
function norm(d: SymbolDecl): string[] {
  const self = lastSeg(d.sym.tail);
  const cls = d.sym.kind === 'method' && d.sym.tail.includes('.') ? d.sym.tail.slice(0, d.sym.tail.indexOf('.')) : undefined;
  return d.tokens.map((t) => (t === self ? '$SELF' : t === cls ? '$CLS' : t));
}
function sim(a: string[], b: string[]): number {
  if (a.length === b.length && a.every((t, i) => t === b[i])) return 1;
  const bg = (x: string[]) => {
    const m = new Map<string, number>();
    for (let i = 0; i + 1 < x.length; i++) m.set(`${x[i]}\u0001${x[i + 1]}`, (m.get(`${x[i]}\u0001${x[i + 1]}`) ?? 0) + 1);
    return m;
  };
  const [A, B] = [bg(a), bg(b)];
  let c = 0;
  for (const [k, n] of A) c += Math.min(n, B.get(k) ?? 0);
  const n = Math.max(0, a.length - 1) + Math.max(0, b.length - 1);
  return n === 0 ? 1 : (2 * c) / n;
}

interface Item {
  id: string;
  commit: string;
  parent: string;
  old: Sym;
  expected: { outcome: 'renamed' | 'renamed+changed' | 'none'; to?: string };
  news: Sym[];
}
const items = new Map<string, Item>();
for (const c of key.cases) {
  const k = `${c.commit}:${qn(c.old)}`;
  const it = items.get(k) ?? { id: c.id, commit: c.commit, parent: c.parent, old: c.old, expected: { outcome: 'none' as const }, news: [] };
  it.news.push(c.new);
  if (c.label === 'rename') it.expected = { outcome: 'renamed', to: qn(c.new) };
  if (c.label === 'rename+change') it.expected = { outcome: 'renamed+changed', to: qn(c.new) };
  items.set(k, it);
}

interface Result {
  id: string;
  old: string;
  expected: Item['expected'];
  got: { outcome: string; to?: string; similarity?: number; candidates?: string[]; reason?: string };
  best: number; // key-measure similarity of the labelled target (positives) or the best key candidate (negatives)
  verdict: 'right' | 'miss' | 'wrong' | 'silent-fresh' | 'ok-none';
}
function judge(expected: Item['expected'], r: Reanchor): Result['verdict'] {
  const to = r.to ? qn(r.to) : undefined;
  const reanchored = r.outcome === 'renamed' || r.outcome === 'renamed+changed';
  if (expected.outcome === 'none') return reanchored ? 'wrong' : 'ok-none';
  if (!reanchored) return 'miss';
  if (to !== expected.to) return 'wrong';
  if (expected.outcome === 'renamed+changed' && r.outcome === 'renamed') return 'silent-fresh';
  return r.outcome === expected.outcome ? 'right' : 'miss';
}
const shape = (r: Reanchor): Result['got'] => ({
  outcome: r.outcome,
  ...(r.to ? { to: qn(r.to) } : {}),
  ...(r.similarity !== undefined ? { similarity: Math.round(r.similarity * 1000) / 1000 } : {}),
  ...(r.candidates ? { candidates: r.candidates.map(qn) } : {}),
  ...(r.reason ? { reason: r.reason } : {}),
});

const results: Result[] = [];
const t0 = Date.now();
const byCommit = new Map<string, Item[]>();
for (const it of items.values()) byCommit.set(it.commit, [...(byCommit.get(it.commit) ?? []), it]);
for (const [commit, list] of byCommit) {
  const dir = mkdtempSync(join(tmpdir(), 'mole-m9h2-'));
  try {
    execFileSync('sh', ['-c', `git -C "$0" -c gc.auto=0 archive --format=tar "$1" -- ":(glob)$2**/*.ts" ":(glob)$2**/*.tsx" | tar -x -C "$3"`, hRoot, commit, prefix, dir]);
    // a failed archive (sh has no pipefail) leaves an empty tree that would read as 'every symbol deleted': fail loudly instead
    if (dirTree(dir).files().length === 0) throw new Error(`git archive extracted no ${prefix} TS/TSX files for ${commit.slice(0, 10)}`);
    let trees: { oldTree: SourceTree; newTree: SourceTree } | undefined;
    for (const it of list) {
      let r: Reanchor;
      let best = 0;
      try {
        trees ??= { oldTree: sub(gitTree(hRoot, list[0]!.parent)), newTree: dirTree(dir) };
        const { oldTree, newTree } = trees;
        const text = git(hRoot, ['show', `${it.parent}:${it.old.path}`]);
        const sym = symbolsOfText(it.old.path, text).find((s) => s.tail === it.old.tail);
        r = reanchor({ path: it.old.path, tail: it.old.tail, kind: it.old.kind, hash: sym?.hash }, oldTree, newTree);
        const od = declsOfText(it.old.path, text).find((d) => d.sym.tail === it.old.tail);
        const targets = it.expected.to ? it.news.filter((n) => qn(n) === it.expected.to) : it.news;
        for (const n of targets) {
          const nd = declsOfText(n.path, newTree.read(n.path) ?? '').find((d) => d.sym.tail === n.tail);
          if (od && nd) best = Math.max(best, sim(norm(od), norm(nd)));
        }
      } catch (e) {
        r = { outcome: 'none', reason: `error: ${e instanceof Error ? e.message : String(e)}` };
      }
      results.push({ id: it.id, old: qn(it.old), expected: it.expected, got: shape(r), best: Math.round(best * 1000) / 1000, verdict: judge(it.expected, r) });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const count = (rs: Array<{ verdict: string }>, v: string) => rs.filter((r) => r.verdict === v).length;
const positives = results.filter((r) => r.expected.outcome !== 'none');
const right = count(positives, 'right');
const wrong = count(results, 'wrong');
const silent = count(results, 'silent-fresh');
const band = results.filter((r) => r.best >= 0.4 && r.best < 0.55);
const bandPos = band.filter((r) => r.expected.outcome !== 'none').length;
const rightPct = pct(right, positives.length);
const conclusive = band.length >= 5;
const atTarget = thresholdsOk && rightPct >= 95 && wrong === 0 && silent === 0;
const metrics = {
  M9_heldout: `held-out 2 hono src right ${rightPct}% (${right}/${positives.length}) wrong ${wrong} silent-fresh ${silent}; band 0.40-0.55 ${band.length} (pos ${bandPos}, neg ${band.length - bandPos})${conclusive ? '' : ' INCONCLUSIVE (< 5)'}`,
  M9_heldout_detail: `${results.length} old symbols replayed (${results.length - positives.length} must stay unanchored) from ${byCommit.size} commits; thresholds match key ${thresholdsOk}; ${Math.round((Date.now() - t0) / 1000)} s`,
  at_target: atTarget,
  conclusive,
};

console.log(`M9 held-out 2 key ${key.written}: ${metrics.M9_heldout}`);
console.log(`   ${metrics.M9_heldout_detail}`);
for (const r of results.filter((x) => x.verdict !== 'right' && x.verdict !== 'ok-none'))
  console.log(`   ${r.verdict.padEnd(12)} ${r.id}  ${r.old}  expected ${JSON.stringify(r.expected)}  got ${JSON.stringify(r.got)}  key-sim ${r.best}`);
for (const r of band) console.log(`   band ${r.best}  ${r.verdict.padEnd(8)} ${r.id}  ${r.old}  got ${r.got.outcome}${r.got.to ? ' ' + r.got.to : ''}`);
console.log(`   at target: ${atTarget}  conclusive: ${conclusive}`);
const dOut = arg('--details');
if (dOut) writeFileSync(dOut, JSON.stringify({ key: keyPath, written: key.written, metrics, results }, null, 2));
const runs = arg('--append-run');
if (runs) {
  let commit = '';
  try {
    commit = git(moleRoot, ['rev-parse', '--short', 'HEAD']).trim();
  } catch {
    // not a git checkout
  }
  appendFileSync(runs, JSON.stringify({ time: new Date().toISOString(), commit, cmd: 'node packages/memory/dist/bench/m9-heldout2.js', exit: atTarget && conclusive ? 0 : 1, metrics: { M9: metrics.M9_heldout }, detail: metrics.M9_heldout_detail }) + '\n');
}
process.exit(atTarget && conclusive ? 0 : 1);
