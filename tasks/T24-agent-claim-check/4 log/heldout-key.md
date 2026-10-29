# T24 held-out key (round 8, review-2 P1-1 "measure on answers the rules were not tuned on")

```notes
key                     .mole/local/bench/m16-heldout-key.json (gitignored: quotes chat text); same bytes in the main checkout's
                        .mole/local/bench/. Scored by tasks/T24-agent-claim-check/heldout.mjs (checks this sha first), reported
                        by run-check.sh in the runs.jsonl metric string. Not part of the frozen M16 bench.
    sha256              e86a63dad1d4259f26e1cba92078131bd952532e64fb1f14633ce6d79bf7ac3c
    written             2026-10-29T09:33:03-05:00 (field `written`), before any round-8 change under packages/agentstate/src/claims
    answers             16 turn-final answers, all Hermes, 2026-10-28/29: 11 subagent hand-ins + 5 coordinator chats
    claims              158 = 157 supported · 1 unsupported · 0 contradicted (1 flagged)
    by category         commit 49 · test 48 · file 32 · exit 19 · merge 6 · fix 4
    flagged             HO14 (local-55524a…) "The review's two blocking problems are fixed": the fix was a subagent's; the
                        coordinator's own run shows a passing check + the P1-2 guard, nothing for P1-1
    sessions            20261028_143439_0597d8 · 20261028_211534_646a55 · 20261028_214416_f5b1a9 · 20261028_220600_39e9f9 ·
                        20261028_220600_b6f243 · 20261028_223339_363331 · 20261029_013813_b9e17d · 20261029_051818_c1356b ·
                        20261029_054613_fdef49 · 20261029_063134_955737 · 20261029_075621_e3a422 · local-989260337115… ·
                        local-bfda5a42e91c… · local-55524a2e3241… · local-fdb14cadc65d… · local-2ad9a1419717…
    excluded            every M16 key session and review-2's 8 (0b96ae b21361 eaf90d a4c3c9 336cd0 c06d2c d2dba8 36b71b)
method                  hand labels, independent of the code under test: per answer I listed every checkable claim (whole answer,
                        not headline-only), then read the run's own tool rows before the answer with a read-only sqlite grep
                        helper (commands + outputs) and decided each label by hand; the evidence row is in each claim
rule                    labels as in m16-key.json. Scoring: a tool flag (unsupported/contradicted) is correct only if its span
                        overlaps a key claim labelled unsupported/contradicted, so a flag on a non-claim or a supported claim is
                        wrong; precision = correct flags / all flags; recall = flagged key claims overlapped by a tool flag / 1
limits                  only 1 flagged claim: recall on this key is 0/1 or 1/1 and says little; precision is the useful number.
                        No Claude Code answer (none dated 10-28/29 outside tool-trial scratch dirs). One labeller.
```
