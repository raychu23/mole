---
id: '0011'
title: Notes are repo files in .mole/notes anchored to symbols
status: accepted
door: two-way
traces_to: [tenet-1]
scope:
  - packages/memory/src/notes.ts
evidence:
  - test: packages/memory/test/memory.test.ts#stale flag (done-when 2)
approver: raymond
source: T11 commit da6279b (@mole/memory note files with fresh/stale/moved/orphaned status)
---

## Decision

A note is a markdown file with YAML front matter under `.mole/notes/`, anchored to `path#Symbol` with the symbol's normalized-body hash,
so it travels with the repo and turns stale when the code under it changes.
