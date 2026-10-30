---
state: verified
owner: mole-builder-15
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t31-one-on-one-loop-readback
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T31-one-on-one-loop-readback
base: 6c5f406
reviewer: a20-self-review
updated: 2026-10-29 23:10
status: ledger verified
next: merge → ledger move <task> integrated --merge … (ledger reruns checks in the repo)
claimed: 2026-10-29 22:42
---
```notes
T31-one-on-one-loop-readback      ledger task (rules.md §3 code features)      project tasks
    goal                    The 1:1 loop + read-back (3C1 lines 268, 301, 319): questions you hit (hover 'ask', agent sessions) are logged privately under .mole/local/questions; before a 1:1 Mole lists them grouped by folder with any record that already answers them; after the 1:1 the answer becomes a proposal both people OK (T23 drafts it with structured output); read-back = you explain a decision in your words and its approver confirms with one click (a model may only hint), stored as evidence of understanding, private unless shared
    done-when               1) mole oneonone prep|capture and the read-back flow in the panel; 2) M23 pilot, 2 weeks, you + one friend's team (D7), hypotheses fixed before: share of questions answered by a record before the 1:1, repeated questions per week, read-backs confirmed per folder; reference point: I-PASS structured handoffs cut medical errors 23% (NEJM 2014), not a software benchmark; 3) nothing about a person leaves their machine unless they share it; 4) failure case: a question no record answers stays open and goes to the 1:1 list, never auto-answered; 5) npm run check passes
    status                  2026-10-29 verified      reviewer a20-self-review · findings: Self-review per task instructions (no separate fresh-subagent spawn available in th
    next                    merge → ledger move <task> integrated --merge … (ledger reruns checks in the repo)
    pinned
    mode                    code
    boundary                packages/oneonone/** (new package) only, plus exactly one import + one call added into apps/vscode (shared panel/view file) and exactly one import + one call added into packages/mcp (tool list); do not touch more of those files; never restructure apps/vscode, packages/mcp, plugins/claude-code or shared config beyond that one call each
    checks                  npm run check && node packages/oneonone/dist/bench/m23-code.js
    non-goals               no per-person scoring (questions/read-backs are grouped and stored per FOLDER, never per person, per M23/D31); no real 1:1 meeting recordings or transcription; no paid APIs or model calls (matching is deterministic keyword/overlap scoring, no LLM); no running or simulating the real 2-week people pilot (D7 stays OPEN, out of scope here) — this task builds and verifies the code/metric half only
    proof                   a frozen labeled key of >= 20 real questions Raymond actually asked, pulled from Mole's own context/product-plan/4 log/my words.md + my words.txt logs (the "ask"/"check" rows, each with its real date and the record that already answered it, e.g. "just tell it to read HANDOFF.md? → tasks/HANDOFF.md"), stored at packages/oneonone/bench/m23-key.json dated before the implementation commit (R1/R2: never edited after that commit); precision/recall of the folder-grouped question→record matcher measured against that key, appended to tasks/T31-one-on-one-loop-readback/4 log/runs.jsonl
    stop                    loop cap 6 rounds total (tasks/loop-goals.json R3); same failure 3 rounds running → ledger blocked with the cause; a genuine miss after 6 rounds with 0 false verdicts is reported at its real number (R7), never claimed as met
    came from               USER 2026-10-29 07:10 'im still really unhappy with the stuff about codemaps … making that into some relational graph thing based on human decisions … sharing of core intutive info is hard … has to be done throuhg like q1-1 often' · Decision graph.md · D31
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
