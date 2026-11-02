# T45 insights

## OPEN choice: which prCheck outputs go into the live check-run body (stop-rule, not a stop)

The task's stop rule says to stop and ask if wiring prCheck into the live push path needs a
product decision about which of prCheck's many outputs belong in a GitHub check-run body.
Per this task's own instruction, picked the minimal option instead of stopping, and recording
it here as OPEN:

- **picked**: `CheckRunResult.summary` = prCheck's `checkRun.output.title` (one line, e.g.
  "mole: 1 decision governs these lines"); `CheckRunResult.annotations` = prCheck's own
  `checkRun.output.annotations` array unmodified (GitHub check-run annotation shape: path,
  start_line/end_line, annotation_level, title, message — one entry per decision×hit, already
  built by `packages/decisions/src/check/pr-check.ts`'s `buildCheckRun`).
- **not picked**: prCheck's full rich `checkRun.output.summary` markdown (sections for
  decisions, unanchored records, records changed by the PR, record problems, owners, past
  fixes, read-back questions, draft decisions from reviews) is NOT carried into the live
  push check-run body. That richer markdown stays what `mole pr-check`'s CLI / PR-comment
  consumers already get (`formatPrCheck`, `prCheckCli --out`); the live per-PUSH check-run
  (no PR context, no author to answer questions) only needs "what governs this, where" —
  owners/past-fixes/questions are PR-review concepts, not push-notification concepts.
- **why minimal**: the done-when only requires conclusion to react to a real content-anchor
  match (not hardcoded 'success') and a governed-vs-not signal; a title + per-decision
  annotation line is the smallest payload that satisfies both without inventing a push-vs-PR
  UX split that nobody has asked for.
- **open**: should a future PR-triggered check run (not a push) use prCheck's full summary
  instead? That's a different ledger task (a PR webhook event doesn't exist yet in
  `packages/server/src/webhook.ts` — it only handles `push`).

## Conclusion enum: always 'neutral', never widened

`CheckRunPayload.conclusion` in `packages/decisions/src/check/types.ts` is typed
`'neutral' | 'success'`, but `buildCheckRun` only ever returns `'neutral'` (both the silent
and the governed branch). `CheckRunResult.conclusion` here is typed as the literal `'neutral'`
(not a union) on purpose — nothing in this codebase computes `'success'`, `'action_required'`,
or any other GitHub Checks API enum value, and inventing one here would be a product decision
about blocking semantics this task's non-goals explicitly rule out ("not a new gating/blocking
policy -- still flags, not gates").
