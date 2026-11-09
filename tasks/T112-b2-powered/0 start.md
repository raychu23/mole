# T112-b2-powered (Q6) -- B2 v4.1: review-fix (comment-leakage defect), same new-repo powered run

**Goal:** per queue brief Q6 (revised 11-08) + the fresh-reviewer FAIL on v4: fix v4's comment-leakage
construct-validity defect (verdict narrated in diff comments; no-ADR keyword classifier scored 20/21)
via a pre-labeling leakage gate, re-authored diffs, relabeling, and a rerun of all 5 arms on the same
42 held-out cases.

**Done-when:** v4 kept unchanged as a recorded failed attempt; v4.1 built with mechanical-only
comments + real-looking distractors; leakage gate (keyword classifier + no-ADR LLM vs majority-class
chance CI) passes BEFORE labeling; relabeled (2 models + fixed adjudication), frozen 3x by sha256;
all 5 arms run once on held-out; results-v4.1.md reports losses first, the leakage-gate numbers
(including the first REJECTED run), Wilson CIs, McNemar.

**Status:** DONE. Leakage gate passed on the second case-construction pass (first pass was correctly
rejected by the gate itself -- see evidence log). n unchanged at 82 (40 dev / 42 heldout), still below
the task's ">=175 held-out" ask -- not grown this round (growing it was lower priority than closing
the FAIL finding; same ~18 untouched live ADRs remain available). All artifacts live in
`context/product-plan/systems/metrics-proof/m2-conflict/v4.1/` (gitignored, main checkout only, same
convention as v3/v4 -- this task folder is the git-tracked summary + pointers). v4's own directory
is untouched.

**Next:** grow v4.1's case count using the same ~18 untouched live ADRs (protocol_v4.1.md references
the list), re-running the leakage gate on each new batch before labeling, to approach the 155-175
power band.

See `4 log/v4.1-review-fix.md` for the fix evidence trail; `4 log/evidence.md` for v4's original
(FAILed) evidence trail, kept for history.
