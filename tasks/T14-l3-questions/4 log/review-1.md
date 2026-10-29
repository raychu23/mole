# T14 review round 1 (fresh reviewer, reviewer-T14-r1, 2026-10-28)

Branch `ledger/t14-l3-questions` @54647b0, worktree `Mole-worktrees/T14-l3-questions`. Did not edit the branch.

## Verdict: back to running (1 P1, 4 P2)

## What holds (PASS)
- R1/R2: red commit 8b8f7ab (key, bench, fixtures, tests, stub) precedes implementation 8b8f725; `git diff 8b8f7ab HEAD -- packages/questions/bench packages/questions/test` is empty (0 bytes).
- R4: runs.jsonl has 4 rows incl. red and the two failed rounds.
- Checks (load avg ~28-33): `npm run check` run 1 → EXIT 1, 2 failed/96 (T12 `CLI: mole check <sha> prints the fix` timed out 5223 ms; vscode `debounce` timing test). Run 2 → EXIT 0, 98/98. `node packages/questions/dist/bench/m4.js` → EXIT 0: past-fix in top3 8/8, empty-case questions 0, useless 0.0% (0/15), key past-fix items 11/11, order 13/13, model calls 0. CLI on excalidraw takes 0.33 s (R1) / 0.59 s (R4), so the T12 CLI timeout is most likely load, not T14.
- E1-E3 really are nothing-known (hand blame at the parent + subject check):
  - E1 excalidraw ed10ac7: App.duplicate.ts 9ba66ed (feat) 24 + 97c68dd (refactor) 1; App.tsx 9ba66ed 5, b552c60 (feat) 4, 87faa5d 9; textWysiwyg.tsx 87faa5d 1. 87faa5d ("fix: sentry CI worfklow") is the shallow boundary (repo is shallow) so its blame is not authorship; ignoring it is right. No test hunk edits old lines.
  - E2 Mole 8664b8b: neighborhood.ts:85 ← 9224561 (T2), mcp/src/server.ts:20 ← 822106c (T2); daemon.test.ts hunk is `-53,0` (add only). CLI: "3 hunks: no past fixes", no questions block.
  - E3 d250105: all 8 files `A`. Honest but trivial (add-only can never yield a question).
- Done-when 1/2/5 as a user (CLI): R1 → 1 q, R4 → 2 q, planted diff → 1 q (9e19c51, cites "idle shutdown (T9)"); `--json` keys `change, fixRule, hunks, noPastFixes, ms, questions` (T12 fields unchanged); `--reword` with no model → exit 0, one stderr line `mole: reword: no model configured; questions are shown as written (deterministic templates)`, stdout byte-identical to the run without `--reword`. Temp repo: a nothing-known edit → no block; `mole note add 'src/load.ts#other' ...` then editing `other` → `[note] Your note on src/load.ts#other says: "other must stay pure: callers memoize it". This change edits src/load.ts:7 inside it; ... (source: .mole/notes/src-load.ts-other.md:10)`; deleting the test a fix added → `[guard-test] This change deletes test/load.test.ts » "load null", a test guarding 7fbac60 "fix: null crashed load". If that fix breaks again, what will catch it?`.
- Excalidraw clone: `git status --short` afterwards = `?? .mcp.json` only.

## Findings

### P1-1 Guard-test rule fires on any edit inside a file-wide describe, then pushes out a real past-fix question
`enclosingTitles` walks up to the top-level `describe`, and `fixesOfTestFile` counts the `-U0` hunk-header context as a title the fix "sat in". In test files wrapped in one big describe, any fix that touched the file "guards" every test in it. Because a guard-test question always takes slot 3, a noise guard pushes out the 3rd past fix. That reverses the contract ranking (past fix > note > guard) in real use. M4 cannot see this because no key case edits old test lines from real history (B1 test hunks only add lines; G1/G2 delete the describe itself).
- Minimal repro (temp repo): `describe('Editor', ...)` with `it('trims')` (feat), then a fix adds `it('null is empty')` inside it, then change `trims`'s expectation → `[guard-test] This change edits test/e.test.ts » "Editor", a test guarding 6762c2b "fix: null crash". If that fix breaks again, what will catch it?` The fix never touched `trims`.
- Real repro: `node packages/daemon/dist/cli.js check 808d068 --root ~/.hermes/cache/scratch/impact/excalidraw`. The change has 3 code past fixes. Only 2 are asked, and slot 3 is `This change edits packages/element/tests/linearElementEditor.test.tsx » "Test Linear Elements", a test guarding d3a9c2a "fix(packages/excalidraw): complete cross-document runtime ownership (#11997)"`. d3a9c2a only added one line at 1598 of that 2065-line file (`@@ -1597,0 +1598 @@ describe("Test Linear Elements"`). 808d068 edits line 1520 in a different `it`. The same happens for 214cd6e, e65eca9, afa3a65 (guard "Test Linear Elements" → 5e375b4), f3d99c4 ("textWysiwyg" → dd8296a), e1b7aac/ef53e54 ("Cropping and other features" → dd8296a), 93dd510 ("interaction={false}" → 3747163), 53732f0 ("cursor hint" → 3747163).
- Sample of the 80 newest test-touching excalidraw commits: 36 guard facts. All 13 `named` ones name a describe-level title ("Test Linear Elements" ×5, "textWysiwyg" ×2, "Cropping and other features" ×2, "elbow arrow routing", "cursor hint", "interaction={false}"), never an `it` the fix wrote. Probe: a script calling `questions()` over `git log -n80 -- '*.test.ts' '*.test.tsx'`.
- Possible fix: for `named`, match only titles the change removes, or the innermost `it`/`test` that encloses the edit, against titles the fix added or edited (not hunk-header context). Don't let a `named` guard evict a past fix. G1 still passes because it deletes the describe, so the title is in `removed`.

### P2-1 Snapshots treated as tests
(a) `pastFixText` filters `.snap` but then falls back to `f.tests.find(via==='fix')`, so B1-R2 and R4 still say `Its guarding test: packages/excalidraw/tests/__snapshots__/history.test.tsx.snap.` / `.../regressionTests.test.tsx.snap.` This contradicts the code comment and the insights' ".snap test pick" fix. (b) Blame-guards fire on `.snap` files because `TEST_FILE` matches `tests/`. Repro: `check 93dd510` → `[guard-test] This change edits excalidraw-app/tests/__snapshots__/MobileMenu.test.tsx.snap, a test guarding 94364af "fix: Clarify welcome screen message ..."`. 4850bf3 and 808d068 also produce .snap guard facts.

### P2-2 The "why:" clip often isn't the reason
The first nearby code comment is labelled as the fix's reason. Verbatim from the bench/CLI:
- R1: `(why: Navigates to a target and optionally installs scroll/zoom constraints.)`: a JSDoc, not why the fix was made.
- R4/R5 dd8296a: `(why: SAFETY: This should never happen, but log it just in case)`.
- R5 acb48c3: `(why: iframe-like elements are rendered as DOM overlays and are not)`; dc2c16d `(why: Whether the element hides what is behind it from binding. Images count as)`: cut mid-sentence with no ellipsis.
- 808d068: `(why: * fix: complete cross-document runtime ownership * fix: schedule cross-document animations in owner window * fix: Prewarm the right font ev…)`: a squash bullet list.
- B3/G2/N1 9e19c51 `(why: editing counts as use: ...)` is good.

The insights already admit this. It still counts as 0% useless, because the metric only checks the cited sha. Label it `nearby comment:` or prefer the commit body, and drop fragments.

### P2-3 The "useless share" measure doesn't judge usefulness
A question counts as useful when it matches a key item (same kind, same sha/path, mustMention). The past-fix items are T12's m8-key, so that part is circular with T12's output. The text's quality, the guard's precision on real test edits and the relevance of "why" aren't measured. My reading of the 15 bench questions: all cite a clickable sha+file:line and all are aimed at understanding ("Does your change keep that fix working?", "what will catch it?", "does the note still hold?"). But 2/15 name a .snap as the guarding test and 4/15 carry a misleading why. In real-history use (P1-1), roughly a third of 3-question outputs in the sample had a noise guard at slot 3. Suggest adding a key case that edits an old line inside a file-wide describe with no fix on it (expect no guard).

### P2-4 Past-fix question on non-code files
e1b7aac: `[past-fix] You edit packages/excalidraw/CHANGELOG.md:41, lines 02fc9f3 "fix(packages/excalidraw): setViewport stops following a collaborator (#12184)" wrote as a fix ... Does your change keep that fix working?` A changelog line can't "keep a fix working". The fact comes from T12, but T14 picks which facts become questions.

Minor wording (not a finding): "You edit X:668, lines 3747163 \"…\" wrote as a fix" reads awkwardly ("lines that 3747163 wrote"). A multi-item subject ("T9 review fixes: Node-too-old message …") doesn't say which item the lines belong to.

## Guard rule vs done-when 3
The rule is "a describe title the change deletes was added or sat in by the fix". It satisfies done-when 3 for deletions and for edits inside the fix's own test (tests + G1/G2 + temp repo). But "sat in" plus walking to the outermost describe makes it fire on edits to tests the fix never touched (P1-1). As implemented it is broader than "a guarding test of a past fix".
