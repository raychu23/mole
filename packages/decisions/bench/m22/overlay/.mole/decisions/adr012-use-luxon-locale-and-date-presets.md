---
id: adr012
title: 'Use Luxon toLocaleString and date/time presets'
status: accepted
door: two-way
scope:
  - plugins/notifications/src/components/
source: docs/architecture-decisions/adr012-use-luxon-locale-and-date-presets.md (backstage e8c4d056e3c)
---

## Decision

Dates and times shown in the UI use toLocaleString with Luxon's presets instead of custom toFormat strings, so users read dates in their own locale's familiar format.
