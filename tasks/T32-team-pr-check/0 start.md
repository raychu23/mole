---
state: proposed
owner:
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch:
worktree:
base:
reviewer:
updated: 2026-10-29 03:59
status: ledger proposed
next: fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
---
```notes
T32-team-pr-check      ledger task (rules.md §3 code features)      project tasks
    goal                    Team phase A, no server (Team mode.md §5): a GitHub Actions job runs `mole check --diff` on every pull request and posts ONE check run: the decision records (.mole/decisions, T29) and notes whose anchors the diff touches with their citator flag, the owners from CODEOWNERS for those folders, the past fixes on the touched lines (T12) and up to 3 read-back questions for the author (T14); silent (neutral, no comment) when nothing governs the changed lines; every teammate's agent reads the same records through the local MCP server (mole_check) at session start
    done-when               1) the workflow + a reusable action in the repo, check run with line annotations; 2) M24 on 30 replayed merged PRs of 2 public repos with CODEOWNERS (key labeled before code: which records/notes/owners each PR should surface): precision >= 0.9 and recall >= 0.8 for 'record governs these lines', owners exact, p95 < 60 s from push to check run in Actions; 3) noise rule: silent on PRs with nothing governed, at most 1 check run per push, never a PR comment per push; 4) dogfood on Mole's own repo with its builder agents as the team: share of builder tasks whose PRs surface the governing decision (today 6 of your decisions are named by no task file); 5) failure case: a renamed file whose anchor can't re-attach shows grey 'unanchored', never a wrong record; 6) npm run check passes
    status                  2026-10-29 proposed
    next                    fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
    pinned
    mode                    code
    boundary
    checks
    non-goals
    proof
    stop
    came from               USER 2026-10-29 03:50 'also how abt the team integratn part doign this knowledge agents stuff w a github and few diff membs … there has to be exisitng syst that does that right … wat it take us to build that as plan taking inspo from larger companie systems' · Team mode.md · D34
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
