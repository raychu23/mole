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
approver: raymond
source: takeaways §16 2026-10-20 T2 close-out ("fixed role columns accepted instead of ELK"), commit 09c0849
---

## Decision

The panel lays nodes out in fixed role columns (callers left, focus middle, callees right); a node that keeps its role keeps its row.
Alternative considered: ELK layered layout (elkjs), which cannot pin role columns (not a Mole record, so not an alternative_to edge).
