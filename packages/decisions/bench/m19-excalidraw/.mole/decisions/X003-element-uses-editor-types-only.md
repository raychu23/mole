---
id: X003
title: '@excalidraw/element uses the editor package for types only'
status: accepted
scope:
  - packages/element/src/
source: M19 bench overlay (T27), read from excalidraw e7b534668a60 packages/element/src (35 files import @excalidraw/excalidraw, all `import type`)
rules:
  - forbid: import
    from: packages/element/src/
    to: '@excalidraw/excalidraw'
    why: the element model must load without React and the editor (export, collab server, tests)
---

Bench fixture (not Excalidraw's own record).
