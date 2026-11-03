# T77 insights — `mole coupling` (logical coupling × CODEOWNERS teams)

## Summary
- New `@mole/coupling` package: `computeCoupling(root, opts)` implements code-maat's `coupling`
  analysis (degree = 100 × sharedRevs / ceil(average(revsA, revsB)), defaults min-revs=5,
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
- Real run: cloned `backstage/backstage` (shallow-since 2025-05-03, 12034 commits, full blobs — a
  `--filter=blob:none` partial clone made `-M` rename detection lazily fetch blobs over the network
  and the log parse did not finish in 120s; redone as a normal shallow-since clone instead, 1.2s to
  parse the log). `mole coupling --top 20 --json`: 1447ms, 1061 files considered, `.github/CODEOWNERS`
  found, top 20 pairs are ALL cross-team with real owner teams (`@backstage/framework-maintainers` vs
  `@backstage/maintainers`/`@backstage/tooling-maintainers` etc.) — saved to `4 log/backstage-top20.txt`
  (readable) and `.json` (raw).
- Touched packages' tests: 536 passed (53 files) across `packages/{coupling,hotspots,mcp,daemon,
  decisions}`; `npx tsc -b` (full repo) clean.

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
- NOT RUN: a fixture/real-repo exercise of `maxChangesetSize` actually dropping a huge commit (the
  backstage run's top pairs never happened to include one) — the logic is covered structurally (code
  reads the same `good` filter hotspots' review-1 MED 3 already tests for rename merging) but has no
  dedicated unit test isolating "a 40-file commit is excluded." Would need a fixture commit touching
  >30 rankable files; left for a follow-up if Raymond wants it pinned down.
- The backstage clone lives under `/Users/a1/.hermes/cache/scratch/backstage-clone` (393M .git) — a
  probe, not committed, per AGENTS.md scratch-dir rule.
