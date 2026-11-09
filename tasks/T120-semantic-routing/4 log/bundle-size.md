# T120c: bundle-size measurement (embedBoost wiring, --embed-route)

Method: `cd packages/decisions && npx tsc -b --clean && npx tsc -b`, then `find dist/src -name "*.js" -exec wc -c {} \;`
summed, compared before (git stash -u, i.e. main @ 91761cb) vs. after (this branch). Reproducible: re-run the same
two commands on `main` and on this branch's tip.

| build                                                      | dist/src total bytes |
|--------------------------------------------------------------|----------------------:|
| main (91761cb, before this task)                              |                469888 |
| this branch (cascade.ts/cli.ts wiring + embedder-minilm.ts)   |                473538 |
| delta                                                         |            +3650 (0.8%) |
| delta excluding embedder-minilm.js itself                     |            +2204 (0.5%) |

`@xenova/transformers` is NOT installed in this repo (intentionally -- see embedder-minilm.ts's own doc) and
contributes 0 bytes to dist: it is referenced only as a runtime string passed to a dynamic `import()` inside
embedder-minilm.ts, never a static import anywhere else. Confirmed:

```
grep -rl "embedder-minilm\|xenova" dist/src --include="*.js" | grep -v "dist/src/cascade/embedder-minilm.js"
-> dist/src/cascade/index.js   (a comment only, no import)
-> dist/src/cascade/cli.js     (a comment + the dynamic `await import('./embedder-minilm.js')`, not a static import)
```

The +3650 bytes is entirely: (a) the `Embedder` interface + `embedBoost?`/`embedder?` fields on
`SemanticRouteOptions` (types.ts), (b) the ~12-line embed-and-pass-through block in `cascadeCheck` (cascade.ts),
(c) the CLI flag plumbing (cli.ts), (d) embedder-minilm.ts's own 1446 bytes (only loaded into the Node process
when `--embed-route` is actually passed, via the dynamic import -- not part of the always-loaded core path).

If/when `@xenova/transformers` is actually installed (`npm install @xenova/transformers -w @mole/decisions`) to
exercise `--embed-route` for real, node_modules grows (that package pulls in onnxruntime-node and model-download
machinery) but `dist/src` itself does not: this file's method only measures the TypeScript build output cli.ts's
own import graph produces, which is exactly the "core bundle" the task asked to keep from growing.
