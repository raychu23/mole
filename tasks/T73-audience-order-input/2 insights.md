# T73 insights — setting and comparing the audience/value order from the CLI and IDE

## Summary
`mole priorities set --phase P --order a,b,c` now writes `.mole/priorities.md` (a person's CLI act, never MCP),
updating an existing phase's order in place or appending a new one dated today; the write is re-read through
T60's own parser before returning, so a malformed write is caught there, not by the next call. Review 1 found
two HIGHs in that write path, both now fixed: it rewrites ONLY the numbered tenet-list lines (every hand
comment/prose/blank line in the phase, and the file's own CRLF/LF ending, survives), and it is guarded by a
git-index.lock-style file lock (O_EXCL create, exponential backoff, stale-lock reclaim, temp-file + rename) so
concurrent `set` calls never lose an edit. A pure, never-writing what-if (`evaluateOrder`/`compareWithOrder` in
`@mole/decisions`, `sel.order` in `@mole/proposals`, `mole priorities whatif --order ...`) judges the graph
under any tenet order without touching the file. The VS Code Reasoning section shows the order in force and a
"compare with order X" input+button that renders the same comparison shape the phase-vs-phase diff already
uses, proved with a real panel screenshot (git status clean before/after). `mole_priorities`'s bare MCP default
(backlog `priorities-default`, T68 left it alone on purpose) now matches its own doc: the phase in force today,
not plain Dung — `mole priorities` (CLI) and `evaluatePhase`'s own default are unchanged.

```notes
code       packages/decisions/src/priorities.ts: setPriorities (write) · evaluateOrder/compareWithOrder (what-if,
           read-only) · diffPhases extracted from comparePhases (one diff implementation, shared) ·
           packages/decisions/src/cli.ts: `priorities set` / `priorities whatif` subcommands ·
           packages/proposals/src/proposals.ts: PhaseSelector.order overrides phase/at in evaluateRecords, never
           written · packages/daemon/src/cli.ts: `mole proposals --order a,b,c` forwarded ·
           packages/mcp/src/reasoning-tools.ts: mole_priorities's bare selector now phaseInForce(root, {}),
           same as T68 gave incident-suggest/proposals-compare; evaluatePhase's own default untouched ·
           apps/vscode: Runners.prioritiesWhatIf (panelData.ts/panelRunners.ts, `priorities whatif --order --at
           today`) · webview/reasoning.ts: comparisonBody extracted + reused by phaseHtml and new renderWhatIf;
           phaseHtml renders a pre-filled what-if input+button+result div when a phase is in force ·
           src/panelView.ts reasoningWhatIf: calls the runner, merges { whatIf } into the ALREADY-rendered
           reasoning section's data, re-posts the WHOLE model (same patch-on-postMessage idiom every other
           refresh uses, M26b) -- renderReasoning stays the one place that knows how to show it ·
           triggerWhatIf/selftestWhatIf: same deterministic-click idiom webview/main.ts's selftestClick already
           uses for the map panel, reused for the M26 check screenshot (fill input, dispatch a REAL click)
tests      red: tasks/T73-audience-order-input/4 log/red.txt (10 failing: setPriorities/evaluateOrder/
           compareWithOrder missing, CLI set/whatif exit codes, mole_priorities bare default) → green:
           packages/decisions 380, packages/proposals 27, packages/mcp 27, apps/vscode 70 (532 total across the
           5 touched packages incl. daemon); `npx tsc -b` clean
round trip done-when 3   packages/decisions/test/priorities.test.ts "T73 setPriorities": setPriorities(...) ->
           readPriorities(root) deep-equals the returned Phase[] for (a) updating an existing phase (same
           `from`, other phase untouched), (b) appending a brand-new phase dated today, (c) a brand-new
           priorities.md
what-if never writes done-when 4   git-status-clean proof at 3 layers: CLI (packages/decisions/test/
           priorities.test.ts, real git repo, `whatif` then `git status --porcelain` empty) · proposals library
           (packages/proposals/test/phase.test.ts, before/after porcelain equal) · the real panel on the t61
           replay COPY (4 log/reasoning-whatif-model.json has data.whatIf populated with a real decision flip,
           ADR-0002 defeated -> holds under tenet-focus,tenet-users; git status --porcelain on the copy was
           empty both before and after -- not committed to the log, confirmed interactively, see proof below)
proof      4 log/reasoning-whatif-panel.png (real Extension Development Host window on a COPY of
           /Users/a1/.hermes/cache/scratch/t61-replay/r, scripts/panel-screenshot.mjs with WHATIF_ORDER=
           tenet-focus,tenet-users SCROLL_TO=reasoning; the copy was deleted after the shot, never the original
           fixture) · 4 log/reasoning-whatif-model.json (the exact rendered model, phase.current = scale, order
           tenet-users/tenet-focus; whatIf.order = tenet-focus,tenet-users; whatIf.comparison shows ADR-0002
           defeated -> holds, same shape comparePhases produces) · screenshot verified by vision: shows "Phase
           in force: scale", the order, the what-if input pre-filled "tenet-users,tenet-focus", Compare button,
           and the what-if result with the flipped decision
limits     INFERENCE: a new phase name with no existing file/phases is dated today with no ordering check
           (nothing to be after); a phase that WOULD precede the latest existing phase is refused with
           PrioritiesError, same invariant readPriorities already enforces -- no prior art picks a date for a
           newly-named phase, today is the only reading consistent with T60's own "from" invariant without
           asking the person for one, and the file stays hand-editable afterward to pick a different date ·
           the panel's what-if baseline is resolved with `--at <today>` (same convention `priorities()`'s own
           runner already uses, panelRunners.ts comment), not the bare CLI default (plain Dung) -- so the panel
           always compares against what it is already showing as "in force" · the daemon CLI's `--order`
           forwarding on `mole proposals` has no dedicated daemon-layer test (mirrors the existing --phase/--at
           forwarding, which also has none at that layer; covered one level down by packages/proposals/test/
           phase.test.ts's sel.order test and by manual verification, NOT RUN at the daemon-CLI layer itself)
NOT RUN    nothing: every change here was exercised by a real test or the real Extension Development Host; no
           model calls, no account/quota blockers applied to this task
```

## Review 1 fixes
- **HIGH 1 — `setPriorities` (priorities.ts:258-264) replaced EVERYTHING between a phase's heading and the next
  heading, deleting hand comments/notes/blank-line formatting inside the edited phase.** Fix: a new
  `rewritePhaseList` helper scans the phase body for ITEM-regex lines only; it splices the new numbered list in
  at the position of the FIRST existing item line and keeps every other line (comments, prose, blank lines)
  exactly where it was, in order; a phase with no list yet gets one inserted right after the heading, same rest-
  of-phase untouched. The whole-file write also now preserves the file's own line ending (CRLF vs LF), detected
  once from the read and reused for every line written, instead of always joining with `\n`. Proof: red at
  `4 log/red.txt` ("T73 review 1 fixes" — 3 failing: comments/prose/blank lines deleted, a comment-only phase
  wiped, CRLF collapsed to LF), green after the fix (`packages/decisions/test/priorities.test.ts`, same 3 tests,
  including a hand-annotated fixture with HTML comments before/inside/after the list, prose, extra blank lines,
  and a separate CRLF-only fixture asserting every untouched line still ends `\r`).
- **HIGH 2 — concurrent `priorities set` on different phases lost one edit (plain read-modify-write, no lock).**
  Fix: `acquireLock`/`writeFileAtomic` in priorities.ts, the git `index.lock` / npm `proper-lockfile` pattern
  (4 log/prior-art.md "Review 1 ... added prior art"): `<file>.lock` created with `open(..., 'wx')` (O_EXCL),
  exponential backoff (10ms → 200ms cap) up to a 5s bound, a lock whose `mtime` is older than 10s (proper-
  lockfile's own default stale bound) is reclaimed as abandoned; the file is re-read ONLY after the lock is
  held (never before, so no read can go stale waiting for the lock); the new content is written to a
  `<file>.<pid>.<ts>.tmp` and renamed into place, so a reader never observes a half-written file; the lock is
  released in a `finally`. Proof: red at `4 log/red.txt` ("N concurrent writes to DIFFERENT phases" — launch's
  own edit clobbered by scale's write, reproduced reliably by forcing the race window open with
  `MOLE_PRIORITIES_TEST_DELAY_MS` so 3 real child processes under `vite-node` genuinely interleave instead of
  hoping for a lucky collision), green after the fix (same test, plus a same-phase concurrency test asserting
  last-writer-wins with the file still parseable — never corrupt — and a stale-lock test that writes a lock
  file with an `mtime` 60s old and confirms `setPriorities` still succeeds instead of timing out).
- **Scope held**: no change to the what-if path (`evaluateOrder`/`compareWithOrder`), which still never writes;
  no change to `mole_priorities`'s MCP read-only contract; the lock lives only inside `setPriorities` itself.
- **Full re-run after both fixes**: `npx tsc -b` clean; `npx vitest run packages/decisions packages/proposals
  packages/mcp apps/vscode` — 59 test files, 510 tests, all passing (incl. `apps/vscode/test/render.test.ts`,
  no debounce flake on this run).
