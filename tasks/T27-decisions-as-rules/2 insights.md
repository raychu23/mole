```notes
T27 insights      (a6 · mole-builder-4 · 2026-10-29 06:50)      INFERENCE = choices made while Raymond is away
    0 assumptions (before the red commit)
        base              branched from T29 fb240ab (not main): T29 was reviewed + verified but its ledger submit kept failing on other
                          packages' vitest timeouts under load; merge main in after T29 integrates
        rule syntax       front matter `rules:` on .mole/decisions/*.md (T29 format), each item one of
            import        {forbid: import, from: <repo path prefix or glob>, to: <path prefix | module name>, except?: [paths], dynamic?: false, why?: text}
                          → a dependency-cruiser `forbidden` rule named mole-<decision id>-<n>, comment = decision title + why
            call          {forbid: call, callee: <name, e.g. fetch | writeFileSync | fs.rmSync>, from: <prefix/glob>, except?: [paths], why?}
                          → Mole's own TS-compiler call scan (dependency-cruiser sees imports, not calls)
            sugar         "only api/ calls fetch" = {forbid: call, callee: fetch, from: '**', except: [api/]}
        errors            unknown kind, missing from/to/callee, bad glob/regex → error with the record's file:line, exit 2, never silently skipped
        output            each violation: file:line · rule · decision id + title + flag (T29 computeFlags) + why · record file:line
        generated config  `mole rules --emit` writes .dependency-cruiser.mole.cjs (generated, never overwrites the repo's own config)
        M19 key           10 planted violations (5 Mole, 5 Excalidraw pinned sha) as patch text + expected {decision, file, line}, by construction
                          base trees must have 0 violations (the bench asserts it first)      Excalidraw rules live in a bench overlay .mole/
        false positives   current Mole rules applied to each of Mole's last 13 changes (C4 set): any violation on a line that change touched = FP
```

```notes
    2 builder notes       (mole-builder-4 · 2026-10-29, written before the red commit; the key, the tests and the code follow them)
        rule fields         forbid (import | call) · from · to (import; string or list) · callee (call; string or list) · except · dynamic · types · why
                            any other key = error at that key's line (a typo like `exept` must not silently widen a rule)
        from / except       repo path prefix: 'dir/' = folder, 'a/b.ts' = that file or folder of that name; globs ** * ? {a,b} allowed
        to                  starts with '@' or has no '/' → module name: matches bare (typescript), sub-path (lodash/fp) and installed
                            (node_modules/typescript/...) forms; '@scope/' = any package of the scope · otherwise a repo path prefix
                            (dependency-cruiser resolves relative imports to repo paths; with tsconfig paths, write the path form)
        type-only imports   not counted unless `types: true` (erased at build, load nothing). Found by Mole's own TS AST pass, because
                            dependency-cruiser reports an UNRESOLVED module (no node_modules, e.g. an exported old tree) as dependencyTypes
                            ['unknown'] even for `import type` (probe on packages/daemon/src/cli.ts, 2026-10-29); the same AST pass gives the
                            import's line, which dependency-cruiser's output does not carry
        dynamic             unset = static and dynamic imports both count · false = static only (0013) · true = dynamic only
        which records       rules of superseded / deprecated / rejected records are skipped (listed with the reason); proposed records ARE
                            enforced and cited with their status, so a builder-proposed rule (0016) is visible before Raymond approves it
        call rules          callee 'x' matches a call whose callee text is x or ends in '.x' (fs.rmSync, window.fetch); comments and strings
                            never match (TS AST, CallExpression only); imports renamed with `as` are not followed (known gap)
        exit codes          `mole rules` 0 clean · 1 violations · 2 rule syntax errors (printed as file:line) · --json · --emit writes
                            .dependency-cruiser.mole.cjs (import rules) + .mole-call-rules.json (call rules) and exits 0
        Mole rules          0013 rules: cli.ts no static runtime import of typescript, better-sqlite3, @mole/indexer, @mole/memory, @mole/history
                            (./server.js is NOT listed: the 13 C4 trees import it statically from cli.ts, and it predates 0013)
                            0014 rules: no write calls in packages/agentstate/src except langgraph.ts (the LangGraph export)
                            0016 NEW, status proposed: packages/core/src imports no @mole/ package, types included
                            adding `rules:` to 0013/0014 changes those record files, so T29's `confirmed` fallback (last commit touching the
                            record) moves to the T27 commit: 0013's yellow from T29's cli.ts line goes green. Side effect, not a confirmation
        C4 set              tasks/c4-dogfood.json key 'recent' has 9 entries; key 'b2' has exactly 13 (the "last 13 changes" of C4). M19 uses b2
        Excalidraw          5 overlay records X001-X005 in packages/decisions/bench/m19-excalidraw/.mole (facts read by grep at e7b5346, with a
                            NOTICE that they are not Excalidraw's own); trees exported with git archive from the local full clone (no network)
        test files          created with terminal heredocs (cat > file <<'EOF'), as the brief allows; no write_file attempt on them
```

```notes
    2 builder notes (cont., after the red commit 1c39a04)
        correction          the core-layering record is 0017, not 0016 (key ruling 1 #3): T29's M21 scenarios M07/M08 plant their own
                            record id 0016 into a copy of the LIVE .mole/decisions, so a real 0016 dropped M21 to 32/38. 0017 also has no
                            `scope:` (a folder scope missing from M21's corpus snapshot made it red-orphaned there); its rule's from: covers it
                            T29 follow-up (not done here): M21 will break again the day a real record takes id 0016
        dependency-cruiser  maxDepth is unusable with directory entries: a module first reached at the depth limit is never expanded,
                            even when it is itself an entry (src/core/a.ts -> src/ui/view.ts hid view.ts's own imports). Scope is limited
                            with doNotFollow instead: node_modules, dist/, .git/, .mole/ and everything outside every rule's from: are
                            nodes but never scanned, and are never initial sources (gather-initial-sources skips doNotFollow matches)
                            `exclude` must not be used for dist/: it drops matching modules as DEPENDENCIES too, which hid
                            node_modules/@mole/indexer/dist/... and node_modules/typescript/... (live-tree plant not caught until fixed)
                            dependency-cruiser refuses unsafe regexes ("will probably run very slowly - cowardly refusing to run"): no
                            (?:.*/)? inside a lookahead
                            without preserveSymlinks, a baseDir under a symlink (macOS /var -> /private/var) resolves imports to
                            ../../../private/var/... paths no repo rule matches: Mole always passes preserveSymlinks: true
        live check          planted on the live worktree (then reverted): static `import ts from 'typescript'` and `@mole/indexer` in
                            packages/daemon/src/cli.ts caught at :12/:13 citing 0013; the type-only and the dynamic import next to them not
        key ruling          3 change requests (4 log/key-changes.md) ruled by a fresh Hermes one-shot session (claude-opus-5-5, session
                            local-2ad9a141971712862098e3dd58705a271dfc87ace8dff78d9409074144ffc785): all APPROVE, #1 with a different edit
                            (baseDir realpath instead of preserveSymlinks); applied exactly in 867774d
        assumptions         proposed records' rules are enforced (cited with status) · module-name vs path `to` decided by '@' / no '/'
                            · renamed imports (`import { writeFileSync as w }`) and element access (fs['rmSync']) are not followed by the
                            call scan · rule flags come from T29 computeFlags best-effort (a tree without git still gets violations)
                            · C4 = c4-dogfood.json b2 (13), not 'recent' (9) · adding rules: to 0013/0014 moved T29's `confirmed` fallback
```

```notes
    3 review-1 fixes      (mole-builder-4 · 2026-10-29 · commit 71603e8 · review 4 log/review-1.md · tests packages/decisions/test/rules-review-fixes.test.ts, 12 new, all red before the src change)
        P1-1 fixed          --emit config runs under the real depcruise CLI: `validate` dropped from the emitted options (API-only flag;
                            checkRules passes validate: true to cruise() itself) · doNotFollow's outside-every-from part now only matches
                            source FILES (…\.(c|m)?(j|t)sx?|vue|svelte|json$), because gather-initial-sources tests each gathered DIRECTORY
                            against doNotFollow without a trailing '/': `src`, `.` and `packages` under a `packages/*/src/` from were pruned
                            (latent in checkRules too for glob froms: 0 modules) · header line names the entries to pass
                            tests: "depcruise -c .dependency-cruiser.mole.cjs src|. validates the config and reports the planted violation"
                            (spawns dependency-cruiser's bin, json + err output, exit 1) · "a glob from (packages/*/src/) still cruises"
        known CLI gap       the depcruise CLI with the emitted file reports type-only imports that `mole rules` drops (Mole's own tree:
                            cli.ts → @mole/memory, @mole/history, both `import type` + dynamic import, merged by dependency-cruiser) — the
                            header already says Mole drops type-only sites; `mole rules` is the source of truth
                            a folder named like a source file (apps/x.js/) above a from: is still pruned (safe-regex forbids the tighter form)
        P2-2 fixed          from: or path to: matching no source file → warning at the rule's record file:line (exit code unchanged);
                            absolute, backslash or '..' paths in from/except/to → syntax error at the key's line, exit 2
                            tests: "a from or to that matches no file warns…" · "absolute from / backslash from / backslash to / .. in from
                            is a syntax error at file:line, exit 2"
        P2-3 fixed          a duplicate id keeps its own rules: named mole-<id>-<file stem>-<n>, warning at the second record's id line
                            test: "each violation cites the record its rule was written in"
        P2-4 fixed          a dependency-cruiser violation with no AST import site (/// <reference path>) is reported at line 1
                            test: "a /// <reference path> to a forbidden module is reported (line 1), not dropped"
        P2-6 fixed          superseded / deprecated / rejected records' rules are syntax-checked (errors at file:line), still not enforced
                            test: "are syntax-checked (error at file:line) but still not enforced"
        P2-1 fixed          checkRules compiles the dependency-cruiser rules without `dynamic` (siteFilter) and applies dynamic: per AST
                            site, since a static + dynamic import of one module is merged into one {dynamic: false} dependency; the emitted
                            config keeps `dynamic` (so the CLI alone still has that merge gap)
                            test: "both sites are judged by each rule's dynamic: filter"
        P2-5 left           call-scan gaps documented, not fixed: method-name FPs (cache.fetch() matches a fetch rule), aliased imports
                            (writeFileSync as w), element access (fs['rmSync']), passing the function as a value ([p].forEach(rmSync)),
                            .call/.apply (writeFileSync.call(null, …)); 0014's callee list also omits copyFileSync, cpSync, writeSync,
                            rmdirSync, openSync(…,'w'), fs.promises.rm. Fix path: resolve callee import bindings with the TS AST
        checks              npm run check && node packages/decisions/dist/bench/m19.js → exit 0 · 35 files / 253 tests · M19 10/10, 0 FP
```
