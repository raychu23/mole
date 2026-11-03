---
state: proposed
owner: hermes-build
repo:
branch:
worktree:
base:
reviewer:
updated: 2026-11-03 02:52
status: ledger proposed
next: fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
---
```notes
T72-okf-export      ledger task (rules.md §3 code features)      project tasks
    goal                    Export Mole decision records with Open Knowledge Format fields (provenance, trust, freshness, lifecycle, attestation) so records carry to other harnesses; `mole export --format okf`.
    done-when               1 prior-art note: fetch the actual OKF spec (version, field names) and any reference consumer; if no OKF spec is findable, record that and pick the closest standard (e.g. W3C PROV-O / schema.org) with reasons · 2 tests first: every field populated from the record (status->lifecycle, approver/source->provenance, updated/as-of->freshness) · 3 round-trip through an external validator/consumer if one exists, else NOT RUN (no interop claim) · 4 decisions tests pass
    status                  2026-11-03 proposed
    next                    fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
    pinned
    mode                    one worker
    boundary                packages/decisions (new export/), daemon cli, tests
    checks                  npm run check
    non-goals               anything outside boundary
    proof                   4 log/
    stop                    inventing fields not in the spec
    came from               D62, D36b; inventory F70
    links                   4 log/ledger.md (every transition + its evidence)
    harness
```
