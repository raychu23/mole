---
id: X001
title: '@excalidraw/math is the bottom layer: no element, editor, utils or React'
status: accepted
scope:
  - packages/math/src/
source: M19 bench overlay (T27), read from excalidraw e7b534668a60 packages/math/src imports (only @excalidraw/common)
rules:
  - forbid: import
    from: packages/math/src/
    to: ['@excalidraw/element', '@excalidraw/excalidraw', '@excalidraw/utils', react]
    types: true
    why: math is published on its own and must stay usable without the element model or the editor
---

Bench fixture (not Excalidraw's own record): a layering decision true of Excalidraw at e7b534668a60.
