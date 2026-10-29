---
id: bs-adr011
title: "Plugin Package Structure"
status: accepted
scope: []
source: backstage/backstage@e8c4d056 docs/architecture-decisions/adr011-plugin-package-structure.md
match:
  - pattern: '"name"\s*:\s*"@backstage/|"@backstage/plugin-[a-z0-9-]+"\s*:'
    in: '{packages,plugins}/*/package.json'
    why: 'ADR011 Decision: "We prefix the package names with `@backstage/plugin-`" + Consequences: "help enforce the package names and dependencies between them"'
---

Overlay record for the M24 bench (T32), v2 (options round): the frozen m24 overlay + `match:` content anchors written from the ADR text (each `why` quotes the sentence). Scope written from the ADR text and the repo tree at the pinned head, never from a PR: repo-wide package naming convention: no path anchor.
