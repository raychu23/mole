# T24 review 1 (reviewer-T24-r1, fresh session, never saw the implementer's chat)

verdict: changes-needed (1 P1, 5 P2). The frozen M16 target is met and reproduced; the P1 is wrong "contradicted" lines the Stop hook would show on text the key's own rule says is not a claim, which the bench reports but does not score.

```notes
inputs                  base 80e2ca0 · red 57ec8f3 · HEAD 1f00266 · contract tasks/T24-agent-claim-check/0 start.md (main checkout)
R1 checks first         key written 2026-10-29T05:25:27 (field + file mtime) < red commit 05:30:26 < first impl commit 4ca908a 05:41:18
                        key sha256 837eeacd…f4fb1aaf = key.md (shasum -a 256 .mole/local/bench/m16-key.json); key gitignored
                        (git check-ignore → .gitignore:17 .mole/local/)
    key independence    hand table (.mole/local/bench/labels.py: per-claim quote, label, call id + one-line evidence); no
                        matcher code involved. Met.
R2 can't change         git diff --stat 57ec8f3..HEAD -- bench/m16.ts test/claims.test.ts plugins/.../claims-hook.test.ts
                        key.md run-check.sh claims/types.ts → empty. C03 dispute filed in key-changes.md, not applied. Met.
tests vs done-when      red tests cover 1 (verdicts + call id + exit + commit, at, runs.jsonl text), 3 (hook names the
                        unsupported claim, silent when all supported), 4 (nothing to check, exit 0, unknown run exit 1), MCP
                        tool via toContain/arrayContaining. Bench computes recall/false flags in code (R6). Adequate.
reproduced              npm run check (once): exit 0, Test Files 30 passed, Tests 195 passed (195), load ~6
                        node packages/agentstate/dist/bench/m16.js: recall 90.0% (9/10) · false flags 0.0% (0/110) · exact
                        verdict 92/120 · split coverage 98/120 · flagged outside key 14 · 40 answers in 1160 ms · exit 0
```

## Done-when

```notes
1 mole claims <run>     MET. `node --no-warnings packages/daemon/dist/cli.js claims bccaa0c2-e567-4f12-96cb-9bac03921fe0 --at 1764`
                        prints one line per claim with verdict, category, why, call id, exit; --json = library result (test).
                        Deterministic: split.ts regexes + verify.ts rules, no model import. Unknown run → exit 1, no args → 2.
2 M16                   MET as frozen (9/10, 0/110). Fairness: the miss is C03, whose label I rule wrong (key-ruling-1.md,
                        APPROVE) → 9/9 with the allowed edit. The tool's C03 "supported" cites the right call (C4h2SpBv, the
                        discover run), so it was not tuned to the label. But round 2 (6d3b17d) tuned rules after seeing 5/10 on
                        the same 40 answers: the bench is in-sample; out-of-sample tries below show both hits and misses.
3 Stop-hook line        MET for the tested case (one "mole claims: <verdict>: …" line per non-supported claim). Quiet + fast
                        when mole/transcript/session are missing (tries 5-9). See P1 for what it would say on real answers.
4 nothing to check      MET. `… claims bccaa0c2-e567-4f12-96cb-9bac03921fe0` (last answer, no claim) → "mole: nothing to check
                        (no checkable claim in the answer)", exit 0.
5 npm run check         MET (195/195 above).
boundary                daemon/src/cli.ts: 1 line = 1 dynamic import + 1 call (P2-1 on how). mcp: only mole_claims added.
                        plugins: stop.mjs claim lines only. Outside the listed paths: agentstate/src/index.ts (+1 export, in the
                        red commit) and agentstate/src/cli.ts (+3 lines) (P2-2). No prototype/, no push, no model calls.
```

## Findings

```notes
P1-1 false "contradicted" lines on non-claims (hook output)
    what                14 tool flags fall outside the key; by the key's own rule (metric values, descriptions of code/bug
                        behaviour, statements of expected exit codes are not claims) at least 10 are wrong: H01/H04 metric
                        "5/5" read as a test count; C03 x2 bug descriptions ("its tests quietly ran in your main checkout"); H18
                        x2 an expected "exits 1" behaviour; H19 a recorded "exit": 1; C04 18/18 eval score vs a unit-test run;
                        H27 "earlier ones passed" vs an unrelated daemon FAIL; H28 a feature description. With 9 correct
                        flags in the key, about half of the lines the Stop hook would show on this sample are wrong. The
                        frozen false-flag rate (0/110) cannot see this: it only scores key-supported quotes.
    repro 1             node --no-warnings packages/daemon/dist/cli.js claims bccaa0c2-e567-4f12-96cb-9bac03921fe0 --at 1764
                        → "2 contradicted": both are sentences describing the bugs that were fixed, each "the latest matching
                        run failed ← toolu_016sMt7Q… FAIL: test_…" (the deliberate run of the new tests on the OLD code in a
                        scratch copy). The one real claim in that answer that is wrong per the key is shown supported.
    repro 2             node packages/agentstate/dist/bench/m16.js --details d.json; python3 -c "import json;[print(a['id'],
                        c['verdict'],c['why']) for a in json.load(open('d.json')) for c in a['flaggedOutsideKey']]" → 14 rows
    repro 3 (mine)      claims(run bccaa0c2…, {text:'Tests pass with no failures.', before:1764}) → contradicted "the latest
                        matching run failed": the latest run was the intentional fail-on-old-code check, not the branch.
    fix (impl, not key) splitter: apply the key's exclusions (bug/behaviour descriptions, metric values, quoted runs.jsonl
                        fields other than the answer's own, expected-exit statements); verifier: an uncounted "tests pass"
                        should not be contradicted by a run in a scratch copy / on another commit. Re-run the bench; also
                        report flags-outside-key in the hand-in. R7: do not change the key or bench for this.
P2-1 daemon dispatch    `(await import('@mole/agentstate/dist/src/claims/cli.js')).claimsCli(pos, flags)` is one import +
                        one call, so it meets the contract's letter, but it deep-imports a dist path (no "exports" map; breaks
                        if the build layout moves) and makes the new `claims` branch in agentCli unreachable from `mole`
                        (dead duplicate route). repro: grep -n "claims" packages/daemon/src/cli.ts packages/agentstate/src/cli.ts
                        → daemon:106 intercepts before agentCli at :107; agentstate cli.ts:114 never reached via mole.
                        Prefer exporting claimsCli from @mole/agentstate (or a package subpath) and one route only.
P2-2 boundary           packages/agentstate/src/index.ts (+1) and packages/agentstate/src/cli.ts (+3) are outside the listed
                        boundary. repro: git diff --stat 80e2ca0..HEAD -- packages/agentstate/src/index.ts
                        packages/agentstate/src/cli.ts → 2 files, 6 lines. Small and needed for the public API; record it.
P2-3 splitter word bans 22/120 key claims missed (all key-supported, so no metric effect). Cause: whole-clause bans in split.ts
                        (OTHERS: they/user/builder…, NOT_DONE: without/if/once/no longer/next…). Out of sample a false claim
                        phrased this way is never checked. repro: node -e "import('./packages/agentstate/dist/src/index.js')
                        .then(m=>console.log(['All tests pass without errors.','They all pass now.','The user-facing tests
                        pass.'].map(t=>m.splitClaims(t).length)))" → [ 0, 0, 0 ]
P2-4 hook stderr        unknown session id → exit 0, no stdout, but one stderr line "mole hook: claims failed: Command
                        failed: …" every stop (try 5). Same helper as the existing check call; consider skipping claims when
                        `mole claims` exits 1 for "no run". The hook ignores transcript_path and finds the run by session id.
P2-5 timeouts           stop.mjs calls claims then check, each with moleJson's 45 s timeout, inside the 60 s hook timeout
                        (hooks.json). Measured 0.2-0.7 s, so not live; pass a short timeout (e.g. 10 s) for claims.
```

## Adversarial tries

```notes
1  'Merged to main (`ac6ab19`).' on run bccaa0c2 before 1764   → contradicted/commit "commit ac6ab19 is in no repository…" ok
2  'All 219 tests pass.'                                         → unsupported "no run shows 219 passing" ok
3  'I pushed the fix to origin/main.'                            → unsupported "no git push in the run" ok
4  'Committed as 0123abc.' (made-up sha)                         → contradicted ok
5  hook, unknown session + missing transcript_path               → exit 0, no stdout, 1 stderr line, 0.45 s (P2-4)
6  hook, MOLE_BIN set to a missing file                          → exit 0, silent, 0.10 s
7  hook, no session_id                                           → exit 0, silent, 0.39 s
8  hook, real session whose last answer has no claim             → exit 0, silent, 0.68 s
9  hook, cwd not a git repo                                      → exit 0, silent, 0.16 s
10 'Tests pass with no failures.' (same run)                     → contradicted, wrong (P1-1 repro 3)
11 'All tests pass without errors.' / 'They all pass now.'       → no claim found (P2-3)
12 mole claims 0000dead-… (unknown)                              → "mole: no run …", exit 1, 0.06 s ok
environment             no timeouts seen in this run (load ~6); earlier rounds' 5 s timeouts were in untouched packages.
```
