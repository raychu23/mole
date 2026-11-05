// Profile ONE prCheck() call: reads pr-check.ts's own instrumented profileCalls[] (populated when
// MOLE_PRCHECK_PROFILE=1), printing time-per-git-subcommand and the worktree add/remove share.
import { performance } from 'node:perf_hooks';

process.env.MOLE_PRCHECK_PROFILE = '1';
const mod = await import('../../../packages/decisions/dist/src/check/pr-check.js');
const { prCheck, profileCalls } = mod;

const root = process.argv[2] || process.cwd();
const head = process.argv[3] || 'HEAD';
const base = process.argv[4] || 'HEAD~15';

const t0 = performance.now();
const result = await prCheck({ root, base, head, history: true });
const totalMs = performance.now() - t0;

function subcommand(parts) {
  let i = 0;
  while (i < parts.length) {
    if (parts[i] === '-C') { i += 2; continue; }
    if (parts[i] === '-c') { i += 2; continue; }
    break;
  }
  const sub = parts[i] ?? '?';
  const sub2 = parts[i + 1] ?? '';
  if (sub === 'worktree') return `worktree ${sub2}`;
  return sub;
}

const byKind = new Map();
for (const c of profileCalls) {
  const kind = subcommand(c.args);
  const e = byKind.get(kind) ?? { count: 0, ms: 0 };
  e.count++;
  e.ms += c.ms;
  byKind.set(kind, e);
}

console.log(`=== prCheck profile: ${root} ${base}..${head} ===`);
console.log(`total wall time: ${totalMs.toFixed(1)} ms`);
console.log(`total git subprocess calls: ${profileCalls.length}, total git time: ${profileCalls.reduce((s, c) => s + c.ms, 0).toFixed(1)} ms`);
console.log('\nby subcommand (count, total ms, avg ms):');
for (const [kind, e] of [...byKind.entries()].sort((a, b) => b[1].ms - a[1].ms)) {
  console.log(`  ${kind.padEnd(20)} ${String(e.count).padStart(4)}  ${e.ms.toFixed(1).padStart(8)} ms  avg ${(e.ms / e.count).toFixed(2)} ms`);
}
const worktreeMs = [...byKind.entries()].filter(([k]) => k.startsWith('worktree')).reduce((s, [, e]) => s + e.ms, 0);
console.log(`\nworktree add+remove share of total git time: ${((worktreeMs / profileCalls.reduce((s, c) => s + c.ms, 0)) * 100).toFixed(1)}%`);
console.log(`result: ${result.files.length} files, ${result.governed.length} governed, silent=${result.silent}, reported ms=${result.ms}`);

import { writeFileSync } from 'node:fs';
writeFileSync(new URL('./profile-before-raw.json', import.meta.url), JSON.stringify({ root, base, head, totalMs, calls: profileCalls, byKind: Object.fromEntries(byKind) }, null, 2));
