---
id: adr004
title: 'Module export structure'
status: accepted
door: two-way
scope:
  - plugins/notifications/src/
  - packages/core-components/src/
source: docs/architecture-decisions/adr004-module-export-structure.md (backstage e8c4d056e3c)
---

## Decision

Each exported symbol is traceable through index files all the way down to the root of the package, src/index.ts. Each index file only re-exports from its own immediate directory children, and only index files have re-exports, so the boundaries of a module are predictable.
