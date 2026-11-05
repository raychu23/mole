## Summary
`mole init`: first-run scaffold for a new user (ux-research #3 + #5). Writes one example
`.mole/decisions/*.md` record (MADR-style front matter + a `rules:` block, the format the existing loader
already accepts, D71) if none exists; idempotent (never overwrites); `--dry-run`; `--json`; optional
`--agents-snippet` appends one marked precedence sentence to AGENTS.md/CLAUDE.md. Also audited the backlog's
"incident-loader-indent" bug: already fixed and merged as T82 (commits 0c027a6/e72cbf1/4950c93) — backlog.json
was stale, now corrected to `integrated`. Open: none blocking; `mole init`'s interactive y/N prompt path is
untested by vitest (not a TTY under spawnSync) — covered by the non-interactive default-off tests instead.

## Goal
A path from `mole --help` to a working `.mole/decisions/` example, compatible with everything that already
reads `.mole/decisions/*.md` (`mole rules`, `mole decisions`, `mole check`, `mole demo`).

## Done-when
- `mole init` on a fresh repo writes exactly one example decision record with `id`/`title`/`status`/`rules`.
- Re-running never overwrites that file (idempotent), even if hand-edited.
- `--dry-run` writes nothing at all, on any repo state.
- `--agents-snippet` appends the exact sentence already published in scripts/public-README.md's "AGENTS.md /
  CLAUDE.md precedence" section, wrapped in markers, never duplicated; creates AGENTS.md if neither
  AGENTS.md nor CLAUDE.md exists; appends to whichever of the two exist otherwise.
- Default (no flags, non-interactive): never touches AGENTS.md/CLAUDE.md.
- `mole --help` / no-args usage lists `init` (the existing T92 test derives this automatically).
- `mole demo`'s closing line points at `mole init`.
- docs/decisions-and-rules.md and scripts/public-README.md document `mole init`.

## Boundary
packages/daemon/src/init.ts (new), one dispatch line + one usage-string line in packages/daemon/src/cli.ts,
one closing-line addition in packages/daemon/src/demo.ts, packages/daemon/test/init.test.ts (new),
docs/decisions-and-rules.md, scripts/public-README.md, scripts/export-public.mjs (3 new private-string-scan
allowlist entries for the legitimate AGENTS.md references the new code/docs needed), the backlog.json status
correction (context/, not git-tracked).

## Checks
`npx tsc -b` (full repo, clean) + `npx vitest run packages/daemon/test/init.test.ts
packages/daemon/test/cli-help.test.ts packages/daemon` (68 tests green) +
`npx vitest run scripts/export-public.test.ts scripts/demo-assets-sync.test.ts
packages/decisions/test/incident-loader-indent.test.ts
packages/decisions/test/incident-loader-indent-snapshot.test.ts` (247 tests green).
Red saved before the fix: `4 log/red.txt` (5 failures: dist/cli.js has no `init`, usage string doesn't
mention it). Green after: `4 log/green.txt`.

## Non-goals
`mole decision new`'s own format/validation (unchanged); the decision graph's conflict/incident machinery
(unchanged); publishing (`npm install -g mole-code` still needs Raymond's tokens, unrelated to this task).

## Proof
Branch `ledger/t96-mole-init`, worktree `/Users/a1/Desktop/CS Code/Project/Mole-worktrees/T96-mole-init`.
See `4 log/red.txt`, `4 log/green.txt`.

## Stop
None open that blocks merge; the TTY-prompt path (`createInterface` in init.ts) has no automated coverage
(NOT RUN: a real interactive terminal, not available to a subagent) — the non-interactive and all explicit-flag
paths are fully covered instead, and the default (no flags, no TTY) is the safe no-prompt/no-write path.
