# Prior art — T114 / Q8 (D86 support sets, test 1 rerun on new repos)

1. **Panthaplackel et al., "Learning to Update Natural Language Comments Based on Code
   Changes" (ACL 2020) / the just-in-time stale-comment task used by this bench's
   `OVERLAP` baseline and `CARL-CCI` reference number (F1 93.4, Java).** Cited in
   `context/product-plan/systems/decisions.jsonl` D78 (2026-11-01) and reused unchanged
   here — no new paper reimplementation, same `scripts/methods.cjs::methodOverlap`.
2. **D86** (`context/product-plan/systems/decisions.jsonl`, 2026-11-01, ACCEPTED): "decision
   staleness flags only when the code a decision's support set depends on changes in a
   way that matters, not on every change" — the design this rerun tests. `methodCompilerSignals`
   in the existing bench is the comment-level analogue of a support-set check (param type,
   return type, return shape, throw set, identifier-removed signals), already frozen before
   this task started.
3. **`context/product-plan/systems/metrics-proof/bench/test1-stale-comments/results/report.md`**
   (2026-11-01, the original test 1 run on date-fns dev / xstate test): precision 7.1% /
   recall 100% / F1 13.2 for flag-every-change on n=367 xstate pairs (balanced n=36: F1 66.7);
   compiler-signals F1 65.2 (balanced), effectively tied with flag-every-change because recall
   100% forces F1=66.7 by construction on perfectly balanced 1:1 data — the open question this
   task answers: does that tie hold on OTHER repos, or was it an artifact of xstate/date-fns's
   low positive counts (summary 6/6, returns 1/2 — too scarce to balance without noise)?
4. **`context/product-plan/19 Can it stand up.md`** fix 6 (2026-11-0x, from `queue/brief.md`'s
   named source "19 fix 6"): "'ValidUntil for decisions' only holds if flags are precise
   (today 7.1%)" → asks for "test 1 rerun: precision + F1 vs flag-every-change (7.1%) and
   OVERLAP's published bar (68.0)" on new repos, which is this task's literal brief.

## What is reused vs new here

- Reused, byte-identical (sha256 verified, see `4 log/` eval run below): `scripts/methods.cjs`
  (all 3 methods), `scripts/common.cjs` (TS-scanner mining), `scripts/mine.cjs`,
  `scripts/build_dataset.cjs`. No method tuning happened for this task — the method was
  already frozen on 2026-11-01 against a different dev split (date-fns) and is applied as-is.
- New: two repos never used in the original bench (checked against its own reject/accept
  list in `.../data/spotcheck_*` and `receipts.json`, which lists date-fns, xstate, and 7
  rejected candidates — zod, class-validator, fp-ts, immer, mobx, class-transformer, rxjs;
  none of those 9 names overlap with the two picked here):
  - **toss/es-toolkit** (lodash-style TS utility library, fully typed, heavy JSDoc:
    856 non-test `.ts` files, 706 contain `@param`/`@returns`, checked 2026-11-08 by grep
    density before cloning deep)
  - **remeda/remeda** (TS functional-utility library, `packages/remeda/src`: 394 non-test
    `.ts` files, 164 with `@param`/`@returns`, checked 2026-11-08 same way)
  Both cloned shallow (`--depth 3000`, ~1900/900 commits respectively) into
  `/Users/a1/.hermes/cache/scratch/t114-bench/` (outside the repo, deleted after mining to
  respect the disk budget — only the mined `.jsonl` facts were kept).
- New split/key script `scripts/build_split_new_repos.cjs`: same balancing policy as the
  original `build_split.cjs` (balance 1:1 if a (repo,type) has >=10 positives, else keep
  everything unbalanced and flag it), new seed (20261108, dated, distinct from the
  original 20261101), applied once to the pooled es-toolkit+remeda raw pairs and treated as
  a single frozen TEST split (no new dev-design step: the method is already frozen, so there
  is nothing to design on a dev slice for).
