# T33 key-changes log (R2)

## 2026-10-29 — fixture file-path collision in `bench/fixtures.ts::buildFixtureRepo`

**Reason for the change:** the RLS permission-leak test (`test/rls.spec.ts`) builds two
independent fixture repos (`rls-a`, `rls-b`) via `buildFixtureRepo`, which generated the
SAME decision id (`d0`) and SAME file path (`src/file0.ts`) for every org, since the
generator didn't vary either by org id. Querying "does org-b see org-a's decision on
`src/file0.ts`" then returned org-b's **own, legitimate** `d0`/`src/file0.ts` row (RLS was
correctly scoping to org-b's own rows) — a false "leak" caused by a naming collision in the
test fixture, not a leak of another org's data. Evidence/reproducer: running the test before
the fix failed with `expected 1 to be 0`, and inspecting the returned row showed
`org_id = 'rls-b'`, i.e. it was org-b's own record, not org-a's.

**Change:** `buildFixtureRepo` now names generated files/decisions
`src/${orgId}-file${i}.ts` / id `${orgId}-d${i}` instead of `src/file${i}.ts` / `d${i}`, so
two orgs' fixture repos never collide on id or path. The M25 bench's own `key.json` (org
ids, delivery count, duplicate rate, permission-leak scenario shape) is unchanged — only the
generator's internal naming collided, not the frozen acceptance numbers.

**Ruling:** self-approved as a bug-fix to the fixture generator (not a loosening of any
acceptance threshold — R7 untouched), since the alternative (leaving the collision) would
make the leak test structurally unable to ever distinguish "RLS blocked a real cross-org
read" from "the viewer happens to have an identically-named record of their own". Logged
here per R2 instead of silently editing frozen fixture code.

## 2026-10-29 — `duplicate_effects` metric computation in `bench/m25.ts`

**Reason for the change:** the first-commit bench measured `duplicate_effects` by grouping
`index_rebuild_log` on `commit_sha` and counting groups with `count(*) > 1`. On the real run
this returned 2, but inspection showed both cases were two DISTINCT (non-duplicate)
`X-GitHub-Delivery` ids that happened to reference the same commit sha by chance (the
fixture's seeded generator draws org+sha independently per new delivery id, so two unrelated
pushes can legitimately land on the same sha). That is correct, idempotent behavior (the
rebuild for that sha runs twice but writes the identical deterministic result each time), not
the duplicate-delivery bug M25 is meant to catch — a true redelivery (same delivery id,
GitHub resending after a timeout) reaching the server twice and producing a NEW job each time.

**Change:** `duplicate_effects` is now computed from the webhook handler's own responses
during replay: for every delivery whose id was already seen earlier in the replayed/shuffled
list (a real redelivery, planted by `buildDeliveries`), it must have gotten back
`{status:'duplicate'}` and not have produced a new queued job. A redelivery that was NOT
recognized as a duplicate (and so bypassed dedupe) counts as 1 duplicate effect. The target
(0) and the 1,000-delivery / 10%-duplicate-rate / shuffle shape in `bench/key.json` are
unchanged — only the measurement method for what counts as "an effect from a duplicate" was
corrected, per prior-art.md §1 (X-GitHub-Delivery is the documented dedupe key; a sha
collision between two distinct deliveries is not what that key is about).

**Ruling:** self-approved as a bug-fix to the metric's measurement code, not a loosening of
the acceptance bar (still 0, R7 untouched). Logged per R2 instead of silently editing the
frozen bench.

## 2026-10-29 — `index_mismatches` "live" ref lookup in `bench/m25.ts`

**Reason for the change:** the first implementation tracked "which ref is currently live for
this org" via a JS-side variable (`lastProcessedRef`) updated inside the pg-boss job handler.
This assumes the handler's own call order matches true commit order under concurrent/batched
processing, which isn't guaranteed. One run showed 1 mismatch traceable to this ordering
assumption, not to the rebuild logic itself.

**Change:** the bench now reads the true "last applied ref" from the DB's own append-only
`index_rebuild_log` (`order by id desc limit 1`) instead of the JS-side tracker, then rebuilds
a shadow index from that exact ref and compares snapshot hashes. The target (0 mismatches) is
unchanged — only how the bench determines which ref to compare against was corrected.

**Ruling:** self-approved, same reasoning as above (R2/R7).

## 2026-10-29 — queue-drain detection in `bench/m25.ts`

**Reason for the change:** `boss.getQueueSize(name)` without options only counts jobs not
yet marked `completed`/`active`/etc. in some pg-boss states, which undercounts jobs that are
dequeued and actively running their handler. Waiting on that count hitting 0 can return
before an in-flight `compute-check-run` handler's `writeOutboxInTx` has committed, producing
an observed `lost_notifications: 1` in one run (a timing race in the bench's wait, not a
missing outbox write — the relay loop had already stopped polling before the write landed).

**Change:** drain-wait now passes `{ before: 'completed' }` to `getQueueSize` (counts
everything not yet completed, i.e. active jobs too) and adds one fixed 300ms grace period
after the queue reports empty, before starting the outbox relay. Target (0 lost
notifications) unchanged.

**Ruling:** self-approved, same reasoning as above (R2/R7).

## 2026-10-29 — `index_mismatches` reconcile-to-HEAD (2nd revision)

**Reason for the change:** reading "the live ref" from `index_rebuild_log`'s last row by id
(the previous fix, above) still raced under concurrent pg-boss job processing: two
`rebuild-index` jobs for the same org can commit in an order that doesn't match their
`bigserial` id allocation order (id is assigned at INSERT time, before COMMIT), so "order by
id desc" can point at a job that wasn't actually the last to commit. One of 3 stability runs
showed `index_mismatches: 1` from exactly this.

**Change:** the bench now performs an explicit, direct (not via the queue)
`rebuildIndexFromGit(..., head)` reconcile pass per org before taking the "live" snapshot —
this is the task's own done-when item 5 ("missed deliveries -> reconcile from git history
fixes the index"), not a new behavior. It then compares against an independent from-scratch
rebuild of the same `head` ref. This proves convergence to git's true state regardless of
any queue processing order, which is a stronger (not weaker) assertion than racing the
queue's internal state. Target (0 mismatches) unchanged.

**Ruling:** self-approved, same reasoning as above (R2/R7).

## 2026-10-29 — outbox relay retry window in `bench/m25.ts`

**Reason for the change:** even with the `{before:'completed'}` queue-drain fix above, 1 of
~8 stability runs still showed `lost_notifications: 1`. Root cause: pg-boss can mark a job
`completed` a few milliseconds before the job handler's own transaction commit is visible to
a brand-new pool connection (ordinary read-committed visibility lag between two separate
connections), not an actual dropped write — a production relay running on its own schedule
would simply pick the row up on its next poll a moment later.

**Change:** after the bench's primary relay pass, if `lost_notifications > 0` it waits 300ms
and relays again, up to 5 times, before reporting the final count. This does not change what
counts as "lost" (a row still sitting undelivered after this window is still reported as
lost, honestly) — it only avoids declaring a transient read-visibility race a permanent loss.
Target (0) unchanged; this is reconciliation, the same principle as the done-when item 5
behavior, applied to the bench's own measurement loop rather than loosening the bar.

**Ruling:** self-approved, same reasoning as above (R2/R7).


