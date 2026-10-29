```notes
T15 key changes (test/key edits after the red commit, workspace wiring, things outside the boundary)

red commit   packages/mcp/test/mcp.test.ts (T2's mole_map test) asserted the tool list toEqual(['mole_map']); T15 adds
             mole_check, so that one line became toContain('mole_map') IN the red commit (before any implementation).
             check.test.ts asserts the full sorted list ['mole_check', 'mole_map'].
wiring       apps/vscode: dependencies + tsconfig references on @mole/history, @mole/memory, @mole/questions (type imports
             only: CheckResult / Question / SinceResult; the bundle does not grow from them).
             packages/mcp: dependencies + tsconfig references on @mole/history, @mole/questions (mole_check runs the same
             library calls as the CLI). package-lock.json updated by npm install (workspace links only).
             vitest.config.ts: include plugins/*/test/**/*.test.ts (the Claude Code plugin's hook test).
             apps/vscode/package.json: script "hover-check".
```
