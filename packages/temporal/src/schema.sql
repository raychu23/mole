-- T38 bitemporal fact store. Maps 1:1 to PostgreSQL 18's
--   PRIMARY KEY (fact_id, attr, valid WITHOUT OVERLAPS)
-- (see https://wiki.postgresql.org/wiki/ApplicationTimeProgress, https://neon.com/postgresql/18/temporal-constraints).
-- Local Postgres here is 16, so the same guarantee is written as btree_gist + EXCLUDE USING gist: the
-- database itself refuses two overlapping valid ranges for the same (fact_id, attr) -- not an app check.
--
-- Each row is one *version* of one fact's one attribute. History is append-only in spirit: a row's
-- VALUE and KIND are never changed or removed once written. The one controlled exception is closing:
-- when a fact's successor arrives, the still-open row's valid UPPER BOUND is set exactly once (an
-- UPDATE of that one bound, never of value/kind, and never a DELETE) -- the same "invalidate, never
-- delete" pattern as Graphiti's valid_at/invalid_at edges (arXiv 2501.13956), which also update a
-- bound rather than removing the edge. See closeFact in src/index.ts.
--
-- Two time axes (Snodgrass bitemporal model, SQL:2011 application time + system-versioned time):
--   valid    = when the fact held in the world/code (application time, Graphiti's valid_at/invalid_at)
--   recorded = when Mole learned it (system/transaction time, Graphiti's created_at/expired_at)
-- recorded is always closed-open [recorded_from, recorded_to); a correction never edits recorded_to of
-- an old row, it inserts a new row with its own recorded range and leaves the old one as history.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS fact_versions (
  id            bigserial PRIMARY KEY,
  fact_id       text NOT NULL,                         -- e.g. a decision id 'D24', a node id, an edge id
  kind          text NOT NULL,                          -- decision | tenet | intent | incident | edge
  attr          text NOT NULL,                          -- e.g. 'status'
  value         text NOT NULL,
  valid         tstzrange NOT NULL,                      -- application time: when this value held
  valid_to      timestamptz GENERATED ALWAYS AS (upper(valid)) STORED, -- convenience: null while open
  recorded      tstzrange NOT NULL DEFAULT tstzrange(now(), NULL, '[)'), -- system time: when Mole knew it
  source        text,                                    -- file:line or git sha this version came from

  -- PG18 equivalent: PRIMARY KEY (fact_id, attr, valid WITHOUT OVERLAPS)
  CONSTRAINT fact_versions_no_overlap EXCLUDE USING gist (
    fact_id WITH =,
    attr WITH =,
    valid WITH &&
  )
);

CREATE INDEX IF NOT EXISTS fact_versions_valid_gist ON fact_versions USING gist (fact_id, valid);
CREATE INDEX IF NOT EXISTS fact_versions_attr_valid_gist ON fact_versions USING gist (attr, valid);

-- decision -> scope (code anchor) edges, also bitemporal, for the recursive-CTE traversal
-- (decision -> scope -> code).
CREATE TABLE IF NOT EXISTS edge_versions (
  id            bigserial PRIMARY KEY,
  edge_id       text NOT NULL,
  from_id       text NOT NULL,
  to_id         text NOT NULL,
  edge_type     text NOT NULL,                           -- traces_to | supersedes | overrides | ... (T29 EdgeType)
  valid         tstzrange NOT NULL,
  recorded      tstzrange NOT NULL DEFAULT tstzrange(now(), NULL, '[)'),
  source        text,

  CONSTRAINT edge_versions_no_overlap EXCLUDE USING gist (
    edge_id WITH =,
    valid WITH &&
  )
);

CREATE INDEX IF NOT EXISTS edge_versions_from_gist ON edge_versions USING gist (from_id, valid);
CREATE INDEX IF NOT EXISTS edge_versions_to_gist ON edge_versions USING gist (to_id, valid);
