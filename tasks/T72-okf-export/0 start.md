---
state: running
owner: hermes-build
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t72-okf-export
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T72-okf-export
base:
reviewer:
updated: 2026-11-03 02:53
status: ledger running
next: worker finishes → ledger move <task> submitted --report … (ledger runs the checks row)
claimed: 2026-11-03 02:53
---
```notes
T72-okf-export      ledger task (rules.md §3 code features)      project tasks
    goal                    Export Mole decision records with Open Knowledge Format fields (provenance, trust, freshness, lifecycle, attestation) so records carry to other harnesses; `mole export --format okf`.
    done-when               1 prior-art note: fetch the actual OKF spec (version, field names) and any reference consumer; if no OKF spec is findable, record that and pick the closest standard (e.g. W3C PROV-O / schema.org) with reasons · 2 tests first: every field populated from the record (status->lifecycle, approver/source->provenance, updated/as-of->freshness) · 3 round-trip through an external validator/consumer if one exists, else NOT RUN (no interop claim) · 4 decisions tests pass
    status                  2026-11-03 running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T72-okf-export · branch ledger/t72-okf-export · base ?
    next                    worker finishes → ledger move <task> submitted --report … (ledger runs the checks row)
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
