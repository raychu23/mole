# T83 counts table (produced by `scripts/mine_adr_merges.py`, rerunnable)

Corpus: 6 real public repos with ADR/decision-record folders and active,
multi-contributor history (full clones, `--filter=blob:none`, cloned
2026-11-03 to `/Users/a1/.hermes/cache/scratch/t83/<name>`). repo configs in
`scripts/repos.json`.

| repo | decision files | 2-parent merges touching decision dir | both-parents-touched-same-file events | same_field | different_fields | body_only | `git merge-file` clean | near-miss pairs (diff. author, same file, <=14d) |
|---|---|---|---|---|---|---|---|---|
| backstage/backstage | 21 | 8 | 0 | 0 | 0 | 0 | — | 32 |
| alphagov/govuk-aws | 94 | 13 | 0 | 0 | 0 | 0 | — | 36 |
| npryce/adr-tools | 9 | 0 | 0 | 0 | 0 | 0 | — | 2 |
| cloudfoundry/korifi | 28 | 0 | 0 | 0 | 0 | 0 | — | 8 |
| cloudfoundry/cli | 13 | 0 | 0 | 0 | 0 | 0 | — | 9 |
| dapr/dapr | 33 | 0 | 0 | 0 | 0 | 0 | — | 7 |
| **total** | **198** | **21** | **0** | **0** | **0** | **0** | n/a (0 events to test) | **94** |

korifi/cli/dapr have 0 two-parent merges touching their decision dirs at all
— these three squash-merge PRs, so git's merge graph never has a real
3-way-merge opportunity to inspect for that path; concurrent-edit risk there
is structurally suppressed by the workflow, not resolved by any merge
technology.

**Near-miss sanity check** (different authors touched the same file within
14 days — the closest proxy for "overlapping PRs" available from git history
alone): of the 94 pairs found (68 of them in backstage/govuk-aws, the two
repos with real merge commits), a spot check with `git merge-base` on all 94
found **94/94 are strictly linear** — i.e. the second edit's commit has the
first edit's commit as a direct ancestor. These are sequential PR-review
fixups / follow-up edits on an already-merged line of history, not
independent concurrent branches. None of them represent a case git's merge
machinery (or a CRDT) would have had to reconcile.

Full per-event rows: `adr_merge_events.csv` (header only — 0 data rows,
confirming 0 events) and `near_miss_pairs.csv` (94 rows). `summary.json` has
the same counts as this table, machine-readable.

## Recommendation: **git merge only**

Across 198 real decision-record files in 6 public, multi-contributor repos
(ADR-tooling's own repo, two government infra repos, two Cloud Foundry
repos, one CNCF-adjacent project), spanning every 2-parent merge that ever
touched a decision directory (21 of them) plus a secondary same-file/
different-author/14-day proxy (94 pairs, all of which turned out to be
linear, not branching) — **zero actual concurrent edits to the same decision
record were found.** There is no measured conflict to classify by field, and
no evidence a CRDT (or any merge technology beyond git's default) would ever
engage. Per the task's stop condition ("stop: recommending a CRDT without
measured concurrent edits"), a CRDT is explicitly not recommended, and since
there are also zero observed classification events to design a field-level
merge driver against, that is not recommended either — building either adds
real cost (new data format + sync layer for a CRDT, new merge-driver config
and test surface for a field-level driver) against a problem that has not
been observed to occur even once across ~200 decision files of real-world
history. Mole's decision records are plain Markdown already handled by
git's default line-based merge; that stays a sufficient baseline until
*actual* concurrent-edit incidents are observed, at which point this same
script can be rerun against Mole's own `.mole/decisions` history to re-check.

No merge-driver prototype is included — the task only requires one if a
field-level merge driver is the recommendation, and it is not.
