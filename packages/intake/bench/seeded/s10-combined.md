---
id: s10
title: An in-memory cache instead of SQLite for the index
status: accepted
door: one-way
traces_to: [tenet-1]
scope:
  - packages/indexer/src/memory-cache.ts
approver: raymond
source: "seeded flaw S10 (bench/m30-key.json): both a contrast phrase with no Considered Options and a scope path that was never created (never built per 0010)"
---

## Decision

We use an in-memory cache rather than SQLite for the index, to avoid disk I/O.
