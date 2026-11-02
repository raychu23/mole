# T55 insights — dense bulk load

## Summary
The incremental engine now builds the whole graph once and runs one grounded pass when it starts, instead of adding
edges one at a time. The dense ICCMA19 5,178-argument graph loads in ~148 ms (was >20 s). A fresh review passed.
Open: which attacker `why.defeatedBy` names can differ by input order (pre-existing, labels always agree).

```notes
review          deleg_221062b4 (11-02 17:41) PASS      probes in /Users/a1/.hermes/cache/scratch/t55-review/
    equal           duplicate edges · self-attacks · audience filter then remove/re-add · removeArg · empty graph
                    40 seeds × 60 args/250 attacks + 100-step random edits = evaluate() at every step
    speed           1,500 args / 20k attacks: 23.8 ms new vs 23.5 s old constructor (0029416), same labels
    stricter        empty id now throws (old ctor allowed it; evaluate() already threw) = done-when "validation consistent"
    note (low)      why.defeatedBy witness depends on attack insertion order, also in 0029416 · not a blocker
merge           main 1606126 (not pushed, D49)      full npm run check on main → /Users/a1/.hermes/cache/scratch/mole-build/main-check-t55.txt
```
