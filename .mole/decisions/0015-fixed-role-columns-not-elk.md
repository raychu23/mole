---
id: '0015'
title: Fixed role columns instead of ELK
status: accepted
door: two-way
traces_to: [tenet-3]
scope:
  - packages/layout/src/layout.ts#layoutNeighborhood
evidence:
  - test: packages/layout/test/layout.test.ts#layoutNeighborhood
alternative_to: [elk-layered]
approver: raymond
source: takeaways §16 2026-10-20 T2 close-out ("fixed role columns accepted instead of ELK"), commit 09c0849
---

## Decision

The panel lays nodes out in fixed role columns (callers left, focus middle, callees right); a node that keeps its role keeps its row.
ELK was tried and cannot pin role columns.
