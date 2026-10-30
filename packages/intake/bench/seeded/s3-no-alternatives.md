---
id: s3
title: SQLite instead of Postgres for the index
status: accepted
door: one-way
traces_to: [tenet-1]
scope:
  - packages/indexer/src/db.ts
approver: raymond
source: "seeded flaw S3 (bench/m30-key.json): names a contrasting approach but no Considered Options section"
---

## Decision

We chose SQLite instead of Postgres for storing the index, because it ships with Node.
