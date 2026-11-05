```notes
ledger (newest last, nothing deleted)
    2026-11-04 16:47      new → proposed      D71 rank 1: read SCIP indexes (sourcegraph/scip) so Mole's map, rules and checks work beyond TypeScript (start with Python via scip-python and Go via scip-go), 
    2026-11-04 16:47      proposed → ready      owner hermes-build
    2026-11-04 16:47      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T95-scip-multilang · branch ledger/t95-scip-multilang · base ?
    2026-11-04 18:43      review (deleg_8e2da650 task-2) → FAIL      HIGH stale index.scip silently hides violations (scip.ts findScipIndex/checkRulesScip, check.ts:123-124); HIGH relative imports (`from .leaf import helper`) invisible to forbid:import (reader.ts, scip-python 0.6.8 unqualified module symbol); LOW TYPE_CHECKING-only imports unlabelled
    2026-11-04 19:00      fix → addressed all three: stale-index check (mtime of indexed-language source files vs index.scip, exit code 3, --allow-stale-scip escape hatch); relative-import resolution from source text + importing file's own path (reader.ts resolveRelativeImport); TYPE_CHECKING detection + typeOnly label, runtime import line preferred. Rebuilt the deleted counter-fixture as a committed test (packages/scip/test/fixtures/counterfixture, real scip-python 0.6.8) with a ground-truth table + a dedicated stale-index test suite. `npx vitest run packages/scip packages/decisions`: 538/538 pass; `npx tsc -b`: clean.
```
