---
status (11-08)   PILOT RUN + ANALYSED (Q5, queue item). n=3 hand-built real decision-reversal cases
                  (npm unpublish/left-pad, GitHub Actions default token/worm, PEP 479 StopIteration), each
                  with a real documented trigger and a real documented later outcome (ground truth = what
                  actually won, never a model's opinion). Frozen cases.json (sha256 in 4 log/frozen.sha256)
                  BEFORE any arm ran. 3 arms run for real: mole incident suggest (CLI, Dung engine) 3/3 --
                  but arm A's candidate set is size 1 on every case by construction (the phase gate
                  excludes the accepted option), so this 3/3 is NOT a measured ranking and must not be
                  compared with arm B or arm C; BM25 (own impl) 2/3 (lost gh-actions-token); LLM baseline
                  (Sonnet-5, via hermes -z) 3/3, with a memorization caveat -- all 3 cases are famous
                  incidents whose outcomes are likely in training data. Wilson 95% CIs wide at n=3, overlap
                  -- no claim of significance between B and C. M-A re-run half of the goal already satisfied
                  by a prior session's results_v2.md (confirmed, not re-run). CONDITIONAL FAIL (reviewer,
                  2026-11-08) resolved docs-only: arm A caveat, arm C memorization caveat, and the
                  reviewer's design for a real study (>=3 options/case, independently dated pre-trigger
                  dissent quotes, n=30-60, PEPs/Rust RFCs/KEPs by status field) added to 4 log/results.md.
state: analysed (pilot only, not the powered benchmark the queue goal describes)
owner: hermes-build
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t111-incident-revival-eval
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T111-incident-revival-eval
base: fed3634
reviewer: CONDITIONAL FAIL 2026-11-08 (arm A tautology undisclosed) -- resolved docs-only, this commit
updated: 2026-11-08
---
```notes
T111-incident-revival-eval     ledger task (queue Q5, from "19 fix 2")     project tasks
    goal                   real-event eval of B1 incidents+tenets: real SUPERSEDED/REVERSED decisions with
                           a real documented trigger, .mole records hand-checked against real text, measure
                           does `mole incident suggest` rank the option that LATER REALLY WON (ground truth
                           = real history, not a model's opinion) vs BM25 vs an LLM baseline. Plus confirm/
                           re-run M-A on new cases after its listed fix.
done-when              protocol.md frozen (sha256) BEFORE any arm ran · >=1 real case with a documented
                           trigger and documented real outcome · 3 arms run for real with evidence paths ·
                           losses reported first · M-A status checked
    status                 DONE, SCOPED DOWN: n=3 hand-picked real cases (not the broad KEP/RFC/PEP/ADR
                           corpus search the queue goal describes -- flagged explicitly as NOT RUN, not
                           silently substituted). All 3 arms ran for real against the frozen case set.
                           M-A's "re-run on new cases after fix" was already done by a prior session
                           (results_v2.md, 22 held-out RFCs, NO DIFFERENCE verdict) -- verified, not re-run.
    next                   docs-only fix applied for the CONDITIONAL FAIL (arm A caveat, arm C
                           memorization caveat, reviewer's real-study design); if a powered real-event
                           benchmark is still wanted, that is new scope (broad corpus search +
                           pre-registration), not covered by this pilot.
    evidence               4 log/prior-art.md · 4 log/protocol.md · 4 log/cases.json + frozen.sha256 ·
                           4 log/run_arms_AB.py (builds .mole records, runs real `mole incident suggest`,
                           own BM25) · 4 log/arms_AB_raw.json · 4 log/armC_llm_raw.json (exact hermes -z
                           prompts+output) · 4 log/results.md (losses first)
    pinned
    mode                   one worker
---
