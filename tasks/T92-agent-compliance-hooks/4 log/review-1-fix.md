## Summary
Review 1 FAIL fix (deleg_b344d5fa/task-0.log): HIGH 1 (PreToolUse wrote the prospective edit onto the
REAL file, SIGKILL mid-check left it corrupted) and HIGH 2 (Stop blocked on violations that pre-date the
session) are both fixed. LOW (redundant `mole rules` calls) is fixed too. Tests first (red-2.txt), all
green, `tsc -b` clean. Nothing open.

## HIGH 1 -- PreToolUse never writes the real file
- `lib.mjs`: `buildOverlay(root, overrides)` -- a throwaway dir mirrored with symlinks, holding ONLY the
  override path(s) as real bytes (or absent, for "this file doesn't exist in this snapshot"). Prior art
  (fetched 2026-11-04): eslint's `--stdin --stdin-filename` (pipe content in, never open the real file --
  https://eslint.org/docs/latest/use/command-line-interface#--stdin) and dependency-cruiser's documented
  "run against a throwaway copy" pattern (https://github.com/sverweij/dependency-cruiser/blob/main/doc/
  cli.md#programmatic-use). `crispViolationsForContent(mole, root, rel, content)` runs `mole rules` against
  that overlay. `pre-tool-use.mjs`'s `crispDenyReason` now only ever **reads** `abs` (never writes); before
  and after are both `crispViolationsForContent` calls, diffed by `violationKey` (decision id + rule + file
  + target, not line number -- a shifted line from an unrelated edit must never look like a new violation).
- Proof: `plugins/claude-code/test/pretooluse-no-write.test.ts` -- SIGKILL at 0/2/5/15/40/200/500/900/1300ms
  after spawn, file byte-identical every time (vs the old code, confirmed corrupted at 900ms in this same
  harness before the fix: 4 log/red-2.txt); 6 concurrent invocations on the same file never corrupt it and
  each still gets the correct `deny` (the old code's real-file write was also a race between concurrent
  hook calls -- fixed by construction, since nothing ever touches the real path).

## HIGH 2 -- Stop blocks only on violations THIS session introduced
- `session-start.mjs`: snapshots every already-dirty file as a git blob (`git hash-object -w`, writes to
  `.git/objects` only -- never the working tree or the index) into `sess.baselineBlobs`, alongside the
  existing `head`.
- `lib.mjs`: `sessionBaselineContent(root, sess, file)` -- the blob if the file was dirty at SessionStart,
  else the file's content at `sess.head` (or current HEAD, for a session with no recorded start).
  `crispViolationsForOverlay(mole, root, overrides)` -- `buildOverlay` + `crispViolations`, for Stop's
  multi-file baseline check (never a checkout).
- `stop.mjs`'s `stopBlockDecision`: computes violations NOW on the real tree (just a read, same as before),
  restricts the baseline check to the files that have a violation right now (not every touched file -- a
  file with no current violation can't contribute a new one), evaluates those files' baseline via the
  overlay, and blocks only on a `violationKey` present now but absent from the baseline.
- Proof: `plugins/claude-code/test/stop-baseline.test.ts` -- a violation already committed to HEAD before
  the session (+ unrelated edit) -> no block; a violation already dirty in the working tree at
  SessionStart (+ unrelated edit) -> no block; a violation the session itself introduces (clean at
  SessionStart) -> block, names D1; `stop_hook_active` / `MOLE_STOP_BLOCK_CAP` still respected with a real
  SessionStart baseline recorded. All 4 red before the fix (4 log/red-2.txt), green after.
- READMEs (`plugins/claude-code/README.md`): documented PreToolUse-vs-Stop semantics exactly (PreToolUse =
  one edit, now vs. what it would produce; Stop = the whole session, SessionStart vs. now) and the new
  "only what this session introduced" Stop behavior.

## LOW -- cache the PreToolUse 'before' baseline per content hash
- `lib.mjs`: `rulesFingerprint(root)` (hash of every rules-bearing decision record) + a
  (fingerprint, rel, content)-keyed cache under `CLAUDE_PLUGIN_DATA/rules-cache` (atomic temp-file+rename
  writes, so two concurrent processes writing the same key never corrupt it; pruned at 500 entries).
  `crispViolationsForContent` checks this cache before spawning `mole rules`. Direct measurement (same repo,
  persistent `CLAUDE_PLUGIN_DATA`): first call 427ms, identical content again 1ms and 0ms -- the cache works.
  The existing `hasAnyRules()` fast path (no subprocess at all on a repo with no `rules:`) is untouched.

## Latency (`npx vitest run plugins/claude-code/test/pretooluse-deny.test.ts`, n=15, isolated run)
p50=1123ms p95=1615ms max=1615ms (well under the 15s PreToolUse timeout the test asserts). This harness
gives each of the 15 calls its OWN fresh `CLAUDE_PLUGIN_DATA` tmp dir (pre-existing test design, not changed
here), so every call pays a cold `mole rules` subprocess for both before and after -- it does not exercise
the LOW cache's cross-edit win, which needs a `CLAUDE_PLUGIN_DATA` that persists across edits (the real,
normal case in an actual Claude Code session). A bare `mole rules --json` subprocess call on this fixture
costs ~450-580ms on this machine (measured directly, packages/daemon/dist/cli.js, cold TypeScript +
dependency-cruiser load); PreToolUse's per-edit cost in production (persistent plugin data dir, `before`
usually a cache hit) is close to that single-call cost, not 2x it.

## Tests + build
`npx vitest run plugins/claude-code packages/daemon`: 22 files, 124 tests, all green.
`npx tsc -b`: clean, no errors.

## Files changed
- `plugins/claude-code/scripts/lib.mjs` (buildOverlay, violationKey, rulesFingerprint, rules-cache,
  crispViolationsForContent, crispViolationsForOverlay, sessionBaselineContent)
- `plugins/claude-code/scripts/pre-tool-use.mjs` (crispDenyReason: read-only, overlay-based)
- `plugins/claude-code/scripts/stop.mjs` (stopBlockDecision: session-baseline diff, not raw violations)
- `plugins/claude-code/scripts/session-start.mjs` (baselineBlobs snapshot)
- `plugins/claude-code/README.md` (PreToolUse/Stop semantics documented exactly)
- `plugins/claude-code/test/pretooluse-no-write.test.ts` (new, HIGH 1 proof)
- `plugins/claude-code/test/stop-baseline.test.ts` (new, HIGH 2 proof)
- `tasks/T92-agent-compliance-hooks/4 log/red-2.txt` (red before the fix)

## Open items (need Raymond)
None. This is a review-fix round on an already-approved task (D101/D102); not resubmitted for a second
adversarial review per the delegation brief (effort-scoped fix-and-report), but the attack reproducers
from `4 log/t92-review-1.md`-equivalent transcript are now committed, deterministic regression tests.
