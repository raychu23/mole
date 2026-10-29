---
id: '0017'
title: packages/core is the bottom layer and imports no other Mole package
status: proposed
door: two-way
source: >-
  T27 builder (mole-builder-4, 2026-10-29), from packages/core/package.json having no @mole dependency;
  waits for Raymond's approval. No scope: the rule's from: (packages/core/src/) is what it covers
rules:
  - forbid: import
    from: packages/core/src/
    to: '@mole/'
    types: true
    why: every other package builds on core's types (Graph, Neighborhood); an import back up, even of a type, makes a cycle in the tsc -b build order
---

## Decision

`@mole/core` holds the shared graph and neighborhood types and imports no other `@mole/*` package, types included.
Every other package may import core. Proposed by the T27 builder from the current tree (0 violations); Raymond accepts or rejects it.
