# M27a key: a finding for a ruling, not an edit (R2 -- the key is frozen, not touched)

## What was asked of this round
Implement the next step logged in `2 insights.md` point 4: match a builder's resumed sessions by
overlapping Hermes `sessions.cwd` + time window, independent of `parent_session_id`, and re-attribute.
Implemented as `buildResumedFamilies()` in `packages/coverage/src/index.ts` (commit 3a59709).

## What it does
Chains root Hermes sessions (no `parent_session_id`) that share harness + cwd and whose time windows are
**sequential** (one's `ended_at` followed within 15 minutes by another's `started_at`, nearest candidate
wins) into one family; an edit in any family member rolls up to every other member, independent of the
existing parent-chain roll-up.

Sequential (not overlapping) was a deliberate, evidence-driven choice, not the first thing tried: querying
this repo's own `~/.hermes/state.db` directly showed the four 10-29 builder root sessions
(mole-builder-3..6) all share **one cwd** (`/Users/a1/Desktop/CS Code/Project/Mole`) and their multi-hour
windows **overlap each other almost entirely** (e.g. builder-3 10:08:06-15:27:18, builder-4
10:08:12-15:27:17). A naive overlap-based union-find would have merged all four builders into one family,
which would have wrecked precision (every file any of them touched would show up under every builder).
Sequencing is the signal that actually distinguishes "resumed" from "four agents concurrently sharing a
checkout".

## Result: no change (0.9982 precision / 0.4269 recall, identical to baseline)
Confirmed empirically, not just by the bench staying flat: a direct SQL scan of every root session in
`sessions` for `cwd = '.../Project/Mole'` found exactly two end→start chains within 15 minutes anywhere in
the whole dataset, and **neither involves mole-builder-3/4/5/6's session ids**. Widening the gap to 2 hours
from each of the four builders' own session ends still only turns up one shared "next session after
everyone" (irrelevant, unrelated later work), not a resumption of any of the four. There is no crash/
compaction-orphaned root session for these four builders in this machine's Hermes history to link.

## The actual dominant cause of the recall gap (not a resumed-session problem)
Traced where the truth-set files for mole-builder-3 (14.3% recall) and mole-builder-5 (32.4% recall) that
are NOT attributed to their own session actually ARE attributed:

```
mole-builder-3's un-self-attributed truth files, by whose session edited them instead (top 5):
  local-55524a2e... (mole-builder-4's own session)   167 files
  20261029_051818_c1356b (a mole-builder-4 subagent)  149 files
  local-fdb14cadc6... (mole-builder-5's own session)   67 files
  ...
```
Same pattern for mole-builder-4 and mole-builder-5: the large majority of "false negatives" are files
correctly attributed to a **different, known builder's own session** -- not orphaned, not mis-attributed to
the wrong session by a bug, just not attributed to the session the key says should own them.

Root cause, confirmed by `git log ledger/t19-rename-proof-anchors --no-merges` filtered to mole-builder-3's
exact `[started_at, ended_at]` window (the same filter `bench/build-key.mjs` applies): the window contains
not just mole-builder-3's own commits but dozens of **unrelated commits by other builders on entirely
different tasks** -- `ledger move: tasks/T28-runtime-flows-from-tests ready -> running`, `T24 run log: round
8...`, `T29: @mole/decisions...`, `T17: insights...`, etc. -- because `ledger/t19-rename-proof-anchors` (and
every ledger branch) is a **serial integration branch**: `git log <branch>` returns every commit reachable
from the tip, including the shared history every other concurrently-running builder merged into main (and
that this branch was later rebased/merged on top of) before this branch's own tip. `build-key.mjs` unions
every file any commit in that reachable set touches within the time window -- not just commits mole-builder-3
actually made. Two branches are explicitly double-counted this way already (`ledger/t19-rename-proof-anchors`
is listed for both mole-builder-3 and mole-builder-6; `ledger/t30-annotated-file-tree` and
`ledger/t32-team-pr-check` for both mole-builder-4 and mole-builder-6), but the effect above is broader than
just those two branches -- it is the whole-branch-history method itself, not only the explicitly shared
branches.

This explains why the fix this round (and any further session-identity fix) cannot move the needle much:
the files ARE correctly attributed, just to the real editing session (a different builder), not the one the
key's git-log-over-a-time-window method happens to also claim. Forcing those files onto mole-builder-3 to
raise recall would mean attributing them to a session that never touched them -- i.e. manufacturing false
positives to chase a number, which R7/the task instructions explicitly forbid ("never loosen the bench/key
to fake a pass").

## What would actually fix M27a's recall (a ruling for whoever reviews this, not done here)
`bench/build-key.mjs` would need to intersect each branch's reachable commits with ones that are either (a)
unique to the branch (`git log main..branch`, excluding shared ancestor history) and/or (b) linked back to
the owning session by the same commit-linking method `@mole/coverage` itself uses (sha/subject match against
that session's own tool calls), rather than time-window-only filtering over the branch's full reachable
history. That is a change to a frozen, checks-committed key (R2) -- flagged here for a ruling, not made.

## What stands as implemented
- `buildResumedFamilies()` is real, general-purpose, and correct for its actual scenario (a session that
  truly crashes and is relaunched in the same cwd shortly after) -- it is low-risk (3-way guarded: same
  harness, same cwd, tight sequential gap, nearest-candidate-only) and does not regress precision (still
  0.9982) or any other metric. It simply found nothing to attribute in this specific dataset because this
  specific dataset's builders didn't crash/resume -- its gap is the ground-truth method described above.
