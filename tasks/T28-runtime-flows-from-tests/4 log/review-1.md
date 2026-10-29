# T28 review-1 (reviewer-T28-r1, fresh session, 2026-10-29)

```notes
verdict                 VERIFIED: no P0/P1; 4 P2 findings below. Reviewed at 8d17c69 (base 5b447f7, red 66f2c76)

order / R1-R2
    red commit          66f2c76 05:39:30, key written 05:31:53, first impl commit 92d6221 05:53:30: checks came first
    R2                  `git diff 66f2c76..HEAD -- packages/flows/bench packages/flows/test` = 0 lines: key, bench,
                        tests unchanged since red. The E16 label error is in key-changes.md, not edited in the key
    key independence    hand trace with file:line evidence per edge, written before src/ had anything but stubs.
                        "static misses" is computed by the bench from @mole/indexer, not hand-asserted
    tests vs done-when  flows.test.ts covers callbacks, registry, async hand-off, classes/ctors, events/timers,
                        generators, line preservation, store query, recordFlows (instrumented + plain), daemon CLI.
                        Bench covers recovery, non-edges, unknown ids, overhead (median, interleaved), broken tests

done-when
    1 record + query    MET. Small real run from the daemon CLI on packages/flows/test/fixtures/mini:
                          node --no-warnings packages/daemon/dist/cli.js flows record test/app.spec.ts --root <mini> --out $S/cliout
                          -> "recorded 1 test flow (3 distinct call edges) in 0.9 s" · "vitest: 1 passed, 0 failed, exit 0"
                          ... flows src/app.ts#visit --root <mini> --out $S/cliout
                          -> "called by function:src/app.ts#each ×2", test "test/app.spec.ts > doubles through a callback",
                             path file:test/app.spec.ts → use → each → visit
    2 M20               MET. My run (`node packages/flows/dist/bench/m20.js`, exit 0):
                        "recovered 22/22 (100.0%) ... invented 0 (non-edge 0, unknown id 0; 149 unverified listed)
                        · overhead mole 0.97x, excalidraw 1.51x (median of 3) · static key edges seen 25/25"
                        0-invented also holds for my hand sample of the 149 (see "unverified sample" below)
    3 overhead <= 2x    MET, but noisy (P2-4). Like-with-like: same test files, same generated wrapper config, both
                        cold Vite caches (cacheDir per run dir), plain/instrumented interleaved, median of 3 per repo
    4 npm run check     MET. My single run: "Test Files 29 passed (29) · Tests 191 passed (191)", exit 0

boundary / non-goals
    paths               packages/flows/**, packages/daemon/src/cli.ts (+1 line: one dynamic import + one call),
                        tasks/T28/**; plus root tsconfig.json (one project reference) and package-lock.json (workspace
                        link): registry-level, required for `tsc -b` / npm workspaces; not flagged
    non-goals           no network/model calls in packages/flows (grep fetch/openai/anthropic/http: none), no
                        prototype/ paths, nothing pushed. Metric computed by code (R6); not loosened (R7)
    target repo         Excalidraw clone untouched by my bench run: `find <clone> -newer <stamp> -not -path '*/.git*'`
                        = nothing, `git status --short` = clean (but see P2-1 for the CLI default)

invented-edge check can fail (mutation test)
    mutation            swapped caller/callee in dist/src/runtime.js flows() (restored after; grep confirms)
    command             node packages/flows/dist/bench/m20.js --repo mole --runs 1
    observed            "recovered 1/2 (50.0%) · invented 1 (non-edge 1, ...)" ·
                        "INVENTED N09 mole ...#newestFirst -> ...#listRuns (reverse direction)" · exit 1

unverified sample (12 of 149, checked against Excalidraw e7b5346 source; all real under the key's frozen definition)
    alignSelectedElements -> App.renderEnvironment      actionAlign.tsx:68 reads app.renderEnvironment (getter, App.tsx:619)
    flipElements -> App.renderEnvironment               actionFlip.ts:156 same getter
    duplicateElements -> actionDuplicateSelection       duplicate.ts:461 opts.overrides(...), lambda at actionDuplicateSelection.tsx:73
    createTestHook -> Scene.replaceAllElements          `set elements` setter nested in createTestHook (App.tsx:11476)
    getNonDeletedElements -> isNonDeletedElement        index.ts:57 elements.filter(isNonDeletedElement)
    ActionManager.handleKeyDown -> actionZoomOut        manager.tsx handleKeyDown runs action.keyTest for every action
    ActionManager.executeAction -> actionGroup          align.test.tsx:211 API.executeAction(actionGroup) -> perform
    API.setSelectedElements -> actionAlignLeft          api.ts:94 act(() => h.setState(..)) renders PanelComponent synchronously
    API.setElements -> actionSendToBack                 api.ts:88 act(() => h.elements = ..), same
    Pointer.down -> actionSendToBack                    ui.ts:238 fireEvent.pointerDown -> React flushes render in the same stack
    AppText.handleTextWysiwyg -> actionSendToBack       App.text.ts:326/349 flushSync(() => setState)
    App.handleLinearElementOnPointerDown -> actionBringForward   App.tsx:8484 flushSync(() => this.setState)
    -> 0 invented added. The last 5 are real only because the frozen definition counts calls "through code outside
       the repo (React)" in the same synchronous stack: see P2-2

findings
    P2-1 CLI default writes into the target repo. `mole flows record` with no --out stores (and generates the wrapper
         config, setup file, Vite cache) under <root>/.mole/local/flows, and creates it even when the run then fails.
         repro: cp -r packages/flows/test/fixtures/mini $S/novt; node --no-warnings packages/daemon/dist/cli.js flows record --root $S/novt
         -> "mole: no vitest installed for .../novt", exit 1; `ls -a $S/novt` -> ". .. .mole src test"
         The bench passes --out under Mole, so the shared clone stays clean; the insights line "the target repo is
         never written" holds only with --out. For a repo that does not gitignore .mole/local, `git status` goes dirty.
         Suggest: mkdir after vitestOf() succeeds, and say in the usage line where the store goes.
    P2-2 React-mediated edges are noise for the picture/gate. Most of the 149 unverified edges are test helpers or App
         handlers "calling" action PanelComponent lambdas because React rendered them inside their stack
         (e.g. Pointer.down -> actionSendToBack ×783). Real under the key definition written before the code, so not
         invented; but `mole flows actionSendToBack` will list Pointer.down/Pointer.up/UI.clickTool as callers.
         repro: python3 over $S/details.json "unverified" (from the bench run above): from-id under a tests/ path and
         to-id under actions/ -> 86 of 149 (plus App/AppText handlers via flushSync). Follow-up: mark edges that
         crossed node_modules frames.
    P2-3 Closures returned by a factory and called elsewhere produce no edge (a dynamic-call recovery gap outside the
         key). repro: $S/adv/adv.mjs case B (instrumentSource + installRuntime from dist):
           factory(){ return () => leaf() }; runner(cb){ return cb() }; main(){ return runner(factory()) }
           -> edges main->factory, main->runner, factory->leaf; no runner->factory although runner runs code of factory
         (the `l` hook attributes without an edge). Misses only, never invents; worth a key edge in a later round.
    P2-4 Overhead is within target but the measurement is dominated by load noise: my run had excalidraw run 2 at
         plain 16.3 s vs instrumented 36.7 s (2.25x for that pair) and mole run 2 at plain 19.6 s vs 11.2 s; earlier
         logged medians range 0.68x-1.18x for the same code. Median of 3 keeps the verdict, but a value < 1 says the
         run-to-run noise exceeds the effect. Plain always runs first in each pair (small warm-file-cache bias toward
         the instrumented run). Not a breach; a quieter-machine rerun would make the number meaningful.

adversarial tries (scratch: $S = /Users/a1/.hermes/cache/scratch/t28r)
    empty / types-only   instrumentSource('', ..) -> null; 'export type X = number' -> 0 functions. OK
    query before record  flows src/app.ts#visit --out <empty> -> "nothing recorded ...; run `mole flows record` first", exit 1. OK
    unknown symbol       flows src/app.ts#nope -> "never ran in the recorded tests (...)", exit 0. OK
    bare symbol name     flows each -> resolves function:src/app.ts#each, callers/callees/path. OK
    missing test file    flows record test/missing.spec.ts -> "recorded 0 test flows", vitest exit 1, exit 1. OK
    no vitest            exit 1 with a clear message (but leaves .mole/: P2-1)
    microtask callback   queueMicrotask(cb) from reg(): cb is a root, no reg->cb. OK (no invented edge)
    throw through frames catcher->mid->boom throws; later other->after recorded correctly, no stale caller. OK
    rejected await       caller->fails, caller->x ×2, y a root; no leak to y. OK
    for-await (muted)    top->loop recorded; top->z after the call is lost (documented: misses, never invents)
    abandoned generator  take->gen, gen->inner, then after->inner correct; no stale gen frame. OK
    mutation             caller/callee swap -> bench reports INVENTED N09, exit 1 (the check can fail)
```
