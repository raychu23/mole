# T77 insights — `mole coupling` (logical coupling × CODEOWNERS teams)

## Summary
- New `@mole/coupling` package: `computeCoupling(root, opts)` implements code-maat's `coupling`
  analysis (degree = truncated-int(100 × sharedRevs / RAW average(revsA, revsB)) -- code-maat's own
  `(int coupling)`; the separately-reported `averageRevs` column is `ceil(average(revsA, revsB))`
  and is NOT what degree is divided by; `minRevs` is checked against the pair's raw average AFTER
  pairing, not per-file before; `maxCoupling` is checked against `floor(degreeExact)`, `minCoupling`
  against the raw percentage -- review-1 fix, see prior-art.md source 2), defaults min-revs=5,
  min-shared-revs=5, min-coupling=30%, max-coupling=100%, max-changeset-size=30), mapped onto
  CODEOWNERS teams via `@mole/decisions`' existing parser, cross-team pairs sorted first.
- `mole coupling [--top N] [--since D] [--min-revs N] [--min-shared-revs N] [--min-coupling PCT]
  [--max-coupling PCT] [--max-changeset-size N] [--all] [--json]` CLI + read-only `mole_coupling`
  MCP tool, both added to the daemon CLI / MCP server the same way `mole hotspots` was (T70).
- Refactored `@mole/hotspots`' `churnAndIncidents` to call a new exported `walkCommits()` (same
  `git log --name-status -M` parse + rename-alias chain, now one implementation for both churn and
  co-change); hotspots' own 12 tests still pass unchanged after the refactor.
- Every returned pair carries sharedRevs, up to 5 sample shas, both sides' owners (possibly empty,
  never fabricated) and decisions whose scope covers both files — the contract's STOP clause
  ("never show a pair without its evidence") is enforced structurally (the type always carries these
  fields) and tested directly.
- Real run (re-run 2026-11-03 after the review-1 fix, fresh shallow-since=2025-05-03 clone -- the
  scratch clone from the first run had been pruned): cloned `backstage/backstage` (12034 commits,
  full blobs, 1.2s log parse). `mole coupling --top 20 --since 2025-05-03 --json`: 2502ms, 4798 files
  considered, `.github/CODEOWNERS` found, top 20 pairs are ALL cross-team with real owner teams
  (`@backstage/framework-maintainers` vs `@backstage/maintainers`/`@backstage/tooling-maintainers`
  etc.) — saved to `4 log/backstage-top20.txt` (readable) and `.json` (raw). Top-ranked pair's degree
  under the fixed formula: 94% (shared=8, avg-revs=9, i.e. 100*8/8.5=94.1% truncated to 94 -- the
  pre-fix formula would have given 100*8/ceil(8.5)=100*8/9=88).
- Touched packages' tests: 57 passed (5 files) across `packages/{coupling,hotspots,mcp,daemon}`
  (`mole_coupling`'s own test file plus `tool-annotations-schema.test.ts`); `npx tsc -b` (full repo)
  clean.
- Review-1 fix (2026-11-03): 4 tests added (3 RED against the pre-fix code, 1 already GREEN --
  max-changeset-size had no dedicated test but its logic was already correct), see `4 log/red.txt`'s
  appended section and `coupling.test.ts`'s four new `describe` blocks.

## Notes / limits (INFERENCE labelled)
- INFERENCE: coupling counts revisions/shared-revs only among files passing `isRankableFile`
  (hotspots' source-extension filter), not every file in the log the way plain code-maat does.
  Reasoned in prior-art.md source 2's "what doesn't fit" — Mole's own source-file filter requirement
  takes precedence; a lockfile/config-churn commit no longer manufactures a coupling pair.
- INFERENCE: "cross-team pairs first" is implemented as a hard sort partition (every crossTeam=true
  pair before every crossTeam=false pair, by degree desc within each group), not a separate
  `--cross-team-only` filter — the contract's done-when does not ask for the latter. Flagged OPEN in
  prior-art.md for Raymond to confirm.
- INFERENCE: `decisionsCoveringPair`'s file/folder/symbol anchor matching is a small reimplementation
  of the same three-way split `packages/decisions/src/check/pr-check.ts`'s internal (unexported)
  `parseAnchor`/`under` already does, rather than an import — that helper isn't exported from
  `@mole/decisions`. Noted in prior-art.md source 4 so it reads as a conscious choice.
- NOT RUN: a fixture/real-repo exercise of `maxChangesetSize` actually dropping a huge commit --
  FIXED in review-1 (`coupling.test.ts`'s "max-changeset-size drops an oversized commit entirely"
  describe block): a fixture commit touching 31 rankable files (`g0.ts`..`g30.ts`, one over the
  default cap of 30) repeated 6 times is confirmed to manufacture zero pairs among those files.
- The backstage clone lives under `/Users/a1/.hermes/cache/scratch/backstage-clone` (393M .git) — a
  probe, not committed, per AGENTS.md scratch-dir rule.
