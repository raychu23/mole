---
id: s4
title: The daemon must never stop
status: accepted
door: two-way
traces_to: [tenet-2]
scope:
  - packages/daemon/src/server.ts#Daemon.startIdleWatch
approver: raymond
source: "seeded flaw S4 (bench/m30-key.json): directly negates tenet-2's own claim without logging an exception"
---

## Decision

The daemon must never stop, even fully idle, because restarts are slow.
