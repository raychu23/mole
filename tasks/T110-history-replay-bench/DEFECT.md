# T110 v1 review FAIL -- defect record (kept, not deleted)

Reviewer verdict (full transcript: `/Users/a1/.hermes/cache/delegation/live/deleg_6bdffd27/task-0.log`): **FAIL**.

## What was wrong

All 4 of v1's "violate" positives (`v1-failed-attempt/cases_h2.json`) used the PR's FINAL MERGED diff as
the scored case. But in every one of the 4 PRs, the maintainer's ADR-citing review comment was posted, the
*author then pushed a fix in response*, and the PR was merged in its fixed state. So the diff v1 actually
fed to every arm was the POST-FIX, ADR-COMPLIANT code -- the opposite of what the "violate" label claimed.

| case | maintainer comment (ADR cited) | v1 diff scored (head=final merge) | actual state at that head |
|---|---|---|---|
| h2-bs-18540 | freben: move export to `types.ts` (ADR004) | `a744b408` | **fixed** -- `types.ts` exists, exported via local `index.ts`, exactly as asked |
| h2-bs-20007 | Rugvip: explicitly list exports (ADR004) | `8863ee2d` | **fixed** -- explicit export list present, no wildcard `export *` |
| h2-bs-17875 | Rugvip: don't use default export (ADR003) | `ebeb7758` | **fixed** -- no `export default` left in the flagged file |
| h2-bs-6882 | Rugvip: follow ADR004 export structure | `fab79add` | **fixed** -- the objected-to `export * from './reading/tree'` line removed from `src/index.ts` |

This is a labeling-methodology defect, not tampering: the freeze hygiene (sha256 before any arm) was fine,
the LABEL ASSIGNMENT RULE was wrong (merge commit instead of comment commit).

## Fix applied (v2, this task's new files)

Every GitHub PR review comment carries `commit_id` (current/latest) and `original_commit_id` (the commit
the comment's diff position was anchored to -- unchanged even if the PR is later pushed/rebased/merged).
v2 re-fetches each of the 4 PRs' review comments, reads `original_commit_id` for the exact ADR-citing
comment quoted in v1's `signal_text`, and uses `gh api repos/.../compare/<base>...<original_commit_id>`
(unified diff) as the positive case's diff -- the code AS IT STOOD when the human wrote "this violates
ADR004" (or equivalent). Manually confirmed (see `4 log/search_log_v2.txt` is the search log; the
per-case confirmation commands and their output are in this task's delegation transcript) that the
flagged pattern is still present in each of the 4 pre-fix diffs, i.e. the violate label is now actually
checked against violating code.

v2 ALSO keeps the final merged (fixed) diff of the SAME PR as a paired negative (`label_final: compliant`)
-- same code, same ADR, same files, after the human-requested fix. This is the strongest pairing design
available (identical change, before/after a human correction isolates the one thing that changed: whether
the fix was applied), stated in the task instructions as the preferred design, not something discovered
after the fact.

v1's files are preserved unchanged under `v1-failed-attempt/` as a recorded failed attempt (not deleted,
not silently overwritten) -- its `0 start.md`/`results.md`/`frozen.sha256` still describe what WAS run and
why it failed review; `protocol_v2.md` and `results-v2.md` are the current record.
