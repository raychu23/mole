```notes
core      T30 review 1 (fresh reviewer, 2026-10-29 ~08:00, diff fb240ab...7893a2d, no code edits)
    verdict                 verified      no P0 or P1      7 P2 below, none blocks a merge if Raymond says merge
    tests                   red f230afd 06:57 before impl ccb6b8f 07:03      tests + key + m22.ts unchanged since red (git diff f230afd HEAD on them: empty)
    done-when 3             met, but the recorded 0.002-0.004 ms is a memo hit      cold re-measure still 0.017 ms p95      → P2-1
    done-when 2             counts per arm produced (15/15 vs 15/15)      proxy at ceiling by design: the tie says nothing either way      → P2-3
    done-when 4             covered by tests + bench (8 no-record folders) and holds on the real backstage clone
    first paint             nothing until `mole decisions --json` returns: 1.0 s Mole, 0.74 s backstage clone      → P2-2
    new       10-29      review 1 written
```
```notes
runs (this review, worktree at 7893a2d, machine shared w other agents)
    npm run build                                                   exit 0
    npx vitest run packages/decisions apps/vscode                   12 files, 94 tests passed
    npm run check                                                   exit 0, 35 files, 238 tests passed
    m22.js --decorations-only                                       PASS exit 0      mole 196 folders (12 decorated) load 232 ms once, p95 0.001 ms      backstage overlay 13 folders p95 0.002 ms
    m22.js --score bench/m22/answers                                with 15/15 · without 15/15 · exit 0
    m22.js --score <empty dir>                                      exit 1 (exit code = both arms present, not with > without)
    apps/vscode esbuild.mjs                                         extension.cjs 360,722 B = 352 KiB (claim holds)      no TypeScript compiler in it (0 hits createProgram / createSourceFile)
    scratch probes                                                  ~/.hermes/cache/scratch/t30-review/{cold.mjs,card.mjs,bs/}
```
```notes
checked + fine
    done-when 4 tests       core: docs/, empty/, nowhere/at/all → no decoration, no card, no tree-text line      repo w/o .mole → nothing, no throw      lib/ w decisions but no intent → card w/o Purpose
                            vscode seam: docs/, unscoped file, path outside repo → undefined      failing load → undefined + error logged, never throws
    real public repo        backstage sparse clone e8c4d056e3c + bench overlay .mole (my run): plugins/notifications yellow 7, src/api green 2 w card, src/hooks + docs nothing
    CLI path = in-process   `daemon cli decisions --json` → loadTreeFrom vs loadTree: 0 of 196 Mole folders and 0 of 2418 backstage folders differ
    failure modes           no .mole/ → startDecisionTree returns before anything (no child process)
                            CLI is the bundled dist/daemon.cjs (or mole.daemonCli), run by the editor's Node: not PATH-dependent
                            missing CLI → node exits nonzero → reject → one Output line, decorations stay empty, no popup, no crash
                            non-git folder w .mole → CLI still returns JSON (orphaned scope → red)      slow repo → 60 s timeout → logged
                            register() wrapped in try/catch      dynamic import failure lands in the same rejected load
    extension.ts            1 import + 1 call line 65, after the no-workspace return, before the TypeScript dormancy check (ok: only runs w .mole/)
    model calls             0      fetch counter + import scan in src/tree clean
```
```notes
findings
    P2-1 p95 measures a memo hit, labeled "from cached flags"
        what                timeSide() runs a warm-up pass over every folder, which fills Tree.decorations + Tree.cards (core.ts decoration()/card() memoize), then times the same folders again
        why vs contract     done-when 3 says per folder from cached flags: the flags are cached, the decoration + card are not, so the first (real) computation is never timed      target still met, evidence mislabeled
        reproducer          scratch cold.mjs: fresh loadTree, time 1st decorationFor+intentCard per folder
        observed            Mole cold p50 0.001 / p95 0.017 / max 0.66 ms      backstage clone (2418 folders) p95 0.002 / max 0.59 ms      files p95 0.001 / max 1.17 ms      all ≥ 2900x under 50 ms
        fix                 time the first call on a fresh index (or drop the warm-up), say "memoized" if kept      correct the runs.jsonl M22 line      stricter meter only, so allowed after red
    P2-2 first paint + per-save cost are the CLI, not in any bench number
        what                VS Code shows nothing until flagsFromCli() returns      the bench prints the in-process loadTree time instead (flagsMs and buildMs are the same variable)
        why vs contract     not a done-when miss (3 is per folder), but "decorations p95 0.004 ms" reads as the user-visible latency      it is not
        reproducer          cold.mjs times `node packages/daemon/dist/cli.js decisions --json --root <r>` + loadTreeFrom
        observed            Mole 1019 ms + 5 ms      backstage clone 738 ms + 3 ms      (in-process loadTree 232-680 ms)
        fix                 bench prints the CLI path as "first paint" next to the per-folder p95      drop the duplicate buildMs field
    P2-3 M22 proxy cannot discriminate; bench exits 0 on a tie
        what                prompt-task.md line 6 tells both arms docs/architecture-decisions is on disk      every question maps to one ADR file      all 6 runs cite the ADR file as source (without-2/3 even note adr013 superseded)
        why vs contract     done-when 2 asks only for correct answers per arm → literally met      the "more correct with the tree" target comes from the coordinator's log, not the contract      score() ok = both arms present, so exit 0 is not a pass and was never meant as one (runs.jsonl says so)
        observed            15/15 vs 15/15      per-arm timing 20-31 s vs 26-30 s, tool calls 4-6 vs 5-7 (not metrics)
        meaning             the tie is a ceiling, not evidence the tree adds nothing      the junior study kit (D7) is the real test
        fix (next proxy)    a question set where the answer is not one grep away (folder → decision mapping absent from ADR text, or exceptions / superseded chains), or time-to-answer as the metric      print an explicit "target with > without: met/not met" line
    P2-4 the production loader path has no vitest test
        what                every test injects loadTree (in-process flags)      the shipped path is CLI JSON → loadTreeFrom (tree-provider.ts)      covered only by the builder's uncommitted fake host + my probe
        observed            equivalence holds today (0 differing folders on 2 repos)
        fix                 1 test: decisionsCli --json output → loadTreeFrom → same decorations as loadTree on the FIXTURE
    P2-5 refresh is not single-flight; every save anywhere spawns the CLI
        what                later() debounces 1.5 s then tree.refresh()      no in-flight guard, so on a repo where the CLI takes > 1.5 s two runs overlap and the older can resolve last (stale flags until the next save)      onDidSaveTextDocument fires for any file, ~1 s CPU per save on Mole
        why vs contract     not a done-when miss      a cost + correctness edge in "cached flags"
        reproducer          reasoning from tree-provider.ts lines 58-76 + tree.ts refresh()      not run in a real window
        fix                 single-flight: keep 1 in-flight promise, set a dirty bit, rerun once when it settles
    P2-6 boundary
        what                study/m22-junior/README.md (92 lines) outside tasks/T30-annotated-file-tree/**      packages/decisions/src/index.ts export line outside src/tree/**      apps/vscode/package.json + tsconfig.json + package-lock.json (3 lines, disclosed in insights §2)
        why vs contract     boundary = src/tree/** + bench m22* + apps/vscode/src + tasks/T30/**
        fix                 move the kit under tasks/T30-annotated-file-tree/ (or Raymond accepts study/)      record the index.ts + dep lines as accepted out-of-boundary in the ledger note
    P2-7 not seen in a real VS Code window
        what                done-when 1 rests on a fake host (Mole, scratch, not committed) + in-process runs (backstage overlay)      the real-clone backstage run in this review is in-process too
        fix                 one screenshot in a real window on Mole and on the backstage clone + overlay before or after merge      note: backstage needs the hand-made overlay (no scope in its ADRs), disclosed
```
