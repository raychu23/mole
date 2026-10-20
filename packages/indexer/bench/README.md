# M0 engine benchmark

Compares four engines on the read-only fixture `~/.hermes/hermes-agent/ui-tui` (362 TS files): TypeScript Compiler API (our `packages/indexer`), tree-sitter, scip-typescript, CodeGraph (benchmark only).

```sh
npm install && npm run build        # repo root
cd packages/indexer/bench && npm install
cd .. && node --no-warnings bench/run.mjs   # ~3 min, writes "generated data/m0-engine-report.json"
```

Ground truth = TypeScript language service go-to-definition at every call site; sample = 50 per stratum (barrel has only 15), seed 20261019. CodeGraph and the edit probes run on a scratch copy, never in the fixture. Candidate deps live only in `bench/package.json` (not a workspace).
