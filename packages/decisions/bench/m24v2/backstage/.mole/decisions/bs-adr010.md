---
id: bs-adr010
title: "Use the Luxon Date Library"
status: accepted
scope: []
source: backstage/backstage@e8c4d056 docs/architecture-decisions/adr010-luxon-date-library.md
match:
  - pattern: '\b(luxon|moment|momentjs|dayjs|date-fns)\b|\bDateTime\.(now|local|fromISO|fromJSDate|fromMillis|fromFormat|utc)\b|\bDuration\.from'
    in: '**/*.{ts,tsx,js,json}'
    why: 'ADR010 Decision: "We will use Luxon as the standard date library within Backstage." Consequences: "should use `Luxon` for any date manipulation or formatting" (Moment.js named as the rejected alternative)'
---

Overlay record for the M24 bench (T32), v2 (options round): the frozen m24 overlay + `match:` content anchors written from the ADR text (each `why` quotes the sentence). Scope written from the ADR text and the repo tree at the pinned head, never from a PR: codebase-wide convention: no path anchor.
