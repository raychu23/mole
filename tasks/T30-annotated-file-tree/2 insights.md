```notes
T30 insights      (a6 · mole-builder-4 · 2026-10-29 06:50)      INFERENCE = choices made while Raymond is away
    0 assumptions (before the red commit)
        base              branched from T29 fb240ab (see T27 insights)      merge main after T29 integrates
        pure core         packages/decisions/src/tree: (graph + flags from T29) → per file/folder {flag, badge, tooltip} + per folder intent card
            flag          worst of the decisions in force on it or below: red > yellow > green      grey (proposed) never colors the tree
            badge         count of accepted decisions whose scope is that file/folder or below (≤ 2 chars, VS Code limit)
            card          purpose · end state · risk (.mole/intent/<folder>.md) · tenets traced · decisions + exceptions with flag + evidence state
                          · who to ask (intent ask + approvers)      fields with no record are left out, never invented
            empty         a folder with no records → no decoration, no card (done-when 4)
        vscode            apps/vscode/src: a thin FileDecorationProvider + folder hover/quick-pick card over the pure core, cached flags
        public repo       backstage ADRs have no scope: a small bench overlay .mole/ maps a few ADRs to folders from the ADR text only
        M22 proxy         builders can't spawn agents: the builder writes the key (5 why-questions + expected ADR id + key phrase), the two
                          prompts (with / without the tree's text) and the scorer; the coordinator (a6) runs 3 fresh subagents per arm and
                          saves their answers; bench/m22 scores them by code + times decorations (p95 ≤ 50 ms per folder)
        junior study      kit written for Raymond (questions, order, timing sheet from systems/tool-trials/you-10-min.md), not run (D7)
```

```notes
2 builder notes      (mole-builder-4 subagent · 2026-10-29 07:05)      red f230afd 06:57 · impl ccb6b8f 07:03 · prompts + kit eacc056 07:04
    test files        written with terminal heredocs (write_file can be approval-gated for tests in unattended runs)
    M22 folder        backstage plugins/notifications (clone e8c4d056e3c; the one sparse folder added; plugins/catalog was tried first
                      and dropped: no msw / luxon there). 5 questions → adr007 msw · adr014 fetchApi (adr013 superseded = trap)
                      · adr010 luxon · adr006 React.FC · adr004 index files
    overlay scope     9 records; scope picked by hand from each ADR's text + folder names only (api/ for fetch + msw, components/
                      for React.FC + dates, src/ for index files, plugins/ + packages/ for codebase-wide adr003). INFERENCE: a real
                      team writes this mapping; the proxy measures whether the tree delivers it, not whether it is discoverable
    phrase bias       record summaries paraphrase the ADRs, so key phrases are easier to hit in the with arm; the ADR-id match is the
                      stricter read. Both arms may open docs/architecture-decisions
    bench root        overlay laid over an empty skeleton of the scoped paths in a temp dir: no clone needed, deterministic, all green.
                      In the real sparse clone adr003/adr004 turn yellow (packages/ not on disk)
    flags             'in force' = accepted or partly superseded; superseded/deprecated listed as Replaced, proposed as Proposed;
                      neither colors nor counts. An accepted record superseded by another record still turns its folder red (T29 flag)
    card tenets       intent tenets ∪ traces_to of the decisions in force there
    tree text         path badge lines + the folder's own card + intent cards of parents (only decisions not already on the
                      folder's card); the root card only if the root has an intent record. --descendants adds decorated paths below
    files vs folders  a file gets a decoration only when a record scopes that file; a folder-scoped decision does not paint each
                      file inside (propagate = false: every parent gets its own aggregate)
    badge             count of decisions in force, capped at '99' (2-char limit); the tooltip card has the exact list
    vscode            tooltip = the full card (Explorer has no hover provider; no command/package.json contribution added).
                      Flags come from `mole decisions --json` (bundled CLI, child process) and the tree from tree/core.ts, which
                      imports no anchors/TypeScript: extension.cjs 352 KB (an in-process loadTree made it 9.8 MB; 60 KB before T30).
                      Started in activate() before the TypeScript dormancy check, only when .mole/ exists; errors only logged
    outside boundary  apps/vscode/package.json + tsconfig.json + package-lock.json: @mole/decisions dependency/reference (3 lines)
    timing            per-folder p95 is a cached-index lookup (µs); the once-per-refresh cost is load+flags+index (Mole ~250-560 ms
                      in-process, ~0.5 s via the CLI in the fake-host run). Both are in the bench output
    verified          fake vscode host (scratch, not committed) ran the bundled extension on this repo: packages/daemon badge 4
                      yellow + card tooltip, scripts / apps/vscode/media undefined. Not verified: a real VS Code window
    open              M22 proxy not run (coordinator: 3 fresh subagents per arm); junior kit not run (D7)
```

```notes
5 owner note      (a6 · 2026-10-29 10:27)
    fact            since Raymond's 10:00 answers this task is a9's (mole-builder-6, HANDOFF 'Added 10:05'); a9 claimed it ~10:10 and is committing (last 10:26)
    mismatch        front matter still says owner: mole-builder-4 after blocked → ready → running, so the overnight watchdog resumes a6 for it (twice so far)
    a6 action       none on this task: one worker per task (ledger never-list); front matter not hand-edited (ledger: no hand edits)
    fix wanted      the ready move / a9's claim should set --owner mole-builder-6, or the watchdog should read the registry queue, not the owner field
```
