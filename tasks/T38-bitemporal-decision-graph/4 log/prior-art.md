```notes
T38 prior art      bitemporal decision graph in Postgres      2026-10-29 (prior-art-first)      sources fetched or searched today unless marked
    names               bitemporal data · temporal knowledge graph · SQL:2011 application-time / system-versioned tables · temporal constraints
    1 graphiti (getzep)      temporal knowledge graph for agent memory · every edge: valid_at / invalid_at (world time) + created_at / expired_at (record time) · old facts invalidated, kept as history
                            paper: Rasmussen et al. 2025, arXiv 2501.13956 · ~31.7k stars (10-13 research) · runs on Neo4j / FalkorDB
                            cost: model calls on every write (extraction + invalidation), pre-1.0, one reported wrong invalidation (graphiti#1729)
                            borrow: the 4-timestamp edge model + 'invalidate, never delete' · differ: Mole's facts come from records + git, so 0 model calls per write
    2 postgres temporal      PG 18 (Sep 2025): PRIMARY KEY / UNIQUE (… , valid_at WITHOUT OVERLAPS) + FOREIGN KEY (…, PERIOD …) · implemented as EXCLUDE USING gist (id WITH =, valid_at WITH &&)
                            https://wiki.postgresql.org/wiki/ApplicationTimeProgress · https://neon.com/postgresql/18/temporal-constraints · PGConf.EU 2025 'Constraints in PG18'
                            local is PG 16.15 → use btree_gist + EXCLUDE USING gist directly (same mechanism), schema written so it maps 1:1 to WITHOUT OVERLAPS
    3 SQL:2011 + Snodgrass   application time (valid) vs system time (transaction) periods · Snodgrass, Developing Time-Oriented Database Applications in SQL (1999)      cited from field knowledge, not fetched today
    4 XTDB                   bitemporal database (valid + system time on every document), as-of queries      cited from field knowledge, not fetched today
    5 mole full system page  context/product-plan/Mole full system.md §'facts that change over time' (S39 Graphiti) + item 3 'facts never overwritten, old fact gets valid_to'
    metric                   as-of correctness on a frozen key (same shape as temporal-QA benchmarks: answer depends on the time asked) · integrity = 0 overlaps under concurrent writes · p95 + EXPLAIN ANALYZE with/without GiST index (standard Postgres tuning evidence)
    gap we build             Graphiti's time model on Postgres with database-enforced integrity and no model in the write path, fed by decisions people approved
```
