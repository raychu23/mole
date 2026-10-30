---
id: bs-adr012
title: "Use Luxon.toLocaleString and date/time presets"
status: accepted
scope: []
source: backstage/backstage@e8c4d056 docs/architecture-decisions/adr012-use-luxon-locale-and-date-presets.md
match:
  - pattern: '\.(toFormat|toLocaleString)\(|\bDateTime\.(DATE|TIME|DATETIME)_[A-Z_]+'
    in: '**/*.{ts,tsx,js}'
    why: 'ADR012 Decision: "we use `toLocaleString` and Luxon''s extensive list of Date and Time presets" (Avoid: `date.toFormat(''yyyy LLL dd'')`)'
---

Overlay record for the M24 bench (T32), v2 (options round): the frozen m24 overlay + `match:` content anchors written from the ADR text (each `why` quotes the sentence). Scope written from the ADR text and the repo tree at the pinned head, never from a PR: codebase-wide convention: no path anchor.
