// T102 after-profile: same methodology as profile-before.mjs, but against the fixed (cached-worktree) pr-check.ts,
// run twice in a row to show the cache-cold vs cache-warm git-time split.
import { performance } from 'node:perf_hooks';

process.env.MOLE_PRCHECK_PROFILE = '1';
const mod = await import('../../../packages/decisions/dist/src/check/pr-check.js');
const wtMod = await import('../../../packages/decisions/dist/src/check/worktree-cache.js');
const { prCheck } = mod;
function getAllCalls() { return [...mod.profileCalls, ...wtMod.profileCalls]; }
function clearProfiles() { mod.profileCalls.length = 0; wtMod.profileCalls.length = 0; }

const root = process.argv[2] || process.cwd();
const head = process.argv[3] || 'HEAD';
const base = process.argv[4] || 'HEAD~15';

function subcommand(parts) {
  let i = 0;
  while (i < parts.length) {
    if (parts[i] === '-C') { i += 2; continue; }
    if (parts[i] === '-c') { i += 2; continue; }
    break;
  }
  const sub = parts[i] ?? '?';
  const sub2 = parts[i + 1] ?? '';
  if (sub === 'worktree' || sub === 'checkout' || sub === 'clean') return `${sub} ${sub2}`.trim();
  return sub;
}

async function runOnce(label) {
  clearProfiles();
  const t0 = performance.now();
  const result = await prCheck({ root, base, head, history: true });
  const totalMs = performance.now() - t0;
  const profileCalls = getAllCalls();
  const byKind = new Map();
  for (const c of profileCalls) {
    const kind = subcommand(c.args);
    const e = byKind.get(kind) ?? { count: 0, ms: 0 };
    e.count++;
    e.ms += c.ms;
    byKind.set(kind, e);
  }
  console.log(`=== ${label}: ${root} ${base}..${head} ===`);
  console.log(`total wall time: ${totalMs.toFixed(1)} ms`);
  const gitMs = profileCalls.reduce((s, c) => s + c.ms, 0);
  console.log(`total git subprocess calls: ${profileCalls.length}, total git time: ${gitMs.toFixed(1)} ms`);
  for (const [kind, e] of [...byKind.entries()].sort((a, b) => b[1].ms - a[1].ms)) {
    console.log(`  ${kind.padEnd(20)} ${String(e.count).padStart(4)}  ${e.ms.toFixed(1).padStart(8)} ms  avg ${(e.ms / e.count).toFixed(2)} ms`);
  }
  console.log(`result: ${result.files.length} files, ${result.governed.length} governed, silent=${result.silent}\n`);
  return { totalMs, gitMs, byKind: Object.fromEntries(byKind) };
}

const cold = await runOnce('AFTER (cache cold: first call for this repo in this process)');
const warm = await runOnce('AFTER (cache warm: second call, same repo)');

import { writeFileSync } from 'node:fs';
writeFileSync(new URL('./profile-after-raw.json', import.meta.url), JSON.stringify({ root, base, head, cold, warm }, null, 2));
