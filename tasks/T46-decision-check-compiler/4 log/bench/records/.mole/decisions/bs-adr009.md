---
id: bs-adr009
title: "Entity References"
status: accepted
scope:
  - packages/catalog-model/src/entity/ref.ts#parseEntityRef
  - packages/catalog-model/src/entity/ref.ts#stringifyEntityRef
  - packages/catalog-model/src/entity/ref.ts#getCompoundEntityRef
  - packages/catalog-model/src/index.ts
  - packages/plugin-catalog-react/src/routes.ts
  - packages/catalog-model/src/entity/index.ts
source: backstage/backstage@e8c4d056
  docs/architecture-decisions/adr009-entity-references.md
match:
  - pattern: /:kind\/:namespace\/:name/
    in: packages/**/*.{ts,tsx}
    why: "the URL containing the reference shall take the following form:
      :namespace/:kind/:name"
  - pattern: \$\{\s*stringifyEntityRef\(
    in: packages/**/*.{ts,tsx}
    why: we do not encourage the string form of entity references to be used as a
      single URL segment
  - pattern: ^\s*export\s+(const|let|function|class|interface|type)\s
    in: packages/catalog-model/src/entity/index.ts
    why: a barrel file exists only to re-export; a brand-new top-level export from
      it changes the entity shape/reference surface this decision governs
---
Overlay record for the M24 bench (T32). Scope written from the ADR text and the repo tree at the pinned head, never from a PR: the reference parser/serializer.
