---
id: X005
title: '@excalidraw/math is deterministic'
status: accepted
scope:
  - packages/math/src/
source: M19 bench overlay (T27), read from excalidraw e7b534668a60 packages/math/src (no Math.random)
rules:
  - forbid: call
    callee: Math.random
    from: packages/math/src/
    why: geometry results must be reproducible for collaboration and tests; randomness comes in through common/random.ts seeds
---

Bench fixture (not Excalidraw's own record).
