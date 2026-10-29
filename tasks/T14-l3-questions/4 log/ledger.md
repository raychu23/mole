```notes
ledger (newest last, nothing deleted)
    2026-10-28 21:10      new → proposed      L3 questions: when a change touches symbols with notes, past fixes or your seen history, mole check adds at most 3 questions aimed at your understanding (from t
    2026-10-28 21:10      proposed → ready      owner mole-builder (Hermes chat)
    2026-10-28 22:05      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T14-l3-questions · branch ledger/t14-l3-questions · base ef51e65
    2026-10-28 22:26      running → submitted      report: branch ledger/t14-l3-questions @54647b0: new @mole/questions (templates over T12 past fixes + T11 notes + guard-test edits, rank past fix > note > guard test, cap 3, guard-test always gets a slot), mole check pri
    2026-10-28 22:26      checks ran: npm run check && node packages/questions/dist/bench/m4.js in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T14-l3-questions → exit 0 (bench: all targets met)
    2026-10-28 22:33      submitted → running      changes requested: review-1 (tasks/T14-l3-questions/4 log/review-1.md, ff5b850): P1-1 guard-test 'named' rule matches outer/file-wide describe via hunk-header context, so editing any test inside it asks about an unrelate
    2026-10-28 22:46      running → submitted      report: round 2 @07b7a04 (fix f233906): guard rule narrowed (fix-written lines inside a test block, or the it/test block whose title the fix added, or deleting a whole block T12 names) — 808d068 now asks 3 past-fix quest
    2026-10-28 22:46      checks ran: npm run check && node packages/questions/dist/bench/m4.js in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T14-l3-questions → exit 0 (bench: all targets met)
    2026-10-28 22:49      submitted → verified      reviewer reviewer-T14-r2 · findings: P2 only: (1) guard of an unasked fix still evicts lowest note/3rd past fix (forced by frozen red test, documented), (2) blame guards on formatting-only fix lines + same-sha guard aske
    2026-10-28 22:49      checks ran: npm run check && node packages/questions/dist/bench/m4.js in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T14-l3-questions → exit 0 (bench: all targets met)
    2026-10-28 22:52      verified → integrated      merge 4e0e9de · combined checks exit 0 · note: npm run check on main 4e0e9de → 128/128 passed (rerun, first run 1 failed: untouched apps/vscode debounce timing test under load avg ~35) · m4.js on main → past-fix in top3 
    2026-10-28 22:52      combined checks ran: npm run check && node packages/questions/dist/bench/m4.js in /Users/a1/Desktop/CS Code/Project/Mole → exit 0 (bench: all targets met)
```
