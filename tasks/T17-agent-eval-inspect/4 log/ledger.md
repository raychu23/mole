```notes
ledger (newest last, nothing deleted)
    2026-10-28 22:23      new → proposed      End-to-end agent eval: with Inspect AI + Inspect SWE's claude_code() in a Docker sandbox, measure whether Claude Code with Mole's hooks (T15) repeats a planted 
    2026-10-29 01:06      proposed → ready      owner mole-builder-2 (Hermes chat)
    2026-10-29 05:44      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T17-agent-eval-inspect · branch ledger/t17-agent-eval-inspect · base d53d3bd
    2026-10-29 06:43      running → submitted      report: branch ledger/t17-agent-eval-inspect @1b0a35d (red 4dfd168): evals/inspect = Inspect AI task with Inspect SWE claude_code() in Docker (mole-t17-eval 1.16 GB), arms none / mole (T15 hooks + MCP), B3-tidy + B3-revi
    2026-10-29 06:43      checks ran: python3 -m pytest evals/inspect/tests -q && npm run check in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T17-agent-eval-inspect → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-10-29 06:49      submitted → verified      reviewer reviewer-T17-r1 · findings: no P0/P1. P2 (1-3 fix before paid run): 1 /opt/mole ships packages/history/bench/keys/m8-key.json naming 9e19c51 + idle clock, readable in both arms, 2 run.py does not check log.statu
    2026-10-29 06:49      checks ran: python3 -m pytest evals/inspect/tests -q && npm run check in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T17-agent-eval-inspect → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-10-29 06:57      verified → integrated      merge bfd34fa · combined checks exit 0 · note: python3 -m pytest evals/inspect/tests -q && npm run check on main bfd34fa → exit 0 (3rd try, tries 1-2 failed only on timing tests in other packages under load 46-92: apps/v
    2026-10-29 06:57      combined checks ran: python3 -m pytest evals/inspect/tests -q && npm run check in /Users/a1/Desktop/CS Code/Project/Mole → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
```
