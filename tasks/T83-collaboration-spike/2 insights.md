## Summary

Two different methods were needed because the 6 real decision-record repos
(backstage, govuk-aws, adr-tools, korifi, cli, dapr; 198 decision files
total) split into two different merge workflows, and git-history mining
alone is structurally blind to one of them.

**True-merge repos** (backstage, govuk-aws): mining 2-parent merge commits
touching the decision dir found 21 real merges, **0 of which had both
parents touch the same file**. A secondary same-file/different-author/
14-day proxy found 94 pairs across all 6 repos; a `git merge-base
--is-ancestor` check — now committed as code in `near_miss_pairs()`, not
just asserted — confirmed **94/94 are strictly linear** (sequential fixups,
not concurrent branches).

**Squash-merge repos** (adr-tools, korifi, cli, dapr): these have zero
2-parent merge commits touching their decision dirs at all, so the method
above cannot see whether two PRs that each touched a decision file were
ever open at the same time. A reviewer found cloudfoundry/korifi PR #21 and
#22 open concurrently for ~5 weeks on different ADR files — invisible to
merge-commit mining by construction. `scripts/pr_overlap.py` recovers PR
timing from the unauthenticated GitHub REST API (commits→PR lookup +
PR-files, cached to `4 log/github-cache/`) and measures PR-pair overlap
directly. Within the 60 req/hour budget (shared with other activity, ~29
left when this ran), **korifi was measured in full** (20/20 commits, 19
PRs): 5 overlapping PR pairs, including the exact PR #21/#22 pair the
reviewer flagged (created 2021-08-27, merged 2021-10-04 — 38 days
overlapping) — **and all 5 overlapping pairs touch different decision
files**, zero same-file. dapr was majority-sampled (27/37 commits, the
older ~73% of its history; its 10 most recent commits were not reached
before the budget ran out): 0 overlaps found among those 27. **adr-tools
and cloudfoundry/cli were not measured at all** this pass.

Zero measured same-file concurrent edits — in either method, across every
repo actually measured — means no field-level merge driver or CRDT
(Automerge/Yjs) is justified yet; git's default merge is sufficient for
what was measured. No merge-driver prototype built, per the task's own gate
(only required if a field-level driver were recommended).

## Notes

- Four of the six repos (adr-tools, korifi, cli, dapr) have zero 2-parent
  merge commits touching their decision dirs at all — they squash- or
  rebase-merge PRs, so git's merge graph structurally has no 3-way-merge
  event to inspect for that path. This is exactly why a separate PR-overlap
  measurement against the GitHub API was added for these repos rather than
  relying on git history alone.
- `git merge-file` was never exercised against a real conflict in the
  merge-commit corpus (0 events to test), so "how often does git's own
  3-way merge resolve cleanly" is reported honestly as n/a rather than
  inflated to a clean-merge rate.
- CAVEAT (recorded in `merge_file_clean()`'s docstring): `git merge-file`'s
  3-way merge is line-based, not field-based. Two edits conflict whenever
  they touch overlapping *or adjacent* diff hunks, even when logically
  independent — e.g. a `Status:` line directly followed by body text: one
  side editing the status value and the other appending a new paragraph
  right below it will conflict under git's merge even though no field's
  value actually collides. So a low or zero `merge_file_conflict` count
  does not by itself prove edits were semantically non-overlapping, and a
  nonzero one would not by itself prove they were — `classify_event()`'s
  same_field/different_fields split is the more meaningful signal, and it
  too can misclassify adjacency-only conflicts.
- INFERENCE: PR-overlap coverage is partial by construction of the rate
  limit, not by choice: korifi is fully measured, dapr is majority-sampled
  (missing its most recent 10 commits), and adr-tools/cli were not reached.
  Rerunning `pr_overlap.py --only adr-tools,cli` (and later `--only dapr` to
  fill the remaining 10 commits) once the hourly window resets would close
  these gaps; the cache in `4 log/github-cache/` means no already-fetched
  data needs to be re-requested.
- INFERENCE: repo selection (korifi, cli, dapr as the 3 additional repos
  beyond the original backstage/govuk-aws/adr-tools set) was done by
  GitHub's unauthenticated repo-search + git-tree API, filtering for
  existing `docs/adr`-ish paths with real multi-contributor history; not an
  exhaustive survey, but all 6 are genuine OSS projects with ADR practice
  and multiple distinct committers, matching the task's intent.
- Scripts and raw clones live outside the repo
  (`/Users/a1/.hermes/cache/scratch/t83`); only the mining/PR-overlap
  scripts, `repos.json`, their output CSVs/summaries, and the GitHub API
  cache under `4 log/github-cache/` are committed under this task.
