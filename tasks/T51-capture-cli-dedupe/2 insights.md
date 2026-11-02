# T51 insights — capture CLI + duplicate suggestions

## Summary
`mole decision new | supersede | link | suggest | recover` writes decision records the adr-tools way (both sides of a
relation in one recoverable transaction) and suggests likely duplicates of an incoming record (exact normalized
match, then fixed-seed MinHash/LSH + exact 3-gram Jaccard ≥ 0.80). Suggestions only, never merges.
Built by the codex worker (prior art, 5 of 6 behaviours red→green, runs.jsonl) until it stopped at a usage limit
~17:05; parent (Hermes chat) finished the `suggest` subcommand + reader, wired `mole decision` into the daemon CLI.
Open: 0.80 / 0.90 thresholds are heuristics, not measured; supersede requires both records accepted.

```notes
tests          packages/decisions/test/capture.test.ts 7/7 (red→green per behaviour in 4 log/runs.jsonl)
smoke          4 log/smoke.txt: new ×2 → suggest finds ADR-1 near (0.90) → supersede refused (ADR-2 proposed) → re-create refused
scratch limit  this worktree's node_modules links to MAIN's packages, so daemon tsc + the CLI/MCP tests that spawn built
               binaries fail here identically with or without T51 (checked by stash) · real check = after merge on main
boundary       capture/** + decisions cli.ts/index.ts + one line in packages/daemon/src/cli.ts (shared-file rule)
```
