// T102 latency: median of 10 prCheck() calls, OLD (main's dist) vs NEW (this branch's dist), same repo & revisions.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

const OLD_MODULE = '/Users/a1/Desktop/CS Code/Project/Mole/packages/decisions/dist/src/check/pr-check.js';
const NEW_MODULE = fileURLToPath(new URL('../../../packages/decisions/dist/src/check/pr-check.js', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '');

const { prCheck: prCheckOld } = await import(OLD_MODULE);
const { prCheck: prCheckNew } = await import(NEW_MODULE);

const git = (...args) => execFileSync('git', ['-C', REPO_ROOT, ...args], { encoding: 'utf8' }).trim();
const head = git('rev-parse', 'HEAD');
const base = git('rev-parse', 'HEAD~12'); // a mid-size real PR range, has a decision record with history

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

async function timeN(fn, n) {
  const times = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    await fn({ root: REPO_ROOT, base, head, history: true });
    times.push(performance.now() - t0);
  }
  return times;
}

// one untimed warmup call each (JIT/module warmup only -- the OLD path's warmup worktree is removed immediately
// after, same as every other call, so this does not pre-warm the NEW cached worktree unfairly for the timed runs
// below: the NEW cache is warmed by its own first timed call like it would be in a long-lived server process)
await prCheckOld({ root: REPO_ROOT, base, head, history: true });

const oldTimes = await timeN(prCheckOld, 10);
const newTimes = await timeN(prCheckNew, 10);

const result = {
  root: REPO_ROOT,
  base,
  head,
  oldTimesMs: oldTimes.map((t) => Math.round(t * 10) / 10),
  newTimesMs: newTimes.map((t) => Math.round(t * 10) / 10),
  oldMedianMs: Math.round(median(oldTimes) * 10) / 10,
  newMedianMs: Math.round(median(newTimes) * 10) / 10,
};
result.speedup = Math.round((result.oldMedianMs / result.newMedianMs) * 100) / 100;

console.log(`=== prCheck latency, median of 10, ${base.slice(0, 7)}..${head.slice(0, 7)} ===`);
console.log(`old (main, unconditional worktree add/remove per call): median ${result.oldMedianMs} ms  [${result.oldTimesMs.join(', ')}]`);
console.log(`new (T102, cached reused worktree):                     median ${result.newMedianMs} ms  [${result.newTimesMs.join(', ')}]`);
console.log(`speedup: ${result.speedup}x`);

writeFileSync(new URL('./latency-results.json', import.meta.url), JSON.stringify(result, null, 2));
