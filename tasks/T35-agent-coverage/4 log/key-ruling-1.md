# R2 ruling on key-changes.md: APPROVE a minimal fix (not applied here, per R2 freeze)

## Claim being checked
`build-key.mjs` runs `git log <branch> --no-merges` on each builder's ledger branches and keeps commits
inside that builder's Hermes session window, unioning every file those commits touch. Claim: this
over-counts because `git log <branch>` is every commit reachable from the tip, which on these repos
includes commits that are not that builder's own work -- shared trunk/orchestration commits (`ledger
move: ...`, `HANDOFF: ...`, `loop-report`, other tasks' work) that entered the branch's ancestry via
merges from `main`/a shared integration trunk, even though `--no-merges` hides the merge commits
themselves.

## Verification against real git log (main checkout, not the worktree)
Confirmed empirically, not asserted:

- `ledger/t19-rename-proof-anchors` has 40 merge commits in its full history (`git log --merges` count),
  i.e. this is a "merge main into the branch repeatedly" workflow, not a clean linear feature branch.
- For mole-builder-3's exact window (`2026-10-29T10:08:06Z..15:27:18Z`, taken from `m27-key.json`),
  `git log ledger/t19-rename-proof-anchors --no-merges` returns **139** commits in-window. Spot-checking
  them by subject shows dozens that are plainly other builders'/the orchestrator's work landing on the
  same branch in that window: `ledger move: tasks/T30-annotated-file-tree ready → running`, `ledger move:
  tasks/T32-team-pr-check blocked → ready`, `T24 run log: round 8...`, `T22-hand-back-test-selection
  review-3...`, `T24: runs.jsonl after merging main...`, etc. -- all authored by "Raymond Chu" (the
  orchestration identity), none are mole-builder-3's own T19/T21 work.
- Cross-check: one of those commits (`38efa0f1...`, "ledger move: tasks/T30... ready → running") is
  contained in **11 different ledger branches** (`git branch -a --contains <sha>`), and is an ancestor of
  `main` (`git merge-base --is-ancestor <sha> main` = true). This is shared trunk history that every
  branch picked up via merge, not a commit unique to any one builder's branch.
- **The claim holds.** The over-count is real and matches the magnitude key-changes.md reports (its own
  worked example: mole-builder-3's un-self-attributed files land mostly on known other builders'
  sessions, which is exactly what you'd see if their commits leaked into mole-builder-3's counted set).

## Candidate fixes tried and why only one is safe

1. **`git log main..branch`** (diff branch tip against current `main`) -- **rejected**. Checked
   `git merge-base --is-ancestor <branch> main` for all 8 of builder-4/5's branches
   (`ledger/t29-decision-graph-core`, `t27-decisions-as-rules`, `t30-annotated-file-tree`,
   `t32-team-pr-check`, `t22-hand-back-test-selection`, `t24-agent-claim-check`,
   `t28-runtime-flows-from-tests`, `t25-hand-back-verify-gate`): **7 of 8 are already fully merged into
   `main`**, i.e. `main..branch` is empty for them. Using current `main` as the comparison point would
   zero out almost all of builder-4's and builder-5's commits -- a correctness-destroying regression, not
   a fix.

2. **`git log --first-parent <branch> --no-merges`, filtered to the session window (same as today,
   same diff-tree step)** -- **this is the fix, verified empirically on all 4 builders' branches**:
   - builder-3 / `ledger/t19-rename-proof-anchors`: 139 → 6 commits in-window; all 6 are explicitly
     T19-prefixed or self-labelled "(builder 3)"/"(mole-builder-6)" for the one that's really builder-6's.
   - builder-4 / `ledger/t29-decision-graph-core` (a fully-merged branch, so fix #1 would've broken it):
     37 → 4 commits in-window; 3 are T29-prefixed, 1 residual is `ledger move: tasks/T22... ready →
     running` (see below).
   - builder-5 / `ledger/t22-hand-back-test-selection`: 86 → 15 commits in-window (proportional
     reduction, branch not collapsed to zero despite also being fully merged into `main`).
   - builder-6's three branches in its own (short, 35-minute) window: `t19` 8→1, `t30` 20→4, `t32` 22→2,
     every surviving commit explicitly T19/T30/T32-prefixed.
   - `--first-parent` does not depend on `main`'s current state at all (it walks the branch ref's own
     first-parent ancestry), so it is immune to failure mode #1 regardless of whether/when a branch gets
     merged into `main` later.
   - Residual noise is small and low-impact: one surviving stray commit (builder-4's window, the "ledger
     move: tasks/T22..." commit) is still structurally shared trunk history that happens to sit on
     `t29`'s first-parent line. Checked its `diff-tree`: it touches only
     `tasks/T22-hand-back-test-selection/0 start.md` and `.../4 log/ledger.md` -- task-ledger metadata,
     not `packages/**` source. It does not inflate the `packages/**` ground-truth file set the metric
     actually scores against.

## Ruling: **APPROVE**
Change `build-key.mjs`'s `git(['log', branch, '--no-merges', '--format=%H %ct'])` call to
`git(['log', '--first-parent', branch, '--no-merges', '--format=%H %ct'])` (one flag added, no other
logic change). This is the minimal, safe fix:
- It is a one-line, mechanical change to the git invocation, not a change to the metric's semantics,
  thresholds, or scoring -- it makes the *ground truth* more accurate, it doesn't loosen the bench.
- It does not require trusting commit message prefixes/content (stays "independent of transcript/message
  parsing" per the key's own stated method), and does not require a `main`-relative diff that breaks on
  already-merged branches (verified 7/8 of builder-4/5's branches are already fully merged, which rules
  out fix #1 as unsafe).
- Verified on real git history for all 4 builders, not just the complaint's one example branch: it cuts
  in-window commit counts by 80-95% in every case checked, and the commits it keeps are the ones that
  actually belong to that builder's own task(s) by subject-line correlation with their branch's task ID.
- Residual contamination after the fix (shared trunk commits that land on a branch's own first-parent
  line, e.g. "ledger move" entries) is real but small and, on inspection, confined to `tasks/**` metadata
  files rather than the `packages/**` source files M27a's precision/recall actually scores -- it should
  not be conflated with "fix is incomplete," though a follow-up could additionally restrict the
  `diff-tree` file union to `packages/**` if those metadata files ever start appearing as false positives
  in a future key rebuild.

**Not applied here per R2** (key and `build-key.mjs` are frozen; this file is the ruling only). Rebuilding
the key with this fix will very likely raise mole-builder-3/4/5's recall materially (the dominant false
negatives traced in `key-changes.md` were files correctly owned by a different builder whose commits were
being double-counted into mole-builder-3's claimed ground truth) -- but that rebuild, and re-running M27a
against it, is the next round's work, not this ruling's.

## Key-guard record (added 11-05 by the orchestrator: the ruling above was applied in d934a53 but never named the new hash, so CI key-guard failed on main since 11-04)

APPROVE applied: packages/coverage/bench/m27-key.json sha256 8b3a6895b9805b19e3acc5f74c5049170696fc4786a63f7767cfea8ef987e278 (content written by d934a53, unchanged since)
