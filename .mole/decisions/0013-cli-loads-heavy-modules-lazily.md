---
id: '0013'
title: The CLI loads heavy modules only in the subcommand that needs them
status: accepted
door: two-way
traces_to: [tenet-3]
scope:
  - packages/daemon/src/cli.ts#main
approver: raymond
source: commit 2b54e3d (daemon CLI loads memory/history/server only in the subcommand that needs them)
rules:
  - forbid: import
    from: packages/daemon/src/cli.ts
    to: [typescript, better-sqlite3, '@mole/indexer', '@mole/memory', '@mole/history']
    dynamic: false
    why: loading them on every call made a 3-call CLI test exceed 5 s; import them with await import() inside the subcommand
---

## Decision

The TypeScript compiler, SQLite and git history load with `await import()` inside the subcommand.
Loading all of them on every call made a 3-call CLI test exceed 5 s on a loaded machine.
