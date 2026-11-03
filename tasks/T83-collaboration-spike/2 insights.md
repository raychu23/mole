## Summary

Mined 198 real decision-record files across 6 public, multi-contributor
repos (backstage, govuk-aws, adr-tools, korifi, cli, dapr) for concurrent
edits around merge commits. Found 21 real 2-parent merges touching a
decision dir, and 0 of them had both parents touch the same file. A
secondary same-file/different-author/14-day proxy found 94 pairs, but all
94 turned out to be strictly linear (sequential fixups), not concurrent
branches. Zero measured concurrent edits means no field-level merge driver
or CRDT (Automerge/Yjs) is justified yet; git's default merge is sufficient.
No merge-driver prototype built, per the task's own gate (only required if
a field-level driver were recommended).

## Notes

- Three of the six repos (korifi, cli, dapr) have zero 2-parent merge
  commits touching their decision dirs at all — they squash-merge PRs, so
  git's merge graph structurally has no 3-way-merge event to inspect for
  that path regardless of whether two PRs raced on the same file.
- `git merge-file` was never exercised against a real conflict in this
  corpus (0 events to test), so "how often does git's own 3-way merge
  resolve cleanly" is vacuously "100% of 0" — reported honestly as n/a
  rather than inflated to a clean-merge rate.
- INFERENCE: the near-miss 14-day window was chosen as a loose proxy for
  "overlapping PRs" since GitHub's PR-open/PR-merge timestamps weren't
  pulled (no token-authenticated GitHub API access in this environment);
  all 94 near-miss pairs were independently verified linear via
  `git merge-base`, so this proxy did not hide any real concurrency either.
- INFERENCE: repo selection (korifi, cli, dapr as the 3 additional repos)
  was done by GitHub's unauthenticated repo-search + git-tree API, filtering
  for existing `docs/adr`-ish paths with real multi-contributor history;
  not an exhaustive survey, but all 6 are genuine OSS projects with ADR
  practice and multiple distinct committers, matching the task's intent.
- Scripts and raw clones live outside the repo (`/Users/a1/.hermes/cache/scratch/t83`);
  only the mining script, `repos.json`, and its output CSVs/summary are
  committed under this task.
