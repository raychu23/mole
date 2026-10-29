written: 2026-10-28T21:19:09-0500 (T12 red commit; keys/fixtures copied unchanged from the main checkout's context/product-plan/systems/)

# T12 bench: M2 / B2 / B3 / M5 for `mole check`

Run: `npm run check && node packages/history/dist/bench/m2.js` (exit 0 only when every target is met).
Excalidraw clone: `~/.hermes/cache/scratch/impact/excalidraw` (override `MOLE_BENCH_EXCALIDRAW`); read-only, the bench only uses sha and diff-file modes there (git diff/blame/show/log/ls-tree, nothing written).

Files (copied unchanged, sha1):
- keys/m8-key.json (B1) 40c0c01dd0bd905d1755cbbf992c6b7bb3559dd2
- keys/past-fix-overlap.json (B2) 1d4b843420793e3d3e7630347126dc558525771e
- fixtures/planted-m8.diff (B3) 2660b4943e4e9a8461311634f6dab8c4eccc7f1a

## Scoring decisions
- M2, the key's rule per listed fix: 1 = the output names the fix (a PastFix whose sha shares a prefix with the key's fix sha, shown as short sha, or the same subject) AND gives a clickable source (source.sha = that fix, a file and an integer line > 0); 0.5 = only one of the two; 0 = the fix is absent.
- M2 strict (the target): a case scores the MIN over the fixes the key lists (R4 has 2, R5 has 3: all must be found). Target R1-R5 sum >= 4, R6 = 1.
- M2 lenient (reported, not a target): the MAX over the case's fixes.
- Line match (diagnostic, not scored): whether the source or base-side lines hit a key line; the key's line numbers are not stated as fix-side or base-side, so both are accepted.
- Fix rule per repo = past-fix-overlap.json summary fixRule (excalidraw `^(fix|revert)\b|regression`, mole `review fixes|^fix\b`), compiled case-insensitive.
- R6 = the planted diff applied as `--diff` against base bdeff14 in this repo (no checkout).
- B3 (all must hold): names 9e19c51; reason contains 'editing counts as use' and matches /never idle|running index/; a task reason source under tasks/T9-*; tests include packages/daemon/test/daemon.test.ts with the name 'idle shutdown (T9)'; source = packages/daemon/src/server.ts line 211-217.
- B2 recall: every row with a non-empty fixCommitsStrict must get >= 1 past fix (denominator excludes rows with none or no fixCommitsStrict field); the share of the listed fix shas found is reported as a diagnostic.
- M5: wall time of each `check()` call over all benchmark changes (B1 6 + B2 47 rows, including rows with no fixes), cold per call (no cache shared between calls); p95 = nearest-rank. Target < 2000 ms. Model calls = the package's `modelCalls.count`, must be 0.
- C contract: done-when 1 and 6 behaviors in temp git repos and through the CLI (`node packages/daemon/dist/cli.js check ...`), because the vitest file could not be created in this run (see tasks/T12-l2-why-and-past-fixes/2 insights.md).
