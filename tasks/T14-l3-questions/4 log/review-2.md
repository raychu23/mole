# T14 review round 2 (fresh reviewer, reviewer-T14-r2, 2026-10-28)

Branch `ledger/t14-l3-questions` @07b7a04 (fix f233906), worktree `Mole-worktrees/T14-l3-questions`. Did not edit the branch; worktree `git status --short` clean afterwards; excalidraw clone `git status --short` = `?? .mcp.json` only (pre-existing).

## Verdict: verified (no P0/P1; 4 P2 left as follow-ups)

## Checks (fresh)
- R2: `git diff 8b8f7ab HEAD -- packages/questions/bench packages/questions/test/questions.test.ts` → 0 bytes.
- New tests bite: `git checkout 54647b0 -- packages/questions/src && npm run build && npx vitest run packages/questions/test/review-fixes.test.ts` → 7 failed | 1 passed (8). The positive named-edit case passes on both, which is expected. After `git checkout HEAD -- packages/questions/src && npm run build`, the tree is clean.
- `npm run check` (load avg 30-42) → EXIT 0, 14 files, 106/106 tests, first run, no flake.
- `node packages/questions/dist/bench/m4.js` → EXIT 0: past-fix in top3 8/8, empty-case questions 0, useless share 0.0% (0/15), key past-fix items 11/11, order 13/13, model calls 0, "bench: all targets met".

## Round-1 findings re-checked
- P1-1 FIXED. `check 808d068 --root <excalidraw>` now gives 3 `[past-fix]` questions (4850bf3, d3a9c2a, 31df3e6). The "Test Linear Elements" guard is gone. 93dd510 and f3d99c4 no longer give the describe-level guards (214cd6e gives 3 past-fix questions). Temp-repo repro via CLI: editing `trims` inside `describe('Editor')` gives "1 hunk: no past fixes", no question. Editing the fix's own `it('null is empty')` gives `[guard-test] This change edits test/e.test.ts » "null is empty", a test guarding c3fb367 "fix: null crash"`. A guard on an already-asked fix is merged into that past-fix question when the cap is full (test 3).
- P2-1 FIXED: `SNAPSHOT` excluded from guards and from "Its guarding test" (no `.snap` in any probed output).
- P2-4 FIXED: `NON_CODE` filter. e1b7aac no longer asks about CHANGELOG.md:41.
- P2-2 PARTLY FIXED: body first sentence, squash bullet lists dropped, word-boundary clip with "…". 808d068's squash list is gone. A JSDoc the fix wrote inside the blamed lines still shows as "why" (02fc9f3 "Navigates to a target…", 53973c3 "SAFETY: …"); insights admit this.
- P2-3 open as documented: the metric is still graded against the key only.

## Done-when 3 probes (Mole repo)
- Deleting the whole `describe('idle shutdown (T9)')` block (lines 38-59, `check --diff <scratch>/del.diff --base HEAD`) gives `[guard-test] This change deletes packages/daemon/test/daemon.test.ts » "idle shutdown (T9)", a test guarding 9e19c51 …`.
- A one-line edit inside that block (line 40) gives "1 hunk: no past fixes", no question. That matches the narrowed rule, because 9e19c51 never wrote those lines.
- Planted diff (`--diff packages/history/bench/fixtures/planted-m8.diff --base bdeff14`) gives 1 `[past-fix]` 9e19c51 question that cites "idle shutdown (T9)" and has the good "editing counts as use" why.

## Findings (all P2; none blocks)

### P2-1 A guard of an UNASKED fix still evicts the 3rd past fix (or the lowest note)
`rank()`: when the cap is full and the guard's fix isn't asked, the guard replaces the lowest note, or the 3rd past fix if there is no note. This puts guard above note in practice, against the contract's stated order. It is forced by the frozen red test ("a guard-test edit keeps a slot") and done-when 3. The narrowed rule makes it rare (0 of the review-1 excalidraw probes now hit it), and the decision is recorded in 2 insights.md. Not a P1. If Raymond wants strict past fix > note > guard, the red test needs his ruling.

### P2-2 Blame guards fire on formatting-only fix lines, and a guard duplicates an asked fix when a slot is free
e1b7aac: Q3 `[guard-test] … packages/utils/tests/export.test.ts » "with exportPadding", a test guarding dd8296a`. dd8296a only re-wrapped `diagramFactory({...})` there (`@@ -110 +110,3`). Its real regression test in that file is "with deleted elements" (un-skipped). Q1 is already the dd8296a past-fix question, so with a free slot the same fix is asked twice instead of merged. Low cost. Suggest merging same-sha guards whenever their past fix is asked, not only when the cap is full.

### P2-3 "why" still a doc comment in some cases (carried from review-1 P2-2; admitted in insights)
02fc9f3 `(why: Navigates to a target and optionally installs scroll/zoom constraints.)`; 53973c3 `(why: SAFETY: This should never happen, but log it just in case…)`.

### P2-4 Past-fix question on an import line
214cd6e Q2: `You edit packages/excalidraw/data/restore.ts:1, lines 0457ac9 … wrote as a fix`. This is a T12 fact, but T14 chooses to ask it. Not P2-4 territory (the file is code); a follow-up could skip import-only hunks the way guards now skip lines outside blocks.

## Ruling on 4 log/key-changes.md (G1/G2 whole-block hunk-header path)
**Keep it, as implemented (whole-block deletions only).**
- Evidence: 9e19c51 is the fix that changed the idle clock (server.ts, "idle clock counts editing + running index"). `describe('idle shutdown (T9)')` is the test that exercises that idle behaviour, and the fix's own test hunk sits directly under it (`@@ -60,0 +61,28 @@ describe('idle shutdown (T9)'`). Deleting that whole block really removes the check for the fix's behaviour, so the question is useful and not noise.
- The path is narrow: it needs the change to delete every non-blank line from the title to the block's end. A one-line edit inside the block asks nothing (probe above). This keeps out the P1-1 failure (edits inside a file-wide describe).
- The same hunk-header source is how T12 names guarding tests (B3's mustMention), so dropping it only in T14 would make the two packages disagree.
- No key edit is needed. The wording "a test guarding 9e19c51" slightly overstates a hunk-header link. A follow-up may say "the test next to 9e19c51's test change". Not required.
