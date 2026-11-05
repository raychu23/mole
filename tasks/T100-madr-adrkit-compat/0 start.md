## Summary
status (11-05)   MERGED into main 70f7445 · older status lines below are history
T100-madr-adrkit-compat (wave H, H2). D71 ("Build vs take") already chose MADR + adrkit's `affects` field;
this task closed the implementation gap backlog tracked as `init-madr-fields-gap`: Mole's loader now reads,
and `mole init` now writes, real MADR 4 metadata (`date`/`decision-makers`/`consulted`/`informed`) and
adrkit's `affects`, without losing Mole's own `rules:` extension or breaking any pre-existing
`.mole/decisions` file. Interop proven against adrkit's own CLI. Round-2 review (`deleg_9dadfbcf`) FAILed 5
findings (CRITICAL: `affects` folded into scope with a literal, non-glob anchor check, flagging every real
use -- including `mole init`'s own scaffold -- red; HIGH: a personal name in the public docs; 2x MEDIUM;
item 5 behavior-change note) -- all fixed, see `4 log/round2-review-fix.md`. Done; branch not merged.

## Goal / scope
- `packages/decisions/src/graph.ts` `loadMoleDecisions()`: parse MADR 4's `date`, `decision-makers`
  (+ legacy `deciders:`), `consulted`, `informed` (sequence or comma-separated scalar) and adrkit's
  `affects` (`{type, pattern}` list) onto `GraphNode`; fold `affects` into `scope`/`applies_to` edges.
- `packages/decisions/src/types.ts`: add the new optional `GraphNode` fields.
- `packages/daemon/src/init.ts`: `mole init`'s example record now includes `date`, `decision-makers`,
  `affects`, alongside the existing `rules:` block.
- `docs/decisions-and-rules.md`: new "MADR 4 and adrkit compatibility (D71)" section with the interop
  findings.
- `context/product-plan/systems/build-backlog/backlog.json`: `init-madr-fields-gap` updated from `open` to
  `partly_integrated` with the result (not integrated into main yet).

## Acceptance
- Back-compat: `packages/decisions/test/parser.test.ts` (pre-existing, untouched) still 6/6 green.
- New tests, red saved then green: `packages/decisions/test/madr4-adrkit.test.ts` (6 tests) and one new
  case in `packages/daemon/test/init.test.ts` (21/21 green including it).
- Interop: `npx @adrkit/cli@0.20.0 lint`/`migrate` run against a `mole init`-written file (scratch, not
  committed); findings recorded in prior-art.md and docs/decisions-and-rules.md.
- `npx tsc -b` (whole worktree) clean.

## Evidence
- `4 log/red.txt`: RED run of madr4-adrkit.test.ts against pre-implementation graph.ts/types.ts (4/6 failing,
  as expected -- the 2 passing ones were cases with no new behavior yet, e.g. no-affects back-compat).
- `4 log/prior-art.md`: MADR 4 template, log4brains, adrkit -- fetched/dated 2026-11-05, plus the adrkit
  interop test transcript.

## Open / NOT RUN
- log4brains itself was not run against a Mole file (adrkit's `adr lint`/`migrate` already satisfied the
  "prove interop with an installable ADR tool" acceptance; running a second tool was not required by the
  brief's "whatever installs ... or").
- `mole decisions --export madr` was evaluated and judged unnecessary: `.mole/decisions/*.md` already is
  MADR 4 after this task, so there is nothing distinct to export (documented in docs/decisions-and-rules.md).
- Not merged: branch `ledger/t100-madr-adrkit-compat` in worktree `../Mole-worktrees/T100-madr-adrkit-compat`
  (shared rules: never merge/push from this task).
