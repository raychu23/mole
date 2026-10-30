```notes
T40 insights      (a20 · mole-builder-15 · 2026-10-30)      INFERENCE = choices made while Raymond is away
    0 assumptions (before the red commit)
        flag notation     a flagged (decision) line is DECIDED:/AGREED:/DECISION: (markdown bullet); a candidate code
                          reference inside it is backtick-wrapped (`fn()` or `path/to/file.ts`) -- the only notation real
                          review-note fixtures here use, so prose never accidentally resolves to a symbol (D38 no-invent)
        symbol resolution reused @mole/memory's sourceFiles/symbolsOfText (same primitives T11/T19/pr-check already use)
                          instead of re-parsing TypeScript; a candidate resolves only if it names EXACTLY one file/symbol
                          in the repo -- ambiguous or unknown candidates stay unanchored, never guessed
        drift policy      Swimm-style: a symbol's SHAPE (kind + param count) unchanged => trivial (auto-sync silently);
                          deleted/renamed/signature-changed => real (escalate). Picked because it is the smallest
                          deterministic signal that distinguishes "still the same decision, implementation moved on"
                          from "this decision might not describe the code anymore" -- no model anywhere in the file
        T32 connection    reused the ONE check-run payload pr-check already builds (buildCheckRun's `s` summary array)
                          instead of a second PR comment/bot -- keeps D24's non-goal ("no PR comments or PR bot") true
        capture UI        no new authoring surface built (out of scope per non-goals: no transcription, meeting bots,
                          ticket creation); a person writes .mole/local/meetings/*.md by hand today, same place T31's
                          "explain it back" box already writes to -- draftsFromNotes/reviewDraftsSummary just read it

    1 self-review (distinct pass after implementation, against the done-when contract)
        done-when 1 (M34 part 1) MET: bench/m34.js -> drafts link right 100.0% (n=10, target >=90%), invented 0 (target 0)
        done-when 2 (M34 part 2) MET: diagram delta match 100.0% (target 100%), byte-identical twice true
        done-when 3 (M34 part 3) MET: drift split agree 100.0% (n=10, target >=90%), real->trivial misses 0 (target 0)
        done-when 4 (panel + PR comment) MET: apps/vscode 'Review / meeting notes' section + inline diagram SVG;
                          packages/decisions/src/check/pr-check.ts surfaces drafts on T32's existing check-run
        done-when 5 (npm run check green) PARTIAL: full `npm run check` = 69/77 test files, 505/521 tests pass; the 2
                          failures are packages/bench/test/h2h.test.ts (T41, a17's task), missing
                          'generated data/m0-engine-report.json' -- an untracked generated artifact that exists on the
                          main checkout but is never created fresh in a new git worktree. Verified this is unrelated to
                          T40: the failing test never imports anything from packages/reviews, apps/vscode's panel code
                          or packages/decisions/src/check; I did not touch packages/bench or the T1 engine report
                          generator. P1, not fixed (not mine to generate/own; a17's worktree, forbidden to touch).
        P2 (not blocking) draftsFromNotes builds a full-repo TS symbol index on first call per repo root (cached after
                          that); on a very large repo the VS Code panel's first 'Review / meeting notes' refresh could
                          be slower than the other 8 sections' CLI-cached reads. Not measured against T34's p95 refresh
                          target because that target (M26) was frozen before this 9th section existed; the new section
                          test suite (apps/vscode/test/panel.test.ts) still passes with it added. Future task: cache
                          the symbol index across VS Code sessions the way T34's daemon caches the call graph.
        P2 (not blocking) no capture UI: a person must hand-write .mole/local/meetings/*.md today (by design, see
                          assumptions above). A follow-up (T31-adjacent) could add a 'New meeting note' button to the
                          panel; out of this task's non-goals.
        0 P0s found.
