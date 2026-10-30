---
id: adr014
title: 'Proper use of HTTP fetching libraries (native fetch)'
status: accepted
door: two-way
scope:
  - plugins/notifications/src/api/
source: docs/architecture-decisions/adr014-use-fetch.md (backstage e8c4d056e3c)
---

## Decision

Code that runs in Node.js uses the native fetch (Node.js 20+, undici based) and typeof fetch as the type; frontend plugins and packages prefer fetchApiRef; isomorphic packages accept an injected typeof fetch. Replaces ADR013 (node-fetch).
