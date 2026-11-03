# T69 prior art: one authoritative decision store

## 1. Graphiti (getzep/graphiti) — bi-temporal edges
Source: `graphiti_core/utils/maintenance/edge_operations.py` (GitHub, fetched 2026-11-03,
`main` + pinned commit `eaa4128...`), plus issues #920, #1728, #2012 (same repo, read for the
*failure modes* of this design, not just the happy path).

- Every edge carries two independent timestamp pairs: `valid_at`/`invalid_at` (the fact's own
  real-world validity window) and `created_at`/`expired_at` (when Graphiti's own bookkeeping
  learned about it) — the same valid-time/system-time split `packages/temporal` already uses
  (`valid` / `recorded` tstzranges in `schema.sql`).
- `resolve_edge_contradictions` (edge_operations.py) never deletes a superseded edge: it sets
  the old edge's `invalid_at` to the new edge's `valid_at` and stamps `expired_at = now()` —
  "invalidate, never delete". `packages/temporal/src/index.ts`'s `closeFact`/`recordFact`
  already follow exactly this pattern (header comment, lines 4-6) and that's confirmed correct
  prior art, not something this task needs to change.
- What we borrow: nothing new here — T47 already borrowed this (see its header comment citing
  `edge_operations.py:715-783`). T69 only needs to confirm the existing `recordFact`/`closeFact`
  design is still the right one to build a decision-store API ON TOP of, and it is.
- What does NOT fit: Graphiti's invalidation is **temporal-only** and, per issue #1728, was for
  a long stretch **unscoped by subject** (any edge in the whole group, not just edges about the
  same entities, was eligible to retire another) — the fix landed only recently and still
  relies on an LLM call to decide "is this really the same fact". Mole's decisions are
  identified by a stable `factId` (the decision's own id from front matter), so this whole class
  of bug (wrong-fact invalidation) does not apply: `recordFact` only ever compares candidates
  that already share `(org_id, fact_id, attr)`.

## 2. XTDB 2.x / SQL:2011 bitemporal tables — `as-of` queries
Source: `docs.xtdb.com/about/time-in-xtdb` (fetched 2026-11-03) and the SQL:2011 temporal
features paper it cites (Kulkarni & Michels, dbs.uni-leipzig.de).

- Three question categories, in descending real-world frequency: (1) current state — the
  default, (2) history "as best known" (`FOR VALID_TIME ...`, i.e. corrections folded in), (3)
  history "as we believed it at the time" (`FOR SYSTEM_TIME AS OF ...`, i.e. no corrections).
  This maps directly onto `packages/temporal`'s existing `asOf` (valid-time, as-best-known) and
  `knownAt` (both axes) functions — no new query shape needed, T69 just needs a server-facing
  caller for the ones a tenant-scoped decision read needs (`asOf` for "current"/"as-of-date",
  not `knownAt`, since the server has no use case yet for "what we believed on day X about day
  Y" — that stays available in `@mole/temporal` if a future task needs it).
- What we borrow: the XTDB framing that `FOR VALID_TIME AS OF <now>` IS "current" — there is no
  separate "current" storage/table, `current` is just `asOf(now())` over the same bitemporal
  rows. T69's `decisionStore.currentDecision` is implemented exactly this way (an `asOf` call
  with `at = now`), rather than adding a second "latest" table that could drift from the
  temporal history.
- What does NOT fit: XTDB's engine-level recency/ceiling indices (for O(log n) as-of lookups
  at scale, per `xtdb.com/blog/taking-out-the-o-n-squared`) are a storage-engine optimization
  Postgres's btree_gist EXCLUDE constraint + an index on `(fact_id, attr)` already gets most of
  for this corpus size; out of scope for a team-server-sized tenant.

## 3. Datomic — immutable datoms + `as-of`
Source: `docs.datomic.com` (Information Model, fetched 2026-11-03) and
`vvvvalvalval.github.io/.../Datomic-this-is-not-the-history-youre-looking-for` (fetched
2026-11-03, read for `as-of` pitfalls).

- Datoms (entity/attribute/value/transaction/added) are immutable and every one carries its own
  transaction time `t`; `as-of t` filters a database value to only datoms transacted at or
  before `t` — append-only history, same invariant `fact_versions` already enforces (`insertFact`
  only INSERTs, `closeFact` only closes an open upper bound).
- The linked post's caution ("this is not the history you're looking for") is about a subtlety
  that DOES matter here: `as-of` on its own answers "what did the LATEST write believe was true
  at valid-time X", not "what was MOST RECENTLY CORRECTED knowledge as of X" unless the caller
  also fixes the transaction/system-time axis. `packages/temporal`'s `asOf` already matches
  Datomic's `as-of` semantics (valid-time filter only, latest `recorded`-open row), and `knownAt`
  already exists for the two-axis case — so T69's server-facing `decisionAsOf` is a thin pass-
  through to `asOf`, not a reimplementation, and its doc comment says explicitly which axis it
  fixes.
- What does NOT fit: Datomic's "speculative" writes (`d/with`, applying facts to an immutable db
  value without transacting them) and database-value branching are a different concurrency model
  (single-writer-per-connection, values instead of a live Postgres connection) that doesn't map
  onto a shared-Postgres multi-tenant server; not borrowed.

## 4. ai-memory (this environment's own agent-memory tool) — advisory-only contradiction handling
Observed directly (2026-11-03, via this session's own `ai_memory` MCP tool surface) and already
cited as prior art inside this repo (`packages/temporal/src/index.ts` header comment: "ai-
memory's advisory-only contradiction_lint.rs: 'writes no supersession and deletes nothing'";
also `tasks/T58-incident-dissent-revival/4 log/prior-art.md` row "Graphiti + ai-memory —
invalidation/supersession is a separate, gated step").
- What we borrow (already in `packages/temporal`, re-confirmed here, not re-done): a
  contradiction is *raised*, not *resolved* — `recordFact` writes a `contradiction_flags` row
  and leaves both the old and new fact_versions live (bounded, not deleted) for a person to
  adjudicate. T69 does not add a second contradiction-handling path in the server; it reuses
  `listContradictionFlags`/`recordFact` as-is.
- What does NOT fit: ai-memory's lint step is a standalone CLI pass over a wiki, not a request-
  path library call; the server instead calls `recordFact` synchronously inside the same
  transaction that records a decision revision, which is a tighter integration ai-memory's own
  architecture doesn't need (it has no multi-tenant RLS boundary to preserve per write).

## Spike (F62): real Graphiti over the T69 small corpus — NOT RUN
Attempted directly in this session (2026-11-03), not simulated:

```
$ pip install graphiti-core   # succeeded: graphiti-core 0.31.2, neo4j-6.4.1, pydantic-2.14.2
$ python3 -c "
from graphiti_core import Graphiti
g = Graphiti(uri='bolt://localhost:7687', user='neo4j', password='password')
"
FAILS AS EXPECTED: OpenAIError Missing credentials. Please pass an `api_key`, ...
```
`graphiti_core.Graphiti.__init__` constructs an LLM client (OpenAI by default) unconditionally,
before any Neo4j/FalkorDB connection is even attempted — so there is no way to exercise
`add_episode`/`resolve_edge_contradictions` end-to-end without either (a) an LLM API key, which
this environment has none of until 08:59 per the task contract's "no model calls" rule, or (b) a
running Neo4j/FalkorDB instance, which also isn't provisioned here. Reason recorded per the
task contract's own prediction ("likely NOT RUN"): **NOT RUN — blocked by both a required LLM
key and a required graph DB, neither available in this session**. §1 above substitutes a direct
read of Graphiti's invalidation code (not a live run) for the design borrowed into
`packages/temporal`.
