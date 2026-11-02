---
id: bs-adr005
title: "Catalog Core Entities"
status: accepted
scope:
  - packages/catalog-model/src/kinds/
  - packages/catalog-model/src/index.ts
source: backstage/backstage@e8c4d056
  docs/architecture-decisions/adr005-catalog-core-entities.md
match:
  - pattern: kind:\s*['"]component['"]
    in: packages/catalog-model/src/kinds/**
    why: "kind: Component"
  - pattern: kind:\s*['"]api['"]
    in: packages/catalog-model/src/kinds/**
    why: "kind: API"
  - pattern: kind:\s*['"]Api['"]
    in: packages/catalog-model/src/kinds/**
    why: "kind: API"
  - pattern: kind:\s*['"]resource['"]
    in: packages/catalog-model/src/kinds/**
    why: "kind: Resource"
  - pattern: kind:\s*['"]Resources['"]
    in: packages/catalog-model/src/kinds/**
    why: "kind: Resource"
---
Overlay record for the M24 bench (T32). Scope written from the ADR text and the repo tree at the pinned head, never from a PR: the entity kinds.
