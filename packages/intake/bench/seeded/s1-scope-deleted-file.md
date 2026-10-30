---
id: s1
title: Stop the watcher after 10 idle minutes
status: accepted
door: two-way
traces_to: [tenet-2]
scope:
  - packages/daemon/src/old-watcher.ts
approver: raymond
source: "seeded flaw S1 (bench/m30-key.json): scope path does not exist in this repo"
---

## Decision

The old file watcher stops itself after 10 idle minutes.
