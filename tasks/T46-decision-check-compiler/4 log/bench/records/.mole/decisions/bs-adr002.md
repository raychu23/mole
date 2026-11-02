---
id: bs-adr002
title: "Default Software Catalog File Format"
status: accepted
scope:
  - packages/catalog-model/src/entity/Entity.ts
  - packages/catalog-model/src/schema/
  - catalog-info.yaml
  - packages/catalog-model/src/index.ts
  - packages/catalog-model/src/entity/index.ts
source: backstage/backstage@e8c4d056
  docs/architecture-decisions/adr002-default-catalog-file-format.md
match:
  - pattern: apiVersion\s*:\s*['"](?!backstage\.io/)[^'"]+['"]
    in: packages/catalog-model/src/**
    why: Backstage specific entities have an apiVersion that is prefixed with
      backstage.io/
  - pattern: catalog-info\.(json|toml|ya?ml\.json)['"]
    why: Descriptor files use the YAML format.
  - pattern: name\s*:\s*\{[^}]*pattern\s*:\s*['"](?!\^?\[a-zA-Z0-9\])
    in: packages/catalog-model/src/schema/**
    why: Must consist of sequences of [a-z0-9A-Z] possibly separated by one of [-_.]
  - pattern: ^\s*export\s+(const|let|function|class|interface|type)\s
    in: packages/catalog-model/src/entity/index.ts
    why: a barrel file exists only to re-export; a brand-new top-level export from
      it changes the entity shape/reference surface this decision governs
---
Overlay record for the M24 bench (T32). Scope written from the ADR text and the repo tree at the pinned head, never from a PR: the descriptor format: Entity shape, JSON schemas, the repo's own descriptor.
