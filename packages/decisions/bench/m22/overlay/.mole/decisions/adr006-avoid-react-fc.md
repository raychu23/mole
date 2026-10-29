---
id: adr006
title: 'Avoid React.FC and React.SFC'
status: accepted
door: two-way
scope:
  - plugins/notifications/src/components/
source: docs/architecture-decisions/adr006-avoid-react-fc.md (backstage e8c4d056e3c)
---

## Decision

React.FC and React.SFC are avoided in new code: they add children props implicitly and do not support generic types on children; Facebook removed React.FC from the create-react-app base template. Type props as a plain function parameter instead.
