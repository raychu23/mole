# Design review: team PR check

Attendees: a14, raymond (async notes only)

- walked through the merge-base snapshot approach
- DECIDED: `prCheck()` must read records at the merge base, never the PR head, so a PR can't silence its own check by editing or deleting a record.
- some discussion of GitHub API rate limits, no conclusion
- nit: rename `diffText` to something clearer later
