# T116 incident-revival-powered — results (n=6, PEPs only) — 2026-11-08

```notes
T111-defect fix  the single most important result of this task: for every one of the 6 cases,
               `mole incident suggest --phase before`'s candidate_set_size = 2 (never 1). T111's arm A
               was a tautology (size-1 candidate set, 3/3 "recall" that could never have been wrong);
               this task's arm A actually misses 2/6 cases. The structural gate is for the first time
               being measured, not just exercised end-to-end.
losses first   mole incident suggest (arm A) MISSED 2/6: py-finally-controlflow (picked the
               "change-semantics" distractor over the real winner pep601-forbid -- char-3gram Jaccard
               scored the distractor 0.194 vs the winner's 0.166, because the distractor's text happens
               to share more surface vocabulary with the incident report) and py-enum-type (picked
               PEP 354's functional design over the real winner, flufl-style-class-enum -- PEP 354's own
               rejected text shares more raw tokens with the 2013 incident text than flufl.enum's does).
               BM25 (arm B) MISSED 4/6 -- it has no structural gate at all and in 3/6 cases ranked the
               ORIGINAL (losing) decision's own text above either dissent, because an incident report
               restates the problem the original decision caused, which shares vocabulary with that
               original decision's own text (same failure mode as T111's gh-actions-token BM25 miss).
               LLM baseline (arm C, Sonnet-5) got 6/6 -- see the memorization caveat below before reading
               that as "the model reasons well".
headline       On this SMALL (n=6, EASY-ish per-case: exactly 3 options, 2 real candidates after the
               structural gate), PEP-only pilot: mole incident suggest (arm A, real CLI, no model) 4/6
               (67%) -- a REAL, non-tautological measurement this time; BM25 (arm B) 2/6 (33%); LLM
               baseline (arm C, Sonnet-5) 6/6 (100%, memorization caveat applies). Wilson 95% CIs on n=6
               are wide and overlap (A [0.300,0.903], B [0.097,0.700], C [0.610,1.000]) -- NO claim of a
               significant difference between any two arms is supported at this n.
memorization caveat (arm C)   4/6 cases resolve in 2023-2025 (post many models' training cutoffs, chosen
               deliberately per the Q5b goal's "prefer post-training-cutoff 2025-26 cases" instruction),
               but PEP 601/765, PEP 722/723, PEP 554/734, PEP 665/751, and PEP 563/649/749 are all
               Python's own extensively-blogged, extensively-discussed public PEPs -- "famous" within the
               Python community even when recent, and PEP 354/435 (enum) is 2005-2013 Python history any
               LLM almost certainly has memorized verbatim. Arm C's 6/6 cannot be read as "the model
               reasoned over the supplied incident/option text" rather than "the model already knew which
               PEP shipped" -- same caveat T111 raised, not resolved by choosing newer PEPs (PEPs are
               published, discussed, and summarized immediately, unlike e.g. undisclosed CVEs).
```

## Numbers (recall@1, pooled Wilson 95% CI, k/n=6; stats.py wilson(), T93 z-fix applied)

```notes
arm                                k/n    recall@1   95% CI            candidate_set_size (T111 check)
A  mole incident suggest (CLI)     4/6    67%        [0.300, 0.903]    2 every case (never 1 -- FIXED)
B  BM25 (own impl, k1=1.5,b=0.75)  2/6    33%        [0.097, 0.700]    n/a (no structural gate)
C  LLM baseline (Sonnet-5)         6/6    100%       [0.610, 1.000]    n/a (memorization caveat, above)
recall@2                           -      100% all arms -- DEGENERATE: every case has exactly 2 candidates
                                            after the structural gate (see protocol.md limit #3)
```

## Per-case detail (sources: 4 log/cases.json, frozen sha256 4ab5b9d8...180dd3ce)

| case | real trigger (dated) | ground truth (real, dated) | A top | B top | C top |
|---|---|---|---|---|---|
| py-finally-controlflow | Katriel's empirical PyPI study, 2024-11-09 | pep601-forbid (PEP 765, Final) | change-semantics-exception-wins (WRONG) | status-quo-linters (WRONG) | pep601-forbid |
| py-script-deps-format | Steering Council rejects PEP 722, 2023-10-21 | toml-block (PEP 723, Final) | toml-block | toml-block | toml-block |
| py-subinterpreters | PEP 703/684 GIL removal, 2023 | interpreters-stdlib-module (PEP 734, Final) | interpreters-stdlib-module | multiprocessing-only (WRONG) | interpreters-stdlib-module |
| py-lockfile-format | lock-file fragmentation + supply-chain pain, 2023-2025 | standard-lockfile-format (PEP 751, Final) | standard-lockfile-format | standard-lockfile-format | standard-lockfile-format |
| py-annotations-eval | chronic runtime pain w/ stringized annotations, 2017-2022 | deferred-eval-function (PEP 649/749, Final) | deferred-eval-function | stringized-annotations (WRONG) | deferred-eval-function |
| py-enum-type | python-ideas enum thread, Jan-Feb 2013 | flufl-style-class-enum (PEP 435, Final) | pep354-functional-enum (WRONG) | int-constants (WRONG) | flufl-style-class-enum |

Raw evidence: `4 log/arms_AB_raw.json` (arm A's real `mole incident suggest --phase before` JSON output,
including every candidate's score, for every case; arm B's BM25 scores), `4 log/armC_prompts.json` +
`4 log/armC_out_*.txt` (exact prompts and raw `hermes -z` stdout, cmd:
`hermes -z "<prompt>" -m claude-sonnet-5 --provider anthropic -t "" --safe-mode`).

## Why this is n=6, not the n=30-60 powered study the queue goal describes

- The queue goal (Q5b/T116) asks for n=30-60 across PEPs, Rust RFCs, and KEPs. This pass built and ran
  n=6, PEPs only, in the ~3h timebox the queue brief allows ("if you can't reach n=30 in a ~3 hour
  timebox, freeze what you have and run descriptively") — that condition was hit: this task's remaining
  scope (Rust RFC + KEP sourcing, plus scaling PEPs past 6 of the 31 real `superseded_by` pairs the
  official API lists) is flagged as NOT RUN below, not silently dropped.
- **What WAS fixed vs T111**: every case has >=3 options (1 winner + 2 dissents), giving
  `mole incident suggest`'s structural gate a real candidate_set_size=2 in every case — T111's arm A was
  a tautology (gate collapsed to 1 candidate by construction); this task's arm A is a real, scoreable
  measurement with real misses (4/6, not 3/3).
- **What is STILL not fully met** vs the reviewer's T111 design: the goal calls for n=30-60 and
  "independently dated dissent quotes" for every option. 4/6 cases meet the independent-pre-dating bar
  for ALL their non-winning options (722/723, 554/734, 665/751, 354/435's two dissents); 2/6 cases
  (py-finally-controlflow, py-annotations-eval) have one dissent that is NOT independently pre-dated
  (flagged per-option in cases.json and protocol.md limit #1) — included only to reach the >=3-option
  structural requirement, not hidden as if it met the bar.

## NOT RUN

- Rust RFC cases (`postponed` label / `superseded-by` link in rust-lang/rfcs) — not sourced this pass.
- KEP cases (`status` in {Deferred, Withdrawn, Replaced} in kubernetes/enhancements) — not sourced this
  pass.
- Scaling PEPs past n=6: `peps.python.org/api/peps.json` lists 31 real `superseded_by` pairs total (dated
  04-Jun-2009 through 29-Jul-2021 for the originals); only 6 were hand-built and verified this pass. The
  other 25 are candidates for a follow-up session, not a new search (`4 log/prior-art.md` lists all 31
  with dates).
- Varying option count per case (3-6, not a fixed 3) so recall@2/@3 would be non-degenerate — this pass's
  6 cases all use exactly 3 options (protocol.md limit #3).
- A McNemar or other paired significance test between arms A and B/C — n=6 is underpowered for this
  (Wilson CIs already overlap substantially); not attempted, would be noise at this n.
