// T18 bench M7 (checks: `npm run check && node packages/agentstate/dist/bench/m6.js && node packages/agentstate/dist/bench/m7.js`).
// M7 already-tried recall across compaction. The key was written BEFORE the implementation by a separate subagent
// (rule: "list commands/tests tried before each compaction, with outcome") over every local session with a compaction
// (9 Hermes + 1 Claude Code on 2026-10-29). It quotes chat text, so it lives in the gitignored main checkout
// .mole/local/bench/m7-key.json (or MOLE_M7_KEY); its sha256 is committed in tasks/T18-agent-states/4 log/key.md and
// checked here first (R2: a changed key fails the bench).
// Scoring, per session and compaction k (key items under k = tried after compaction k-1 and before k):
//   mole side   tried(<session id>) items of kind command|test with segment k (segment null = after the last compaction: ignored)
//   match       same command after whitespace collapse, as multisets (a command run 3 times needs 3), paired in time order
//   recall      matched key items / key items                                   target 100%
//   wrong       (mole items with no key match + matched pairs whose outcomes are pass vs fail) / mole items   target <= 5%
//               ('unknown' on either side never contradicts)
// usage: node packages/agentstate/dist/bench/m7.js [--metrics-out FILE] [--details FILE]
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { defaultSources, tried, type TriedItem } from '../src/index.js';

interface KeyItem {
  command: string;
  kind: 'command' | 'test';
  outcome: 'pass' | 'fail' | 'unknown';
  at: string;
}
interface Key {
  written: string;
  sessions: Array<{ harness: string; id: string; compactions: Array<{ index: number; at: string; tried: KeyItem[] }> }>;
}

const args = process.argv.slice(2);
const flag = (n: string): string | undefined => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const git = (a: string[]): string => execFileSync('git', a, { encoding: 'utf8' }).trim();
const top = git(['rev-parse', '--show-toplevel']);
const mainCheckout = dirname(resolve(top, git(['rev-parse', '--git-common-dir'])));
const keyPath = process.env.MOLE_M7_KEY ?? join(mainCheckout, '.mole/local/bench/m7-key.json');
const keyMd = join(top, 'tasks/T18-agent-states/4 log/key.md');

function fail(msg: string): never {
  console.log(`M7 FAIL ${msg}`);
  const out = flag('--metrics-out');
  if (out) writeFileSync(out, JSON.stringify({ M7: `FAIL ${msg}` }));
  process.exit(2);
}
if (!existsSync(keyPath)) fail(`key not found at ${keyPath} (set MOLE_M7_KEY)`);
const raw = readFileSync(keyPath);
const sha = createHash('sha256').update(raw).digest('hex');
const want = /sha256\D{0,40}([0-9a-f]{64})/.exec(existsSync(keyMd) ? readFileSync(keyMd, 'utf8') : '')?.[1];
if (!want) fail(`no sha256 in ${keyMd}`);
if (sha !== want) fail(`key sha256 ${sha} != committed ${want} (R2: the key must not change)`);
const key = JSON.parse(raw.toString('utf8')) as Key;
// R1: the key is older than the red commit (the commit that added this bench)
const red = git(['-C', top, 'log', '--diff-filter=A', '--format=%cI', '--', 'packages/agentstate/bench/m7.ts']).split('\n').filter(Boolean).at(-1);
if (red && Date.parse(key.written) > Date.parse(red)) fail(`key written ${key.written} after the red commit ${red}`);

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();
const contradicts = (a: string, b: string): boolean => (a === 'pass' && b === 'fail') || (a === 'fail' && b === 'pass');

let src: ReturnType<typeof defaultSources>;
try {
  src = defaultSources();
} catch (e) {
  fail(`defaultSources: ${e instanceof Error ? e.message : String(e)}`);
}
let keyTotal = 0;
let moleTotal = 0;
let matched = 0;
let unmatchedMole = 0;
let outcomeWrong = 0;
const perSession: string[] = [];
const details: Array<{ session: string; compaction: number; missed: string[]; extra: string[]; outcome: string[] }> = [];
const t0 = performance.now();
for (const s of key.sessions) {
  let items: TriedItem[] = [];
  let err: string | undefined;
  try {
    items = tried(s.id, { ...src, all: true }).items.filter((i) => i.kind === 'command' || i.kind === 'test');
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }
  let sKey = 0;
  let sHit = 0;
  const maxK = s.compactions.length;
  for (const it of items) if (it.segment !== null && it.segment > maxK) {
    moleTotal++;
    unmatchedMole++;
  }
  for (const c of s.compactions) {
    const keyItems = [...c.tried].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    const mine = items.filter((i) => i.segment === c.index).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    keyTotal += keyItems.length;
    moleTotal += mine.length;
    sKey += keyItems.length;
    const pool = new Map<string, TriedItem[]>();
    for (const m of mine) {
      const k = norm(m.command);
      pool.set(k, [...(pool.get(k) ?? []), m]);
    }
    const missed: string[] = [];
    const outcome: string[] = [];
    for (const k of keyItems) {
      const list = pool.get(norm(k.command));
      const m = list?.shift();
      if (!m) {
        missed.push(norm(k.command).slice(0, 120));
        continue;
      }
      matched++;
      sHit++;
      if (contradicts(k.outcome, m.outcome)) {
        outcomeWrong++;
        outcome.push(`${norm(k.command).slice(0, 80)}: key ${k.outcome}, mole ${m.outcome}`);
      }
    }
    const extra = [...pool.values()].flat();
    unmatchedMole += extra.length;
    if (missed.length || extra.length || outcome.length)
      details.push({ session: s.id, compaction: c.index, missed, extra: extra.map((e) => norm(e.command).slice(0, 120)), outcome });
  }
  perSession.push(`  ${s.harness.padEnd(11)} ${s.id}  ${maxK} compaction${maxK === 1 ? '' : 's'}  recall ${sHit}/${sKey}${err ? `  ERROR ${err}` : ''}`);
}
const ms = performance.now() - t0;
const recall = keyTotal ? matched / keyTotal : 0;
const wrong = moleTotal ? (unmatchedMole + outcomeWrong) / moleTotal : 1;
const pct = (x: number): string => `${(100 * x).toFixed(1)}%`;
const summary = `M7 recall ${pct(recall)} (${matched}/${keyTotal}) · wrong ${pct(wrong)} (${unmatchedMole} unmatched + ${outcomeWrong} outcome of ${moleTotal}) · ${key.sessions.length} sessions, ${key.sessions.reduce((a, s) => a + s.compactions.length, 0)} compactions · target recall 100%, wrong <= 5%`;
console.log(summary);
console.log(`  key sha256 ${sha.slice(0, 12)}… written ${key.written} · tried() ${Math.round(ms)} ms`);
for (const l of perSession) console.log(l);
for (const d of details.slice(0, 12))
  console.log(`  ${d.session} c${d.compaction}: missed ${d.missed.length}, extra ${d.extra.length}, outcome ${d.outcome.length}${d.missed[0] ? ` · e.g. missed "${d.missed[0].slice(0, 60)}"` : ''}`);
const out = flag('--metrics-out');
if (out) writeFileSync(out, JSON.stringify({ M7: summary.slice(3), M7_recall: recall, M7_wrong: wrong }));
const det = flag('--details');
if (det) writeFileSync(det, JSON.stringify(details, null, 1)); // quotes chat text: keep under .mole/local/ or a scratch dir
process.exit(recall === 1 && wrong <= 0.05 ? 0 : 1);
