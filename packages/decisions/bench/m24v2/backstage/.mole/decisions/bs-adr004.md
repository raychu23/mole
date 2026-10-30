---
id: bs-adr004
title: "Module Export Structure"
status: accepted
scope: []
source: backstage/backstage@e8c4d056 docs/architecture-decisions/adr004-module-export-structure.md
match:
  - pattern: '^\s*export\s'
    in: '{packages,plugins}/*/src/**'
    why: 'ADR004 Decision: "We will make each exported symbol traceable through index files all the way down to the root of the package, `src/index.ts`. Each index file will only re-export from its own immediate directory children, and only index files will have re-exports."'
---

Overlay record for the M24 bench (T32), v2 (options round): the frozen m24 overlay + `match:` content anchors written from the ADR text (each `why` quotes the sentence). Scope written from the ADR text and the repo tree at the pinned head, never from a PR: codebase-wide convention (every index.ts): no path anchor.
