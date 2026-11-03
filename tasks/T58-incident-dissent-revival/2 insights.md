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

## 11-02 18:40 review 1 (deleg_27342d20) PASS on the stop condition, 3 findings fixed tests-first (3 red → green)
- HIGH crash between the 2 writes could not be completed (dissent already 'in' → not a candidate) → accept detects
  the written attack and only adds `revives:`
- MEDIUM 3-hop neighbourhood silently missed a dissent 5 steps away → whole attack-connected component
- LOW block-style `dismissed:\n  - x` refused → appended in the same style
- held: no label/status change without accept · suggest read-only · unicode id refused before writes · dotted ids ·
  '>' in titles inert · two incidents on one dissent (2nd refused) · attacked incident re-labels normally ·
  alsoReinstates = real diff · CRLF kept · 14 tests, decisions 323

## 11-02 18:55 review 2 (deleg_21ad1cbf) FAIL → fixed tests-first (5 red → green)
- HIGH my round-1 crash shortcut ("incident already attacks one attacker → record revives") recorded arguments nobody
  accepted: a knock-on sibling, an unrelated decision's dissent, a hand-written attack → shortcut removed; accept
  now (1) requires a CURRENT candidate, (2) writes `revives:` first, (3) then the attack. A crash leaves `revives:`
  without the attack; a re-run sees the person's record and writes only the missing attack. No guessing
- HIGH no hop limit made suggest O(N·E) + one dry-run evaluation per candidate: 10k chain 71 s → adjacency BFS,
  attacker index, file-line cache, dry run only for the top 20 shown (Graphiti `limit`) or the one accepted: 450 ms
- LOW blank/comment lines inside a block list broke the duplicate check → scanned through
- not ours (pre-existing loader, follow-up): mixed indentation in a block list drops the whole incident record
- 18 T58 tests · decisions 327 · replay unchanged (ADR-0002 holds → defeated, abandon shown as knock-on)

## 11-02 19:00 review 3 (deleg_9d69be3e) FAIL → redesigned (2 red → green), not patched again
- both HIGHs, one root cause: a 2-file accept needs a "complete it on re-run" path, and no re-run can prove what the
  person approved (a hand-added `revives:` earned an attack on an unrelated decision; a re-run attacked attackers that
  appeared after the accept)
- now ONE atomic write (temp + rename) of the incident record: `revives: [A]` + `attacks: [frozen IN attackers]`;
  graph.ts loadIncidents turns `attacks:` into the argument `incident-<id>`. `revives:` alone carries no attack;
  incidents.argdown is gone. No crash window, no completion path
- held per reviewer: limit 20 never blocks accepting #21+ · alsoReinstates = real diff on 15 seeds · 10k 348 ms, 50k 2.0 s
- INFERENCE lesson: 3 rounds on crash recovery for a 2-file write → make it 1 write. Same shape as T54 (remove, don't guard)
- 19 T58 tests · decisions 328 · replay: ADR-0002 holds → defeated, one file changed
