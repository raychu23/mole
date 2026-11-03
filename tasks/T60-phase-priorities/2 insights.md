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

## 11-02 19:50 review 1 (deleg_8866ecef) FAIL → fixed tests-first (3 red → green) + same-class siblings
- HIGH the loader keeps an argument's FIRST mention as node.line; a bare `-> <use-kafka>` before its tagged definition
  made valuesOf read the reference line and drop the tag silently (reviewer: 16/200 random frameworks mismatched)
  → new argdown/definitions.ts: every `<id>: text` definition (also inline after an arrow `-> <b>: text`) across all
  argument files the loader reads; tags from there; two definitions with different tenet tags refused, both lines named
- same class fixed: T58 revive.ts argumentText and T56 proposals.ts statementText read node.line too → use the helper
- LOW Date.parse rolled 2026-02-30 into March → round-trip check
- reviewer's probes re-run: repro gives launch {ship-fast in, use-kafka out}; 200-trial property vs engine 0 failures
- not ours (pre-existing T48 loader): self-attack edges dropped silently, no problem reported → backlog
- decisions + proposals 362 tests

## 11-02 20:00 review 2 (deleg_d06cf655) FAIL → definitions now come from the parser itself (2 red → green)
- both HIGHs = my round-1 helper was a 2nd Argdown scanner: it read prose / `[id]: url` links / ```js code outside
  ```argdown fences, and missed `-><id>: text` (no space) that the parser accepts
- fix: parser.ts records every definition (top-level `<id>: text` and inline after an arrow) on the item; loader.ts
  carries them onto the node (GraphNode.definitions, + Builder.addDefinitions for a later file's definition of an id
  already loaded); definitions.ts only reads node.definitions. One parser, one set of fence/arrow rules
- reviewer probes re-run: fence2/fence3 no spurious definitions, no-space arrow tag kept, property 0 failures,
  explain invariant 0 failures · decisions + proposals + plugin 46 files, 385 tests
- INFERENCE: third time this session the fix was "one source" (T58 one write, T59 one rev, T60 one parser)

## 11-02 20:05 review 3 (deleg_c1d6eac9) PASS
- Mole's own repo graph identical before/after (16 nodes, 31 edges, 0 problems; main base 9a569de vs this build)
- parser oracle tests unchanged · round-2 probes clean (property 0/200+300, explain invariant 0/300, fences, no-space
  arrow, absolute lines in fenced blocks) · addDefinitions across 3 files in load order · [x] and <x> same path
- note: argdown nodes now carry `definitions: []` when empty (shape change, nothing depends on key counts)
