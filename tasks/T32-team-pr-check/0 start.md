---
state: integrated
owner: mole-builder-10
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t32-team-pr-check
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T32-team-pr-check
base: dbfdc52
reviewer: fresh-review-a14-r1
updated: 2026-10-29 18:33
status: ledger integrated
next: record outcome → ledger move <task> done --outcome … --resources … --prevents …
claimed: 2026-10-29 15:46
---
```notes
T32-team-pr-check      ledger task (rules.md §3 code features)      project tasks
    goal                    Team phase A, no server (Team mode.md §5): a GitHub Actions job runs `mole check --diff` on every pull request and posts ONE check run: the decision records (.mole/decisions, T29) and notes whose anchors the diff touches with their citator flag, the owners from CODEOWNERS for those folders, the past fixes on the touched lines (T12) and up to 3 read-back questions for the author (T14); silent (neutral, no comment) when nothing governs the changed lines; every teammate's agent reads the same records through the local MCP server (mole_check) at session start
    done-when               1) the workflow + a reusable action in the repo, check-run output with line annotations, proven locally by running the workflow's steps (as T16 did), never pushed, 2) M24 on 30 replayed merged PRs of 2 public repos with CODEOWNERS (key labeled before code: which records/notes/owners each PR should surface): precision >= 0.9 and recall >= 0.8 for 'record governs these lines', owners exact, p95 < 60 s for the local run of the job's steps, 3) noise rule: silent on PRs with nothing governed, at most 1 check run per push, never a PR comment, 4) dogfood on Mole's own repo with its builder agents as the team: share of builder tasks whose diffs surface the governing decision, 5) failure case: a renamed file whose anchor can't re-attach shows grey 'unanchored', never a wrong record, 6) npm run check passes
    status                  2026-10-29 integrated      merge cc3f521 · combined checks exit 0 · note: npm run check on main (merge cc3f521) = exit 0, 58 files / 455 tests gree
    next                    record outcome → ledger move <task> done --outcome … --resources … --prevents …
    pinned
    mode                    code
    boundary                .github/workflows/mole-pr-check.yml (new), .github/actions/mole-check/** (new), packages/decisions/src/check/** + bench m24*, packages/daemon/src/cli.ts (register the subcommand with one import + one call only), tasks/T32-team-pr-check/**
    checks                  npm run check && node packages/decisions/dist/bench/m24.js
    non-goals               no PR comments/bot (D24) · no structure-map work (D23) · prototype/ rejected · no publishing or pushing · Raymond's accounts never used · no paid API or model calls from Mole code · don't edit benchmark keys after the red-tests commit (R2) · shared registries (MCP tool list, CLI usage, workspace deps) tested with toContain, never an exact set
    proof                   runs.jsonl last line with the metric + npm run check output + the red-tests commit sha dated before the first implementation commit + the fresh reviewer's verdict
    stop                    same check failure 3 rounds in a row (R3) · needs Raymond's accounts, paid API spend, people or a product decision (log it in 4 log, move on to the next task)
    came from               USER 2026-10-29 03:50 'also how abt the team integratn part doign this knowledge agents stuff w a github and few diff membs … there has to be exisitng syst that does that right … wat it take us to build that as plan taking inspo from larger companie systems' · Team mode.md · D34
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
