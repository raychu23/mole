---
state: built, needs review
owner: wave-h-agent-h3
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t101-package-size
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T101-package-size
base: f22b551
status: built, not yet reviewed or integrated
next: adversarial review (sdlc 4-verify/4-adversarial-review), then ledger integrate
---
```notes
T101-package-size    wave H task H3 (users: install time)
    goal              find what's bundled in the mole-code npm tarball and why
                      (release/mole-code/tools/build.mjs), cut what isn't needed at runtime,
                      compare against similar CLIs, keep tools/test-install.mjs green, report
                      before/after sizes + cold npx --help time. Do not publish.
    found             (1) typescript (8.7 MB compiler) was esbuild-bundled INLINE into all 3
                      outputs (cli.js, worker.cjs, mcp.cjs) because it wasn't in bundleDaemon's
                      `externals` list -- ~3x duplication of the same 8.7 MB of code across the
                      tarball. (2) the separately vendored dist/node_modules/typescript (for
                      dependency-cruiser's own `require('typescript')`, T86 finding) copied the
                      WHOLE installed npm package via the generic vendorPackageTree: standalone
                      tsc/tsserver/typingsInstaller entry points (_tsc.js alone 5.9 MB) and ~13
                      locale dirs (4.3 MB) that @mole's runtime never reaches -- only
                      lib/typescript.js (require('typescript')'s main) + lib/lib.*.d.ts (the
                      type checker's default libs -- confirmed load-bearing: packages/indexer's
                      ts-engine.ts calls ts.createProgram + getTypeChecker, not just a parser)
                      are ever used.
    fix               scripts/bundle-daemon.mjs: new vendorTypescriptRuntime(outDir) (copies only
                      typescript.js + lib.*.d.ts + package.json + LICENSE); release/mole-code/
                      tools/build.mjs: 'typescript' added to bundleDaemon's externals, old
                      top-level dist/lib.*.d.ts copy loop + vendorPackageTree('typescript', ...)
                      replaced with the new helper. apps/vscode/esbuild.mjs and
                      plugins/claude-code/scripts/build.mjs untouched (different artifacts, not
                      this task's boundary; verified plugins/claude-code/scripts/build.mjs still
                      builds unchanged after the shared-file addition).
    measured          npm pack (release/mole-code): packed 13,546,802 -> 6,021,329 B (-55.5%),
                      unpacked 72,756,122 -> 28,384,787 B (-61.0%), 1216 -> 1087 files. See
                      4 log/before-after.md. tools/test-install.mjs: 12/12 steps pass (fresh
                      build+pack+isolated install+`mole --help`/`rules`/`check`/`runs`/`agents`/
                      `steer`+MCP initialize/tools-list/5 tools-call), including `mole rules`
                      (the real test that dependency-cruiser's trimmed `typescript` is still
                      resolvable and working, not just present).
    not-run           cold npx --help timing: measured before (1.476s) and after (2.301s) but
                      NOT a reliable before/after signal -- T97's dcbench-v4 benchmark pilot was
                      running concurrently on this Mac tonight (shared-note CPU contention); see
                      4 log/before-after.md. No npm publish (brief boundary).
    boundary          scripts/bundle-daemon.mjs, release/mole-code/tools/build.mjs,
                      tasks/T101-package-size/**
    non-goals         apps/vscode/esbuild.mjs, plugins/claude-code/scripts/build.mjs (same
                      pattern, same potential win, but a different shipped artifact -- out of
                      this task's named boundary, left for a follow-up)
    came from         Wave H brief H3 (briefs/G-wave.md)
    links             tasks/T101-package-size/4 log/{prior-art,before-after}.md
    harness           hermes
```
