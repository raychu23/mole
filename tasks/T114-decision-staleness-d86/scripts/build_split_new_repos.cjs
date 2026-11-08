'use strict';
// Pre-registered split for the D86/Q8 rerun of test 1 on NEW TypeScript repos
// (es-toolkit, remeda -- neither used in the original xstate/date-fns run).
// The method under test (scripts/methods.cjs) is BYTE-IDENTICAL to the
// original frozen file (verified by sha256 before this script ran; see
// "4 log/prior-art.md"). No new dev-design step happens here: this is a
// held-out generalization check of an already-frozen method, so the whole
// mined pool is treated as a single frozen TEST split, run once.
// Same balancing policy as the original bench (build_split.cjs), same seed.
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

const SEED = 20261108; // dated seed, distinct from the original 20261101 run, fixed before any eval ran
const res = buildSplit('../data/new-repos.raw.jsonl', 'test', SEED);

fs.writeFileSync('../data/new-repos.examples.jsonl', res.examples.map((e) => JSON.stringify(e)).join('\n') + '\n');

const key = {};
for (const e of res.examples) key[e.id] = { label: e.label, type: e.type, repo: e.repo, split: 'test' };
const keyJson = JSON.stringify(key, Object.keys(key).sort(), 2);
fs.writeFileSync('../data/new-repos.key.json', keyJson);
const sha256 = crypto.createHash('sha256').update(keyJson).digest('hex');
fs.writeFileSync('../data/new-repos.key.json.sha256', sha256 + '\n');

console.log(JSON.stringify({ seed: SEED, n: res.examples.length, policy: res.policyNotes, key_sha256: sha256 }, null, 2));
