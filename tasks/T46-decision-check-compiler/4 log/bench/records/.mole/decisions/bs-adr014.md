---
id: bs-adr014
title: "Proper use of HTTP fetching libraries"
status: accepted
scope:
  - packages/core-plugin-api/src/apis/definitions/FetchApi.ts
  - packages/core-plugin-api/src/index.ts
source: backstage/backstage@e8c4d056 docs/architecture-decisions/adr014-use-fetch.md
match:
  - pattern: from\s+['"]node-fetch['"]
    in: "**/*.{ts,tsx,js}"
    why: We will gradually transition away from third party `fetch` replacement
      packages such as `node-fetch`
  - pattern: require\(\s*['"]node-fetch['"]\s*\)
    in: "**/*.{ts,tsx,js}"
    why: We will gradually transition away from third party `fetch` replacement
      packages such as `node-fetch`
  - pattern: from\s+['"]isomorphic-fetch['"]
    in: "**/*.{ts,tsx,js}"
    why: Isomorphic packages should have a dependency on the `cross-fetch` package
      for mocking and type definitions
rules:
  - forbid: import
    from: packages/*/src/**
    to:
      - node-fetch
    why: All code that is executed in Node.js ... should use the native `fetch`
---
Overlay record for the M24 bench (T32). Scope written from the ADR text and the repo tree at the pinned head, never from a PR: fetchApiRef, named in the ADR.
