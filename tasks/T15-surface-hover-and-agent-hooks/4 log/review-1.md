```notes
T15 review round 1      reviewer-T15-r1 (fresh context, Claude)      2026-10-29      branch ledger/t15-surface-hover-and-agent-hooks @ 47667e2 (base a0b46a9, red a11b256)
    verdict                 VERIFIED: no P0 / P1      5 P2 below (hardening / noise / evidence), none blocks a done-when

    R2 red tests            git diff a11b256 HEAD -- '*test*' → only ADDS 4 log/selftest-vsix-summary.json; --diff-filter=M empty
                            hover.test.ts, since.test.ts, check.test.ts, hooks.test.ts, hover-check.mjs unchanged since a11b256
                            mcp.test.ts (T2) loosened toEqual(['mole_map']) → toContain IN the red commit, logged in 4 log/key-changes.md
    boundary                code in apps/vscode/**, packages/mcp/**, plugins/claude-code/**, tasks/T15/**
                            outside: vitest.config.ts (+plugins/*/test include), package-lock.json (workspace links) — both in the red commit, logged
                            no prototype/, PR bot, structure-map or wiki work      nothing pushed / published
    privacy                 hover + since run the local CLI (execFile, process.execPath) and git; hooks run local git + mole CLI
                            no network calls added; hook output goes only to the Claude Code session it is installed in (by design)
    no popups               grep show(Error|Warning|Information)Message in apps/vscode/src, packages/mcp/src, plugins → only the
                            hover-check wrapper that COUNTS popups; every failure path logs to the output channel (surface.ts, Touched)

    done-when               evidence (mine = rerun by this reviewer)
    1 hover + click         mine: dev hover check passed (hoverShowsPastFix, clickOpensCommit, clickOpensSource = true); vsix json in 4 log
    2 panel since           mine: panelListsSince true (rendered 1); since.ts escapes every field (esc)
    3 mole_check = CLI      mine: packages/mcp/test/check.test.ts green (worktree, sha, diff+base deep-equal; bad input isError; no daemon started)
    4 plugin hooks          mine: SCRATCH=<scratch> bash "3 work/hooks-run.sh" exit 0; SessionStart fresh+stale notes, NOTE-C excluded;
                            Stop systemMessage with fix sha, why, test, source, questions first; committed session diff still checked;
                            no-change session silent      hooks.test.ts 5/5
    5 clean-profile         mine: hover-check.mjs dev build, clean --user-data-dir, git clone --shared scratch → passed 8/8 checks
                            T9 selftest on vsix: implementer's 4 log/selftest-vsix-summary.json (not rerun: it drives the ui-tui fixture)
    6 daemon down          mine: down.daemonRunning false, moleHovers 0, decorations 0, popups.patched true count 0
    7 npm run check         mine: exit 0, Test Files 22 passed, Tests 150 passed (150), 24 s (no 5 s timeouts this run, no rerun needed)

    findings
    P2-1 hook CLI lookup    plugins/claude-code/scripts/lib.mjs findMole: `mole` on PATH wins over packages/daemon/dist/cli.js in the repo
                            the unrelated Mac cleaner tw93/Mole installs a `mole` binary (brew) → with it installed the hooks call that
                            tool (`mole memory --json --root …`), JSON.parse fails, hooks go silent even inside the Mole repo
                            repro: mkdir /tmp/fakebin; printf '#!/bin/sh\necho usage\n' > /tmp/fakebin/mole; chmod +x it;
                            PATH=/tmp/fakebin:$PATH (MOLE_BIN unset) → stop.mjs prints nothing on the hooks-run fixture
                            ran it: stderr "mole hook: check failed: Unexpected token 'u', "usage", stdout empty, exit 0
                            fix idea: prefer the repo-local cli, or probe `mole --version` for the Mole signature before using PATH
    P2-2 Stop repeats       stop.mjs runs on every turn end and re-emits the cumulative session diff check each time (same past fixes,
                            same questions) — noise in long sessions      repro: hooks-run.sh step 2 then call stop again → identical message
                            fix idea: remember the last emitted hash per session in the session file; emit only when it changes
    P2-3 git argv           surface.ts showCommit / mole-git provider pass sha straight to `git show <sha>` (no `--end-of-options`,
                            no hex check); via the hover the sha is always git hex, but the command is callable by any caller
                            e.g. executeCommand('mole.showCommit','--output=/tmp/x') → git show --output writes a file
                            ran it: `git show --output=<scratch>/written HEAD` in a scratch repo created the file (196 bytes)
                            fix: validate /^[0-9a-f]{7,40}$/ or add `--end-of-options`
    P2-4 refresh cost       every window focus + save (800 ms debounce) spawns `mole check --worktree` and `mole since` processes;
                            fine on Mole-size repos, unmeasured on large ones (T9-style switch timing does not cover it)
    P2-5 evidence           4 log/selftest-vsix-summary.json has "extension": null, so the file alone does not show the vsix was the build
                            under test (runs.jsonl note says it was); record the vsix name/hash in the summary next time
    note                    packages/mcp checkJson re-implements the CLI's --json shaping (facts minus notes/guards + questions) instead of
                            sharing one function; check.test.ts guards equality today, drift risk later (not a finding)
```
