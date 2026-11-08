'use strict';
// Deterministic split + balancing policy, frozen BEFORE any method runs.
// Policy (documented, INFERENCE because real repos don't hand us the paper's
// 40k-example pool to balance 1:1 at will):
//   - if a (repo, type) has >=10 positives: balance 1:1, sampling negatives
//     with a fixed seeded RNG (reproducible, no model calls).
//   - if a (repo, type) has <10 positives: too scarce to balance without
//     discarding almost all negatives (destroys statistical power); use ALL
//     available examples for that type, unbalanced, and flag it as low-n/noisy
//     in the report. This is reported honestly, not hidden.
const fs = require('fs');
const crypto = require('crypto');

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildSplit(rawPath, splitName, seed) {
  const rng = mulberry32(seed);
  const lines = fs.readFileSync(rawPath, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  const byType = {};
  for (const ex of lines) { (byType[ex.type] = byType[ex.type] || []).push(ex); }
  const out = [];
  const policyNotes = {};
  for (const type of Object.keys(byType)) {
    const pos = byType[type].filter((e) => e.label === 1);
    const neg = byType[type].filter((e) => e.label === 0);
    if (pos.length >= 10) {
      const negSample = shuffle(neg, rng).slice(0, pos.length);
      out.push(...pos, ...negSample);
      policyNotes[type] = { policy: 'balanced_1to1', pos: pos.length, neg_sampled: negSample.length, neg_available: neg.length };
    } else {
      out.push(...pos, ...neg);
      policyNotes[type] = { policy: 'unbalanced_low_n', pos: pos.length, neg: neg.length, note: 'too few positives (<10) to balance; used all examples, flagged noisy' };
    }
  }
  return { split: splitName, examples: out, policyNotes };
}

const devRes = buildSplit('../data/dev.raw.jsonl', 'dev', 20261101);
const testRes = buildSplit('../data/test.raw.jsonl', 'test', 20261101);

fs.writeFileSync('../data/dev.examples.jsonl', devRes.examples.map((e) => JSON.stringify(e)).join('\n') + '\n');
fs.writeFileSync('../data/test.examples.jsonl', testRes.examples.map((e) => JSON.stringify(e)).join('\n') + '\n');

// Frozen answer key: id -> {label, type, repo, split}. No predictions, no method
// output goes anywhere near this file before methods run.
const key = {};
for (const e of devRes.examples) key[e.id] = { label: e.label, type: e.type, repo: e.repo, split: 'dev' };
for (const e of testRes.examples) key[e.id] = { label: e.label, type: e.type, repo: e.repo, split: 'test' };
const keyJson = JSON.stringify(key, Object.keys(key).sort(), 2);
fs.writeFileSync('../data/key.json', keyJson);
const sha256 = crypto.createHash('sha256').update(keyJson).digest('hex');
fs.writeFileSync('../data/key.json.sha256', sha256 + '\n');

console.log(JSON.stringify({
  dev: { n: devRes.examples.length, policy: devRes.policyNotes },
  test: { n: testRes.examples.length, policy: testRes.policyNotes },
  key_sha256: sha256,
}, null, 2));
