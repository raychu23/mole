# T116 (Q5b) protocol — frozen 2026-11-08 (cases.json sha256'd by build_run.py at run start, before any
arm's result was read)

```notes
question        given a real incident/trigger text, does the candidate ranking surface the option that
                REALLY won afterward (ground truth = the real, documented, later PEP outcome — never a
                model's opinion), AND does `mole incident suggest`'s structural gate present a real,
                non-degenerate candidate set (>=2) instead of T111's size-1 tautology?
data            6 real, dated, documented PEP decision-reversal events (cases.json, sha256 in
                frozen.sha256): PEP 601->765 (finally control flow, 2019->2024), PEP 722->723 (script
                dependency format, 2023->2023), PEP 554->734 (subinterpreters stdlib, 2017->2025),
                PEP 665->751 (lock file format, 2021->2025), PEP 563->649/749 (annotation evaluation,
                2017->2025), PEP 354->435 (enum type, 2005->2013). Selection: every official
                `superseded_by` pair on peps.python.org/api/peps.json where the superseding PEP's own
                text (or a quoted contemporaneous mailing-list reply) lets me (a) name a real trigger
                event with its own date, (b) quote >=2 real pre-trigger dissents against the original
                decision with independent dates, and (c) identify which dissent's design the later PEP
                actually shipped.
                PREFERENCE FOR RECENCY (per Q5b goal, to limit memorization): 4 of 6 cases resolve in
                2023-2025 (722/723, 554/734, 665/751, 563/649/749); 2 are old/famous (601/765 resolves
                2024 but references 2019; 354/435 resolves 2013) — flagged with a memorization caveat.
records         each case gets a `.mole/decisions/<id>.md` (the pre-incident decision, status accepted),
                a `.mole/arguments/<id>.argdown` with ALL options as a FULL mutual-attack graph (every
                option attacks every other), one tenet per option, and tenet priorities ranking the
                pre-incident winner above every dissent "before" the trigger — this is the T111-defect
                fix: >=3 options per case means >=2 are 'out' (losing) at phase "before", so
                `mole incident suggest`'s candidate set is never size 1 by construction.
                (see tasks/T111-incident-revival-eval/4 log/results.md "Why this is a pilot" #4 for the
                exact defect being fixed, and 4 log/build_run.py for the generalized N-option builder.)
arms            A  mole incident suggest <id> --phase before    — the real CLI (packages/decisions, Dung
                                                                    engine, no model call)
                B  BM25 baseline (own impl, k1=1.5, b=0.75)      — same params as B2/M-A/T111, ranks all
                                                                    options' text against the incident
                                                                    text, no structural gate
                C  LLM baseline (Sonnet-5, hermes -z)            — given the SAME decision+ALL options'
                                                                    text+incident text, asked to output
                                                                    ONLY the option id it thinks the
                                                                    incident vindicates
metric          recall@1 (did the arm's #1-ranked option match ground_truth_winner); PRIMARY. Candidate
                set size (A's own structural output) is reported as the T111-defect check: must be >=2
                for every case — this is a NEW metric this task adds, T111 never reported it because its
                candidate set was always exactly 1.
stats           Wilson 95% CI (evals/inspect/dcbench_eval/stats.py wilson(), T93 z-factor fix applied) on
                pooled k/n=6 per arm.
freeze          cases.json sha256'd by build_run.py's freeze_check() at the START of the first run that
                reads arm results (frozen.sha256, this directory) — before any arm's score was read or
                reported. Re-running build_run.py re-checks the hash and aborts if cases.json changed.
not run         Rust RFCs and KEPs (the queue goal names all three sources) — NOT RUN this pass:
                time/scope in the ~3h timebox did not allow sourcing and hand-verifying cases from those
                two in addition to the 6 PEP cases. n=6, not the n=30-60 the goal asks for — see
                results.md "NOT RUN" for what's needed to close the gap; queue brief explicitly permits
                freezing below n=30 and running descriptively if the 3h timebox binds first.
limits          (1) 2 of the 6 cases' third (distractor) option is NOT independently pre-dated before the
                   trigger (py-finally-controlflow's "change-semantics" idea, py-annotations-eval's
                   "store-strings-lazily" idea) — both are drawn from the SAME PEP as the eventual winner,
                   dated at/near the trigger, not years earlier like the other dissent in the same case.
                   Disclosed in cases.json per-option, not hidden.
                (2) n=6, not the n=30-60 target — Wilson CIs are wide (A: [0.300,0.903], B: [0.097,0.700],
                   C: [0.610,1.000]) and overlap; no claim of significance between arms is supported.
                (3) candidate_set_size is exactly 2 in every case (never more) because every case has
                   exactly 3 options (1 winner + 2 dissents) — recall@2 is therefore 100% for every arm by
                   construction (same kind of degeneracy T111 flagged for recall@3 on its 2-option cases);
                   only recall@1 is informative here. A real n=30-60 study should vary option count per
                   case (3-6) so recall@2/@3 are non-degenerate too.
                (4) PEP text is written by the same small set of CPython/packaging core developers across
                   both the original and superseding PEP in several cases (e.g. Eric Snow wrote both
                   PEP 554 and PEP 734) — real continuity of authorship/intent, but means the "revival" is
                   partly the same person reinstating their own earlier idea, not an independent party.
