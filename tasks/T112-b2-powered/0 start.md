# T112-b2-powered (Q6) -- B2 v4: new-repo powered run, rule-gap fix

**Goal:** per queue brief Q6 (revised 11-08): build a v4 case set using the v3 construction method
(real ADRs + constructed changes) on repos never used in v1/v2/v3, target the v3 power band, fix the
known labeling rule-step-order gap BEFORE labeling, pre-register protocol_v4.md, freeze by sha256, run
T53 (frozen v3 params)/RAG reads-all/reviewer/T46 cascade (file-scoped)/two-sided judge once on the
held-out split.

**Done-when:** protocol_v4.md pre-registered + frozen (sha256) before labeling; 4 new repos found
(>=10 real ADRs each, search logged); cases built + frozen; labeled by 2 models + the FIXED adjudication
rule; frozen again; all 5 arms run once; results-v4.md reports losses first, Wilson CIs, McNemar, the
constructed-vs-real-PR caveat, and links T110's real-history finding.

**Status:** DONE, with an explicit, reported scope cut: n=82 (40 dev / 42 heldout), below the task's
">=175 held-out" ask and below v3's own 155-175-total power target. All artifacts live in
`context/product-plan/systems/metrics-proof/m2-conflict/v4/` (gitignored, main checkout only, per repo
convention -- this task folder is the git-tracked summary + pointers).

**Next:** grow v4's case count using the ~18 untouched live ADRs these same 4 repos still offer
(hand-authored the same non-gameable way -- see protocol_v4.md's "n cut" section for the exact list),
to approach the 155-175 power band for a future, better-powered rerun.

See `4 log/` for the evidence trail (every number's source file, repo search log, run logs).
