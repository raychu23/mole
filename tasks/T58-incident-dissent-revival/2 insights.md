# T58 insights — incidents revive recorded dissent

## Summary
`mole incident suggest <id>` lists the losing arguments (recorded dissent) an incident may vindicate, with evidence:
the decision it names or the code path it shares, ranked by text overlap. A person runs `mole incident accept <id>
--argument <A>` (or `dismiss`); accept adds the incident as an argument attacking what beat the dissent, so the reasoning
engine brings the dissent back and the decision turns contested/defeated. Decision records are never edited.
Real replay (python-tuf ADR 0002 + an illustrative incident): ADR-0002 holds → defeated, and suggest showed up front
that accepting "parallel" also brings back "abandon" (they lost to the same argument). Open: no UI, no double-loop yet.

```notes
design          plan update 11-01 §6 steps 1-5 · prior art 4 log/prior-art.md (Graphiti invalidation candidates, Dung reinstatement)
candidates      losing (out) argument ≤3 attack hops from a decision's cited arguments · decision named in `decisions:` OR
                its scope overlaps the incident's `scope:` (must share a node; text alone never admits) · ranked by
                char-3gram Jaccard · excludes the decision's own arguments, ones already hit by an incident, decided ones
alsoReinstates  dry run of the accept: every other argument that goes out → in · found by the replay, added test-first
writes          accept: .mole/arguments/incidents.argdown + `revives: [A]` · dismiss: `dismissed: [A]` · both idempotent
                argument first, then record: a crash between leaves an attack w/o `revives:`; re-running accept completes it
ids             incident argument = `incident-<id>`: the record id is already the incident node's (loader keeps the first id)
tests           packages/decisions/test/incident-revive.test.ts 11 (red.txt: 8/8 then the knock-on test red first)
                decisions package 34 files, 320 tests
replay          4 log/replay.txt · /Users/a1/.hermes/cache/scratch/t58-replay/r
limits          INFERENCE: reinstating = attacking ALL in-attackers, which can knock out a premise everyone still believes
                ("finite resources") · shown as alsoReinstates, not prevented · a finer encoding needs attacks on attacks
                (not in the Dung engine) · incident text vs argument text overlap is weak (0.26 for the right one)
```
