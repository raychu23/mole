# ADR 7: Use SQLite for the local index

## Decision

Use SQLite for the on-disk index, accessed through a single connection owned by the daemon process.

## Rationale

It needs no server process and ships with node's native bindings on every platform we target, so there is
no extra install step for contributors or CI.

## Consequences

Queries must stay simple enough for SQLite's feature set (no advanced window functions on old platform
builds), and only one process may hold the write lock at a time.
