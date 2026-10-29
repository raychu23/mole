// T24 bench M16 (checks: `npm run check && node packages/agentstate/dist/bench/m16.js`).
// M16 agent claim check. The key (40 final answers from real Hermes + Claude Code runs, 120 claims) was labelled by hand
// BEFORE any matcher code existed. It quotes chat text, so it lives in the gitignored .mole/local/bench/m16-key.json
// (this worktree's, else the main checkout's, or MOLE_M16_KEY); its sha256 is committed in
// tasks/T24-agent-claim-check/4 log/key.md and checked here first (R2: a changed key fails the bench).
// Per answer: claims(run, { text: <answer text>, before: <answer row> }) -> the tool's claims with verdicts.
// Matching: a key claim's quote span [start, start+len) is matched to the tool claim overlapping it the most (ties: first).
//   recall       key unsupported/contradicted claims whose matched tool claim is unsupported or contradicted / all of them
//                (no overlapping tool claim = a miss)                                       target >= 90%
//   false flags  key supported claims whose matched tool claim is unsupported or contradicted / key supported claims
//                (no overlapping tool claim = not a false flag)                             target <= 10%
//   reported, not scored: exact-verdict agreement, splitter coverage, flagged tool claims outside the key, answer extraction
// usage: node packages/agentstate/dist/bench/m16.js [--metrics-out FILE] [--details FILE]
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { claims, defaultSources, finalAnswers, type Claim } from '../src/index.js';

interface KeyClaim {
  quote: string;
  start: number;
  category: string;
  label: 'supported' | 'unsupported' | 'contradicted';
  evidence: string;
}
interface KeyAnswer {
  id: string;
  harness: 'hermes' | 'claude-code';
  run: string;
  kind: 'final' | 'runs-line';
  source: { row?: number; line?: number; file?: string };
  before: number;
  text: string;
  claims: KeyClaim[];
}
interface Key {
  written: string;
  answers: KeyAnswer[];
}

const args = process.argv.slice(2);
const flag = (n: string): string | undefined => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const git = (a: string[]): string => execFileSync('git', a, { encoding: 'utf8' }).trim();
const top = git(['rev-parse', '--show-toplevel']);
const mainCheckout = dirname(resolve(top, git(['rev-parse', '--git-common-dir'])));
const keyPath =
  process.env.MOLE_M16_KEY ?? [join(top, '.mole/local/bench/m16-key.json'), join(mainCheckout, '.mole/local/bench/m16-key.json')].find((p) => existsSync(p)) ?? join(top, '.mole/local/bench/m16-key.json');
const keyMd = join(top, 'tasks/T24-agent-claim-check/4 log/key.md');

function fail(msg: string): never {
  console.log(`M16 FAIL ${msg}`);
  const out = flag('--metrics-out');
  if (out) writeFileSync(out, JSON.stringify({ M16: `FAIL ${msg}` }));
  process.exit(2);
}
if (!existsSync(keyPath)) fail(`key not found at ${keyPath} (set MOLE_M16_KEY)`);
const raw = readFileSync(keyPath);
const sha = createHash('sha256').update(raw).digest('hex');
const want = /sha256\D{0,40}([0-9a-f]{64})/.exec(existsSync(keyMd) ? readFileSync(keyMd, 'utf8') : '')?.[1];
if (!want) fail(`no sha256 in ${keyMd}`);
if (sha !== want) fail(`key sha256 ${sha} != committed ${want} (R2: the key must not change)`);
const key = JSON.parse(raw.toString('utf8')) as Key;
// R1: the key is older than the red commit (the commit that added this bench)
const red = git(['-C', top, 'log', '--diff-filter=A', '--format=%cI', '--', 'packages/agentstate/bench/m16.ts']).split('\n').filter(Boolean).at(-1);
if (red && Date.parse(key.written) > Date.parse(red)) fail(`key written ${key.written} after the red commit ${red}`);

const src = defaultSources();
const flagged = (v: string | undefined): boolean => v === 'unsupported' || v === 'contradicted';
let keyFlagged = 0;
let found = 0;
let keySupported = 0;
let falseFlags = 0;
let exact = 0;
let covered = 0;
let total = 0;
let extra = 0;
let extracted = 0;
let finals = 0;
const details: unknown[] = [];
const t0 = Date.now();
for (const a of key.answers) {
  let got: Claim[] = [];
  let err: string | undefined;
  try {
    got = claims(a.run, { ...src, text: a.text, before: a.before }).claims;
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }
  if (a.kind === 'final') {
    finals++;
    try {
      if (finalAnswers(a.run, src).some((x) => x.row === (a.source.row ?? a.source.line) && x.text.includes(a.text.slice(0, 200)))) extracted++;
    } catch {
      // counted as not extracted
    }
  }
  const used = new Set<Claim>();
  const rows = a.claims.map((k) => {
    const ks = k.start;
    const ke = k.start + k.quote.length;
    let best: Claim | undefined;
    let bestOv = 0;
    for (const c of got) {
      const ov = Math.min(ke, c.end) - Math.max(ks, c.start);
      if (ov > bestOv) {
        best = c;
        bestOv = ov;
      }
    }
    if (best) used.add(best);
    total++;
    if (best) covered++;
    if (best && best.verdict === k.label) exact++;
    if (flagged(k.label)) {
      keyFlagged++;
      if (flagged(best?.verdict)) found++;
    } else {
      keySupported++;
      if (flagged(best?.verdict)) falseFlags++;
    }
    return { quote: k.quote, key: k.label, tool: best?.verdict ?? 'MISSED', toolText: best?.text, why: best?.why, evidence: best?.evidence.slice(0, 2), keyEvidence: k.evidence };
  });
  const outside = got.filter((c) => !used.has(c) && flagged(c.verdict));
  extra += outside.length;
  details.push({ id: a.id, run: a.run, error: err, claims: rows, flaggedOutsideKey: outside.map((c) => ({ text: c.text, verdict: c.verdict, why: c.why })) });
}
const ms = Date.now() - t0;
const pct = (n: number, d: number): string => `${d ? ((100 * n) / d).toFixed(1) : '0.0'}%`;
const recall = keyFlagged ? found / keyFlagged : 0;
const ffRate = keySupported ? falseFlags / keySupported : 1;
const met = recall >= 0.9 && ffRate <= 0.1;
const line =
  `recall ${pct(found, keyFlagged)} (${found}/${keyFlagged}) · false flags ${pct(falseFlags, keySupported)} (${falseFlags}/${keySupported}) · ` +
  `exact verdict ${exact}/${total} · split coverage ${covered}/${total} · flagged outside key ${extra} · answers extracted ${extracted}/${finals} · ` +
  `${key.answers.length} answers in ${ms} ms, model calls 0 · target recall >= 90%, false flags <= 10%`;
console.log(`M16 key ${key.written}: ${line}`);
console.log(met ? 'bench: all targets met' : 'bench: target NOT met');
const out = flag('--metrics-out');
if (out) writeFileSync(out, JSON.stringify({ M16: line, M16_recall: recall, M16_false_flags: ffRate }));
const det = flag('--details');
if (det) writeFileSync(det, JSON.stringify(details, null, 1));
process.exit(met ? 0 : 1);
