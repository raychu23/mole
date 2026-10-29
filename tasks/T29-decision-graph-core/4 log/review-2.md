```notes
T29 review 2      (fresh reviewer · 2026-10-29 06:39-06:45 · fix commit fb240ab on a657784, contract = 0 start.md + 2 insights.md §0, round 1 = review-1.md)
    verdict             verified: no P0/P1 remains. P1-1, P2-1 and P2-2 are fixed, and the frozen key/tests are untouched.
                        2 P2 remain: P2-3 from round 1 was not addressed, and there is 1 new residual P2 next to P1-1. Neither blocks the merge.
    P2-A  superseded_by naming an id that exists but is not a decision, or naming the record itself → green, no problem reported
        what            The P1-1 fix only covers an id that is missing (`!o`). Two cases still fall through to green with no reason and no problem line:
                        - when `o` exists but is a tenet or an incident, relFlag returns at `o.kind !== 'decision'`
                        - when the record names itself (A superseded_by A, or A supersedes A), it is also green
                        The self case is older than this fix: round-1 probe.mjs case 14 already showed it.
        why             §0 red rule: "superseded_by set". It is the same silent-green class as P1-1, but it needs nonsense input
                        (a wrong kind of id, or a self-reference), so it rates P2, not P1.
        repro           node ~/.hermes/cache/scratch/t29-r2/probe3.mjs   (cases E, F)
        observed        E: green A accepted []   (superseded_by: [tenet-1], with tenet-1 present)
                        F: green A accepted []   (superseded_by: [A])
                        Neither case prints a problem line.
        fix             In relFlag, take the written-in-target supersedes branch before the `o.kind` check. Treat a self-edge
                        or a non-decision `o` as red, with text "superseded by X (not a decision)". Or report it as a problem at e.file:e.line.
    P2-3  (round 1, not addressed) in a cycle a record inherits its own flag back
        repro           node ~/.hermes/cache/scratch/t29-review/probe.mjs   (case 4)
        observed        unchanged: yellow A ["yellow scope_changed .mole/decisions/a.md:7","yellow inherited .mole/decisions/a.md:5"]
                        The flag is still right. Only the reason list is noisy.
    checked, no finding
        frozen key/tests
                        `git diff 53aafc6 HEAD -- bench/m21-key.json bench/m21.ts test/parser.test.ts test/flags.test.ts test/cli.test.ts` → empty
                        fb240ab touches 4 files:
                        - flags.ts
                        - graph.ts
                        - a new test/review-fixes.test.ts
                        - .mole/decisions/0015
        new tests are red without the fix
                        Method: copy src from fb240ab^ and from fb240ab into scratch, add review-fixes.test.ts to each, and run vitest in each.
                        Old src: 3/3 fail
                        - P1-1: expected 'green' to be 'red'
                        - P2-1: problems []
                        - P2-2: problems []
                        New src: 3/3 pass
                        Assertions are concrete: flag, code, file and line 5, the ZZZ text, and lines 4/1 and 5/6.
                        They also check that the known tenet-1 is not reported.
        P1-1            The round-1 CLI reproducer (mktemp repo, `superseded_by: [ZZZ]`) gives:
                        - red A a .mole/decisions/a.md:1
                        - red superseded: superseded by ZZZ (not found) .mole/decisions/a.md:5
                        - problem .mole/decisions/a.md:5: supersedes: unknown id ZZZ
                        probe2 case C → red. Mole and Nygard now agree: case B is still red.
                        `supersedes: [ZZZ]` (case H) stays green with a problem line. That is correct: A is the successor.
                        A proposed record with superseded_by unknown is red (case G). That matches the existing behaviour for a known id (cases K, L).
        P2-1            Results:
                        - probe2 case A: problem a.md:4 unknown status 'acepted', and b.md:1 no status
                        - an empty `status:` (case J): problem at :4 "no status"
                        Only Mole-format records are checked. Nygard ADRs are not, which is the scope round 1 asked for.
        P2-2            Results:
                        - probe2 case D: problem a.md:5 traces_to: unknown id tenet-9
                        - an incident naming a missing decision (case I): problem i1.md:4 evidence_for: unknown id NOPE
                          Round 1 suggested excluding evidence_for. Reporting it is still a true dangling reference, so this is not a finding.
                        - malformed values from the round-1 probe give extra but true lines: "traces_to: unknown id 5", "supersedes: unknown id null"
        0015 edit       The commit removes `alternative_to: [elk-layered]` and keeps that information in the body.
                        In §0, alternative_to is a Kruchten decision-to-decision relation, and elk-layered is not a record.
                        So the old line would now be a true dangling-id problem. Removing it is a data fix, not masking a bug.
        no new false problems
                        - `node packages/daemon/dist/cli.js decisions --root .` → 0 problem lines. 13 records: 0 red, 4 yellow, 9 green, 0 grey (same as round 1).
                        - All 6 ADR corpora load with 0 problems: backstage 15 nodes, govuk-aws 38, and the 4 historical parent/child snapshots 13-14 each.
                          Script: ~/.hermes/cache/scratch/t29-r2/corp.mjs
        bench           `node packages/decisions/dist/bench/m21.js`
                        - recall 100% (38/38), false flags 0% (0/38), false flags over all records 0/372
                        - recompute p95 496 ms, model calls 0 → exit 0
                        - load avg 50-63 on this machine (`uptime` 06:39-06:40)
        vitest          `npx vitest run packages/decisions` → 4 files, 37/37 pass (load ~45)
        build           `npm run build` (tsc -b) → exit 0
        not run         The full `npm run check`. Other packages' timeouts are environmental per the brief.
```
