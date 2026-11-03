## Summary
Argdown's loader no longer silently drops a self-attack edge or a duplicate argument id.
Self-relations (support/attack/undercut) now survive parser.ts -> graph.ts -> argumentFramework()
unchanged, matching real @argdown/core's own behaviour (verified by running it directly). A second
`<title>: text` definition for an id already in the graph now emits a Problem naming both
files/lines; a bare cross-file reference to an existing id (normal Argdown reuse) still stays silent.
Grounded label for a bare self-attacker is `undecided`, not `out` — corrected against two primary
sources (Caminada's complete-labelling definition, ICCMA's own IN/UNDEC notation); the GOAL line's
parenthetical ("is out under grounded") was wrong and is overridden by evidence, recorded as decision
D1. Carneades's own Go solver was NOT RUN (no toolchain/network). Mole's own `.mole/decisions` graph
still reports 0 problems (checked against a scratch copy of main). Open: incident-loader-indent
(graph.ts frontMatter/indentation bug) is a different backlog item, out of this task's DONE-WHEN —
left untouched.

```notes
Changed (boundary: packages/decisions/src/argdown/*, + 2 lines in packages/decisions/src/graph.ts):
  - parser.ts addRelation: dropped the `from === to` guard. Real @argdown/core keeps A->A for all
    three relation kinds (prior-art.md #1, run directly: `[A]: a\n  - [A]` -> one `attack` relation).
  - graph.ts Builder.edge: self-loop still dropped for the ADR relation types (supersedes/cites/etc,
    where it's always a typo); kept for supports/attacks/undercuts (`ARGUMENTATION_EDGE_TYPES`), since
    those three are where the drop was actually losing data. Added `nodeLocation(id)` (additive,
    non-breaking) so loader.ts can name the first definition's file:line in a duplicate-id Problem.
  - loader.ts applyParsed: when `b.has(it.id)` AND this occurrence carries its own `<title>: text`
    (`defs.length > 0`) -> push a Problem (`duplicate argument id '<id>': also defined at <file>:<line>
    ...`) before merging definitions (T60's merge behaviour is unchanged, just no longer silent). A
    bare reference with no colon (`<title>` reused to build a relation) is NOT flagged -- that is
    Argdown's own designed behaviour (titles are the id across the whole document set), not a bug.
  - packages/reasoning/src/engine.ts: NO CHANGE. runGrounded already seeds `remaining[A]` to
    `attackersOf(A).size`; a self-attacker's only attacker is itself, which can never become 'out'
    without first being 'in', so A is stuck 'undecided' by construction -- already matches
    Caminada/ICCMA. Traced by hand against engine.ts:70-125.

Tests (red -> green), `tasks/T67-argdown-silent-drops/4 log/{red,red->green}`:
  - red.txt: 7 new tests failing (`npx vitest run packages/decisions/test/argdown-{parser,loader,
    reasoning}.test.ts ...`).
  - green.txt: same targeted run, 40 files / 383 tests passed (full packages/decisions +
    packages/reasoning suite, not just the new tests) after the fix.
  - `npx tsc -b`: clean, no errors.
  - Mole's own graph: `decisions(root, {})` against an rsync copy of the main repo root (read-only,
    not the live worktree) -> `problems: 0`, `decisions: 14` (main has no .mole/arguments/*.argdown
    and no ```argdown fences in .mole/decisions, so this specific check was a low-risk confirmation,
    not a stress test -- recorded honestly).

Decision D1 (self-attack grounded label, see prior-art.md): a bare self-attacker is UNDECIDED, not
OUT, under grounded semantics -- backed by Caminada's complete-labelling definition and ICCMA 2025's
own IN/UNDEC notation (2 independent primary sources). This corrects the informal parenthetical in
this task's own GOAL text; DONE-WHEN #3's actual bar ("matches the Carneades/ICCMA reference") is
satisfied by `undecided`. A self-attacker that also attacks B leaves B undecided too (Dung's
documented self-defeat-poisons-attacked-arguments effect), tested explicitly.

NOT RUN: Carneades's dung.go (github.com/carneades/carneades-4) was not independently executed --
no local Go toolchain, no network to fetch/build it in this worktree. Substituted two other primary
sources for the same semantics question (Caminada 2006 labelling theory; ICCMA 2025 proceedings'
own notation) instead of fabricating a Carneades transcript.

Limits (INFERENCE):
  - INFERENCE: the duplicate-id Problem fires only when the later occurrence supplies its own
    `<title>: text`; a plain `<title>`/`[title]` reference never does, by design (matches Argdown's
    documented cross-document id-reuse semantics, confirmed against the real parser and existing
    tests' "dedupes a relation repeated via a bare reference block" case). If this undercounts real
    duplicates in practice (e.g. two *different* texts attached across 3+ files, where only the 2nd
    def triggers the problem and the 3rd is silently merged into the already-flagged id), that's a
    reasonable default but not stress-tested against a 3-file case.
  - INFERENCE: `ARGUMENTATION_EDGE_TYPES` is a 3-item allowlist in graph.ts rather than a per-loader
    flag; reversible (one-line set literal) if a future EdgeType needs the same self-loop exemption.
```
