---
state: submitted
owner: hermes-build
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t82-incident-loader-indent
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T82-incident-loader-indent
base:
reviewer:
updated: 2026-11-03 09:38
status: ledger submitted
next: fresh reviewer → ledger move <task> verified --reviewer … --findings …
claimed: 2026-11-03 07:03
---
```notes
T82-incident-loader-indent      ledger task (rules.md §3 code features)      project tasks
    goal                    Fix backlog incident-loader-indent: a .mole incident record whose block list mixes indentation (4-space then 2-space items) makes frontMatter fail and the whole record is dropped silently. Mixed-but-valid YAML must load; invalid YAML must be reported as a problem with file:line, never dropped silently. Use the YAML library already in the repo (check how graph.ts parses front matter) rather than hand-parsing.
    done-when               1 red test from the T58 review 2 reproducer · 2 fix · 3 a sweep test: every record shape in the vendored corpora + fixtures still loads identically (snapshot before/after) · 4 decisions tests pass
    status                  2026-11-03 submitted      report: tasks/T82-incident-loader-indent/2 insights.md, proof 4 log/snapshot-diff.txt, red/green · checks exit 0
    next                    fresh reviewer → ledger move <task> verified --reviewer … --findings …
    pinned
    mode                    one worker
    boundary                packages/decisions (graph.ts front matter / incidents loader), tests
    checks                  npm run check
    non-goals               anything outside boundary
    proof                   4 log/
    stop                    a record silently dropped
    came from               backlog incident-loader-indent (T58 review 2)
    links                   4 log/ledger.md (every transition + its evidence)
    harness
```
