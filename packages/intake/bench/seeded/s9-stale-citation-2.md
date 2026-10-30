---
id: s9
title: addNote only writes a flat note file
status: accepted
door: two-way
traces_to: [tenet-1]
scope:
  - packages/memory/src/notes.ts#addNote
confirmed: 'da6279b'
approver: raymond
source: "seeded flaw S9 (bench/m30-key.json): confirmed at commit da6279b (T11's first notes.ts); addNote changed substantially in the T11 review-fixes commit without re-confirming"
---

## Decision

`addNote` writes a flat markdown file with no overload or orphan handling.
