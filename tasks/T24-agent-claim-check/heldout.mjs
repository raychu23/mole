// T24 held-out score (review-2 P1-1): run `claims` on the 16 held-out answers (4 log/heldout-key.md) and score the flags.
//   precision = tool flags whose span overlaps a key claim labelled unsupported/contradicted / all tool flags
//               (the key lists every checkable claim of each answer, so any other flag is wrong)
//   recall    = key unsupported/contradicted claims whose most-overlapping tool claim is flagged / all of them
// usage: node tasks/T24-agent-claim-check/heldout.mjs [--json FILE] [--details FILE]   (after npm run build)
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const git = (a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const top = git(['rev-parse', '--show-toplevel']);
const main = dirname(resolve(top, git(['rev-parse', '--git-common-dir'])));
const keyPath = [join(top, '.mole/local/bench/m16-heldout-key.json'), join(main, '.mole/local/bench/m16-heldout-key.json')].find((p) => existsSync(p));
const out = (s) => { console.log(s); const j = flag('--json'); if (j) writeFileSync(j, JSON.stringify({ heldout: s })); };
if (!keyPath) { out('held-out: key not found'); process.exit(2); }
const raw = readFileSync(keyPath);
const sha = createHash('sha256').update(raw).digest('hex');
const want = /sha256\D{0,40}([0-9a-f]{64})/.exec(readFileSync(join(top, 'tasks/T24-agent-claim-check/4 log/heldout-key.md'), 'utf8'))?.[1];
if (sha !== want) { out(`held-out: key sha256 ${sha} != committed ${want}`); process.exit(2); }
const key = JSON.parse(raw.toString('utf8'));
const { claims } = await import(join(top, 'packages/agentstate/dist/src/index.js'));
const bad = (v) => v === 'unsupported' || v === 'contradicted';
const ov = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
let flags = 0, correct = 0, keyBad = 0, caught = 0, toolClaims = 0;
const details = [];
for (const a of key.answers) {
  const r = claims(a.run, { text: a.text, before: a.before });
  toolClaims += r.claims.length;
  const ks = a.claims.map((k) => ({ ...k, end: k.start + k.quote.length }));
  for (const c of r.claims) {
    if (!bad(c.verdict)) continue;
    flags++;
    const hit = ks.find((k) => bad(k.label) && ov(c.start, c.end, k.start, k.end) > 0);
    const on = ks.find((k) => ov(c.start, c.end, k.start, k.end) > 0);
    if (hit) correct++;
    details.push({ id: a.id, run: a.run, ok: !!hit, verdict: c.verdict, category: c.category, text: c.text, why: c.why, key: on ? `${on.label}: ${on.quote}` : 'not a key claim', ev: c.evidence[0]?.detail ?? '' });
  }
  for (const k of ks.filter((k) => bad(k.label))) {
    keyBad++;
    let best = null, bo = 0;
    for (const c of r.claims) { const o = ov(c.start, c.end, k.start, k.end); if (o > bo) { bo = o; best = c; } }
    if (best && bad(best.verdict)) caught++;
    details.push({ id: a.id, run: a.run, keyFlag: k.quote, label: k.label, tool: best ? `${best.verdict}: ${best.why}` : 'no tool claim' });
  }
}
const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : 'n/a');
const s = `held-out ${key.answers.length} answers: flags ${flags}, correct ${correct} (precision ${pct(correct, flags)}) · flagged key claims caught ${caught}/${keyBad} (recall ${pct(caught, keyBad)}) · tool claims ${toolClaims}`;
if (flag('--details')) writeFileSync(flag('--details'), JSON.stringify(details, null, 1));
out(s);
