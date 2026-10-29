---
id: '0007'
title: Stop the daemon after 30 idle minutes
status: accepted
door: two-way
traces_to: [tenet-2]
scope:
  - packages/daemon/src/cli.ts
  - packages/daemon/src/server.ts#Daemon.startIdleWatch
overridden_by: ['0008', '0009']
evidence:
  - test: packages/daemon/test/daemon.test.ts#idle shutdown (T9)
approver: raymond
source: commit 6a546ec (T9 self-contained .vsix, idle shutdown + restart)
---

## Context

The daemon is started by the editor extension or the MCP server and keeps a TypeScript index and a SQLite file open.
Left alone it would run for days after the editor closed.

## Decision

`mole daemon` stops itself after 30 minutes without a request (`--idle-minutes`, 0 = never). The lock and socket are removed on the way out.
Indexing and editing are exceptions, decided in 0008 and 0009.
