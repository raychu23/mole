---
id: adr011
title: 'Plugin package structure'
status: accepted
door: two-way
scope:
  - plugins/notifications/
source: docs/architecture-decisions/adr011-plugin-package-structure.md (backstage e8c4d056e3c)
---

## Decision

All plugin code lives in plugins/ (packages/ is for core packages). A plugin x has x (main frontend code), x-backend, x-react, x-node, x-common and optional modules, published as @backstage/plugin-x*.
