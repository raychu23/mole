# T77 prior art — logical coupling (git co-change) × CODEOWNERS teams

Fetched 2026-11-03.

## 1. adamtornhill/code-maat, README "Options" table + "Mining logical coupling"
   (https://github.com/adamtornhill/code-maat, fetched 2026-11-03).
   - Full options table (`-a coupling`): `-n/--min-revs 5` ("Minimum number of revisions to include
     an entity in the analysis"), `-m/--min-shared-revs 5` ("Minimum number of shared revisions to
     include an entity in the analysis"), `-i/--min-coupling 30` / `-x/--max-coupling 100` ("degree of
     coupling in percentage"), `-s/--max-changeset-size 30` ("Maximum number of modules in a change
     set if it shall be included in a coupling analysis"). CSV output columns: `entity, coupled,
     degree, average-revs`.
     **Borrowed as-is:** these five numeric defaults (min-revs=5, min-shared-revs=5, min-coupling=30,
     max-coupling=100, max-changeset-size=30) as `computeCoupling`'s own option defaults, named the
     same way code-maat does, so a reader who knows code-maat recognizes the knobs immediately.
     **What doesn't fit:** code-maat's `-g/--group` (layer aggregation), `-t/--temporal-period`
     (same-day squashing) and SVN/hg/p4/tfs VCS adapters are out of T77's boundary (git only, no
     layer grouping asked for in the done-when).

## 2. adamtornhill/code-maat, `src/code_maat/analysis/logical_coupling.clj` and
   `src/code_maat/analysis/coupling_algos.clj` at `master`
   (https://github.com/adamtornhill/code-maat/blob/master/src/code_maat/analysis/logical_coupling.clj
   and .../coupling_algos.clj, fetched 2026-11-03, review-1 refetch replacing the v1.0.1-tag
   paraphrase below) + Tornhill, "Your Code as a Crime Scene" ch. "Measure Temporal Coupling"
   (PDF mirror media.pragprog.com/titles/atcrime/decay.pdf, fetched 2026-11-03).
   - `logical_coupling.clj`'s `as-logical-coupling-measure` (exact, quoted):
     ```clojure
     (let [co-changing (c/co-changing-by-revision ds options)
           module-revs (c/module-by-revs co-changing)
           coupling (c/coupling-frequencies co-changing)]
       (for [[[first-entity second-entity] shared-revs] coupling
             :let [first-entity-revisions (module-revs first-entity)
                   second-entity-revisions (module-revs second-entity)
                   average-revs (m/average first-entity-revisions
                                           second-entity-revisions)
                   coupling (m/as-percentage (/ shared-revs average-revs))]
             :when (within-threshold-fn? average-revs shared-revs coupling)]
         {:entity first-entity
          :coupled second-entity
          :degree (int coupling)
          :average-revs  (math/ceil average-revs)
          ...}))
     ```
     `average-revs` (the local, raw value `degree`/the threshold check are computed from) is NEVER
     ceiled; `(math/ceil average-revs)` happens ONLY when assembling the emitted `:average-revs`
     column. `:degree` is `(int coupling)` — Clojure's `int` truncates toward zero — applied to
     `coupling`, the RAW (not ceiled-average, not truncated) percentage.
   - `coupling_algos.clj`'s `within-threshold?` (exact, quoted):
     ```clojure
     (defn within-threshold?
       [{:keys [min-revs min-shared-revs min-coupling max-coupling]}
        revs shared-revs coupling]
       {:pre [(and min-revs min-shared-revs min-coupling max-coupling)]}
       (and
        (>= revs min-revs)
        (>= shared-revs min-shared-revs)
        (>= coupling min-coupling)
        (<= (math/floor coupling) max-coupling)))
     ```
     Called as `(within-threshold-fn? average-revs shared-revs coupling)` — the `revs` parameter
     bound to `within-threshold?` is `average-revs`, the PAIR's (raw) average, not either entity's
     individual revision count. So `min-revs` is checked ONLY after pairing, against the pair's own
     average — a file whose own revision count is below `min-revs` can still appear in a kept pair
     if its partner has enough revisions to pull the pair average up. `max-coupling` is checked
     against `(math/floor coupling)` (floored), while `min-coupling` is checked against the raw,
     un-floored `coupling` — the two bounds are NOT symmetric.
   - `coupling_algos.clj`'s `module-by-revs`/`co-changing-by-revision`/`coupling-frequencies`: every
     entity appearing in a (changeset-size-filtered) revision is paired with every other entity in
     that same revision and counted toward `module-revs` — there is no separate per-file `min-revs`
     pre-filter stage before pairing; `min-revs` is purely a post-pairing filter (see above).
   - Book, same chapter: "average-revs: ... a weighted number of total revisions for the involved
     modules. The idea here is that we can filter out modules with too few revisions to avoid bias,"
     and the `max-changeset-size` cap exists because a single huge commit (e.g. a repo-wide
     reformat) touching hundreds of files would otherwise manufacture spurious coupling between every
     pair of files it touches — confirmed independently by a from-scratch reimplementation's own
     comments (rust crate `codelore-lib`'s `coupling.rs`, docs.rs/crate/codelore-lib, fetched
     2026-11-03: "`max_changeset_size` — `good_commits` filter" applied *before* building the
     per-file revision counts or the pairwise shared-commit counts, i.e. an oversized commit is
     dropped from both inputs, not just from the pairing step).
     **Borrowed (review-1 correction — the original prior-art entry below got this wrong):**
     `degreeExact = 100 * sharedRevs / average(revsA, revsB)` (RAW average, not ceiled);
     `degree = Math.trunc(degreeExact)` (code-maat's `(int coupling)`); `averageRevs` (the emitted
     column) `= Math.ceil(average(revsA, revsB))`, computed separately from — and never fed back
     into — `degree`/`degreeExact`. `minRevs` is checked against the pair's raw `average(revsA,
     revsB)` AFTER pairing (no per-file pre-filter before forming pairs). `minCoupling` is checked
     against raw `degreeExact`; `maxCoupling` is checked against `Math.floor(degreeExact)`. A
     commit whose changeset size (file count, after Mole's own source-file filter — see source 4)
     exceeds `maxChangesetSize` is dropped before counting revisions or pairs, not only before
     pairing (this part of the original entry was already correct).
     **Original (pre-review-1) reading, WRONG — kept here so the mistake is visible:** "degree = 100
     * sharedRevs / averageRevs; averageRevs = ceil((revsA + revsB) / 2)" — conflated the emitted,
     ceiled `average-revs` COLUMN with the raw average `degree` is actually divided by. Caught by
     review-1 HIGH (test: revsA=17 revsB=24 shared=12 -> code-maat gives 58 (58.54% raw, truncated),
     the old code gave 57 (100*12/ceil(20.5)=57.14, rounded)) and by a second HIGH on `max-coupling`
     comparing against raw `degree` instead of `floor(degree)`, plus a MED on `min-revs` filtering
     per-file before pairing instead of the pair's average-revs after pairing.
     **What doesn't fit:** code-maat computes `revs` per entity over the *entire* log (code-maat has
     no source/lockfile-extension filter of its own); T77 applies Mole's existing `isRankableFile`
     filter first (source 4), so `revs`/`sharedRevs` here are revisions among rankable files only —
     an INFERENCE recorded in insights.md, not a code-maat behaviour.


## 3. GitHub Docs, "About code owners" ("CODEOWNERS syntax" section)
   (https://docs.github.com/repositories/managing-your-repositorys-settings-and-features/
   customizing-your-repository/about-code-owners, fetched 2026-11-03).
   - "A CODEOWNERS file uses a pattern that follows most of the same rules used in gitignore files"
     (minus `!`, `[ ]`, and `\#`-escaping, which don't work in CODEOWNERS). "Order is important; the
     last matching pattern takes the most precedence." "If you want to match two or more code owners
     with the same pattern, all the code owners must be on the same line." A matching pattern with no
     owners after it leaves the path unowned. The file is looked up at `.github/CODEOWNERS`, the repo
     root, or `docs/CODEOWNERS` (first found wins).
     **Borrowed as-is, via `@mole/decisions`' existing `parseCodeowners`/`codeownersAt`
     (`packages/decisions/src/check/codeowners.ts`, built for T-prior pr-check work): gitignore-style
     globs, last-matching-line-wins, the three standard lookup locations.** T77 does not re-implement
     CODEOWNERS parsing — it imports the existing parser (one source of truth per AGENTS.md), reading
     the CODEOWNERS file at `HEAD` (T77 computes a whole-repo view, not a per-PR one, so there is no
     base-branch rev to resolve against the way `pr-check` does).

## 4. Reused, not independently fetched prior art (Mole-internal "one source of truth"):
   - `packages/hotspots/src/filters.ts` (`isRankableFile`, T70, itself citing CodeScene's "Exclude
     Files from an Analysis" + code-maat's own numstat-based churn): T77's "source-file filters"
     requirement — a file counted toward coupling must pass this same source-extension allowlist
     (lockfiles/generated dirs/`*.json`/`*.md`/`*.yaml` excluded by default, `all: true` lifts the
     extension allowlist only, same as `mole hotspots --all`).
   - `packages/hotspots/src/index.ts`'s `churnAndIncidents` (T70): the `git log --name-status -M`
     parse + rename-alias-chain resolution (a file renamed partway through history is counted once,
     under its current name). T77 factors the per-commit file-set walk this function already does
     into a new exported `walkCommits()` in the same package (refactor, not a second implementation —
     `churnAndIncidents` now calls it) so coupling's commit/file-set data comes from the exact same
     parse hotspots' churn does, per AGENTS.md "reuse ... instead of a second git parser."
   - `packages/decisions/src/graph.ts`'s `loadGraph` + `Anchor.scope` (T29/T70's `decisionVolatility`
     pattern): "decisions whose scope covers both files" reuses the same decision-graph read T70
     already does for per-file decision volatility, extended here to folder-prefix anchors (`src/`)
     the way `packages/decisions/src/check/pr-check.ts`'s own `parseAnchor`/`under` helpers do for
     file/folder/symbol anchors (not exported from that module, so T77's `decisionsCoveringPair`
     reimplements the same three-way file/folder/symbol split locally rather than importing an
     unexported internal — flagged here so it reads as a conscious choice, not an oversight).

## 5. Cataldo, Herbsleb & Carley, "Socio-Technical Congruence: A Framework for Assessing the Impact
   of Technical and Work Dependencies on Software Development Productivity" (ESEM 2008, ACM DL
   https://dl.acm.org/doi/10.1145/1414004.1414008, fetched 2026-11-03).
   - Core idea cited by the contract: socio-technical congruence is "the degree of matching between
     [a project's] coordination requirements [who technically needs to talk to whom, derived from
     dependencies between the pieces of code people are changing] and [its] actual coordination
     activities [who actually talks to whom]." Low congruence (a technical dependency crossing a team
     boundary nobody is coordinating across) predicts worse productivity/defects.
     **Borrowed as the framing, not a computed metric:** T77 does not compute Cataldo's full
     congruence score (that needs an explicit communication-network dataset Mole doesn't have — e.g.
     chat/email logs). What it borrows is the *diagnostic shape*: a technical coupling (code-maat's
     `coupling`, source 1-2) that crosses a CODEOWNERS team boundary (source 3) is exactly the
     "coordination requirement" Cataldo's framework flags as the one most likely to be under-matched
     by actual team communication, which is why `mole coupling` sorts cross-team pairs first instead
     of by raw degree alone. Recorded as a design choice (OPEN for Raymond to confirm the sort is
     the right default), not a literal reimplementation of the paper's metric.

## Decisions taken (reversible defaults, with the evidence above)
- **Coupling degree = truncated-int(100 × sharedRevs / RAW average(revsA, revsB))** (source 2,
  review-1 corrected), computed over commits whose changeset size (after the source-file filter,
  source 4) is ≤ `maxChangesetSize`. `averageRevs` (the separately-reported column) is
  `ceil(average(revsA, revsB))` and is NEVER what `degree` is divided by — the pre-review-1 version
  of this task conflated the two. `minRevs` is checked against the pair's raw average AFTER pairing
  (not per-file before pairing); `maxCoupling` is checked against `floor(degreeExact)`, not the raw
  percentage. `degreeExact` (the untruncated raw percentage) is kept on `CouplingPair` alongside the
  truncated `degree` for callers that want it. Defaults `minRevs=5`, `minSharedRevs=5`,
  `minCoupling=30`, `maxCoupling=100`, `maxChangesetSize=30` (source 1), all overridable via CLI
  flags / MCP tool params. Reversible: pure numeric thresholds, no code path depends on the exact
  values.
- **Commit/file-set walk reused from `@mole/hotspots`** (source 4) via a new exported `walkCommits`,
  refactoring `churnAndIncidents` to use it, instead of a second `git log` parser. Reversible: the
  refactor changes no observable behaviour of `computeHotspots` (T70's existing tests must still
  pass unchanged).
- **Owners read via `@mole/decisions`' existing `parseCodeowners`/`codeownersAt`** (source 3), at
  `HEAD` (whole-repo view, no PR base branch to resolve). Reversible: swap the rev later without
  changing `CouplingPair`'s shape.
- **Cross-team pairs sorted first, then by degree desc within each group** (source 5's framing).
  INFERENCE/OPEN: the contract says "surfacing cross-team pairs first" but does not specify whether
  that is a hard partition (this task's choice) or a separate `--cross-team-only` filter; the latter
  is NOT implemented (not asked for in done-when) — flagged OPEN for Raymond.
- **A pair is never returned without its evidence** (contract's STOP clause): every `CouplingPair`
  carries `sharedRevs` (≥ `minSharedRevs` ≥ 1 by construction), `sampleShas` (≥1, capped at 5),
  `ownersA`/`ownersB` (possibly empty arrays when no CODEOWNERS file exists or the pattern leaves the
  path unowned — an honest empty result, not a fabricated owner), and `decisions` (possibly empty,
  same honesty rule).
