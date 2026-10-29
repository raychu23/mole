---
id: '0012'
title: The seen log stays local
status: accepted
door: two-way
traces_to: [tenet-4]
scope:
  - packages/memory/src/seen.ts#appendSeen
  - packages/memory/src/seen.ts#readSeen
evidence:
  - test: packages/memory/test/seen-log.test.ts#seen log robustness
approver: raymond
source: T13 commit 89f015b (seen log in .mole/local/seen.jsonl, gitignored)
---

## Decision

What you looked at is written to `.mole/local/seen.jsonl`, which is gitignored and never leaves the machine.
