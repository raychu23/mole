```notes
T41 insights      M35 head-to-head scoreboard      a17/mole-builder-12      2026-10-30

    assumptions (R9 Raymond may not be watching)
        H3 scope           limited to the 7 real (symbol, commit) pairs from T11's m1-key.json that are repo=='mole', kind=='commit'
                            (excalidraw scenarios skipped: their commits aren't in this repo's git history, so `git show <rev>:<path>`
                            can't resolve them here; running those would need the separate excalidraw clone checked out, not done this round)
        H4 n is small      only 7 of m9-key's 151 cases are repo=='mole' with usable commit shas for git's own detector; the other 144
                            are excalidraw (same clone-availability issue) or synthetic. Reported as-is (n stated in the row), not padded.
        H5 same-file overlap  "files touched" for REAL pairs comes from `git show --name-only` on the evidence.commits list (first commit
                            only would undercount; used the full union across all listed commits per side)
        H6 private key      m16-key.json (T24) is gitignored chat-text; never copied into this worktree (R2 + the project's privacy rule).
                            H6's baselines are scored from the key's own committed PUBLIC aggregate counts in
                            tasks/T24-agent-claim-check/4 log/key.md (by-category + flagged breakdown), not from a fresh per-claim run.
                            tests-pass-only is therefore an upper-bound ANALYTIC estimate (assumes it perfectly separates test/exit-category
                            claims and never produces an extra false positive inside that category) — labelled as such in the row.
        git merge-tree     only runs on REAL pairs with >=2 distinct commit shas in evidence (3 of 9 real pairs); planted pairs are
                            synthetic session logs with no corresponding git commits to merge, so merge-tree cannot run on them (stop rule:
                            "a baseline can't run offline -> reimplement from docs or drop that row with the reason" — here the real tool
                            genuinely cannot apply to synthetic data, so its n is reported honestly rather than faked)
        dependency-cruiser  real tool, run with --no-config (repo has no .dependency-cruiser.js); reports import-module count only, since
                            it has no call-edge concept — included in H1's all_baselines for completeness, explicitly marked not comparable
                            to the F1 column
        H1 Mole result     Mole (TypeScript Compiler API) scores HIGHER than scip-typescript and tree-sitter on this fixture (100% vs 96.1%
                            vs 80.7% F1) — a genuine win from T1's already-reviewed 4-engine bench, not something this task computed; reported
                            as-is per R7 (losses AND wins reported with the same prominence, and this one happens to be a win)
    losses / limits reported (R7)
        H4                 Mole's own number (88.9%, target >=95%) is already BLOCKED upstream (T19); git's own rename detector score even
                            lower (0%) on this n because it structurally can't see same-file symbol renames (6 of 7 cases) — reported, not hidden
        H5 git merge-tree  0% recall: textual merges of the sampled real commit pairs never produced a literal conflict marker even where the
                            key labels them a real collision — this is the exact gap the claim is about (behavioral overlap, not textual)
    files              packages/bench/{h2h.ts,src/*.ts,keys/reused-keys.json,test/h2h.test.ts}; output tasks/T41-head-to-head-benchmarks/4 log/{scoreboard.json,scoreboard.md}
```

```notes
review-1 fixes      2026-10-30
    P1 R1 violation    fixed: red commit (bb1589d) now has only harness + frozen keys + STUB src (throws) + the test file,
                       genuinely 7/9 red; the real implementation moved to its own commit (f275354)
    P2 boundary        root tsconfig.json's 3-line addition ({"path":"packages/bench"}) is necessary wiring to include the new
                       package in `tsc -b`'s project graph (every other packages/* package does the same); kept, noted here
                       since it's not literally inside packages/bench/** or tasks/T41-**, per the reviewer's flag
```
