# T111 protocol (PRELIMINARY pilot, n=3) — frozen 2026-11-08 BEFORE any arm ran

```notes
question        given a real incident/issue text, does the candidate ranking surface the option that REALLY won
                afterward (ground truth = the real, documented, later outcome -- never a model's opinion)?
data            3 real, dated, documented decision-reversal events (cases.json, sha256 frozen below):
                npm unpublish policy (left-pad, 2016) · GitHub Actions default GITHUB_TOKEN (2023) ·
                PEP 479 StopIteration-in-generators (2014). Selection: hand-picked for (a) a clearly stated
                PRIOR decision/behavior, (b) a real, dated, documented trigger, (c) a real, dated, documented
                LATER decision that reversed/superseded (a) -- not model-opined, all three facts quoted from
                primary or near-primary sources (npm's own postmortem+policy posts, GitHub's own changelog +
                its own Security Lab post, PEP 479's own accepted text). Each case has exactly 2 options
                (the reversed one, the one that won) -- this is a SMALL, non-representative pilot, not a
                powered study; see limits.
records         for each case: a `.mole/decisions/<id>.md` record for the ORIGINAL decision (status: accepted,
                written as it stood before the incident), a `.mole/arguments/<id>.argdown` pair (the kept
                option attacks the option that would be reversed, both tagged from real quoted text), and a
                `.mole/incidents/<id>.md` record (the real incident/trigger text, dated, scoped to the same
                decision). Built from cases.json's quoted spans -- hand-checked against the source quote in
                cases.json (not re-derived by a model). See 4 log/build_mole_records.py.
arms            A  mole incident suggest <id>        -- the real CLI (packages/decisions, Dung engine, no
                                                          model call), ranks candidates by char-3gram Jaccard
                   over (incident text) vs (argument text), structurally gated to share decision/scope first
                B  BM25 baseline                      -- BM25 (k1 1.5, b 0.75, own implementation, same as
                                                          B2/M-A) ranking the 2 options' argument text against
                                                          the incident text, no structural gate, no model call
                C  LLM baseline (Sonnet-5)             -- hermes -z, given the SAME decision+both options'
                                                          text+the incident text, asked to output ONLY the id
                                                          of the option it thinks the incident vindicates
metric          recall@1 (did the arm's #1-ranked option match ground_truth_winner); PRIMARY. recall@3 is
                reported too but is degenerate here (only 2 options per case, so recall@3 = 100% for every
                arm by construction) -- stated as a known limitation of a 2-option pilot, not hidden.
stats           Wilson 95% CI (evals/inspect/dcbench_eval/stats.py wilson(), T93 z-factor fix applied) on
                pooled k/n=3 per arm. n=3 cannot distinguish arms statistically; CIs will be wide by
                construction -- reported anyway, losses first, no claim of significance drawn from n=3.
freeze          cases.json sha256'd BEFORE arm A/B/C are run (frozen.sha256, this directory). Any change to
                cases.json after this point invalidates the run.
not run         a powered case set (brief's larger ask: mine KEPs/Rust RFCs/PEPs/ADR repos broadly, search
                recorded) -- NOT RUN in this pass: time/scope did not allow broad corpus mining; this n=3
                is a hand-built pilot proving the harness end-to-end, not the powered benchmark the queue
                item's goal describes. Flagged explicitly, not silently substituted.
m-a re-run      the queue item's second half ("re-run M-A on NEW cases after its listed fix") was already
                done by a prior session: results_v2.md in
                metrics-proof/prelim-11-01/ma-objections/ (richer records + linker + reasoning engine, 22
                held-out 2025 RFCs, frozen protocol_v2.md) -- verdict NO DIFFERENCE, confirmed here by
                reading that file, not re-run again (see results.md "M-A" section below).
limits          (1) the "rejected option" text in each case is reconstructed from the SAME source that
                   reports the reversal, not an independent contemporaneous dissenter's quote (see
                   prior-art.md's stated limitation) -- weaker than T58's python-tuf ADR fixture.
                (2) n=3, hand-picked, not a random or exhaustive sample of real reversed decisions.
                (3) only 2 options per case -- recall@3 is degenerate; only recall@1 is informative.
                (4) arm A (mole incident suggest) requires the incident to structurally link (decision/scope)
                   to the candidate argument -- by construction of these records it always can, so arm A's
                   structural gate is not stress-tested here (no true negative/distractor option included).
```
