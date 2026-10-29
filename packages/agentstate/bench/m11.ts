// T21 bench M11 (checks: `npm run check && node packages/agentstate/dist/bench/m11.js`).
// M11 parallel-agent collision recall + false alarms. The key (bench/m11-key.json) was written BEFORE the collision code
// (R1) and holds only run ids, file#symbol names, times, labels and reasons (no transcript text).
//   real     the Mole builder chats of 10-28/29 in ~/.hermes/state.db (MOLE_HERMES_DB), root = the Mole main checkout
//   planted  synthetic Claude Code transcripts over a small fixture repo, built here in a temp dir from the key
// Scoring (key.scoring): candidate pairs = every unordered pair of the listed runs; flagged = pairs collisions() reports.
//   recall       flagged ∩ labelled collision / labelled collision                     target >= 90%
//   false alarm  flagged pairs not labelled collision (labelled not or unlabelled) / flagged    target <= 10%
// A missing source (no state.db, a key run not found, a planted run not read) fails the bench (exit 2), never a silent pass.
// usage: node packages/agentstate/dist/bench/m11.js [--append-run RUNS.jsonl] [--details FILE] [--real-only | --planted-only]
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { symbolsOfText } from '@mole/memory';
import { collisions, defaultSources, type CollisionsResult } from '../src/index.js';

interface KeyPair {
  a: string;
  b: string;
  label: 'collision' | 'not';
  reason: string;
}
interface PlantedStep {
  at: number;
  op: 'edit' | 'read';
  symbol: string;
  complete?: boolean;
}
interface PlantedRun {
  id: string;
  start: string;
  steps: PlantedStep[];
  parent?: string;
  tail?: 'truncated';
}
interface Key {
  written: string;
  definition: { windowMinutes: number; hops: number };
  real: { runs: Array<{ id: string }>; pairs: KeyPair[] };
  planted: { files: Record<string, string>; runs: PlantedRun[]; pairs: KeyPair[] };
}

const here = dirname(fileURLToPath(import.meta.url));
const keyPath = resolve(here, '../../bench/m11-key.json');
const args = process.argv.slice(2);
const arg = (n: string): string | undefined => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const git = (cwd: string, a: string[]): string => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const top = git(here, ['rev-parse', '--show-toplevel']);
const mainCheckout = dirname(resolve(top, git(top, ['rev-parse', '--git-common-dir'])));
const CMD = 'npm run check && node packages/agentstate/dist/bench/m11.js';

function finish(exit: number, metrics: Record<string, unknown>, detail: string): never {
  const runs = arg('--append-run');
  if (runs) {
    let commit = '';
    try {
      commit = git(top, ['rev-parse', '--short', 'HEAD']);
    } catch {
      // not a git checkout
    }
    appendFileSync(runs, JSON.stringify({ time: new Date().toISOString(), commit, cmd: CMD, exit, metrics, detail }) + '\n');
  }
  process.exit(exit);
}
function fail(msg: string): never {
  console.log(`M11 FAIL ${msg}`);
  finish(2, { M11: `FAIL ${msg}` }, msg);
}

if (!existsSync(keyPath)) fail(`key not found at ${keyPath}`);
const key = JSON.parse(readFileSync(keyPath, 'utf8')) as Key;
// R1: the key is older than the commit that added this bench
const red = (() => {
  try {
    return git(top, ['log', '--diff-filter=A', '--format=%cI', '--', 'packages/agentstate/bench/m11.ts']).split('\n').filter(Boolean).at(-1);
  } catch {
    return undefined;
  }
})();
if (red && Date.parse(key.written) > Date.parse(red)) fail(`key written ${key.written} after the red commit ${red}`);

const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
interface Score {
  name: string;
  labelled: number;
  hit: number;
  flagged: number;
  wrong: number;
  missed: string[];
  falseAlarms: string[];
}
function score(name: string, ids: string[], pairs: KeyPair[], r: CollisionsResult): Score {
  const label = new Map(pairs.map((p) => [pairKey(p.a, p.b), p.label]));
  const inSet = new Set(ids);
  const flagged = new Set(r.pairs.filter((p) => inSet.has(p.a.run) && inSet.has(p.b.run)).map((p) => pairKey(p.a.run, p.b.run)));
  const want = [...label].filter(([, l]) => l === 'collision').map(([k]) => k);
  const missed = want.filter((k) => !flagged.has(k));
  const falseAlarms = [...flagged].filter((k) => label.get(k) !== 'collision');
  return { name, labelled: want.length, hit: want.length - missed.length, flagged: flagged.size, wrong: falseAlarms.length, missed, falseAlarms };
}

// ---------------------------------------------------------------- planted: fixture repo + Claude Code transcripts
function planted(): Score {
  const base = mkdtempSync(join(tmpdir(), 'mole-m11-'));
  try {
    const root = join(base, 'repo');
    for (const [p, body] of Object.entries(key.planted.files)) {
      mkdirSync(dirname(join(root, p)), { recursive: true });
      writeFileSync(join(root, p), body);
    }
    const proj = join(base, 'claude', '-fixture-repo');
    mkdirSync(proj, { recursive: true });
    const sym = (s: string): { file: string; text: string; start: number; end: number } => {
      const [path, tail] = s.split('#') as [string, string];
      const body = key.planted.files[path];
      const found = body ? symbolsOfText(path, body).find((x) => x.tail === tail) : undefined;
      if (!body || !found) fail(`planted symbol ${s} not in the fixture files`);
      const text = body.split('\n').slice(found.startLine - 1, found.endLine).join('\n');
      return { file: join(root, path), text, start: found.startLine, end: found.endLine };
    };
    for (const run of key.planted.runs) {
      const session = run.parent ?? run.id;
      const lines: string[] = [];
      const t0 = Date.parse(run.start);
      run.steps.forEach((s, i) => {
        const at = new Date(t0 + s.at * 60_000).toISOString();
        const done = new Date(t0 + s.at * 60_000 + 4_000).toISOString();
        const x = sym(s.symbol);
        const id = `toolu_${run.id}_${i}`;
        const input = s.op === 'edit' ? { file_path: x.file, old_string: x.text, new_string: x.text } : { file_path: x.file, offset: x.start, limit: x.end - x.start + 1 };
        lines.push(JSON.stringify({ type: 'assistant', sessionId: session, cwd: root, timestamp: at, message: { role: 'assistant', content: [{ type: 'tool_use', id, name: s.op === 'edit' ? 'Edit' : 'Read', input }] } }));
        if (s.complete !== false)
          lines.push(JSON.stringify({ type: 'user', sessionId: session, cwd: root, timestamp: done, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: s.op === 'edit' ? 'The file has been updated.' : x.text }] } }));
      });
      let text = lines.join('\n') + '\n';
      if (run.tail === 'truncated') {
        const at = new Date(t0 + 30 * 60_000).toISOString();
        const x = sym(run.steps[0]!.symbol);
        text += JSON.stringify({ type: 'assistant', sessionId: session, cwd: root, timestamp: at, message: { role: 'assistant', content: [{ type: 'tool_use', id: `toolu_${run.id}_cut`, name: 'Edit', input: { file_path: x.file, old_string: x.text, new_string: x.text } }] } }).slice(0, 140);
      }
      const file = run.parent ? join(proj, run.parent, 'subagents', `${run.id}.jsonl`) : join(proj, `${run.id}.jsonl`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
    }
    const ids = key.planted.runs.map((r) => r.id);
    let r: CollisionsResult;
    try {
      r = collisions({ root, claudeDir: join(base, 'claude'), hermesDb: join(base, 'none.db'), codexDir: join(base, 'none'), runs: ids, since: 0 });
    } catch (e) {
      fail(`planted: collisions() threw ${e instanceof Error ? e.message : String(e)}`);
    }
    const seen = new Set(r.runs.map((x) => x.id));
    const lost = ids.filter((i) => !seen.has(i));
    if (lost.length) fail(`planted runs not read: ${lost.join(' ')}`);
    return score('planted', ids, key.planted.pairs, r);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- real: the Hermes builder chats, read-only
function real(): Score {
  const src = defaultSources();
  if (!existsSync(src.hermesDb)) fail(`real: Hermes state.db not found at ${src.hermesDb} (set MOLE_HERMES_DB)`);
  const ids = key.real.runs.map((r) => r.id);
  let r: CollisionsResult;
  try {
    r = collisions({ ...src, root: mainCheckout, runs: ids, since: 0 });
  } catch (e) {
    fail(`real: collisions() threw ${e instanceof Error ? e.message : String(e)}`);
  }
  const seen = new Set(r.runs.map((x) => x.id));
  const lost = ids.filter((i) => !seen.has(i));
  if (lost.length) fail(`real runs not found in ${src.hermesDb}: ${lost.join(' ')}`);
  return score('real', ids, key.real.pairs, r);
}

const t0 = performance.now();
const parts: Score[] = [];
if (!args.includes('--real-only')) parts.push(planted());
if (!args.includes('--planted-only')) parts.push(real());
const ms = performance.now() - t0;
const sum = (f: (s: Score) => number): number => parts.reduce((a, s) => a + f(s), 0);
const labelled = sum((s) => s.labelled);
const hit = sum((s) => s.hit);
const flagged = sum((s) => s.flagged);
const wrong = sum((s) => s.wrong);
const recall = labelled ? hit / labelled : 0;
const fa = flagged ? wrong / flagged : 0;
const pct = (x: number): string => `${(100 * x).toFixed(1)}%`;
const each = parts.map((s) => `${s.name} recall ${s.hit}/${s.labelled}, false alarms ${s.wrong}/${s.flagged}`).join('; ');
const summary = `recall ${pct(recall)} (${hit}/${labelled}) · false alarms ${pct(fa)} (${wrong}/${flagged}) · ${each} · target recall >= 90%, false alarms <= 10%`;
console.log(`M11 ${summary}`);
console.log(`  key written ${key.written} · N=${key.definition.windowMinutes} min, ${key.definition.hops} hops · ${Math.round(ms)} ms`);
for (const s of parts) {
  for (const m of s.missed) console.log(`  ${s.name} missed ${m}`);
  for (const f of s.falseAlarms) console.log(`  ${s.name} false alarm ${f}`);
}
const det = arg('--details');
if (det) writeFileSync(det, JSON.stringify(parts, null, 1));
const ok = recall >= 0.9 && fa <= 0.1 && parts.length > 0;
finish(ok ? 0 : 1, { M11: summary, M11_recall: recall, M11_false_alarms: fa }, each);
