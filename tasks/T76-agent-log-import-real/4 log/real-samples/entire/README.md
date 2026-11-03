# T76 review fix: real Entire checkpoint data (entireio/cli public repo)

The prior-art claim "no real public instances of Entire checkpoint data found" was false. Entire's own
`entireio/cli` repository on GitHub dogfoods the tool: its `refs/entire/checkpoints/*` namespace is public and
fetchable with plain `git`, no `entire` CLI, no install, no live agent session.

## Step 1: list the public checkpoint refs (no clone)

```
git ls-remote https://github.com/entireio/cli.git | grep 'refs/entire/checkpoints'
```

Returned 59 refs at capture time (2026-11-03), e.g.:
```
df7917690384ee1cee2ec069929195c3c6318f17	refs/entire/checkpoints/0D/01KXGTTNGCEACC83QZEJ5YAF0D
9f11d3cfc00913866b45e13c7093bf30466ef38f	refs/entire/checkpoints/0G/01KWY3M0FWWCV0SVB84CPG040G
...
```
(Full list captured in `all-checkpoint-refs.txt` in this directory.)

## Step 2: fetch a sample of them into a scratch bare repo (no working tree, no entire CLI)

```
mkdir -p /tmp/entire-probe && cd /tmp/entire-probe && git init -q --bare .
git fetch -q https://github.com/entireio/cli.git \
  refs/entire/checkpoints/0D/01KXGTTNGCEACC83QZEJ5YAF0D:refs/t/r1 \
  refs/entire/checkpoints/0G/01KWY3M0FWWCV0SVB84CPG040G:refs/t/r2 \
  refs/entire/checkpoints/1T/01KWY36KMC5ZJSTSFN91GNF51T:refs/t/r3 \
  refs/entire/checkpoints/2E/01KX0ENQ9M4C5P85G431G5YR2E:refs/t/r4 \
  refs/entire/checkpoints/2V/01KX0P0XW5TXCPJY4G65B8N82V:refs/t/r5
```

## Step 3: read the tree and dump metadata.json blobs (each checkpoint ref is itself a tree, not a commit)

```
git ls-tree -r refs/t/r1
# 100644 blob <hash>  0/content_hash.txt
# 100644 blob <hash>  0/full.jsonl
# 100644 blob <hash>  0/metadata.json      <- per-session metadata (snake_case, no line ranges)
# 100644 blob <hash>  0/prompt.txt
# 100644 blob <hash>  0/transcript.jsonl
# 100644 blob <hash>  metadata.json        <- root CheckpointSummary (snake_case, no line ranges)

git cat-file -p <root-metadata-hash>    > checkpoint-<id>.root.metadata.json
git cat-file -p <session0-metadata-hash> > checkpoint-<id>.session0.metadata.json
```

Repeated for r1..r5 (refs/t/r1 through refs/t/r5 above) to produce the 5 checkpoints x 2 files
(root + session 0) saved alongside this README:

- `checkpoint-01KXGTTNGCEACC83QZEJ5YAF0D.{root,session0}.metadata.json` (branch `fix/1036-headless-login-hint`)
- `checkpoint-01KWY3M0FWWCV0SVB84CPG040G.{root,session0}.metadata.json` (branch `feat/review-no-default-timeout`)
- `checkpoint-01KWY36KMC5ZJSTSFN91GNF51T.{root,session0}.metadata.json` (branch `cli-onboard`)
- `checkpoint-01KX0ENQ9M4C5P85G431G5YR2E.{root,session0}.metadata.json` (branch `paul/mirror-get-cluster-routing`)
- `checkpoint-01KX0P0XW5TXCPJY4G65B8N82V.{root,session0}.metadata.json` (branch `feat/review-no-default-timeout`)

## What the real format actually is (confirmed against both data and source)

Confirmed against `entireio/cli`'s own `api/checkpoint/metadata.go` (`CheckpointSummary`, `Metadata` structs,
fetched via web search of the GitHub-rendered source, 2026-11-03) and `docs/architecture/sessions-and-checkpoints.md`:

- Root `metadata.json` is a `CheckpointSummary`: `cli_version`, `checkpoint_id`, `strategy`, `branch`,
  `commit_sha` (omitempty; **import-only** anchor, absent on every real sample above), `checkpoints_count`,
  `files_touched` (file paths, **no line ranges** — `null` or `[]` when nothing changed, e.g. the
  `01KXGTTNGCEACC83QZEJ5YAF0D` and `01KWY36KMC5ZJSTSFN91GNF51T` samples), `sessions` (array of **file paths**:
  `metadata`/`transcript`/`compact_transcript`/`content_hash`/`prompt` — not session objects), `token_usage`.
- Per-session `metadata.json` is a `Metadata`: `checkpoint_id`, `session_id`, `strategy`, `created_at`, `branch`,
  `commit_sha` (import-only, absent here too), `checkpoints_count`, `save_step_count`, `files_touched` (again
  file paths only), `agent`, `model` (empty string when unknown, e.g. `01KX0P0XW5TXCPJY4G65B8N82V`'s session),
  `turn_id`, plus optional `token_usage`, `skill_events`, `session_metrics`, `initial_attribution`,
  `prompt_attributions` (legacy line-count stats, not line *ranges* and not read here).
- **There is no per-session file/line-range field anywhere in the real schema.** `entire.ts`'s old
  `EntireSessionRecord.fileRanges: Array<{file,startLine,endLine}>` does not exist in any real checkpoint;
  it was invented by T39 to fill a gap the (non-existent, at the time) real data left open. The granularity
  Entire's real data actually supports is **file-level** (`files_touched`), not line-level.

## How Entire links a checkpoint to a commit (the real mechanism, confirmed from source/docs)

`commit_sha` in metadata.json is **not** the normal link — the code comment is explicit: "CommitSHA anchors an
imported checkpoint to an existing commit; empty for non-imported checkpoints, which link via the
Entire-Checkpoint trailer." Entire's own docs (docs.entire.io/guides/checkpoints/overview) confirm the same:
"Entire adds that ID to the commit message with an `Entire-Checkpoint` trailer." A real example, found in
`entireio/cli`'s own history (git log, no entire CLI):

```
commit fd3b9e60c5c48adef513d5feb0d0d3aebf16e92c
    Condense an amended squash into its own checkpoint
    ...
    Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
    Entire-Checkpoint: 01M3CPBXB4WW7TXJJ3HDYQR63Z
```//captured in commit-trailer-example.txt in this directory (`git log -1 --format='%B' fd3b9e60...`).
(That checkpoint's own ref had been removed/GC'd by capture time — Entire checkpoint refs are not permanent —
so this evidences the *mechanism*, not a still-resolvable id; the mechanism itself is what `entire.ts`/
`external.ts` need to use, not a `commit_sha` metadata field.)

So the real options for linking a checkpoint to code are exactly the two the review named: file-level via
`files_touched`, or commit-level via the `Entire-Checkpoint:` trailer on the linked commit's message — never a
line range.
