// M3 bench (T13): a scripted repo where 5 symbols were seen and 2 (+ the class symbol) were not; commits change 3 seen + 2 unseen
// (and reformat a seen one). `since` must list exactly the seen-then-changed symbols, newest first, grouped by file, with the
// right commit / author / agent, and a fresh look must clear an entry.
// usage: node packages/memory/dist/bench/m3.js [--metrics-out FILE] [--details FILE]
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendSeen, since, type SinceFile } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const keyPath = resolve(here, '../../bench/m3-key.json');

interface Person {
  name: string;
  email: string;
}
interface KeyCommit {
  id: string;
  author: Person;
  date: string;
  message: string;
  files: Record<string, string>;
}
interface ExpChange {
  commit: string;
  author: string;
  agent: string | null;
}
interface ExpFile {
  path: string;
  symbols: Array<{ symbol: string; status: string; changes: ExpChange[] }>;
}
interface Key {
  written: string;
  fixture: {
    base: Omit<KeyCommit, 'id'>;
    seen: Array<{ symbol: string; how: 'visible' | 'hover' | 'note' }>;
    unseen: string[];
    commits: KeyCommit[];
    relook: string[];
  };
  expected: { since: ExpFile[]; afterRelook: ExpFile[] };
}

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const key = JSON.parse(readFileSync(keyPath, 'utf8')) as Key;
const root = mkdtempSync(join(tmpdir(), 'mole-m3-'));
const git = (args: string[], env: Record<string, string> = {}): string =>
  execFileSync('git', ['-C', root, '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

function commit(c: Omit<KeyCommit, 'id'>): string {
  for (const [p, text] of Object.entries(c.files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), text);
  }
  git(['add', '-A']);
  const env = {
    GIT_AUTHOR_NAME: c.author.name,
    GIT_AUTHOR_EMAIL: c.author.email,
    GIT_AUTHOR_DATE: c.date,
    GIT_COMMITTER_NAME: c.author.name,
    GIT_COMMITTER_EMAIL: c.author.email,
    GIT_COMMITTER_DATE: c.date,
  };
  git(['commit', '-q', '-m', c.message], env);
  return git(['rev-parse', 'HEAD']).trim();
}

const split = (q: string) => ({ path: q.slice(0, q.indexOf('#')), tail: q.slice(q.indexOf('#') + 1) });
const pct = (a: number, b: number) => (b === 0 ? 0 : Math.round((1000 * a) / b) / 10);

const details: Record<string, unknown> = { key: keyPath, written: key.written, root };
let listedFirst: SinceFile[] = [];
let listedRelook: SinceFile[] = [];
let error: string | undefined;
const idOf = new Map<string, string>();
try {
  git(['init', '-q', '-b', 'main']);
  idOf.set(commit(key.fixture.base), 'base');
  appendSeen(
    root,
    key.fixture.seen.map((s) => ({ ...split(s.symbol), how: s.how })),
  );
  for (const c of key.fixture.commits) idOf.set(commit(c), c.id);
  listedFirst = since(root).files;
  appendSeen(
    root,
    key.fixture.relook.map((q) => ({ ...split(q), how: 'visible' as const })),
  );
  listedRelook = since(root).files;
} catch (e) {
  error = e instanceof Error ? e.message : String(e);
}

const names = (files: { symbols: Array<{ symbol: string }> }[]) => files.flatMap((f) => f.symbols.map((s) => s.symbol));
const shape = (files: SinceFile[]): ExpFile[] =>
  files.map((f) => ({
    path: f.path,
    symbols: f.symbols.map((s) => ({
      symbol: s.symbol,
      status: s.status,
      changes: s.changes.map((c) => ({ commit: idOf.get(c.commit) ?? c.commit, author: c.author, agent: c.agent ?? null })),
    })),
  }));

const listed = names(listedFirst);
const expected = names(key.expected.since);
const correct = listed.filter((s) => expected.includes(s)).length;
const found = expected.filter((s) => listed.includes(s)).length;
const seenSet = new Set(key.fixture.seen.map((s) => s.symbol));
const unseenListed = [...listed, ...names(listedRelook)].filter((s) => !seenSet.has(s));
const got = shape(listedFirst);
const gotRelook = shape(listedRelook);
const orderExact = JSON.stringify(got.map((f) => [f.path, f.symbols.map((s) => s.symbol)])) === JSON.stringify(key.expected.since.map((f) => [f.path, f.symbols.map((s) => s.symbol)]));
const attributionExact = JSON.stringify(got) === JSON.stringify(key.expected.since);
const relookExact = JSON.stringify(gotRelook) === JSON.stringify(key.expected.afterRelook);
const precision = pct(correct, listed.length);
const recall = pct(found, expected.length);
const atTarget = !error && precision === 100 && recall === 100 && unseenListed.length === 0 && orderExact && attributionExact && relookExact;

const metrics = {
  M3: `precision ${precision}% (${correct}/${listed.length}), recall ${recall}% (${found}/${expected.length}), unseen listed ${unseenListed.length}`,
  M3_detail: `order exact ${orderExact}, commit/author/agent exact ${attributionExact}, relook clears ${relookExact}${error ? `, error: ${error}` : ''}`,
  at_target: atTarget,
};
Object.assign(details, { metrics, got, gotRelook, expected: key.expected, unseenListed, error });

console.log(`M3 key ${key.written}: ${metrics.M3}`);
console.log(`   ${metrics.M3_detail}`);
console.log(`   at target: ${atTarget}`);
const mOut = arg('--metrics-out');
if (mOut) writeFileSync(mOut, JSON.stringify(metrics, null, 2));
const dOut = arg('--details');
if (dOut) writeFileSync(dOut, JSON.stringify(details, null, 2));
rmSync(root, { recursive: true, force: true });
process.exit(atTarget ? 0 : 1);
