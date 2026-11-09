---
status (11-08)   BUILT + RUN. n=6 real PEP decision-reversal cases (sourced from peps.python.org's own
                  `superseded_by` field, each with >=3 real options: 1 pre-incident winner + >=2 real
                  dissents, dated, quoted). Fixes T111's defect: `mole incident suggest --phase before`'s
                  candidate_set_size = 2 in every case (never 1, never a tautology). 3 arms run for real:
                  mole incident suggest 4/6 (67%, real misses this time), BM25 (own impl) 2/6 (33%), LLM
                  baseline (Sonnet-5, hermes -z) 6/6 (100%, memorization caveat -- all 6 are
                  extensively-public Python PEPs). Wilson 95% CIs wide at n=6, overlap -- no claim of
                  significance between arms. NOT the n=30-60 powered study the queue goal describes:
                  PEPs only (no Rust RFCs/KEPs sourced), and 6 of the official API's 31 real candidate
                  PEP pairs used -- flagged explicitly per the queue brief's "freeze + run descriptively"
                  fallback for the 3h timebox, not silently substituted.
state: analysed (n=6 descriptive pilot; the T111-defect fix is verified, the n=30-60 power target is not)
owner: hermes-build
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t116-incident-revival-powered
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T116-incident-revival-powered
base: fed3634
updated: 2026-11-08
---
```notes
T116-incident-revival-powered     ledger task (queue Q5b, from "T111 review design")     project tasks
    goal                   powered real-event study of incident revival: n 30-60 decisions from
                           PEPs/Rust RFCs/KEPs where a later trigger reversed/replaced the decision;
                           >=3 options per case with INDEPENDENTLY DATED dissent quotes from before the
                           trigger; ground truth = the option actually adopted later; arms mole incident
                           suggest (candidate set > 1), BM25, Sonnet-5 (memorization caveat, prefer
                           post-cutoff 2025-26 cases); freeze, losses first.
done-when              cases.json frozen (sha256) BEFORE arm results were read · every case's candidate
                           set >= 2 (T111 defect fixed, verified) · 3 arms run for real with evidence
                           paths · losses reported first · n toward 30-60 (reached 6, timeboxed, see next)
    status                 DONE, SCOPED DOWN TO n=6: the ~3h timebox bound before reaching n=30 (queue
                           brief explicitly permits freezing + running descriptively in that case). All
                           6 cases are real, PEP-sourced, dated, with a verified candidate_set_size=2
                           (the T111 defect is fixed and confirmed, not just claimed). Rust RFCs and KEPs
                           were not sourced this pass -- flagged as NOT RUN, not silently dropped.
    next                   if the n=30-60 power target is still wanted: source Rust RFC
                           (postponed/superseded-by) and KEP (Deferred/Withdrawn/Replaced) cases the same
                           way, and/or build out more of the 25 remaining real PEP superseded_by pairs
                           already identified in prior-art.md.
    evidence               4 log/prior-art.md · 4 log/protocol.md (frozen BEFORE arm results were read) ·
                           4 log/cases.json + frozen.sha256 · 4 log/build_run.py (builds .mole records,
                           runs real `mole incident suggest`, own BM25) · 4 log/arms_AB_raw.json ·
                           4 log/build_armC_prompts.py + 4 log/armC_prompts.json + 4 log/armC_out_*.txt
                           (exact hermes -z prompts + raw output) · 4 log/results.md (losses first)
    pinned
    mode                   one worker
---
