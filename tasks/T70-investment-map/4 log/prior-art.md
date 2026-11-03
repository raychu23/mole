# T70 prior art — hotspots (churn × complexity × decision volatility × incident/fix density)

Fetched 2026-11-03.

## 1. Adam Tornhill, "Your Code as a Crime Scene" (Pragmatic Bookshelf; PDF mirror
   http://www.r-5.org/files/books/computers/dev-teams/trenches/Adam_Tornhill-Your_Code_as_a_Crime_Scene-EN.pdf,
   ch. "Calculate Code Complexity With a Forensic Psychology Approach" / "Learn About the Negative Space in Code", p.25+)
   and the code-maat tool he wrote to compute it (https://github.com/adamtornhill/code-maat, README
   "Code churn measures" + "Complexity Trend", fetched 2026-11-03).
   - **Hotspot = frequency-of-change (revisions/churn) × complexity.** Code-maat's own `-a abs-churn`/
     `-a revisions` gives per-file commit counts; combined with a complexity proxy this is literally the
     "hotspot" scatter Tornhill popularized (high churn + high complexity = pay down first; high churn +
     low complexity is fine, low churn + high complexity can wait).
   - **Complexity proxy: indentation-based ("whitespace") complexity**, *not* a per-language AST parse.
     Tornhill, ch. cited above: "We'll use indentation as a proxy for complexity... count the leading
     tabs and whitespaces to convert them into logical indentations." He cites Hindle, Godfrey, Holt,
     "Reading Beside the Lines: Indentation as a Proxy for Complexity Metric" (ICPC 2008) for the
     correlation with McCabe cyclomatic / Halstead complexity. Tornhill's own standalone tool
     (https://github.com/adamtornhill/indent-complexity-proxy, fetched 2026-11-03) takes
     `--spaces 4 --tabs 1` (spaces-per-logical-indent) and reports `{total, n, mean, median, sd, max}`
     per file — "total" (sum of per-line logical-indent depth) is the complexity number code-maat's
     hotspot analysis plots against churn.
     **Borrowed:** this exact metric — per line, logical-indent depth = floor(leading-whitespace-width /
     spacesPerIndent) with tabs counted as 1 indent each; file complexity = sum over non-blank lines.
     Default `spacesPerIndent = 2` (Mole's own `.editorconfig`/prettier config in this repo use 2-space
     indent; Tornhill's own default is 4 — made configurable, not hardcoded, since it's corpus-dependent).
     **What doesn't fit:** Tornhill tracks complexity *trend* across revisions (is a hotspot getting
     worse); T70's DONE-WHEN only asks for a point-in-time top-10 ranking, so trend-over-time is out of
     scope (recorded as a decision below, not silently dropped).
   - A cyclomatic-complexity-via-TypeScript-AST alternative was considered (the task names it as an
     option) and rejected for this corpus: Mole's repo and the fixture repo below are not pure
     TypeScript (markdown, JSON, SQL), a per-file AST walk needs a different parser per language, and
     Tornhill's own point is that indentation is the one proxy that is language-independent and does
     not require a working parse (useful on partial/incomplete code too). TypeScript already lives in
     `packages/indexer/src/ts-engine.ts` for *symbol* indexing, not complexity, so reusing it here would
     be a second, narrower implementation rather than one source of truth.

## 2. Adam Tornhill / code-maat README, "Code churn measures" section
   (https://github.com/adamtornhill/code-maat, fetched 2026-11-03) and `-a revisions`/`-a entity-churn`.
   - **Churn = number of commits that touched a file** (code-maat's `revisions` analysis), optionally
     added/deleted LOC per author (`entity-churn`). Mole already has every commit's file list via git
     plumbing (`@mole/history`'s `git()` helper, read-only `git log`/`git diff`), so T70 reuses that
     helper rather than re-shelling to git — one source of truth for "how do we call git safely" (no
     optional locks, no index writes), per AGENTS.md.
     **Borrowed:** commit-count-per-file as the churn signal (code-maat's `revisions`), computed with
     `git log --name-only --format=%H` over the full history (configurable `--since`), not restricted to
     one author or branch.
     **What doesn't fit:** code-maat's `entity-churn` (added/deleted LOC) needs `--numstat`, a second git
     call per analysis; T70 keeps to commit-count only (code-maat's simpler `revisions` analysis) to match
     the DONE-WHEN's four named inputs without inventing a fifth metric.

## 3. Nagappan & Ball, "Use of Relative Code Churn Measures to Predict System Defect Density"
   (ICSE 2005; Microsoft Research PDF
   https://microsoft.com/en-us/research/wp-content/uploads/2016/02/icse05churn.pdf, fetched 2026-11-03).
   - Core finding (abstract + §"Research Hypotheses"): **absolute churn is a poor predictor of defect
     density; *relative* churn measures are.** Their M3 ("files churned / file count") and M4 ("churn
     count / files churned") normalize churn against the size of the change population rather than using
     raw commit counts across files of very different git ages/sizes.
     **Borrowed:** normalize each raw input (churn, complexity, decision-volatility, incident count)
     across the files being ranked (min-max to [0,1]) before combining them — an un-normalized product
     of four raw counts is dominated by whichever metric happens to have the largest scale, which is
     exactly the "absolute measure is a poor predictor" failure Nagappan & Ball found. This is the
     relative-measure principle, not their specific regression model (M1–M8 need defect-density ground
     truth to fit coefficients against; Mole has no defect-density labels to regress on, so T70 does not
     claim statistical calibration — it is a ranking heuristic, not a predictive model).
     **What doesn't fit:** Nagappan & Ball's M1/M2 (churned LOC / total LOC) need LOC-level diff stats;
     T70 stays with code-maat's simpler commit-count churn (source 2) and borrows only the
     *normalize-before-combining* principle from this paper.

## Mole-internal sources read (not external prior art, but inputs this task must wire together per the
   contract's own Context — reusing them is the "one source of truth" AGENTS.md rule, not fabrication):
   - `packages/history/src/git.ts` + `src/index.ts` (T12): read-only git plumbing (`git()` helper) and
     `DEFAULT_FIX_RULE = /^(fix|revert)\b|regression|review fixes/i` — the existing definition of "this
     commit is a fix" in this repo. **Borrowed as-is** for incident/fix density (DONE-WHEN input 4):
     count commits per file whose subject matches this same regex, so `mole hotspots`'s fix definition
     never disagrees with `mole check`'s.
   - `packages/decisions/src/graph.ts` `loadGraph(root)`: parses `.mole/decisions/*.md` into
     `GraphNode[]` (each decision has `scope: Anchor[]`, i.e. which files/symbols it governs) and
     `GraphEdge[]` with `type: 'overrides'` edges (from `overrides`/`overridden_by` frontmatter) — this
     *is* "decision revisions" in Mole's own data model (a decision superseded by another is a revision
     of the team's stance on that code). **Borrowed as-is**: decision-volatility(file) = count of decision
     nodes whose scope touches file, plus count of `overrides` edges among those decisions (each edge is
     one recorded revision). This avoids depending on `@mole/temporal`'s Postgres-backed bitemporal store
     (D68/T38) for this task: `.mole/decisions/*.md` + git history of those files is the lighter-weight,
     already-git-tracked record of decision revisions, and temporal's RLS/org_id machinery is out of
     T70's BOUNDARY (`packages/history` or new `packages/hotspots`, daemon cli, mcp tool, tests — not
     `packages/temporal`). Recorded as an OPEN/INFERENCE decision below.

## Decisions taken (reversible defaults, with the evidence above)
- **Complexity = indentation-based (Tornhill, source 1), spacesPerIndent=2 default, configurable.**
  Evidence: source 1. Reversible: swap for a TS-AST cyclomatic walker later without changing the
  `HotspotInput` shape (`complexity: number` stays a per-file scalar either way).
- **Churn = commit count per file, full history by default, `--since` optional** (code-maat `revisions`,
  source 2), computed via `@mole/history`'s existing `git()` helper (one source of truth for git calls).
- **Decision volatility = decisions touching the file (scope) + `overrides` edges among them**, read via
  `@mole/decisions`' existing `loadGraph`, NOT `@mole/temporal`. INFERENCE: the contract's Context line
  says "temporal revisions" naming `packages/temporal`, but that package is Postgres-backed (RLS,
  org_id) and out of T70's boundary to touch; `.mole/decisions/*.md` + code-maat-style git log on those
  files is the lighter, already-read-only equivalent inside boundary. Flagged OPEN for Raymond to
  confirm or redirect to `@mole/temporal` in a follow-up task.
- **Incident/fix density = fix-commit count per file**, using `@mole/history`'s existing
  `DEFAULT_FIX_RULE`/`isFix`-equivalent regex (source: `packages/history/src/index.ts`), not a second
  regex.
- **Combination = product of four independently min-max-normalized [0,1] scores** (Nagappan & Ball's
  relative-measure principle, source 3), not a weighted sum — the contract literally writes "churn ×
  complexity hotspots × decision volatility × incident/fix density" with multiplication signs.
  INFERENCE/OPEN: this is a ranking heuristic (no regression against real defect labels, since Mole has
  none) — Raymond's human spot-check of the top 10 (contract's own line) is the actual validation, not a
  statistical claim this task makes.
- **Human spot-check of the top 10 stays OPEN** per the contract ("Human spot-check of the top 10 is
  Raymond's, record as OPEN") — not performed by this task.
