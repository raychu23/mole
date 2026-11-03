# T83 counts table (produced by `scripts/mine_adr_merges.py` +
`scripts/pr_overlap.py`, rerunnable)

Scope: two different methods, because the repos split into two different
merge workflows, and the git-history method is structurally blind to one of
them (see "PR-overlap" section below).

## 1. True-merge repos: merge-commit mining (backstage, govuk-aws, adr-tools)

Corpus: 6 real public repos with ADR/decision-record folders and active,
multi-contributor history (full clones, `--filter=blob:none`). repo configs
in `scripts/repos.json`.

| repo | decision files | 2-parent merges touching decision dir | both-parents-touched-same-file events | same_field | different_fields | body_only | `git merge-file` clean | near-miss pairs (diff. author, same file, <=14d) | near-miss pairs confirmed linear (`git merge-base --is-ancestor`) |
|---|---|---|---|---|---|---|---|---|---|
| backstage/backstage | 21 | 8 | 0 | 0 | 0 | 0 | — | 32 | 32/32 |
| alphagov/govuk-aws | 94 | 13 | 0 | 0 | 0 | 0 | — | 36 | 36/36 |
| npryce/adr-tools | 9 | 0 | 0 | 0 | 0 | 0 | — | 2 | 2/2 |
| cloudfoundry/korifi | 28 | 0 | 0 | 0 | 0 | 0 | — | 8 | 8/8 |
| cloudfoundry/cli | 13 | 0 | 0 | 0 | 0 | 0 | — | 9 | 9/9 |
| dapr/dapr | 33 | 0 | 0 | 0 | 0 | 0 | — | 7 | 7/7 |
| **total** | **198** | **21** | **0** | **0** | **0** | **0** | n/a (0 events to test) | **94** | **94/94** |

Only backstage and govuk-aws actually use `git merge --no-ff`-style 2-parent
merges for their decision dirs (21 merge commits between them, 0 of which
had both parents touch the same file). adr-tools, korifi, cli and dapr have
**zero** 2-parent merge commits touching their decision dirs **at all** —
these four squash- or rebase-merge PRs, so git's merge graph never has a
3-way-merge event to inspect for that path, regardless of whether two PRs
actually raced on the same file. That blindness is exactly what section 2
below measures directly.

**Near-miss sanity check** (different authors touched the same file within
14 days — a loose proxy for "overlapping PRs", chosen only because this
section's method, by construction, cannot see squash-repo concurrency; it
does not stand in for it). Of the 94 pairs found across all 6 repos, running
the actual check — `git merge-base --is-ancestor commit_a commit_b` on every
pair, now committed as code in `near_miss_pairs()` rather than asserted in
prose — found **94/94 are strictly linear** (commit_a is a direct ancestor
of commit_b). These are sequential PR-review fixups on an already-merged
line of history, not independent concurrent branches, in the four repos that
have real 2-parent merge history. This result says nothing about korifi,
cli, adr-tools or dapr's actual concurrency, because their git history has
no branching events of this kind to sample in the first place — see section
2.

Full per-event rows: `adr_merge_events.csv` (header only — 0 data rows) and
`near_miss_pairs.csv` (94 rows, now including a `linear` column). `summary.json`
has the same counts, machine-readable.

**`git merge-file` caveat**: it is line-based, not field-based. Two edits
conflict whenever they touch overlapping *or adjacent* diff hunks, even when
logically independent — e.g. one side edits the `Status:` line and the other
appends a new paragraph directly below it; because `Status:` sits immediately
above the body in most ADR templates, that pair conflicts under
`git merge-file` even though no field's value collides. `merge_file_clean`
measures line-adjacency conflicts, not semantic conflicts, so it is reported
as n/a here (0 events to test) rather than extrapolated — see the docstring
on `merge_file_clean()` in the script.

## 2. Squash/rebase-merge repos: PR-overlap measure (korifi, dapr; cli and adr-tools not measured)

Git history only shows one squash commit per merged PR on these repos —
there is no 2-parent merge event, so section 1's method cannot see whether
two PRs that each touched a decision file were ever open *at the same time*.
A reviewer found cloudfoundry/korifi PR #21 and #22 open concurrently for
~5 weeks, each touching a different ADR file — invisible to section 1
entirely. `scripts/pr_overlap.py` recovers this from the GitHub REST API
(unauthenticated, 60 req/hour): for each commit touching the decision dir,
`GET /repos/{o}/{r}/commits/{sha}/pulls` gives the PR's `created_at`/
`merged_at`; `GET /pulls/{n}/files` is used where budget allowed to confirm
the exact file(s) touched (commit-diff file lists, computed locally at zero
API cost, are the fallback everywhere else). Every raw response is cached to
`4 log/github-cache/<repo>/*.json` and re-read on rerun.

| repo | commits touching decision dir | commits measured (PR timing obtained) | PRs measured | overlapping PR pairs, same decision file | overlapping PR pairs, different decision files |
|---|---|---|---|---|---|
| cloudfoundry/korifi | 20 | 20/20 | 19 | **0** | **5** |
| dapr/dapr | 37 | 27/37 | 27 | 0 | 0 |
| npryce/adr-tools | 9 | not measured (budget exhausted before this repo was reached) | — | — | — |
| cloudfoundry/cli | 13 | not measured (budget exhausted before this repo was reached) | — | — | — |

Budget: the unauthenticated 60/hour cap was shared with other activity in
this environment and had ~29 of 60 requests left when this measurement
started; korifi (20 commits) was measured in full. dapr's 10 most recent
commits (by merge date) were not measured before the budget ran out — the
27 measured are the older ~73% of its decision-dir history; 0 overlaps were
found among them, but this is **not** a statement about dapr's most recent
PRs. **adr-tools and cloudfoundry/cli were not measured at all** in this
pass — rerun `pr_overlap.py --only adr-tools,cli` once the hourly window
resets to fill them in; results will land in the same cache directory and
this table should be regenerated, not hand-edited.

**Confirmed finding (korifi)**: of korifi's 5 overlapping PR pairs, all 5
touch different decision files, including the exact pair the reviewer
flagged — PR #21 (`0003-strategy-for-testing-frameworks.md`, created
2021-08-27, merged 2021-10-04) and PR #22 (`0004-strategy-for-continuous-
integration.md`, created 2021-08-27, merged 2021-10-04) — open concurrently
for 38 days. **Zero of korifi's overlapping pairs touch the same decision
file.** Raw pairs: `pr_overlap_pairs.csv`; machine-readable summary:
`pr_overlap_summary.json`.

## Recommendation: **git merge only**

True-merge repos (backstage, govuk-aws, plus adr-tools/korifi/cli/dapr's
linear history): 21 real 2-parent merges touching a decision dir across 198
decision files, 0 of them with both parents touching the same file, and a
94-pair near-miss sample all confirmed strictly linear by
`git merge-base --is-ancestor`. No measured conflict to classify, and no
evidence git's default merge would ever need help here.

Squash repos measured for PR-overlap (korifi fully, dapr majority-sampled):
PRs *do* overlap in time on the squash repos — korifi had 5 such pairs,
confirming the reviewer's PR #21/#22 finding is real and would be invisible
to the merge-commit method alone. But **in every overlapping pair found,
the two PRs touched different decision files** — none of the measured
overlap data shows two concurrent PRs editing the *same* decision record.
Per the task's stop condition ("stop: recommending a CRDT without measured
concurrent edits"), that still means no same-file concurrent edit has been
observed anywhere in this corpus, so git's default merge remains the
recommendation and neither a field-level merge driver nor a CRDT (Automerge/
Yjs) is justified by what was measured.

This recommendation is scoped to what was measured, not to these repos as a
whole: dapr's most recent 10 commits, and all of adr-tools and
cloudfoundry/cli, were not run through the PR-overlap check (budget). If a
rerun of those finds an overlapping pair that *does* touch the same decision
file, that would be the first observed instance of real concurrent decision
editing in squash-workflow repos, and would change the recommendation:
either a field-level merge driver (if the colliding edits are typically to
different *fields* of the same record — status vs. supersedes vs. body) or
a CRDT (if they are typically to the same field/value, where a merge driver
can't arbitrate and would need the same conflict-resolution policy a CRDT
already encodes). That distinction can only be made once such a pair is
actually found; none has been so far.

No merge-driver prototype is included — the task only requires one if a
field-level merge driver is the recommendation, and it is not.
