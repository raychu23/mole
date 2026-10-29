// M9 bench (T19): replay every hand-labelled rename candidate from real history (Mole repo + Excalidraw clone) through the
// real re-anchor code: old tree = the parent commit (git), new tree = the commit extracted with git archive into a temp dir.
// Scored per old symbol: right = re-anchored to the labelled symbol with the labelled outcome; wrong = any other re-anchor.
// Planted synthetic fixtures (incl. ambiguous cases) are replayed through a temp git repo and counted separately.
// usage: node packages/memory/dist/bench/m9.js [--metrics-out FILE] [--details FILE] [--append-run RUNS.jsonl]
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirTree, gitTree, REANCHOR, reanchor, symbolsOfText, type Reanchor, type SourceTree } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const keyPath = resolve(here, '../../bench/m9-key.json');
const moleRoot = resolve(here, '../../../..');

type Label = 'rename' | 'rename+change' | 'not-rename' | 'ambiguous';
interface Sym {
  path: string;
  tail: string;
  kind: string;
}
interface Case {
  id: string;
  repo: 'mole' | 'excalidraw';
  commit: string;
  parent: string;
  subject: string;
  old: Sym;
  new: Sym;
  how: string;
  label: Label;
  reason: string;
}
interface Synthetic {
  id: string;
  label: Label;
  reason: string;
  old: Record<string, string>;
  new: Record<string, string>;
  anchor: string;
  expect: { outcome: Reanchor['outcome']; to?: string; candidates?: string[] };
}
interface Key {
  written: string;
  thresholds: { renamedChangedMin: number; tieEpsilon: number; minTokens: number };
  repos: { excalidraw: { path: string; head: string } };
  cases: Case[];
  synthetic: Synthetic[];
}

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const key = JSON.parse(readFileSync(keyPath, 'utf8')) as Key;
// MOLE_M9_EXCALIDRAW overrides the clone path (used to check the 'B7 clone missing' exit)
const exRoot = process.env.MOLE_M9_EXCALIDRAW ?? key.repos.excalidraw.path.replace(/^~/, homedir());
const git = (repo: string, args: string[], input?: string): string =>
  execFileSync('git', ['-C', repo, '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], {
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    ...(input === undefined ? {} : { input }),
  });

// the Excalidraw clone (B7) lives in a pruned scratch dir: never pass silently without it
let cloneOk = existsSync(join(exRoot, '.git'));
if (cloneOk) {
  try {
    git(exRoot, ['cat-file', '-e', `${key.repos.excalidraw.head}^{commit}`]);
  } catch {
    cloneOk = false;
  }
}
if (!cloneOk) {
  console.log(`M9: B7 clone missing (${exRoot} at ${key.repos.excalidraw.head.slice(0, 10)}): cannot replay the Excalidraw cases`);
  process.exit(2);
}

const qn = (s: { path: string; tail: string }) => `${s.path}#${s.tail}`;
const pct = (a: number, b: number) => (b === 0 ? 0 : Math.round((1000 * a) / b) / 10);
const thresholdsOk =
  REANCHOR.renamedChangedMin === key.thresholds.renamedChangedMin && REANCHOR.tieEpsilon === key.thresholds.tieEpsilon && REANCHOR.minTokens === key.thresholds.minTokens;

interface Item {
  id: string;
  repo: string;
  commit: string;
  parent: string;
  old: Sym;
  expected: { outcome: 'renamed' | 'renamed+changed' | 'none'; to?: string };
}
// one item per old symbol: its positive pair (if any) is what it must re-anchor to; otherwise it must stay unanchored
const items = new Map<string, Item>();
for (const c of key.cases) {
  const k = `${c.repo}:${c.commit}:${qn(c.old)}`;
  const it = items.get(k) ?? { id: c.id, repo: c.repo, commit: c.commit, parent: c.parent, old: c.old, expected: { outcome: 'none' as const } };
  if (c.label === 'rename') it.expected = { outcome: 'renamed', to: qn(c.new) };
  if (c.label === 'rename+change') it.expected = { outcome: 'renamed+changed', to: qn(c.new) };
  items.set(k, it);
}

interface Result {
  id: string;
  old: string;
  expected: Item['expected'];
  got: { outcome: string; to?: string; similarity?: number; candidates?: string[]; reason?: string };
  verdict: 'right' | 'miss' | 'wrong' | 'silent-fresh' | 'ok-none';
}
function judge(expected: Item['expected'] | Synthetic['expect'], r: Reanchor): Result['verdict'] {
  const to = r.to ? qn(r.to) : undefined;
  const reanchored = r.outcome === 'renamed' || r.outcome === 'renamed+changed';
  if (expected.outcome === 'none' || expected.outcome === 'ambiguous') {
    if (reanchored) return 'wrong';
    if (expected.outcome === 'ambiguous') {
      const want = [...(expected as Synthetic['expect']).candidates!].sort();
      const got = (r.candidates ?? []).map(qn).sort();
      return r.outcome === 'ambiguous' && JSON.stringify(want) === JSON.stringify(got) ? 'right' : 'miss';
    }
    return 'ok-none';
  }
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
for (const it of items.values()) byCommit.set(`${it.repo}:${it.commit}`, [...(byCommit.get(`${it.repo}:${it.commit}`) ?? []), it]);
for (const [k, list] of byCommit) {
  const [repoName, commit] = k.split(':') as ['mole' | 'excalidraw', string];
  const repo = repoName === 'mole' ? moleRoot : exRoot;
  const dir = mkdtempSync(join(tmpdir(), 'mole-m9-'));
  try {
    // git archive fails on a pathspec that matches nothing (the Mole repo has no .tsx): only pass the globs that match
    const names = git(repo, ['ls-tree', '-r', '--name-only', commit]).split('\n');
    const globs = ['ts', 'tsx'].filter((x) => names.some((n) => n.endsWith(`.${x}`))).map((x) => `':(glob)**/*.${x}'`);
    execFileSync('sh', ['-c', `git -C "$0" archive --format=tar "$1" -- ${globs.join(' ')} | tar -x -C "$2"`, repo, commit, dir]);
    let trees: { oldTree: SourceTree; newTree: SourceTree } | undefined;
    for (const it of list) {
      let r: Reanchor;
      try {
        trees ??= { oldTree: gitTree(repo, list[0]!.parent), newTree: dirTree(dir) };
        const { oldTree, newTree } = trees;
        const text = git(repo, ['show', `${it.parent}:${it.old.path}`]);
        const sym = symbolsOfText(it.old.path, text).find((s) => s.tail === it.old.tail);
        r = reanchor({ path: it.old.path, tail: it.old.tail, kind: it.old.kind, hash: sym?.hash }, oldTree, newTree);
      } catch (e) {
        r = { outcome: 'none', reason: `error: ${e instanceof Error ? e.message : String(e)}` };
      }
      results.push({ id: it.id, old: qn(it.old), expected: it.expected, got: shape(r), verdict: judge(it.expected, r) });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const synResults: Array<Omit<Result, 'expected'> & { expected: Synthetic['expect'] }> = [];
for (const s of key.synthetic) {
  const root = mkdtempSync(join(tmpdir(), 'mole-m9s-'));
  let r: Reanchor;
  try {
    git(root, ['init', '-q', '-b', 'main']);
    const put = (files: Record<string, string>) => {
      for (const [p, t] of Object.entries(files)) {
        mkdirSync(dirname(join(root, p)), { recursive: true });
        writeFileSync(join(root, p), t);
      }
    };
    const env = { GIT_AUTHOR_NAME: 'm9', GIT_AUTHOR_EMAIL: 'm9@example.com', GIT_COMMITTER_NAME: 'm9', GIT_COMMITTER_EMAIL: 'm9@example.com' };
    Object.assign(process.env, env);
    put(s.old);
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'old']);
    for (const p of Object.keys(s.old)) if (!(p in s.new)) rmSync(join(root, p));
    put(s.new);
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'new']);
    const [path, tail] = [s.anchor.slice(0, s.anchor.indexOf('#')), s.anchor.slice(s.anchor.indexOf('#') + 1)];
    const sym = symbolsOfText(path, s.old[path]!).find((x) => x.tail === tail);
    r = reanchor({ path, tail, kind: sym?.kind ?? 'function', hash: sym?.hash }, gitTree(root, 'HEAD~1'), dirTree(root));
  } catch (e) {
    r = { outcome: 'none', reason: `error: ${e instanceof Error ? e.message : String(e)}` };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  const v = judge(s.expect, r);
  synResults.push({ id: s.id, old: s.anchor, expected: s.expect, got: shape(r), verdict: s.expect.outcome === 'none' && v === 'ok-none' ? 'right' : v });
}

const count = (rs: Array<{ verdict: string }>, v: string) => rs.filter((r) => r.verdict === v).length;
const real = (repo: string) => results.filter((r) => r.id.startsWith(`${repo}-`));
const positives = results.filter((r) => r.expected.outcome !== 'none');
const right = count(positives, 'right');
const wrong = count(results, 'wrong');
const silent = count(results, 'silent-fresh');
const synRight = count(synResults, 'right');
const synWrong = count(synResults, 'wrong') + count(synResults, 'silent-fresh');
const per = (repo: string) => {
  const p = real(repo).filter((r) => r.expected.outcome !== 'none');
  return `${repo} ${count(p, 'right')}/${p.length}`;
};
const rightPct = pct(right, positives.length);
const atTarget = thresholdsOk && rightPct >= 95 && wrong === 0 && silent === 0 && synRight === synResults.length && synWrong === 0;
const metrics = {
  M9: `right ${rightPct}% (${right}/${positives.length}) wrong ${wrong} silent-fresh ${silent}; synthetic ${synRight}/${synResults.length} wrong ${synWrong}`,
  M9_detail: `real: ${per('mole')}, ${per('excalidraw')}; ${results.length} old symbols replayed (${results.length - positives.length} must stay unanchored); thresholds match key ${thresholdsOk}; ${Math.round((Date.now() - t0) / 1000)} s`,
  at_target: atTarget,
};

console.log(`M9 key ${key.written}: ${metrics.M9}`);
console.log(`   ${metrics.M9_detail}`);
for (const r of [...results, ...synResults].filter((x) => x.verdict !== 'right' && x.verdict !== 'ok-none'))
  console.log(`   ${r.verdict.padEnd(12)} ${r.id}  ${r.old}  expected ${JSON.stringify(r.expected)}  got ${JSON.stringify(r.got)}`);
console.log(`   at target: ${atTarget}`);
const mOut = arg('--metrics-out');
if (mOut) writeFileSync(mOut, JSON.stringify(metrics, null, 2));
const dOut = arg('--details');
if (dOut) writeFileSync(dOut, JSON.stringify({ key: keyPath, written: key.written, metrics, results, synthetic: synResults }, null, 2));
const runs = arg('--append-run');
if (runs) {
  let commit = '';
  try {
    commit = git(moleRoot, ['rev-parse', '--short', 'HEAD']).trim();
  } catch {
    // not a git checkout
  }
  appendFileSync(runs, JSON.stringify({ time: new Date().toISOString(), commit, cmd: 'node packages/memory/dist/bench/m9.js', exit: atTarget ? 0 : 1, metrics: { M9: metrics.M9 }, detail: metrics.M9_detail }) + '\n');
}
process.exit(atTarget ? 0 : 1);
