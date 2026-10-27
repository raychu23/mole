```notes
ledger (newest last, nothing deleted)
    2026-10-25 18:21      new → proposed      Fix the map's file:line evidence for callers and callees: show the CALL-SITE line (edge evidence, already stored in edges.path/line) instead of the neighbour fu
    2026-10-25 18:32      proposed → ready      owner unclaimed
    2026-10-25 18:32      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T7-map-callsite-lines · branch ledger/t7-map-callsite-lines · base 7458804
    2026-10-25 18:35      running → submitted      report: callers/importers now carry site{path,line,count}, map text prints call-site line + xN, webview click opens site line, callees keep declaration line by design, excalidraw shouldResizeFromCenter map lines 507/696/
    2026-10-25 18:35      checks ran: npm run check in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T7-map-callsite-lines → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-10-25 18:42      submitted → verified      reviewer subagent sa-0-fd89d162 · findings: 3 fixes: file-level callers/importers print path:line xN in text, MCP description explains call-site lines, done-when #2 wording: site.count is the 'more sites' signal (no sepa
    2026-10-25 18:42      checks ran: npm run check in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T7-map-callsite-lines → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-10-25 18:43      verified → integrated      merge a16f9db merge of ledger/t7-map-callsite-lines into main · combined checks exit 0
    2026-10-25 18:43      combined checks ran: npm run check in /Users/a1/Desktop/CS Code/Project/Mole → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-10-27 16:40      integrated → done      outcome: Callers/importers carry call/import site line in text, JSON and panel, excalidraw lines equal grep -n, merged · resources: retain · prevents: packages/daemon/test/daemon.test.ts:38 call-site lines tests
    2026-10-27 16:40      prevents: packages/daemon/test/daemon.test.ts:38 call-site lines tests [source: tasks/T7-map-callsite-lines; added: 2026-10-27]
```
