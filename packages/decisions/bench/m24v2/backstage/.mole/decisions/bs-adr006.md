---
id: bs-adr006
title: "Avoid React.FC and React.SFC"
status: accepted
scope: []
source: backstage/backstage@e8c4d056 docs/architecture-decisions/adr006-avoid-react-fc.md
match:
  - pattern: '\bReact\.(FC|SFC|FunctionComponent)\b|:\s*(FC|SFC|FunctionComponent)\s*<'
    in: '**/*.{ts,tsx}'
    why: 'ADR006 Decision: "`React.FC` and `React.SFC` should be avoided in our codebase when adding new code" (example: `const BadComponent: FC<BadProps>`)'
---

Overlay record for the M24 bench (T32), v2 (options round): the frozen m24 overlay + `match:` content anchors written from the ADR text (each `why` quotes the sentence). Scope written from the ADR text and the repo tree at the pinned head, never from a PR: codebase-wide convention: no path anchor.
