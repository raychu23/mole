---
id: X002
title: '@excalidraw/common imports element and editor types only, never their code'
status: accepted
scope:
  - packages/common/src/
source: M19 bench overlay (T27), read from excalidraw e7b534668a60 packages/common/src (every element/excalidraw import is `import type`)
rules:
  - forbid: import
    from: packages/common/src/
    to: ['@excalidraw/element', '@excalidraw/excalidraw']
    why: common sits under element and the editor; a runtime import upward makes a module cycle and pulls the editor into every package
---

Bench fixture (not Excalidraw's own record).
