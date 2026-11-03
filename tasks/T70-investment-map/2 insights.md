## Summary

Built `@mole/hotspots`: ranks code areas to pay down by multiplying four normalized inputs —
churn (commits/file, code-maat's `revisions`), indentation-based complexity (Tornhill), decision
volatility (decisions scoping the file + `overrides` edges, from `@mole/decisions`' `loadGraph`),
and incident/fix density (fix-commit count, `@mole/history`'s `DEFAULT_FIX_RULE`). Exposed as
`mole hotspots [--top N] [--since D] [--fix-rule RE] [--json]` (daemon CLI) and the read-only MCP
tool `mole_hotspots`. Tests first (6 red → 6 green on a fixture repo). Ran on Mole's own repo:
top 10 with every rank's four raw+normalized inputs saved to `4 log/hotspots-top10-mole.{txt,json}`.
Open: decision volatility reads `.mole/decisions/*.md` + git, not `@mole/temporal` (INFERENCE, out
of boundary — see prior-art.md); normalize-then-multiply combination is a heuristic, not a fitted
model; Raymond's human spot-check of the top 10 is OPEN per the contract.

```notes
what changed
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

inputs (prior-art.md has full citations + dates)
  churn        commit count per file, `git log --name-only` over full history (code-maat
               `revisions`; Nagappan & Ball: relative, not absolute, measures predict defects —
               hence normalizing before combining, not using raw counts)
  complexity   sum of per-line logical-indent depth (Tornhill, "Your Code as a Crime Scene" p.25;
               Hindle/Godfrey/Holt ICPC 2008); spacesPerIndent=2 default (Mole's own indent style),
               tabs = 1 indent each; read from `git show HEAD:<file>`, not the working tree
  volatility   decisions (@mole/decisions loadGraph) whose `scope` covers the file, plus `overrides`
               edges between decisions that both cover it (each edge = one recorded revision)
  incidents    commits per file whose subject matches @mole/history's DEFAULT_FIX_RULE (same rule
               `mole check`/`mole_check` use — one source of truth, not a second regex)
  combination  product of four independently min-max-normalized [0,1] scores; contract's own
               wording uses "x" between the four inputs. Score = 0 if ANY input is 0 (STOP clause:
               a file never touched by a decision or a fix is not ranked, no matter how high its
               churn x complexity)

tests (red → green)
  red:   tasks/T70-investment-map/4 log/red.txt — 6/6 failing (src/*.ts replaced with throwing
         stubs, same exported names, then `npx vitest run packages/hotspots`)
  green: `npx vitest run packages/hotspots packages/mcp packages/daemon` — hotspots 6/6 pass;
         mcp/daemon full suites pass except 3 PRE-EXISTING failures unrelated to this task's
         boundary (mole_map stdio timing, mole_map maxNodes, mole_coverage pagination timeout —
         all pass individually in isolation except the coverage one, which times out even alone;
         none touch packages/hotspots, daemon's new `hotspots` branch, or hotspots-tool.ts; the
         repo's own vitest.config.ts documents this machine's load-driven flakiness). Re-ran
         `packages/mcp/test/mcp.test.ts` + `mole-map-max-nodes.test.ts` alone: both pass, confirming
         contention, not a regression from this change.
  build: `npx tsc -b` clean (whole workspace, node v22.21.0)

proof
  tasks/T70-investment-map/4 log/prior-art.md            3 primary sources, each dated/fetched
  tasks/T70-investment-map/4 log/red.txt                 6 failing tests before implementation
  tasks/T70-investment-map/4 log/hotspots-top10-mole.txt  mole hotspots --top 10 on Mole's own repo
  tasks/T70-investment-map/4 log/hotspots-top10-mole.json same, --json (MCP tool's shape)

limits (INFERENCE / OPEN, not fabricated results)
  - decision volatility reads `.mole/decisions/*.md` via @mole/decisions, NOT `@mole/temporal`
    (Postgres/RLS store named in the contract's Context line) — @mole/temporal is out of T70's
    BOUNDARY to touch; this is the lighter read-only equivalent already inside boundary. INFERENCE,
    flagged for Raymond to confirm or redirect.
  - no defect-density ground truth exists in this repo to calibrate weights/combination against;
    the ranking is Tornhill/code-maat's heuristic (churn x complexity, extended with two more
    multiplicands here), not a fitted statistical model.
  - Human spot-check of the top 10 is explicitly OPEN (contract's own line) — not performed here.
  - `mole_coverage` pagination test timing out (90s, pre-existing, this task did not touch
    @mole/coverage) — recorded as observed, NOT attributed a cause by this task.
```
