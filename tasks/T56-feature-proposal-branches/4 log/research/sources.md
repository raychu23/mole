# Primary-source capture — 2026-11-02

The dated source URLs and their decision-relevant extracts are indexed in
[`../prior-art.md`](../prior-art.md). This research record deliberately stores only
the short, implementation-relevant findings, not copied documentation.

- Git worktree — linked worktrees share common repository data and isolate
  per-worktree `HEAD`/index state.
- Git check-ref-format — validate names with Git rather than a home-grown ref parser.
- Git rev-parse — use `--verify --end-of-options` and require a commit object.
- Git status — porcelain output is stable for scripts; source dirtiness is not a
  substitute for a pinned commit.
- Git update-ref — ref changes can be guarded by expected old values/transactions.
- AWS ADR process — proposed is distinct from accepted/superseded.
- Argdown syntax — relationships are structured source material, not prose inference.
