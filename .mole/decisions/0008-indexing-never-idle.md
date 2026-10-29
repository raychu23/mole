---
id: '0008'
title: Indexing never counts as idle
status: accepted
door: two-way
traces_to: [tenet-2, tenet-3]
overrides: ['0007']
scope:
  - packages/daemon/src/server.ts#Daemon.onWorker
evidence:
  - test: packages/daemon/test/daemon.test.ts#idle shutdown (T9)
approver: raymond
source: commit 9e19c51 (T9 review fixes, idle clock counts the running index)
---

## Decision

While a worker job (full index or file update) runs, the idle clock does not tick, however long the job takes; the clock restarts when the job is done.
An exception to 0007: a large first index must not be killed half way.
