```notes
ledger (newest last, nothing deleted)
    2026-11-03 08:35      new → proposed      Race in @mole/steer (T74/T75): the inbox bootstrap writeFileSync(canonical, ..., {flag:'wx'}) runs OUTSIDE the lock and is not atomic (create, then write), so a
    2026-11-03 08:35      proposed → ready      owner hermes-build
    2026-11-03 08:35      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T84-steer-inbox-bootstrap · branch ledger/t84-steer-inbox-bootstrap · base ?
    2026-11-03 09:59      running → submitted      report: tasks/T84-steer-inbox-bootstrap/2 insights.md, proof 4 log/red.txt (exact production error reproduced), green.txt · checks exit 0
    2026-11-03 09:59      checks ran: npm run check in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T84-steer-inbox-bootstrap → exit 0 (mole steer: inbox for session s4 was not valid JSON (Unterminated string in JSON at position 31 (lin)
```
