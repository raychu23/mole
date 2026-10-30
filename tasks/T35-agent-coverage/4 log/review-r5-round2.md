# R5 round 2: fresh review of d934a53 (R2-approved --first-parent key fix applied)

Fresh review, no implementer transcript read. Scope: confirm `cce2f8c..d934a53` applies only the
approved fix + key regen + logging, and independently reproduce the claimed final numbers.

## Diff boundary check: `git diff --stat cce2f8c..d934a53`
6 files changed, 234(+)/1143(-):
- `packages/coverage/bench/build-key.mjs` (+6/-2 lines) -- exactly the ruling's approved edit: adds
  `--first-parent` to the `git log` invocation building each builder's commit set. No other logic
  touched (confirmed by reading the full hunk: only the `git(['log', ...])` call line changed, plus a
  3-line explanatory comment citing `key-ruling-1.md`).
- `packages/coverage/bench/m27-key.json` (1185 lines changed, almost entirely deletions) -- the
  regenerated frozen key: `built` timestamp updated, commit/file lists shrink as expected from
  `--first-parent` filtering. This is a data artifact of running `build-key.mjs`, not a hand edit.
- `tasks/T35-agent-coverage/2 insights.md` (+22) -- "Round 2" log entry recording the fix, before/after
  numbers, and the per-builder precision breakdown. Documentation only.
- `tasks/T35-agent-coverage/4 log/runs.jsonl` (+1 line) -- one new run record with the round-2 numbers.
  Documentation only.
- `tasks/T35-agent-coverage/4 log/key-ruling-1.md` (new, 88 lines) and
  `tasks/T35-agent-coverage/4 log/review-r5.md` (new, 75 lines) -- **both confirmed absent from
  `cce2f8c`** (`git show cce2f8c:<path>` fails with "exists on disk, but not in cce2f8c" for both).
  These are the R2 ruling and the prior R5 PASS review themselves, landing in this commit rather than
  an earlier one. Checked: neither file's content is anything other than the ruling/review text already
  known to this review chain -- no scope creep, no code, no changed criteria. This is a commit-sequencing
  artifact (review/ruling docs committed together with the fix they authorize), not a boundary violation.
  Noting it so it's visible, not treating it as a finding.

No package.json/tsconfig/other source files touched. **Confirmed: the diff applies exactly the approved
`--first-parent` fix, the key regeneration it causes, and logging of the new numbers -- nothing else.**

## Independent rebuild and rerun (this worktree, not trusting claimed numbers)
- `npm run build -w @mole/coverage` -- clean, exit 0.
- `npm run check` -- **499 passed, 14 skipped, 0 failed** (66 test files passed, 7 skipped). Matches
  claim exactly.
- `node packages/coverage/dist/bench/m27.js`, independently re-run:
  - **M27a**: precision `0.8421`, recall `0.8824`, tp 480 / fp 90 / fn 64 -- **matches the claimed
    0.842/0.882 (480/90/64) exactly**. Both precision and recall are below the 0.95/0.95 target: a
    genuine double miss, not a loosened one (target, key-building method, and scoring code are
    unchanged in semantics -- only the git-log flag changed, per the approved ruling).
  - **M27b**: `sampled: 20, wrong: 0` -- **MET**, matches claim.
  - **M27c**: `queryP95Ms: 0` (<=200ms target) -- **MET**; `fullScanMs: 42206.9` (~42.2s, <=60s target)
    -- **MET**, though slower than the earlier 23.6s run (already-disclosed machine-load variance per
    insights.md, still comfortably under the 60s ceiling).

All claimed round-2 numbers independently reproduced, digit for digit.

## Assessment of the miss
- The fix is exactly the one R2 approved after independent empirical verification (confirmed again by
  re-reading `key-ruling-1.md`'s evidence in this pass): `--first-parent` corrects a real ground-truth
  over-count without touching the metric's thresholds or scoring semantics.
- Applying it moved the failure mode from a pure recall problem (0.998p/0.427r) to a balanced
  precision/recall tradeoff (0.842p/0.882r) -- both now closer to target, neither spuriously inflated.
  mole-builder-3's precision (0.231) is the main drag, and insights.md correctly identifies the cause
  (round-1's resumed-session attribution crediting builder-3 with files that, under the tighter key,
  belong to someone else) rather than guessing.
- This is the second diagnosed, documented round on this exact gap (round 1: key over-count found and
  ruled on; round 2: ruling applied, new gap located and attributed to a specific known mechanism). The
  feature itself works: 0 wrong weak-spot reasons (M27b), good query latency (M27c), and M27a's own
  tp/fp/fn numbers show substantial correct attribution, not a broken mechanism.
- No unilateral key or threshold loosening at any point in this chain -- every key-affecting change went
  through an explicit ruling.

## VERDICT: **PASS (integrate at the real number)**
Grounds:
- Diff is boundary-clean: only the approved one-line fix, its mechanical key-regen consequence, and
  logging/documentation. No code or scope changes beyond what was authorized.
- `npm run check` and M27a/b/c are all independently reproduced exactly as claimed.
- The M27a miss (precision 0.842, recall 0.882, both < 0.95) is logged honestly per R7, with a correctly
  diagnosed, two-round cause trail -- not a stop-worthy defect and not a hidden/loosened check.
- Per the standing R7 rule ("a missed target changes the claim built on it, not the metric"): integrate
  T35 with the claim stated as precision 0.842 / recall 0.882 (tp 480, fp 90, fn 64) against the
  0.95/0.95 target -- a genuine, documented miss -- alongside M27b (0/20 wrong, MET) and M27c (p95 0ms,
  full scan ~42s, both MET).
