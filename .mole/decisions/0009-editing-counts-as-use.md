---
id: '0009'
title: Editing counts as use
status: accepted
door: two-way
traces_to: [tenet-2, tenet-3]
overrides: ['0007']
scope:
  - packages/daemon/src/server.ts#Daemon.startWatching
evidence:
  - test: packages/daemon/test/daemon.test.ts#idle shutdown (T9)
  - incident: 2026-10-27-map-stopped-while-typing
approver: raymond
source: commit 9e19c51 (T9 review fixes, idle clock counts editing)
---

## Decision

A file change seen by the watcher resets the idle clock, like a request does.
An exception to 0007: a person typing in one file for an hour must not lose the map.
