---
id: adr003
title: 'Avoid default exports and prefer named exports'
status: accepted
door: two-way
scope:
  - plugins/
  - packages/
source: docs/architecture-decisions/adr003-avoid-default-exports.md (backstage e8c4d056e3c)
---

## Decision

We will stop using default exports except when absolutely necessary (such as React.lazy modules). Named exports keep one name per symbol, so IDE rename, Find All References and grep work and re-exports do not conflict. Scope from the ADR: "our codebases".
