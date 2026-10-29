---
id: s2
title: TypeScript Compiler API is the only engine
status: accepted
door: one-way
traces_to: [tenet-1]
scope:
  - packages/indexer/src/ts-engine.ts#OldIndexer
approver: raymond
source: "seeded flaw S2 (bench/m30-key.json): symbol OldIndexer was never a real export of ts-engine.ts"
---

## Decision

The index is built by `OldIndexer`, a class that does not exist in the current indexer.
