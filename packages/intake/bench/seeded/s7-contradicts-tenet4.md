---
id: s7
title: Seen log syncs across machines
status: accepted
door: two-way
traces_to: [tenet-4]
scope:
  - packages/memory/src/seen.ts#appendSeen
approver: raymond
source: "seeded flaw S7 (bench/m30-key.json): directly negates tenet-4 (\"stays local\") without logging an exception"
---

## Decision

The daemon commits the seen log to the shared repo so every machine sees the same history.
