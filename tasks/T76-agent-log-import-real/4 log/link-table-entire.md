# T76 review fix: hand-checked link table — real Entire checkpoint data

Entire's real data supports two link granularities, confirmed against 5 real checkpoints fetched from
`entireio/cli`'s public `refs/entire/checkpoints/*` (see `4 log/real-samples/entire/README.md` for exact
commands) and against the tool's own source (`api/checkpoint/metadata.go`) and docs: **file-level**
(`files_touched`, root or per-session) and **commit-level** (the `Entire-Checkpoint:` trailer on the linked
commit). There is no line-range granularity in the real format at all — unlike git-ai's table above, this table
has no "anchors to <function>" column, because the real data gives nothing to anchor a line range to.

## File-level links (files_touched, hand-checked against each checkpoint's own real sessions array)

| checkpoint_id | branch | session files_touched | root files_touched | which wins (session non-empty takes priority) | correct? |
|---|---|---|---|---|---|
| `01KXGTTNGCEACC83QZEJ5YAF0D` | fix/1036-headless-login-hint | `[]` | `null`→`[]` | `[]` (both empty) | ✅ 0 RawIntents — honestly nothing to link, not a crash or a guess |
| `01KWY3M0FWWCV0SVB84CPG040G` | feat/review-no-default-timeout | `["cmd/entire/cli/review/cmd.go"]` | `["cmd/entire/cli/review/cmd.go"]` | session (matches root here) | ✅ 1 RawIntent, file-level, `granularity: 'file'` |
| `01KWY36KMC5ZJSTSFN91GNF51T` | cli-onboard | `[]` | `null`→`[]` | `[]` (both empty) | ✅ 0 RawIntents |
| `01KX0ENQ9M4C5P85G431G5YR2E` | paul/mirror-get-cluster-routing | `["cmd/entire/cli/corecmd.go","cmd/entire/cli/repo_mirror.go","cmd/entire/cli/repo_mirror_test.go"]` | same 3 files | session (matches root) | ✅ 3 RawIntents, one per file, all `granularity: 'file'`, `agent: "Claude Code"`, `model: "claude-fable-5"` |
| `01KX0P0XW5TXCPJY4G65B8N82V` | feat/review-no-default-timeout | `["cmd/entire/cli/review/run.go"]` | same 1 file | session (matches root) | ✅ 1 RawIntent, `model` normalized to `undefined` (real data: session's `model` field is `""`) |

5/5 checkpoints: `entireToRawIntents` emits exactly the files that checkpoint's own real data names (5 total
RawIntents across the 3 checkpoints with any files touched; 0/5 wrong files, 0/5 fabricated line ranges). The
2 checkpoints with empty `files_touched` at both levels correctly produce 0 RawIntents rather than guessing.

`anchorIntents` on all 5 real file-level RawIntents: 5/5 reported as an explicit miss with reason `"file-level
claim only (source has no per-session line range); cannot anchor to a single function"` — never silently
anchored to whatever symbol happened to sit at the `[1,1]` sentinel. That IS the correct, honest behavior for
data this coarse (see `packages/agentstate/test/t76-real-entire.test.ts`, "anchorIntents reports a file-level
RawIntent as an explicit miss").

## Commit-level link (the Entire-Checkpoint trailer)

| evidence | what it shows | correct? |
|---|---|---|
| `entireio/cli` commit `fd3b9e60c5c48adef513d5feb0d0d3aebf16e92c` message ends `Entire-Checkpoint: 01M3CPBXB4WW7TXJJ3HDYQR63Z` (`git log -1 --format='%B'`, saved verbatim in `4 log/real-samples/entire/commit-trailer-example.txt`) | a real, non-imported checkpoint links to its commit via a trailer, not a `commit_sha` metadata field (every real sample's `commit_sha` is absent, confirmed in all 5 checkpoints above) | ✅ matches the source comment on `Metadata.CommitSHA` ("empty for non-imported checkpoints, which link via the Entire-Checkpoint trailer") and docs.entire.io's "Entire adds that ID to the commit message with an Entire-Checkpoint trailer" |
| `external.ts`'s `findCommitForCheckpoint` resolves this the same way: `git log --all --fixed-strings --grep "Entire-Checkpoint: <id>"` | the reader's commit-linking path matches the real mechanism, not a field read | ✅ (that specific checkpoint's own ref had already been GC'd by capture time, confirmed with `git ls-remote | grep 63Z` returning nothing — evidences the trailer *mechanism*, which is what the code needs, not a still-resolvable ref) |

## What this corrects in prior-art.md / insights.md

The T76 prior-art claim "no real public instances of Entire checkpoint data found" was **false** — see
`4 log/prior-art.md`'s updated `entire` row and `2 insights.md`'s updated Summary. The claim should have been
scoped to "no non-AI way to *create a new* checkpoint", which is still true (confirmed: `entire checkpoint` is
inspect-only); it should never have been extended to "no real data exists to examine", which a plain
`git ls-remote`/`git fetch` against entireio/cli's own repo disproves in under a minute.
