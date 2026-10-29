---
id: bs-adr003
title: "Avoid Default Exports and Prefer Named Exports"
status: accepted
scope: []
source: backstage/backstage@e8c4d056 docs/architecture-decisions/adr003-avoid-default-exports.md
match:
  - pattern: '\bexport\s+default\b'
    in: '{packages,plugins}/*/src/**'
    why: 'ADR003 Decision: "We will stop using default exports except when absolutely necessary"'
  - pattern: '^\s*export\s+(const|let|function|async\s+function|class|abstract\s+class|enum|interface|type|\{|\*)'
    in: '{packages,plugins}/*/src/**'
    why: 'ADR003 title "Avoid Default Exports and Prefer Named Exports"; Consequences: "Have a connected component? `export const ConnectedComponent = connect(Component)`" (every added export is a named-vs-default choice)'
---

Overlay record for the M24 bench (T32), v2 (options round): the frozen m24 overlay + `match:` content anchors written from the ADR text (each `why` quotes the sentence). Scope written from the ADR text and the repo tree at the pinned head, never from a PR: codebase-wide convention: no path anchor.
