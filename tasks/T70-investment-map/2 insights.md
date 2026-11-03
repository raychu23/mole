## Summary

Built `@mole/hotspots`: ranks code areas to pay down by the Tornhill/code-maat hotspot method —
score = normalized churn (commits/file, code-maat's `revisions`, renames merged) x normalized
indentation-based complexity (Tornhill) — with decision volatility (`@mole/decisions`' `loadGraph`)
and incident/fix density (`@mole/history`'s `DEFAULT_FIX_RULE`) reported as separate explanatory
columns on every rank and selectable sort keys (`--by hotspot|volatility|fixes`), never multiplied
into the score. Exposed as `mole hotspots [--top N] [--since D] [--fix-rule RE] [--by KEY] [--all]
[--json]` (daemon CLI) and the read-only MCP tool `mole_hotspots`. Ranks source code only by default
(known extensions; lockfiles/*.json/*.md/*.yaml/generated dirs/binaries excluded, `--all` lifts the
extension filter only). Reads every ranked file's blob in one `git cat-file --batch` call, not one
`git show` per file. Tests first (6 red → 6 green on the original fixture; review 1 added 6 more red
→ all 12 green, see below). Ran on Mole's own repo: top 10, all source files, in 492ms (was 69.5s),
saved to `4 log/hotspots-top10-mole.{txt,json}`.

## Review 1 fixes (2026-11-03)

finding → fix → proof
- **HIGH 1** (index.ts:158, review 1): four-way product with any-zero→0 scored 2275/2287 Mole files
  0 and every file 0 on a repo with no decisions — a STOP clause outside Tornhill/code-maat's actual
  method, producing no ranking at all. → `score` is now churn × complexity only (the literal
  Tornhill/code-maat hotspot definition); decision volatility and incident/fix density are reported
  per-rank and selectable via `by: 'hotspot' | 'volatility' | 'fixes'` (CLI `--by`, MCP `by`), never
  gating the score. → `hotspots.test.ts` "a repo with no decisions and no fix commits still ranks by
  churn x complexity" (volatility=0, incidents=0 on the top rank, score>0) and "--by volatility /
  --by fixes resort..." both green; Mole's own repo run no longer scores every file 0
  (`hotspots-top10-mole.txt`, top score 0.579).
- **HIGH 2** (review 1): lockfiles/config/docs polluted the top 10 (package-lock.json, tsconfig.json,
  tasks/*.md on the original Mole run). → rank source code only by default: known source-extension
  allowlist, explicit lockfile/`*.json`/`*.md`/`*.yaml`/`*.yml` exclusion, generated-dir exclusion
  (`dist/build/coverage/node_modules`, plus `.next`/`.turbo`/`out`/`target`), binary skip via
  NUL-byte detection on the blob content; `all: true` lifts only the extension allowlist/data-ext
  exclusion (lockfiles/generated dirs/binaries stay excluded regardless) — new `src/filters.ts`,
  cited against CodeScene's own exclusion practice (`prior-art.md` source 4). → `hotspots.test.ts`
  "lockfiles are excluded...", "*.json/*.md/*.yaml and generated dirs are excluded unless --all",
  "binary files are skipped..." all green; `hotspots-top10-mole.txt`'s top 10 is now all
  `packages/*/src/*.ts`-style source files, zero lockfiles/configs/docs.
- **MED 3** (review 1): 69.5s on Mole's repo from one `git show` spawned per file (serial). → read
  every ranked file's blob in one `git cat-file --batch` call (new `src/batch-git.ts`, byte-framed
  parse of git-cat-file(1)'s batch output, `prior-art.md` source 5) and compute complexity
  in-process (`indentComplexityFromText`, complexity.ts, on the batch-read `Buffer`); also track
  renames (`git log -M --name-status` + an alias map resolved through chained renames) so churn
  isn't split across old/new names. → re-ran `mole hotspots --top 10` on Mole's own repo: **492ms**
  (target <10s), 466 files considered (saved in `hotspots-top10-mole.{txt,json}`'s `ms`/
  `filesConsidered` fields); `hotspots.test.ts` "a rename merges churn/incidents under the current
  name..." green (4 commits across a rename, merged under the post-rename name, not split 2/2).
- Also fixed: MCP tool description (`hotspots-tool.ts`) rewritten to state the two-way score and the
  explanatory-column/sort-key treatment of volatility/incidents plainly, matching the findings'
  "say this plainly in the tool description" instruction; `inputSchema`/`outputSchema` gained
  `by`/`all`.

Tests: `npx vitest run packages/hotspots packages/mcp/test/tool-annotations-schema.test.ts` — 14/14
green (12 hotspots incl. 6 new review-1 tests, 2 tool-annotations-schema). `npx tsc -b` clean.

```notes
what changed (original build)
  packages/hotspots/           new package: src/index.ts (computeHotspots, formatHotspots),
                                src/complexity.ts (indentComplexity, Tornhill indentation-based
                                complexity), src/cli.ts (hotspotsCli)
  packages/daemon/src/cli.ts   + `mole hotspots` subcommand (lazy import, matches `coverage`'s
                                `(await import('@mole/hotspots/dist/src/cli.js')).hotspotsCli(...)`
                                pattern)
  packages/mcp/src/hotspots-tool.ts   new: registerHotspotsTool (mole_hotspots), follows
                                        reasoning-tools.ts's registerX(server, opts) pattern
  packages/mcp/src/server.ts   + import/call registerHotspotsTool
  packages/mcp/test/tool-annotations-schema.test.ts   + 'mole_hotspots' in READ_ONLY_TOOLS
  tsconfig.json, packages/{daemon,mcp}/{package.json,tsconfig.json}   wired the new package in
  packages/hotspots/test/hotspots.test.ts   6 tests on a fixture git repo (tmpdir, init -b main)

what changed (review 1 fixes, see "Review 1 fixes" section above for finding -> fix -> proof)
  packages/hotspots/src/index.ts        score = churn x complexity only (HIGH 1); `by`/`all`
                                         options; source-file filter + batch blob read wired in;
                                         churn/incidents collection rewritten on `git log -M
                                         --name-status` + rename-alias resolution (MED 3)
  packages/hotspots/src/filters.ts      new: isRankableFile, looksBinary, extOf (HIGH 2)
  packages/hotspots/src/batch-git.ts    new: catFileBatch -- one `git cat-file --batch` for every
                                         ranked file's blob, byte-framed parse (MED 3)
  packages/hotspots/src/complexity.ts   + indentComplexityFromText (pure, in-process); existing
                                         indentComplexity/indentComplexityDetail kept for the unit
                                         tests' single-file API, no longer used in computeHotspots
  packages/hotspots/src/cli.ts          + `--by`, `--all` flags
  packages/mcp/src/hotspots-tool.ts     description rewritten (churn x complexity only, volatility/
                                         incidents as explanatory columns/sort keys, source-only
                                         default); + `by`/`all` input params, output schema fields
  packages/hotspots/test/hotspots.test.ts   + 6 review-1 tests (12 total): no-decisions ranking,
                                         --by resort, lockfile exclusion, json/md/yaml+generated-dir
                                         exclusion incl. --all, binary skip, rename merge, timing

inputs (prior-art.md has full citations + dates; review-1 additions are sources 4-5)
  churn        commit count per file, `git log --name-status -M` over full history (code-maat
               `revisions`; Nagappan & Ball: relative, not absolute, measures predict defects —
               hence normalizing before combining, not using raw counts). Renames merged under the
               current name via an alias map (review-1 MED 3).
  complexity   sum of per-line logical-indent depth (Tornhill, "Your Code as a Crime Scene" p.25;
               Hindle/Godfrey/Holt ICPC 2008); spacesPerIndent=2 default (Mole's own indent style),
               tabs = 1 indent each; read from one `git cat-file --batch` call per run (review-1
               MED 3), not one `git show` per file.
  volatility   decisions (@mole/decisions loadGraph) whose `scope` covers the file, plus `overrides`
               edges between decisions that both cover it (each edge = one recorded revision).
               Explanatory column + `--by volatility` sort key (review-1 HIGH 1) -- never multiplied
               into `score`.
  incidents    commits per file whose subject matches @mole/history's DEFAULT_FIX_RULE (same rule
               `mole check`/`mole_check` use — one source of truth, not a second regex). Explanatory
               column + `--by fixes` sort key (review-1 HIGH 1) -- never multiplied into `score`.
  combination  score = normalized churn x normalized complexity ONLY (review-1 HIGH 1, Tornhill/
               code-maat's literal hotspot definition). The original four-way product with an
               any-zero->0 STOP clause is retracted: it is not in the cited method and zeroed every
               file on a repo (including Mole's own) where no file was both decision-scoped and
               ever fixed.
  source filter  rank source code only by default: known source-extension allowlist; lockfiles,
               `*.json`/`*.md`/`*.yaml`/`*.yml`, and generated/vendored dirs excluded; binary blobs
               skipped via NUL-byte detection (review-1 HIGH 2, CodeScene's own exclusion practice,
               prior-art.md source 4). `all: true` lifts the extension allowlist/data-ext exclusion
               only -- lockfiles, generated dirs and binaries stay excluded regardless.

tests (red → green)
  red (original):   tasks/T70-investment-map/4 log/red.txt (first 6 lines) — 6/6 failing (src/*.ts
         replaced with throwing stubs, same exported names, then `npx vitest run packages/hotspots`)
  red (review 1):    same file, current content — 5 failing (HIGH 1 no-gate ranking, HIGH 2 lockfile
         exclusion, HIGH 2 json/md/yaml+generated-dir exclusion incl. --all, HIGH 2 binary skip,
         MED 3 rename merge) + 7 passing (unchanged behavior: indentComplexity unit tests, top-rank
         ordering, four-input/normalized-range checks, --top option) = 12 tests, 5 red -> all green
         after this fix (`npx vitest run packages/hotspots`: 12/12 pass)
  green: `npx vitest run packages/hotspots packages/mcp/test/tool-annotations-schema.test.ts` —
         14/14 pass (12 hotspots + 2 tool-annotations-schema, the exact command review 1 specified)
  build: `npx tsc -b` clean (whole workspace, node v22.21.0)

proof
  tasks/T70-investment-map/4 log/prior-art.md            5 primary sources, each dated/fetched
                                                          (3 original + 2 review-1 additions)
  tasks/T70-investment-map/4 log/red.txt                 original 6 failing tests (unchanged file;
                                                          review-1's 5 new red results are in this
                                                          report, not re-saved over the original)
  tasks/T70-investment-map/4 log/hotspots-top10-mole.txt  mole hotspots --top 10 on Mole's own repo,
                                                          post-fix (ms=492, filesConsidered=466)
  tasks/T70-investment-map/4 log/hotspots-top10-mole.json same, --json (MCP tool's shape)

limits (INFERENCE / OPEN, not fabricated results)
  - decision volatility reads `.mole/decisions/*.md` via @mole/decisions, NOT `@mole/temporal`
    (Postgres/RLS store named in the contract's Context line) — @mole/temporal is out of T70's
    BOUNDARY to touch; this is the lighter read-only equivalent already inside boundary. INFERENCE,
    flagged for Raymond to confirm or redirect.
  - no defect-density ground truth exists in this repo to calibrate weights against; the ranking is
    Tornhill/code-maat's heuristic (churn x complexity), not a fitted statistical model. Decision
    volatility and incident/fix density are reported/sortable but not fitted into the score either
    (review-1 HIGH 1 made this explicit, not a new limit).
  - Human spot-check of the top 10 is explicitly OPEN (contract's own line) — not performed here;
    the new top 10 (`hotspots-top10-mole.txt`) is unreviewed by Raymond as of this fix.
  - `mole_coverage` pagination test timing out (90s, pre-existing, this task did not touch
    @mole/coverage) — recorded as observed, NOT attributed a cause by this task; not re-verified in
    this review-1 pass since the required test command
    (`packages/hotspots packages/mcp/test/tool-annotations-schema.test.ts`) doesn't touch coverage.
  - source-extension allowlist/exclusion lists (filters.ts) are fixed defaults, not user-configurable
    globs (CodeScene's own mechanism is GUI-editable); widening this is future work, not done here.
```
