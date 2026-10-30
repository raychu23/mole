---
id: s8
title: The old layout engine owns column assignment
status: accepted
door: two-way
traces_to: [tenet-3]
scope:
  - packages/old-layout/
approver: raymond
source: "seeded flaw S8 (bench/m30-key.json): packages/old-layout/ was never a real package in this repo"
---

## Decision

Column assignment lives in the old layout engine package.
