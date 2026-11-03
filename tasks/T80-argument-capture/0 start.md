---
state: verified
owner: hermes-build
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t80-argument-capture
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T80-argument-capture
base:
reviewer: hermes-subagent deleg_4aace94e FAIL, deleg_bcd93cfa FAIL, deleg_734389d3 FAIL, deleg_66708b2a PASS (fresh, claude-sonnet-5)
updated: 2026-11-03 10:14
status: ledger verified
next: merge → ledger move <task> integrated --merge … (ledger reruns checks in the repo)
claimed: 2026-11-03 07:03
---
```notes
T80-argument-capture      ledger task (rules.md §3 code features)      project tasks
    goal                    Contestable AI-drafted arguments from human records (W3, backlog argument-capture): when Mole drafts an argument (premise, pro/con, attack) from an ADR/PR/meeting text, store it with its exact source span (file + line/char range + quoted text) and provenance (model/compiler/person), status draft until a person approves; approved and draft arguments are visibly separate and drafts never change a decision's verdict in the reasoning engine until approved. Read the existing capture path (packages/decisions/src/capture, argdown, T43 definitions) and extend it; MADR 'Considered Options / Pros and Cons' become arguments with spans.
    done-when               1 prior-art note (MADR 4 template fields, Argdown, AIF/argument-mining span annotation e.g. Stab & Gurevych, W3C Web Annotation TextQuoteSelector) · 2 tests first · 3 drafts excluded from evaluate() until approved (test) · 4 run on 5 real MADR records from the vendored corpora, spans hand-checked in 4 log · 5 decisions + reasoning tests pass
    status                  2026-11-03 verified      reviewer hermes-subagent deleg_4aace94e FAIL, deleg_bcd93cfa FAIL, deleg_734389d3 FAIL, deleg_66708b2a PASS (fresh, clau
    next                    merge → ledger move <task> integrated --merge … (ledger reruns checks in the repo)
    pinned
    mode                    one worker
    boundary                packages/decisions (capture/argdown), packages/reasoning only via its public input, daemon cli, tests
    checks                  npm run check
    non-goals               anything outside boundary
    proof                   4 log/
    stop                    a draft argument changes a verdict
    came from               backlog argument-capture; inventory F36; W3
    links                   4 log/ledger.md (every transition + its evidence)
    harness
```
