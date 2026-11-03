```notes
ledger (newest last, nothing deleted)
    2026-11-03 08:35      new → proposed      Race in @mole/steer (T74/T75): the inbox bootstrap writeFileSync(canonical, ..., {flag:'wx'}) runs OUTSIDE the lock and is not atomic (create, then write), so a
```
