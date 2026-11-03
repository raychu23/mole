## Summary

`mole export --format okf [--out DIR]` writes Mole's decision graph (decisions, tenets,
intent, incidents) as a real Open Knowledge Format v0.2 bundle: one markdown concept
per node plus a bundle-root `index.md`. Every OKF field is mapped from an existing
Mole field (status→lifecycle, approver→trust, source/evidence→provenance, git commit
date→freshness) using the field names verbatim from the fetched OKF SPEC.md — nothing
invented. Round-tripped through the real `okf-skill` validator: 0 conformance errors.

## Notes

### What
- `packages/decisions/src/export/okf.ts`: pure `buildOkfBundle(graph, root) -> { files }`.
- `packages/decisions/src/export/cli.ts`: `exportCli(pos, flags, root)` — writes files,
  default out `.mole/export/okf`.
- Wired: `packages/decisions/src/index.ts` exports it; `packages/daemon/src/cli.ts`
  routes `cmd === 'export'` to it (one line, same pattern as `decisions`/`decision`).
- `packages/decisions/src/anchors.ts`: added `Git.commitDate(rev)` (ISO 8601 commit
  date) — the only new primitive; everything else is existing `GraphNode` fields.

### Field mapping (OKF SPEC.md §refs; full justification in `4 log/prior-art.md`)
| Mole | → OKF |
|---|---|
| `node.kind` | `type: Mole <Kind>` (§4.1, producer-chosen, un-registered) |
| `node.status` | `status: draft\|stable\|deprecated` (§5.4) + `mole_status: <original>` (§4.1 extension, lossless) |
| `node.source` | `sources[]` entry, `resource: <source>` (§5.1) |
| `node.evidence[]` | `sources[]` entries (test/incident anchors — prior-art.md §5: no attestation field invented) |
| `node.approver` | `generated.by` / `verified.by` = `human:<approver>` (§5.2, §7 actor convention) |
| git commit date of the record file (or `node.confirmed` when it is a known sha) | `generated.at` / `verified.at` (§5.2, freshness) |
| (nothing — no Mole field for it) | `stale_after` (§5.5) — **omitted**, not guessed |

### Tests (red → green)
- Red: `packages/decisions/test/export-okf.test.ts` failed to resolve
  `../src/export/{okf,cli}.js` (module not found) — saved at `4 log/red.txt`.
- Green: `npx vitest run packages/decisions/test/export-okf.test.ts` → **11/11 passed**.
- Full package regression: `npx vitest run packages/decisions` → **381/381 passed**
  (37 files); `npx vitest run packages/daemon` → **28/28 passed**; `npx tsc -b` → clean.

### Round-trip (done-when #3)
External validator `okf-skill`'s `validate_okf.py` (stdlib Python, no deps; fetched
2026-11-03, copied to `4 log/validate_okf.py`) run against an exported bundle inside the
test suite itself: **exit 0, no `ERROR` lines** — this is a real interop check, not a
claim of record. python3 was available in this environment, so this path is RUN, not
NOT RUN; the test still warns+skips gracefully if python3 is ever absent elsewhere.

### Reversible defaults chosen (with evidence)
- **Status mapping is lossy but non-destructive** (INFERENCE): Mole's 8-value status
  vocabulary collapses to OKF's 3 (`draft`/`stable`/`deprecated`); the original string
  is always kept in the `mole_status` extension key, which SPEC.md §4.1 explicitly
  sanctions ("producers MAY include any additional keys... consumers MUST NOT reject").
  Reversible: a future importer can read `mole_status` back exactly.
- **`generated.by` for a record with no approver** is `mole-export/0.2` (SPEC.md §7's
  `<producer>/<version>` actor form) rather than omitting `generated` entirely — chosen
  so every concept always carries *some* trust-family signal, distinguishing
  "no verification happened" from "we don't know who wrote this." Reversible: swap the
  constant for any other producer string without touching the mapping logic.
- **`evidence` → `sources[]`, not a bespoke "attestation" field** (INFERENCE, the one
  genuinely interpretive call in this task): OKF's real attestation family (§10) is
  scoped to re-runnable *computations* (SQL/dbt/Python with typed parameters); Mole
  decision records have none. Exposing evidence as `sources[]` entries is the nearest
  *real* OKF field rather than inventing a new key — explicitly flagged as the lossy
  point in both `prior-art.md` §5 and the export module's own comments, so a reviewer
  disagreeing with this call can see exactly what to change and where.
- **`stale_after` left unpopulated**: no Mole field maps to it; guessing one would be
  fabrication, so it's just absent (SPEC.md §11 requires consumers tolerate this).

### Limits / NOT RUN
- No NOT RUN items: python3 was available, so the external-validator round-trip test
  actually ran and passed (not skipped).
- Not attempted: Attested Computation concepts (§10) — out of boundary; Mole has no
  computation-execution surface for `export/` to attest.
