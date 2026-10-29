---
id: '0010'
title: TypeScript Compiler API + SQLite is the v1 engine
status: accepted
door: one-way
traces_to: [tenet-1]
scope:
  - packages/indexer/src/ts-engine.ts#TsIndexer
  - packages/indexer/src/db.ts
approver: raymond
source: takeaways §14 2026-10-19 ("yes do rec all"), T1 commit 8af8f81 (M0 engine benchmark)
---

## Decision

The index is built with the TypeScript Compiler API (type-checked calls, imports, definitions) and stored in SQLite (node:sqlite).
scip is for CI and other languages, tree-sitter for structure only; CodeGraph is not a dependency.
