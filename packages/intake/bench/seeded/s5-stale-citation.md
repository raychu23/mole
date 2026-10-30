---
id: s5
title: The CLI's main() is a thin dispatcher
status: accepted
door: two-way
traces_to: [tenet-3]
scope:
  - packages/daemon/src/cli.ts#main
confirmed: '9224561'
approver: raymond
source: "seeded flaw S5 (bench/m30-key.json): confirmed at commit 9224561 (T2, the original single-writer daemon CLI); cli.ts#main has since grown substantially (T9-T13 subcommands) without re-confirming"
---

## Decision

`main()` only parses argv and dispatches to a handful of daemon subcommands; it stays a thin wrapper.
