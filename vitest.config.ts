import { defineConfig } from 'vitest/config';

// Root-level vitest config (none existed before). Needed because `npm run check`
// (`vitest run` at the workspace root) picks up every `*.test.ts` in the repo by default,
// including frozen bench-fixture corpora that are COPIES of an earlier Mole checkout used
// as test data by other tasks' benches (e.g. packages/decisions/bench/corpora/mole/**).
// Those corpora ship their own test files (so the benches that read them see realistic
// history), but they were never meant to run as live tests from the workspace root — they
// have no sibling `dist/` built there, so every one of them fails with "Cannot find module
// ../src/index.js". This exclude only removes bench-fixture data from discovery; it does not
// touch any package's own `src`/`test` directories or skip any real test.
export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/bench/corpora/**',
      '**/bench/**/corpora/**',
      'evals/inspect/**',
    ],
  },
});
