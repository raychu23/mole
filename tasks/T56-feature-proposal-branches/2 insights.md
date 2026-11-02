# T56 insights — feature proposals as what-if branches (D67 first slice)

## Summary
Built `packages/proposals` (`mole-proposals` CLI + API). A person creates proposal branches of the decision
records from one pinned baseline commit (git linked worktrees), edits the reasoning (Argdown arguments,
decision records), then `evaluate` / `compare` shows which arguments flip (in/out/undecided) and which
decisions resting on them go from holds → contested/defeated, with file:line sources and the baseline hash.
The approved checkout is never written; evaluation reads the baseline's `.mole` via `git archive`.
Open: no UI yet (CLI/JSON only), no natural-language proposals (prose files are listed as notEvaluated),
no staged rollout / outcomes (D66), not wired into VS Code or MCP.

```notes
continued from    codex worker (17:02, stopped at a usage limit ~17:05): prior-art.md + research/sources.md + a draft
                  test kept the design; draft test rewritten (CLI path pointed into the temp repo; expected labels
                  misread Argdown: `<A>` + indented `-> <B>` = A attacks B)
red → green       red.txt: 5/5 failing (no package) · after: 5/5 pass · text field added test-first (1 red → green)
model             per-worktree metadata at `git rev-parse --git-path mole-proposal.json` (outside the tree, never committed)
                  decision state = its cited arguments: all in → holds · any out → defeated · else contested
safety            name slug + git check-ref-format · absolute, non-existent path · existing branch refused · baseline
                  resolved to a full commit before any write · undo only what this call created · execFile arrays, no shell
smoke             real python-tuf clone, ADR 0002 as records + two proposals (support window vs drop old code):
                  4 log/smoke-compare.json · baseline repo stayed clean on its branch
limits            supports edges are display-only (Dung engine) · decisions without `cites` to arguments never change
                  state · no value-order (audience) input yet · prose proposals not interpreted, only listed
```
