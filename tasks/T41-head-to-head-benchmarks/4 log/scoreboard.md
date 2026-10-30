```notes
T41 scoreboard      M35 head-to-head vs recognizable tools      written 2026-10-30T03:04:03.700Z
    rule                a loss or a tie is reported with the same prominence as a win (R7); every row names a real Amazon JD line it supports
```

### H1 call graph precision/recall (F1) vs the most recognizable static-analysis tools

Amazon JD line: Amazon AWS Database SDE Intern (10565667): "Participate in code reviews as a core engineering practice, providing constructive feedback and validating correctness, including for AI-generated code."

Mole: F1 100.0% (P 100.0% / R 100.0%), full index 5.8s, incremental p95-ish 97ms

Best baseline (scip-typescript): F1 96.1% (Sourcegraph scip-typescript)

All baselines (real: npx @sourcegraph/scip-typescript (0.4.0), web-tree-sitter (0.27.1) + tree-sitter-typescript (0.23.2), dependency-cruiser (18.7.0), all offline devDependencies, T1 4-engine bench):
- scip-typescript: F1 96.1% (P 97.9% / R 94.4%), full index 5.3s
- tree-sitter: F1 80.7% (P 99.4% / R 67.9%), full index 0.8s, incremental 20ms (fastest, lowest recall)
- dependency-cruiser: 7 modules indexed (import graph only, no call edges — not comparable to F1 above)

n: 215 sampled / 7020 truth call sites, 362-file TS fixture · key: `generated data/m0-engine-report.json`

---

### H2 hand-back test selection: regressions caught vs tests run

Amazon JD line: Amazon AWS Database SDE Intern (10565667): "Work in an agile environment practicing CI/CD principles while participating in operational responsibilities including on-call duties."

Mole: caught 10/10 while running 18.5% of the tests that reach the change (mean)

Best baseline (run-all (full suite)): run-all catches 10/10 but at 1347.5% of the suite — Mole gets the same catch rate at ~1/73 the tests

All baselines (real: vitest 3.2.7 `vitest related <files> --run` (the reach denominator) and the same repos’ real full-suite runs (run-all / run-none)):
- vitest related (reach set, upper bound): the denominator itself: tests whose module graph contains the edited file (vitest’s own changed-file query), mean 18.5% of the full suite
- run-all: 10/10 caught at 1347.5% of the suite
- run-none: 0/10 caught at 0% (baseline floor)

n: 10 planted regressions, Mole 36.0% mean reach share, Excalidraw 1.1% · key: `packages/verify/bench/keys/m14-key.json`

---

### H3 stale-knowledge detection precision/recall/F1 on real commit history vs the field’s own documented approaches

Amazon JD line: Amazon AWS Database SDE Intern (10565667): "Contribute to clear and accurate technical documentation."

Mole: recall 100% (136/136), false flags 0% (0/1151), ws/comment-only flagged 0 (production @mole/memory, integrated T11)

Best baseline (path-touched (CODEOWNERS/ADR style)): path-touched (CODEOWNERS/ADR style): P 20.3% / R 100.0% / F1 33.8%

All baselines (reimplemented+url: Swimm https://docs.swimm.io/features/keep-docs-updated-with-auto-sync ; Copilot Memory citation behaviour per GitHub Copilot docs, cited in 4 log/prior-art.md; path-touched is CODEOWNERS/ADR convention, no vendor to cite):
- Swimm Auto-sync (reimplemented from docs): P 100.0% / R 4.0% / F1 7.7% (tp 3 fp 0 fn 72)
- Copilot Memory citation check (reimplemented from docs): P 0.0% / R 0.0% / F1 0.0% (tp 0 fp 0 fn 75) — misses every same-name body rewrite by design (the documented gap)
- path-touched (CODEOWNERS/ADR style): P 20.3% / R 100.0% / F1 33.8% (tp 75 fp 294 fn 0) — recall 100% by construction, precision collapses on multi-symbol files

n: 369 real (symbol, commit) pairs across 12 real Mole/Excalidraw commits · key: `packages/memory/bench/m1-key.json`

---

### H4 rename re-anchoring precision/recall vs git’s own rename detection

Amazon JD line: Amazon Leo SDE Intern (10587999): "Collaborate and communicate effectively with experienced cross-disciplinary Amazonians ... participating in technical discussions to drive solutions forward."

Mole: frozen 88.9% (32/36) wrong 0; held-out1 68.2% (15/22) wrong 3; held-out2 85.7% (18/21) wrong 1; target >=95% wrong 0 NOT MET

Best baseline (git log --follow -M): git log --follow -M: P 0.0% / R 0.0% (file-level only; structurally blind to same-file symbol renames, 1 of 1 positives)

All baselines (real: git log --follow -M / git show -M --name-status (the installed git binary, no package)):
- git log --follow -M: P 0.0% / R 0.0% (tp 0 fp 0 fn 1) over 7 frozen Mole cases

n: 7 frozen Mole cases (151 total incl. Excalidraw held-out) · key: `packages/memory/bench/m9-key.json`

---

### H5 parallel-agent collision recall / false-alarm rate vs worktree-tool-style baselines

Amazon JD line: Amazon Redshift DB Intern (10590290): "Document technical findings and communicate results clearly to team members."

Mole: recall 100.0% (16/16) · false alarms 0.0% (0/16) · planted recall 7/7, false alarms 0/7; real recall 9/9, false alarms 0/9 · target recall >= 90%, false alarms <= 10%

Best baseline (same-file overlap): same-file overlap: R 56.3%, FP rate 47.1%

All baselines (real: git merge-tree (installed git) on real Mole commits; same-file overlap computed from git show --name-only + the key’s own evidence):
- same-file overlap (what Live Share / worktree tools warn on): R 56.3%, false-alarm rate 47.1% (tp 9 fp 8 fn 7)
- git merge-tree (textual conflicts only, real git commits): R 0.0%, false-alarm rate 0.0% over 3 real-commit pairs (tp 0 fp 0 fn 3) — textual merges rarely conflict even when two agents changed the same function’s *behavior*, which is exactly the gap Mole’s call-graph check closes

n: 16 real pairs + 16 planted pairs · key: `packages/agentstate/bench/m11-key.json`

---

### H6 agent "done"-claim check recall / false-flag rate vs a tests-pass-only gate and trusting the summary

Amazon JD line: Amazon AWS Database SDE Intern (10565667): "critically validate, verify, and integrate AI-generated code, exercising sound judgement about when to trust AI output and when not to."

Mole: recall 100.0% (9/9) · false flags 0.0% (0/111) · exact verdict 95/120 · split coverage 100/120 · flagged outside key 1 · answers extracted 39/39 · 40 answers in 1542 ms, model calls 0 · target recall >= 90%, false flags <= 10% · outside-key flags 1: judged wrong 0, unjudged 1 (before review-1 fix: 14, 14 judged wrong) · held-out 16 answers: flags 15, correct 0 (precision 0.0%) · flagged key claims caught 0/1 (recall 0.0%) · Stop-hook lines (precision guard) 0, correct 0 (precision n/a), caught 0/1 · tool claims 154

Best baseline (tests-pass-only gate): tests-pass-only gate: R 77.8%, false flags 0.0%

All baselines (reimplemented+url: both baselines are definitional (no vendor doc to cite) and scored from the key’s public aggregate counts, since the per-claim quotes are gitignored chat text (R2: never reused/edited)):
- tests-pass-only gate (checks only test/exit-code claims, trusts the rest): R 77.8% (7/9) — structurally misses the 2 flagged claims outside the test/exit category (e.g. "the commit was reverted", a file-copy claim); false flags 0.0% (0/111); computed from the key’s public category breakdown, tasks/T24-agent-claim-check/4 log/key.md
- trust-the-summary (never checks anything): R 0.0% (0/9) by definition, false flags 0.0% (0/111) by definition

n: 40 final answers (32 Hermes + 8 Claude Code), 120 claims, 9 flagged · key: `tasks/T24-agent-claim-check/4 log/key.md`

---

### M32 bonus: bitemporal decision graph as-of answers vs a latest-only store

Amazon JD line: Amazon Redshift DB Intern (10590290): "Participate in performance benchmarking and testing of database workloads."

Mole: as-of 100.0% (64 q, +10 .mole/decisions git-history facts loaded) vs latest-only 45.3% · overlaps 0/1000 (1 committed, 999 rejected by the database, bounded-concurrency writers) · p95 0.44 ms indexed vs 15.40 ms seq (34.9x) at 100000 · model calls 0

Best baseline (latest-only (single current value per record)): latest-only store (wiki/ADR folder style): 45.3%

All baselines (real: PostgreSQL 16 with/without btree_gist EXCLUDE index, T38 (already integrated); copied in per the T41 contract):
- latest-only: as-of accuracy 45.3% on the same 64 questions (T38, already integrated)

n: 64 as-of questions, 100,000 synthetic facts for the index benchmark · key: `packages/temporal/bench/m32-key.json`

