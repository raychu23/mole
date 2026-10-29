```notes
core      T16 review 1      fresh review against 0 start.md done-when 1-5 + loop rules R1/R2/R7
    verdict                 VERIFIED      no P0, no P1      4 P2 (ruling guard can be self-approved, MLflow no-network is a default only, record times)
    reviewer                reviewer-T16-r1 (fresh, never saw the implementer's transcript)
    date                    2026-10-29 CDT
    reviewed                branch ledger/t16-traces-runs-ci HEAD 9147fc5      base c8e53f7      red d81d48d      ruling f8468f6 → b23abcb
```
```notes
checks (red commit d81d48d)
    R1                      key written 01:20, red commit 01:23:37, first impl 9c99915 01:27:51      red run logged exit 1 (0/9 stages)
    strength                strong      key fixes 9 spans with parent + attributes + minimums, off = 0 requests, MLflow count read from the file store itself, CI guard green/red/ruled/wrong-hash
    mutation 1              span mole.git.blame renamed → bench 88.9% (8/9) exit 1, on test fails "mole.git.blame: expected [] length 1"
    mutation 2              CLI no longer awaits shutdownTelemetry → bench 22.2% (2/9) exit 1
    both reverted           git checkout + tsc -b      git status clean
R2
    frozen files            git diff d81d48d HEAD -- packages/telemetry/bench packages/telemetry/test      only b23abcb touches them
    b23abcb vs ruling 1     matches the approved edit verbatim (imports, helpers, async fns, 500 ms off wait, 240 s timeout kept)
done-when
    1 OTel                  MET
        on                  bench 9/9 stages      bundled apps/vscode/dist/daemon.cjs also exports the 7 check spans
        off                 module-load hook + net.Socket.connect hook on `mole check` with MOLE_OTEL unset → 0 @opentelemetry loads, 0 connects
        hook works          same hook with MOLE_OTEL=1 → OTel modules + connects seen
        dead collector      MOLE_OTEL=1, endpoint 127.0.0.1:9 → exit 0 in 3.4 s (shutdown bounded at 3 s)
    2 MLflow                MET
        twice               load_runs.py into a temp file: store → added 25 then 0 (skipped 25)      `cat tasks/*/4\ log/runs.jsonl | grep -c .` = 25      store dir has 25 run dirs
        malformed           not-json, null, [1,2], {"metrics":[1]}, blank, no trailing newline → 7 runs, 4 tagged mole.parse_error, rerun adds 0
        non-file uri        --tracking-uri http://127.0.0.1:5000 → refused
        network             socket.connect blocked + logged → 0 attempts with default env (see P2-3)
    3 CI                    MET
        workflow            YAML parses (bench reads it)      push + pull_request, checkout@v4 fetch-depth 0, setup-node@v4 node 22 cache npm, setup-python@v5
        key guard           temp worktree of HEAD: green 0      key edit uncommitted → 1, committed → 1
    4 no network/accounts   MET for default env      no accounts used anywhere
    5 npm run check         MET      21 files, 137 tests passed (33 s)
other
    mcp edits               span-only: executeTool wrap in server.ts, start/flush in cli.ts only when on      packages/mcp not named in the boundary, needed by the goal + key, noted in 2 insights.md
    vsix                    npm run bundle builds      daemon.cjs 9.9 MB, runs `--help` with MOLE_OTEL unset
```
```notes
findings
    P0                      none
    P1                      none
    P2-1 self-approval      guard accepts any tasks/*/4 log/key-ruling-*.md with APPROVE + key path + new sha256      no reviewer id, may sit in the same commit as the key edit
        repro               temp worktree: edit packages/questions/bench/m4-key.json, commit, write "self-approved by implementer APPROVE\n<path> <sha>" as tasks/T16-traces-runs-ci/4 log/key-ruling-9.md, commit      node scripts/ci/key-guard.mjs → exit 0
        limit               frozen test defines this mechanism      the guard only makes the edit visible      fix: require a reviewer line + ruling committed in a separate, later commit than its key-changes.md request
    P2-2 APPROVE anywhere   /\bAPPROVE\b/ matches inside a rejection
        repro               ruling text "ruling REJECT — we do not APPROVE this\n<path> sha256 <sha>" → "ruled … approved by …key-ruling-9.md", exit 0
        fix                 require a line starting `ruling` / `verdict` whose value starts with APPROVE
    P2-3 no-network         load_runs.py uses os.environ.setdefault, so an explicit opt-in env wins
        repro               MLFLOW_DISABLE_TELEMETRY=false DO_NOT_TRACK=false python (socket.connect logged) load_runs.py --tracking-uri file:… → NETCONNECT ('54.192.100.3', 443) x3
        fix                 force the values (os.environ[...] = ...)
    P2-4 record times       narrated times disagree with git
        key-changes         entry "2026-10-29 01:55", commit 0f602d0 01:29:50      ruling dated 01:40 answers a request "01:55"
        runs.jsonl          9c99915 line "01:52:00", ba3fab8 line "02:00:00", b23abcb line "01:52:30"      out of order and later than the commits that logged them
    minor                   MLflow idempotency key = task + line number + text      an edited or inserted earlier line re-adds runs (fine while runs.jsonl stays append-only)
commands run
    npx tsc -b && npx vitest run packages/telemetry      9/9 passed
    node packages/telemetry/dist/bench/m13.js            M13 100% (9/9), off 0, mlflow 25/25 (second 0), parse 10/10, ci green 0 red 1 ruled 0, at target true, exit 0
    npm run check                                         137/137 passed
    scratch                                               temp worktree + temp stores removed      git worktree list clean
```
