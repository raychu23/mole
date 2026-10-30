```notes
T41 prior art      head-to-head scoring      2026-10-29 (prior-art-first)
    scoring          precision/recall at 0 false positives on a frozen key = how Greptile, CodeRabbit, Bugbot publish review benchmarks (context/product-plan/systems/resume/research/industry-metrics.md, S8)
                     regressions caught at a fraction of tests = Meta predictive test selection (>99.9% at 1/3, S12); CI time saved = DORA lead time (S13)
                     p50/p95 latency + index speedup with EXPLAIN ANALYZE = standard Postgres tuning evidence (T38 already: 34.9x)
    baselines        Sourcegraph scip-typescript (npm 0.5.2, SCIP = Sourcegraph/GitHub-scale code intel) · tree-sitter (GitHub code navigation's parser family) · dependency-cruiser (import graph) · Vitest 'vitest related' (built-in changed-file test selection) · git rename detection (-M, --follow) · git merge-tree (textual conflicts)
                     reimplemented from docs (no accounts): Swimm Auto-sync (https://docs.swimm.io/features/keep-docs-updated-with-auto-sync) · GitHub Copilot Memory citation check (context/product-plan/Mole compared.md S3)
    amazon lines     'validating correctness, including for AI-generated code' · 'performance benchmarking and testing' · 'analyze workloads, identify performance improvements' · 'CI/CD principles' · 'operational excellence through monitoring' (context/product-plan/systems/resume/jds/)
    rule             a loss or tie is a result (R7): report it with the same prominence
```
