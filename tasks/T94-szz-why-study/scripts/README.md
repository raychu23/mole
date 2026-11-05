# T94 SZZ "why" mining scripts

Pre-registered protocol: `../4 log/protocol.md` (frozen, sha256 in `../4 log/FROZEN.sha256`).
Prior art: `../4 log/prior-art.md`. Results: `../4 log/results.md`.

## Pipeline (run once, in order, per repo)
1. `phase_a.py <repo>` — traverses commits (PyDriller), applies deterministic "has a why"
   detection and doc-only-commit exclusion, writes candidate rows + fix-commit candidates.
   Pure git/pydriller, no network.
2. `phase_b.py <repo>` — validates each candidate fix-commit's referenced issue number against
   the GitHub Issues API (closed, not enhancement/feature, not a self-referential PR number).
   Network only, no git subprocess (kept separate from phase A/C: mixing git subprocess forking
   with network calls in the same long-lived process triggered a macOS CoreFoundation
   after-fork crash during development — splitting into single-purpose phases avoided it).
3. `phase_c2.py <repo>` — runs SZZ (`Git.get_commits_last_modified_lines`, PyDriller's B-SZZ)
   on each validated bug-fixing commit, with a 25s per-commit watchdog (added live during
   mining — some very old/large files made `git blame` pathologically slow; skipped commits
   are logged, not imputed) and incremental checkpointing (safe to re-run/resume).
4. `analyze.py` — loads all `raw_*.jsonl`, fits the pre-registered logistic regression
   (cluster-robust SE by repo + bootstrap CI + repo-FE robustness check), applies the
   pre-registered null-result rule, writes `analysis_output.json`. Run exactly once.

Repos used: ledgersmb/LedgerSMB, cloudfoundry/cli, softwaremill/tapir — shallow-cloned
(`--filter=blob:none`, then `git fetch --refetch` to defeat the filter: blame/SZZ needs
historical blob content, so a true partial clone makes `get_commits_last_modified_lines`
fetch blobs one revision at a time over the network and is impractically slow) into
`/Users/a1/.hermes/cache/scratch/szz/<repo>/` (scratch, not committed; delete after use).

`analysis_output.json` here is the committed numeric output of the one real run this task
performed (2026-11-04); re-running requires re-cloning the 3 repos into scratch first.
