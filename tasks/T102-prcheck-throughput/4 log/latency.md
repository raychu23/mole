# Latency: median of 10, before vs after, same repo/revisions

Script: `latency.mjs`. Same machine, same repo, same `base..head` (`HEAD~12..HEAD`, a mid-size real range of this
repo that also triggers the rules-engine worktree, same as the profiling ranges above -- a realistic workload for
this repo, not a cherry-picked best case). One untimed warmup call first (JIT/module warmup only), then 10 timed
calls for each of OLD (main's unmodified dist) and NEW (this branch's dist).

```
=== prCheck latency, median of 10, c32478a..1565dee ===
old (main, unconditional worktree add/remove per call): median 3003.8 ms
  [2805.6, 3110.4, 2967.7, 3116.5, 2817.8, 3032.6, 3207.8, 2894.2, 3071.1, 2975.1]
new (T102, cached reused worktree):                     median 1911.5 ms
  [2094.2, 1628, 2158.4, 1872.1, 2399, 2676.3, 1867.2, 1950.9, 1594.8, 1484.2]
speedup: 1.57x
```

Full raw data: `latency-results.json`.

**Why 1.57x end-to-end, not the 4.5-10x this task's git-call reduction alone would suggest** (see
`profile-after.md`): this repo's own `prCheck` call spends roughly 1.4-1.7s of its ~2-3s wall time on work this
task never touched -- module imports (`@mole/questions`, `@mole/memory`, dependency-cruiser), `loadGraph`'s
markdown/YAML parsing, and the rules engine's real dependency-cruiser cruise of the checked-out tree. The git-call
and worktree-add/remove reduction this task made (profile-before.md -> profile-after.md) is real and large where
it applies (this package's OWN git subprocess time), but it is one part of the total call, stated honestly here
rather than implied as a global `prCheck` speedup.

**Per-call speedup for the server's job path (T99)**: this same 1.57x (median, worst case for a repo whose
decisions already have `rules:` items, which doubles the worktree cost) applies directly to T99's measured
<1 job/s throughput bottleneck, since `prCheck`'s own latency IS the per-job cost on that path. A repo with no
`rules:` items (most of them, per T99's own finding) pays only ONE worktree purpose instead of two, so the
proportional git-time saving (and therefore end-to-end speedup) is larger on those jobs -- not separately
measured here (would need a second repo fixture without `rules:` records), logged as a gap rather than invented.
Wiring `prCheckAsync` into the actual job queue (so this per-call speedup also translates into jobs/s under real
concurrency, via `MOLE_PRCHECK_CONCURRENCY`) is left to the T99 merge per this task's own instruction.
