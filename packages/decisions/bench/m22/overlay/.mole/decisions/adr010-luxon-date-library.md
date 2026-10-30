---
id: adr010
title: 'Use the Luxon date library'
status: accepted
door: two-way
scope:
  - plugins/notifications/src/components/
source: docs/architecture-decisions/adr010-luxon-date-library.md (backstage e8c4d056e3c)
---

## Decision

Luxon is the standard date library for core packages and plugins, for date manipulation or formatting the native Date cannot do easily. Moment.js has large bundle sizes and mutable state and is being sunset; Luxon is immutable and uses Intl.
