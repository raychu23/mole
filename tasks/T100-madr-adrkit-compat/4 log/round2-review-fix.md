## Summary
Round-2 review (`deleg_9dadfbcf`, task-1.log) verdict: **FAIL**. Fixed all 5 findings in this pass; branch
still not merged (shared rule: never merge/push from this task).

## Findings and fixes

**F1 — CRITICAL.** `affects` was folded into `scope`/`applies_to` regardless of `type`, and `anchors.ts`
`checkAnchor` did a literal `isFile`/`isDir` lookup, so a glob pattern (`src/ui/**`) or a non-path type
(`package`) could never match and read 'orphaned' -- including `mole init`'s own scaffold.
Fix: `graph.ts` now only folds `type: path` entries into `scope`; `anchors.ts` adds `checkGlobAnchor` (glob
metachar detection + `node:path`'s `matchesGlob`, Node 22.5+, against `git ls-files`/a plain walk fallback).
Because `affects` names what a decision *governs* (forward-looking), not asserted-existing code the way
`scope:` is, a glob with zero current matches is only 'orphaned' when git history (`Git.treeAt`) shows it
*used to* match and no longer does -- not merely because nothing has been built yet. Tests:
`packages/decisions/test/madr4-adrkit.test.ts` "T100 review round 2" describe block (dir present -> green,
dir removed since confirmed commit -> orphaned/red, mole-init scaffold right after init -> not red,
package-type entry -> never anchored) + `packages/daemon/test/init.test.ts` "review FAIL #1" case (the real
`runInit` scaffold, via `computeFlags`, not red).

**F2 — HIGH.** `docs/decisions-and-rules.md:77` had `decision-makers: [raymond]`, which the export privacy
scan (`scripts/export-public.mjs`) blocks. Fix: replaced with `[alice, bob]`. Verified:
`npx vitest run scripts/export-public.test.ts` no longer reports `docs/decisions-and-rules.md` (the one
remaining scan hit, `evals/inspect/dcbench_eval/tests/test_v4_score_intent_to_add.py`, predates this task --
introduced in T97/commit `8877e4c`, present on `f22b551` before T100 branched, unrelated to MADR/adrkit).

**F3 — MEDIUM.** An `affects` entry with no `pattern:` got `pattern: i.map?.pattern ?? i.value`, which
resolved to the `type` string itself (`- type: path` alone silently became `pattern: 'path'`). Fix:
`graph.ts` now requires `i.map?.pattern`; a missing one is dropped with a `Problem` (`affects: entry has no
pattern (type: ...) -- dropped`) at its own file:line. Test: madr4-adrkit.test.ts "an affects entry with no
pattern:".

**F4 — MEDIUM.** `mole init`'s scaffold and `mole decision new`'s body used a single `## Decision` heading,
not MADR 4's three required sections. Fix: both now emit `## Context and Problem Statement` / `##
Considered Options` / `## Decision Outcome` (https://github.com/adr/madr/blob/4.0.0/template/adr-template.md,
fetched 2026-11-05), with the template's optional sections (Decision Drivers, Consequences) kept behind the
same `<!-- This is an optional element. -->` HTML comment the upstream template uses. Checked Mole's own
loader: `rationale.ts`'s `BUCKET_OF` already matched `context\b` (covers "Context and Problem Statement") and
`considered options\b` into the context bucket, and `decision outcome\b` into the decision bucket -- no loader
change needed. `capture/records.ts`'s `readDecisionRecords` (duplicate-suggestion dedupe) heading-strip regex
was widened from `## Decision` only to all 3 new headings (`RENDERED_HEADING`), so near-duplicate body
comparison still ignores Mole's own boilerplate, not user text. `capture.test.ts`'s exact-string assertion on
`renderNew`'s output was updated to match (`toContain`-only assertions elsewhere, e.g.
`packages/daemon/test/init.test.ts`, needed no change). Test:
`packages/daemon/test/init.test.ts` "the scaffold's MADR 4 body carries the 3 required sections".

**F5 — item 5 (pre-existing-affects behavior change).** Before this fix, *every* `affects` entry (any type,
literal-only matching) was folded into `scope`, so a `pattern` with `**` or any non-`path` type could never
anchor and read permanently red/orphaned. Documented in `docs/decisions-and-rules.md` ("Behavior change for an
existing affects: record"). Regression test: madr4-adrkit.test.ts "a pre-existing affects: record changes
behaviour" (a `src/widgets/**` glob now reads green once its target exists, instead of permanently red).

## Evidence
- `npx vitest run packages/decisions packages/daemon`: 598 passed, 3 failed -- all 3 are
  `packages/daemon/test/init-pty.test.ts`'s pre-existing pty-harness `PermissionError` (unrelated to T100;
  reproduced identically on `git stash` back to the pre-fix `9be8f8e` state, same 3 failures).
- `npx tsc -b`: clean.
- `npx vitest run scripts/export-public.test.ts`: `docs/decisions-and-rules.md` no longer in the scan output
  (the one remaining hit predates this task -- see F2).
