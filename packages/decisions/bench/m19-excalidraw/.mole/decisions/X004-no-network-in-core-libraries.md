---
id: X004
title: The core libraries (common, math, element) never call the network
status: accepted
scope:
  - packages/common/src/
  - packages/math/src/
  - packages/element/src/
source: M19 bench overlay (T27), read from excalidraw e7b534668a60 (no network call in these three packages)
rules:
  - forbid: call
    callee: fetch
    from: 'packages/{common,math,element}/src/'
    why: network access lives in the editor and app (data/, collab); the libraries must run offline and in workers
---

Bench fixture (not Excalidraw's own record).
