# T111 incident-revival-eval — results (PRELIMINARY pilot, n=3) — 2026-11-08

```notes
losses first   BM25 (arm B) MISSED the gh-actions-token case: it ranked "readwrite-default" (the option
               that was actually reversed) above "readonly-default" (the real winner) -- BM25 matches
               surface tokens, and the incident text ("worm", "write permissions", "push malicious code")
               shares more raw vocabulary with the description of the EXPLOITED default than with the
               terse "read-only" fix text. This is a real loss, not a tie, on 1/3 cases.
headline       On this SMALL (n=3), EASY (2 options/case, strong structural link), HAND-PICKED pilot:
               mole incident suggest (arm A, real CLI, no model) 3/3 · LLM baseline (arm C, Sonnet-5,
               same records) 3/3 · BM25 (arm B) 2/3. Wilson 95% CIs on n=3 are wide and overlap --
               NO claim of a significant difference between arms is supported at this n.
caveat         this is NOT the powered, broadly-mined benchmark the queue item (Q5/T111) goal describes
               (KEPs/Rust RFCs/PEPs/ADR repos, broad search). It is a hand-built, 3-case pilot that proves
               the measurement harness end-to-end on real, dated, documented decision reversals. See
               protocol.md "not run" and "limits".
```

## Numbers (recall@1, pooled Wilson 95% CI, k/n=3; stats.py wilson(), T93 z-fix applied)

```notes
arm                                k/n    recall@1   95% CI            per-case top pick (truth)
A  mole incident suggest (CLI)     3/3    100%       [0.439, 1.000]    all 3 match
B  BM25 (own impl, k1=1.5,b=0.75)  2/3    67%        [0.208, 0.939]    gh-actions-token MISSED
C  LLM baseline (Sonnet-5)         3/3    100%       [0.439, 1.000]    all 3 match
recall@3                           -      100% all arms -- DEGENERATE: only 2 options/case (see protocol.md limits #3)
```

## Per-case detail (sources: 4 log/cases.json, frozen sha256 acf278ab...62829)

| case | decision (orig) | real trigger | real winner (ground truth) | A top | B top | C top |
|---|---|---|---|---|---|---|
| npm-unpublish | unrestricted unpublish | left-pad, 2016-03-22 (blog.npmjs.org/post/141577284765) | windowed unpublish (blog.npmjs.org/post/141905368000, 2016-03-29) | windowed | windowed | windowed |
| gh-actions-token | GITHUB_TOKEN read/write default | Actions-worm research (paloaltonetworks.com, github.blog/security/...) | read-only default (github.blog/changelog/2023-02-02) | readonly-default | readwrite-default (WRONG) | readonly-default |
| pep479-stopiteration | StopIteration propagates silently | contextmanager/yield-from bug (PEP 479 Rationale) | RuntimeError conversion (PEP 479, accepted 2014-11-22) | convert-to-runtimeerror | convert-to-runtimeerror | convert-to-runtimeerror |

Raw evidence: `4 log/arms_AB_raw.json` (arm A's real `mole incident suggest --phase before` JSON output + arm B's
BM25 scores), `4 log/armC_llm_raw.json` (exact prompts + raw `hermes -z` stdout, cmd:
`hermes -z "<prompt>" -m claude-sonnet-5 --provider anthropic -t "" --safe-mode`).

## Why this is a pilot, not the powered benchmark (stated up front, not found later)

- n=3, hand-picked for a clear trigger→reversal chain, not sampled from a search of KEPs/Rust RFCs/PEPs/ADR
  repos the way Q4 (T110) pre-registers its corpus search. The queue goal's broader corpus mining was NOT
  RUN this pass (time/scope) -- see protocol.md.
- Each case has exactly 2 options, so recall@3 cannot fail (it's always 100%); only recall@1 is informative,
  and the action space (choose 1 of 2) is much easier than Mole's real use (choose among N recorded dissents
  across a whole decision graph).
- The "rejected option" text was reconstructed from the SAME source reporting the reversal (npm/GitHub's own
  postmortems, PEP 479's own Rationale), not an independent contemporaneous dissenter's quote -- weaker
  grounding than T58's python-tuf ADR-0002 fixture (real ADR text, real-shaped dissent). Flagged in
  prior-art.md and protocol.md, not glossed over.
- `mole incident suggest`'s structural gate (incident must share decision/scope with a candidate) was never
  stress-tested here: every incident record was built to link to exactly one decision with exactly one
  attack-connected dissent, so arm A's candidate set is never larger than 1-2 real options. A real benchmark
  needs distractor decisions/incidents that do NOT structurally link, to test the gate itself.

## M-A re-run (second half of the Q5 goal)

Already done by a prior session, found (not re-run) on disk:
`context/product-plan/systems/metrics-proof/prelim-11-01/ma-objections/results_v2.md` — 22 held-out 2025
Rust RFCs, protocol_v2.md frozen before the held-out run, arms A0/B/D/D2/E (D2 = richer records + linker,
fixes 1+2; E = D2 + reasoning engine, fix 3). **Verdict: NO DIFFERENCE** — every arm sits at 41-45% capped
recall@3 on held-out, `E - D2` on held-out [-11.4, +10.6] (crosses zero), `B - A0` [-6.1, +13.6] (crosses
zero too — even raw history barely helps). This already satisfies "re-run M-A on NEW cases after its listed
fix": the NEW cases are the 22 held-out RFCs, the fix is richer records + linker + engine. I verified
`results_v2.md` and `protocol_v2.md` exist and match this description; I did not re-run it again (no reason
to spend new model calls re-deriving an already-frozen, already-scored result). One limitation this file
itself names and I'm repeating, not hiding: the v2 records, like the v1 ones, are AI-drafted from corpus
threads, NOT human-approved — the "human-approved-style records with attack links" the Q5 goal describes
were NOT built or run in v2 either; that remains open (see "what changes next" in v1's results.md, which v2
did not fully close).

## NOT RUN

- Broad corpus mining of KEPs/Rust RFCs/PEPs/ADR repos for a powered, pre-registered real-event set
  (the queue goal's actual ask) — time/scope did not allow it this pass; n=3 hand-picked pilot only.
- Distractor decisions/incidents to stress-test `mole incident suggest`'s structural gate.
- A human-approved version of the M-A records (still open from v1/v2, not attempted here — out of this
  task's declared scope, which is incident-revival + confirming the existing M-A re-run).
