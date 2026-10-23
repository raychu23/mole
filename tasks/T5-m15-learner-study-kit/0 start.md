---
state: verified
owner: unclaimed
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t5-m15-learner-study-kit
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T5-m15-learner-study-kit
base: 45e24ed
reviewer: subagent sa-0-808009dc
updated: 2026-10-23 04:25
status: ledger verified
next: merge → ledger move <task> integrated --merge … (ledger reruns checks in the repo)
claimed: 2026-10-23 04:09
---
```notes
T5-m15-learner-study-kit      ledger task (rules.md §3 code features)      project tasks
    goal                    Make the learner half of M1.5 runnable by a human with minimal effort: a within-subject crossover study (no tool vs Mole panel) on ui-tui comprehension tasks, with answer keys, a participant protocol, a response template and a scorer that reports accuracy, time and transfer per arm. Success claim to test later: the Mole panel helps a beginner answer 'who uses this / what breaks / how does A reach B' correctly and faster, and what they learn transfers to a file seen without the tool
    done-when               1) study/m15-learner/README.md: protocol a non-author can run in 45 min (setup of scratch repo copy + VS Code with the extension, 2 task sets x 4 tasks + 2 transfer tasks, counterbalanced order for 4 participants, what to read aloud, what to record); 2) study/m15-learner/tasks.json generated from generated data/m15-tickets.json keys (T06/T07 lenient), human-readable prompts; 3) study/m15-learner/score.mjs scores a responses.json to per-arm accuracy (F1), median time, transfer accuracy, and prints n and a caution when n<8 per arm; 4) a dry run of score.mjs on synthetic responses proves it works and a test covers it; 5) npm run check passes
    status                  2026-10-23 verified      reviewer subagent sa-0-808009dc · findings: 2 validity defects fixed (ignore-tests clause vs test files in copy, transfe
    next                    merge → ledger move <task> integrated --merge … (ledger reruns checks in the repo)
    pinned
    mode                    code
    boundary                study/m15-learner/** (new) · packages/daemon/bench/m15/study.test.* if needed · context notes
    checks                  npm run check
    non-goals               no recruiting, no running humans, no simulated participants counted as evidence, no product code changes
    proof                   node study/m15-learner/score.mjs on the synthetic fixture + npm run check
    stop                    stop if the extension cannot be launched from README steps on a clean scratch dir
    came from               plan M1.5 learner half; USER 2026-10-22 'in accordance with my original thoughts'
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 any
```
