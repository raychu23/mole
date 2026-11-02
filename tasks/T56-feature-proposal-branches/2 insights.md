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

## 11-02 17:55 review 1 (deleg_99bfc656) FAIL → fixed tests-first (3 red → green, 8/8)
- HIGH a deleted decision with no `cites` went absent → absent and vanished → new state `uncited` (record exists, engine can't judge it)
- MEDIUM `--path` inside `.git` was allowed (prior-art.md said it wasn't) → refused, compared by real path (/var vs /private/var, symlinked parents)
- LOW hand-edited baseline hash → raw stack trace → clean "baseline commit not found"
- solid per reviewer: baseline never written · name injection rejected · deterministic · labels = @mole/reasoning direct · 3,000 records in ~2 s
