# T60 insights — tenets reranked as priorities shift (launch → scale)

## Summary
`.mole/priorities.md` lists phases (`## launch · from 2021-01-01`) each with the team's tenets in priority order; an
argument names the tenet it serves with a `#tenet-x` tag. `mole priorities --at DATE` (or `--phase`) runs the reasoning
engine with that phase's order as the audience (Bench-Capon, already in the engine); `mole priorities compare A B` lists
every argument and decision that changes, with the attack that wins in one phase and loses in the other, both tenets
and their ranks. Replay (real python-tuf ADR 0002 + illustrative tenets/phases): ADR-0002 holds at launch, defeated at
scale, explained by one flipped attack. Open: inferring the order from past decisions (A3), floors, UI.

```notes
design          Bench-Capon VAF (engine.ts:31-51 unchanged) · Le-Brun tenets in descending priority · human graph
                "PHASE node: the tenet order has valid time" · prior art 4 log/prior-art.md
no file         no priorities.md → no audience → labels identical to the plain engine (test, done-when 2)
validation      heading form, YYYY-MM-DD, phases in date order, unique names, known tenets, no rank twice, known tag
                tenets — each refused with file:line
explain         per changed argument: flipped incoming attacks (from/to, both tenets, ranks in both phases) or
                `via` = changed attackers when it moved indirectly · decisions: before/after + cited args that changed
boundary        new priorities.ts reads #tags from definition lines itself (graph.root): loader/framework untouched
tests           packages/decisions/test/priorities.test.ts 13 (red 11/11 with the module absent) · decisions 341
replay          4 log/replay.txt · /Users/a1/.hermes/cache/scratch/t60-replay/r
limits          INFERENCE: one value per argument (last tag wins) · strict order only (ties refused) · unranked tenet
                or untagged argument = attack unfiltered (engine rule)
```
