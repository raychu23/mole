# T51 prior art and fit — 2026-11-02

Five fetched primary sources are saved under `research/` with URL and fetch date.

| Source | Established mechanism | T51 decision |
| --- | --- | --- |
| adr-tools `adr-new` | New/supersede/link records write both relation sides; supersede changes predecessor status. | Borrow the reciprocal-record contract, not its shell writes or auto-numbering. |
| MADR upstream | Markdown decision records with a template and optional YAML front matter. | Keep Mole's existing `.mole/decisions/*.md` front matter and `## Decision` body. |
| Git `api-lockfile` | Exclusive staging, atomic rename, rollback of uncommitted locks. | Stage a bounded transaction with backups and a recover command for interruption/failure. |
| Node fs docs | Rename overwrites; `sync()` flushes staged content. | Reject collisions before any write; use exclusive create, `sync`, then explicit renames. |
| Graphiti upstream + issue #1916 | Exact matching before MinHash/LSH; stable ordering is needed for reproducibility. | Exact normalized duplicate suggestions first; fixed-seed MinHash/LSH then exact Jaccard and id tie-break. Suggestions only, never merge. |

## Fit and boundaries

The repository already has a YAML parser (`yaml`) and front-matter loader; it has
no installed maintained MinHash/LSH package (`package-lock.json` and
`node_modules` were searched). Adding a dependency would require a manifest
change, so this task keeps the documented algorithm small, deterministic, and
local instead. This is an implementation of published mechanics, not a new
matching method. Its 0.90 threshold is a **proposal heuristic**, not a measured
quality claim; results remain review suggestions.

The current loader understands `supersedes` / `superseded_by`, `amends` /
`amended_by`, and `overrides` / `overridden_by`; T51 will generate only those
known reciprocal relation pairs. It will reject malformed ids and unsafe paths,
preserve approved/accepted records unless an explicit `supersede` command
targets them, and refuse any recovery ambiguity rather than guessing.

## Test seams agreed for this bounded task

1. `mole decision` through the built daemon CLI: command parsing and a fresh
   repository's observable files/output. It catches registration and workflow
   regressions; it does not prove crash durability under power loss.
2. `capture` public functions against a real temporary filesystem: collision,
   reciprocal contents, malformed input, and injected commit failure/recovery.
   It catches record integrity without mocking the filesystem; it does not test
   multiple-process locking.
3. `suggestDuplicates` public function: independently specified exact and
   near-duplicate pairs. It catches deterministic matching and proves no write
   occurs; it does not establish corpus precision/recall.
