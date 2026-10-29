```notes
T29 review 1      (fresh reviewer · 2026-10-29 06:40 · diff main...a657784, contract = 0 start.md + 2 insights.md §0)
    verdict             changes needed: 1 P1 (superseded_by naming an unknown id stays green), 3 P2. The rest of the contract holds:
                        tests, key, R1/R2/R6/R7, CLI, MCP, boundary and the corpora all checked out.

    P1-1  superseded_by naming an id that is not in the graph → green, not red
        what            A Mole record with `superseded_by: [ZZZ]`, where ZZZ is not a loaded record, gets flag green with no reasons.
                        flags.ts relFlag returns early on `!o` (other node missing) before the `writtenInTarget` red branch.
                        A plain Nygard ADR in the same situation ("Superseded by [9](0009-x.md)", target missing) is red, so the two formats disagree.
        why             §0 red rule: "status superseded/deprecated · superseded_by set · …". The record says it is superseded, and it shows green.
                        That is the silent-green failure done-when 4 is meant to rule out. It happens in real use, e.g. a typo in the id
                        or a successor kept in a folder that was not loaded. No test covers it: flags.test.ts 0042 only uses an existing id ('0007').
        repro           ~/.hermes/cache/scratch/t29-review/probe2.mjs (case C) — or by hand:
                        d=$(mktemp -d ~/.hermes/cache/scratch/t29-review/x-XXXX); cd $d; git init -q; mkdir -p .mole/decisions
                        printf -- "---\nid: A\ntitle: a\nstatus: accepted\nsuperseded_by: [ZZZ]\n---\n" > .mole/decisions/a.md; git add -A; git -c user.name=t -c user.email=t@e commit -qm x
                        node "/Users/a1/Desktop/CS Code/Project/Mole-worktrees/T29-decision-graph-core/packages/daemon/dist/cli.js" decisions --root $d
        observed        green  A  a  .mole/decisions/a.md:1      (Nygard equivalent, probe2 case B: red 0001 superseded docs/adr/0001-a.md:5)
        fix             In relFlag, handle `e.type === 'supersedes' && e.file === t.file` (the relation is written in the target itself)
                        before the `!o` return: red 'superseded' at e.file:e.line, with the text "superseded by ZZZ (not found)".
                        Add a flags test with an unknown superseded_by id. This is a new test, not a key/test change (R2 covers only the red-commit files' expectations).

    P2-1  unknown or missing status turns grey silently
        what            `status: acepted` (typo) or no status line → status 'unknown', flag grey, and graph.problems is empty.
        why             §0 status set = proposed | accepted | superseded | deprecated | rejected, and grey = "proposed or rejected".
                        A typo hides an accepted decision from every check that only looks at green/yellow/red.
        repro           node ~/.hermes/cache/scratch/t29-review/probe2.mjs   (case A)
        observed        grey A unknown []  ·  grey B unknown []  ·  no problem lines
        fix             When a Mole record's status normalizes to 'unknown', push a problem at the status line (or at line 1 when there is no status).

    P2-2  dangling references are dropped without a problem
        what            `traces_to: [tenet-9]` (no such tenet) or overrides/cites naming a missing id → green, no problem reported.
        why             Not a §0 flag rule, but done-when 1 promises reasons at file:line, and a broken link in the graph is the kind of
                        fact the citator should show. Low cost.
        repro           node ~/.hermes/cache/scratch/t29-review/probe2.mjs   (case D)
        observed        green A accepted []
        fix             After loading, report each relation edge whose `to` is not a node as a problem at e.file:e.line
                        (applies_to and evidence_for excluded).

    P2-3  in a cycle a record can inherit its own flag back
        what            In the 3-cycle A→C→B→A, where A's scope changed, A gets an extra 'inherited' reason that goes back to its own change.
        why             The flag is right (yellow either way) and the fixed point terminates. The reason list is noise and
                        contradicts the builder note "propagation ignores reasons the child itself caused".
        repro           node ~/.hermes/cache/scratch/t29-review/probe.mjs   (case 4)
        observed        yellow A ["yellow scope_changed .mole/decisions/a.md:7","yellow inherited .mole/decisions/a.md:5"]
        fix             Carry an origin set on inherited reasons and skip a parent reason whose origin includes the child.

    checked, no finding
        R1              53aafc6 (05:32:43 -0500) = bench + key + 3 test files + a typed stub where every function throws.
                        Key "written" 2026-10-29T10:24:30Z (05:24 CDT) < impl a657784 (05:38:58).
        R2              git diff 53aafc6 a657784 -- bench/m21-key.json test/ bench/m21.ts → empty
        R7              No test files outside packages/decisions changed.
        key             Hand labels come from construction plus a `statusRead` table copied from each ADR's Status line.
                        No label is derived from the implementation.
        tests vs done-when
                        - 4: the only scope path deleted → red 'orphaned' at the scope line, plus `.not.toBe('green')`.
                          Every anchor gone (symbol + file) → red. Missing folder → red.
                        - Partial anchor loss → yellow anchor_gone at the line.
                        - Whitespace- and comment-only edits → green. An edit outside the scope → green. Re-confirm → green.
                        - A proposed record that conflicts/supersedes/overrides → yellow; the proposal stays grey.
                        - Accepted supersedes → red, and overrides propagate.
                        - Retired tenet → red plus inherited reasons.
                        - Fixed point along traces_to/overrides/cites, with a cycle.
                        - Evidence missing (name gone, file gone, incident missing) and evidence failing (vitest report).
                        - ADR formats (Nygard / backstage).
                        - Malformed front matter → file:line.
                        - The CLI JSON shape, and file:line on every reason.
                        The MCP tool list uses toContain; the MCP output is asserted equal to the CLI JSON.
                        Expectations are concrete (codes + lines), not presence-only.
        my probes       (probe.mjs) All of these behaved correctly:
                        - Symbol renamed → red orphaned.
                        - Comment-only edit in a symbol, and in the same file → green.
                        - A whitespace or `//` change inside a string literal → yellow.
                        - Malformed YAML (tab, list root, no front matter, duplicate ids) → problems at file:line, no crash.
                        - A non-git dir.
                        - A `../` path outside the root → orphaned.
                        - conflicts_with written on the accepted side → yellow.
        CLI             `mole decisions --root .` and `--json` work and print file:line on records and reasons.
                        A bad --adr-dir becomes a problem line. A missing --test-report exits 1 with the error.
                        Dogfood: 0007, 0008, 0009 and 0013 are yellow, because the one cli.ts line changed their scope after 53aafc6. This is correct by the rules.
        MCP             mole_decisions is registered in packages/mcp/src/server.ts only. The cli.test MCP case passes.
        boundary        Outside packages/decisions/**: .mole/**, one line in daemon/src/cli.ts, mole_decisions in mcp/src,
                        and wiring (root tsconfig, daemon/mcp package.json + tsconfig refs, package-lock). Nothing else.
        corpora         NOTICE.md present.
                        - backstage/ and govuk-aws/: `diff -r` against the clones at e8c4d056 / 81ee9f6e shows the .md files identical
                          (govuk images left out, as NOTICE says).
                        - mole/ snapshot: identical to `git show 491dd7e:<file>` for every file.
                        - Historical snapshots spot-checked against raw.githubusercontent.com: backstage 3ecfb121859 adr014 identical;
                          govuk 52979fc8 and 52979fc8^ 0004 identical. The blobless clones cannot `git show` offline.
        vitest          npx vitest run packages/decisions → 3 files, 34/34 pass (load 58)
        bench           node packages/decisions/dist/bench/m21.js
                        - run 1, load 92 on 8 cores: recall 100% (38/38), false flags 0% (0/38), p95 1987 ms, model calls 0 → exit 1 (p95 target missed)
                        - run 2, load 58: same recall/false flags, p95 914 ms, model calls 0 → exit 0
                        - builder log, load ~38: p95 322-375 ms
                        Reading: environmental, but the headroom is small on a loaded machine. Worth one quiet-machine rerun for the proof row.
        not run         The full `npm run check`. Builder rounds show only 5 s timeouts in other packages at load 38-130 (environmental per the brief).
```
