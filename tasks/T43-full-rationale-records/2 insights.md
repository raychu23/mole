# T43 insights

```notes
scope decision: where the "full rationale" lives
    chose          a single shared extraction (packages/decisions/src/rationale.ts: sectionsOf +
                   formatSections), read straight from each decision node's own file (already tracked
                   via GraphNode.file:line) at the point `decisions()` builds its result -- not a new
                   on-disk copy, not a change to GraphNode's shape. Works identically for .mole/decisions
                   records AND plain ADR-folder records (graph.ts loadAdrDir), since both already carry
                   a file reference and neither needed the text duplicated to get this.
    why            cheapest change that reaches every agent-facing surface at once: MCP mole_decisions
                   (reads decisions()'s JSON unchanged), `mole decisions --json` (same function), and the
                   Claude Code hook (plugins/claude-code/scripts/lib.mjs, kept dependency-free per its own
                   file-header rule, so it duplicates a small, equivalent sectionsOf/formatSections rather
                   than importing the TS package -- flagged in the file's own comment).

bug caught by a red test, not by inspection
    found          sectionsOf() returned {} for an ADR that has '##' headings, but none of them match a
                   recognized MADR/Nygard bucket name (Backstage's own adr002, which uses Background/
                   Format/Envelope/Metadata instead of Context/Decision/Consequences) -- the "no headings
                   at all" fallback never fired because headings DID exist, just none recognized.
    fixed          sectionsOf (both packages/decisions/src/rationale.ts and lib.mjs's dependency-free
                   duplicate) now falls back to the whole stripped body as the Decision bucket whenever
                   NOTHING matched a bucket, not only when there were no headings at all. Caught this
                   while generating the done-when-4 product records (bs-adr002 came back 0 chars on the
                   first pass) -- a real repo exercised a case the hand-written unit tests hadn't covered,
                   so a test for exactly this shape was added (rationale.test.ts) before the fix.

worktree gotcha: untracked files are not carried by `git worktree add`
    found          packages/bench/test/h2h.test.ts reads "generated data/m0-engine-report.json", an
                   UNTRACKED file on main (not in git ls-files). `npm run check` in a fresh ledger worktree
                   failed 2 tests on this alone; the same tests pass on main. Not a regression from T43's
                   diff (confirmed by running the same test on main directly).
    acted          copied the file from main into the worktree (read-only copy, not committed -- it's
                   gitignored) so `npm run check`'s result reflects the same green state main already has.
                   Did not touch the test or the file's contents.

done-when 4: A2 baseline not rerun
    done-when 4's own wording is "re-run M-B dev B arm with records produced by the PRODUCT importer ...
    CORRECT within 1 of v2 hand-made 9/12" -- scoped to the B arm only. Reused v2's existing
    A2_adr_removed_rerun rows (same dev key, same checkout family) as the "no record" reference point in
    results.md rather than spending a fresh 12 model calls re-proving a number T43 wasn't asked to rerun.

result            11/12 CORRECT, 1/12 INCORRECT (adr009), 0/12 NOT_ATTEMPTED -- beats the "within 1 of
                  9/12" bar (exceeds it by 2). Full method/deviations in
                  context/product-plan/systems/metrics-proof/prelim-11-01/mb-why/t43-product/results.md
                  (outside this repo, in the Mole *context* tree per the task's own evidence pointers).
```
