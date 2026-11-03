# T60 prior art — tenets reranked as priorities shift (launch → scale)

## Summary
Value-based argumentation (Bench-Capon 2003) already gives the mechanism: each argument promotes a value, an
*audience* is an ordering of values, and an attack only succeeds if the attacked argument's value is not preferred to
the attacker's. Mole's engine implements exactly that (packages/reasoning/src/engine.ts:31-51, T42). Amazon's tenet
practice (Le-Brun, AWS 2023) says a team writes ≤ 7 tenets "in descending order of priority", used as tie-breakers,
and that the order changes with the phase ("initially … moving fast … as an application scales … drive down the
average transaction cost"). T60 connects the two: a phase is an audience (an ordered tenet list with a start date),
an argument names the tenet it serves, and `mole priorities --compare` shows which decisions flip and why.

```notes
source                          what it says                                                  we borrow
Bench-Capon 2003, J. Logic &    VAF: argument → value; audience = value order; attack A→B     audience = one phase's tenet order ·
Computation 13(3) "Persuasion   succeeds unless val(B) ≻ val(A) for that audience; one        attackSucceeds unchanged (engine.ts:37)
in practical argument using     framework, a justified set per audience
value-based argumentation
frameworks"
Le-Brun, "Tenets: super-        ≤ 7 tenets in descending priority, tie-breakers, "unless you  phase = ordered list of ≤ N tenets (no cap
charging decision-making"       know better ones", the order changes with the phase           enforced), reordering is a record edit
(AWS, 2023-06; quoted in the
human graph 11-01 :230-243)
Mole human graph 11-01 :242     "PHASE node: the tenet order has valid time (launch, scale)"  phase has a `from` date; --at picks the latest
                                                                                              phase with from ≤ date
Argdown tags (#tag) — argdown   statements/arguments may carry #tags                          `#tenet-N` on the definition line = value
.org syntax docs                                                                              (read by Mole; Mole's parser keeps titles only)
```

## Fit check
- Bench-Capon assumes a STRICT total order per audience; tenet lists are exactly that. Ties (two tenets equal) are not
  supported: duplicate rank refused. INFERENCE.
- Arguments without a tag, or tenets not in a phase's list, are unranked → attacks unfiltered (plain Dung), matching
  the engine's own rule. No priorities file = no audience = today's labels (done-when 2).
- Inferring the order from what a team actually decided (A3) is a different, measurable claim; not this task.
