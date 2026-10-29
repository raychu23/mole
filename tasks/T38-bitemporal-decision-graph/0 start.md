---
state: verified
owner: mole-builder-11
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t38-bitemporal-decision-graph
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T38-bitemporal-decision-graph
base: 6849a91
reviewer: fresh subagent (R5, no prior transcript)
updated: 2026-10-29 18:34
status: ledger verified
next: merge → ledger move <task> integrated --merge … (ledger reruns checks in the repo)
claimed: 2026-10-29 17:16
---
```notes
T38-bitemporal-decision-graph      ledger task (rules.md §3 code features)      project tasks
    goal                    A bitemporal decision graph in PostgreSQL (USER 10-29 22:08: 'at least something like the temporal graph … ability to adapt use properly newest technologies' + 'i really also want postgres server on current mole'): every decision, tenet, exception, scope link and code anchor stored with valid time (when it held in the code/team) and record time (when Mole learned it), as Graphiti's edges do (valid_at/invalid_at + created/expired), but with zero model calls per write. Integrity in the database, not app code: EXCLUDE USING gist (btree_gist) so one fact never has overlapping validity (the constraint PG 18's WITHOUT OVERLAPS compiles to); as-of queries ('what did the team decide about X on date T', 'what changed between T1 and T2') via range operators + recursive CTE over decision → code edges; loaded from .mole/ records + their git history + context decisions.jsonl supersessions; served through T33's server (same Postgres) and an MCP tool
    done-when               1) M32 as-of key (written before code): >= 40 'what held on date T' questions from Mole's own decision history (D1-D41 supersessions + .mole/decisions git history) → 100% correct, reported beside a latest-only baseline (what a wiki/ADR folder answers); 2) integrity: 1,000 concurrent conflicting writes → 0 overlapping validity rows (database constraint, not app check); 3) speed: 100k facts, as-of query p95 with vs without the GiST index, EXPLAIN ANALYZE plans saved, speedup reported; 4) 0 model calls per write; 5) npm run check green
    status                  2026-10-29 verified      reviewer fresh subagent (R5, no prior transcript) · findings: 2 P0 + 1 P1, all fixed and rerun (tasks/T38-bitemporal-dec
    next                    merge → ledger move <task> integrated --merge … (ledger reruns checks in the repo)
    pinned
    mode                    code
    boundary                packages/temporal/** (new), packages/server/src read-only unless T33 is integrated (then one import + one call to register), tasks/T38-bitemporal-decision-graph/**, root package.json + package-lock.json (workspace deps only)
    checks                  npm run check && node packages/temporal/dist/bench/m32.js
    non-goals               no Neo4j/Graphiti dependency (they need model calls per write; cite them as the comparison) · no paid API or model calls · no edits to T33 files while it runs · don't edit the M32 key after the red-tests commit (R2) · no publishing or pushing · local Postgres 16 at /tmp:5432 (Homebrew), own database mole_t38; never brew-install on this disk (3.5 GB free)
    proof                   runs.jsonl last line with M32 + saved EXPLAIN ANALYZE plans + npm run check output + red-tests commit before first implementation commit + fresh reviewer verdict
    stop                    same check failure 3 rounds in a row (R3) · needs Raymond's accounts, paid spend or a product decision
    came from               USER 2026-10-29 22:08 resume feedback (context/product-plan/systems/resume/ask 2026-10-29 2208.txt) · D42
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
