```notes core
core      fresh review 1 of T32 (diff fb240ab...528a257) against 0 start.md done-when 1-6 + 2 insights §0 §2 §3
    verdict             changes needed      2 P1 + 8 P2      all measured numbers reproduce exactly      → §0 §1
    P1                  records read from the PR side let a PR silence its own check · 2 check runs named "mole" per push      → §1
    options round       numbers honest + reproduced      held-out evidence thinner than "option 1 works" reads (2 PRs)      → §2 P2-4
    reproduced          npm run check · vitest decisions · m24 · m24-options · workflow local rerun at 528a257      → §0
new       10-29      first review (fresh reviewer subagent, no code edits / commits / ledger commands)
```

```notes
0 verdict + what reproduced      (2026-10-29 ~08:00 CDT · worktree T32-team-pr-check at 528a257)
    verdict                 changes needed: 2 P1, 8 P2, 0 P0      M24 blocked status itself is honest (official P .63 R .52 reproduced)
    if raymond says merge   fix P1-1 + P1-2 (or take P1-2's wording call), disclose P2-1 P2-2 P2-8, rest can follow
    reproduced              1) npm run check exit 0: 36 files 253 tests      2) npx vitest run packages/decisions: 8 files 72 tests pass
                            3) node packages/decisions/dist/bench/m24.js exit 1: P 0.63 R 0.52 tp15 fp9 fn14 owners 30/30 silent 27/30 p95 1.12 s, dogfood 9/11, failure case pass, errors 0      = runs.jsonl
                            4) node packages/decisions/dist/bench/m24-options.js exit 0: all 12 rows equal 2 insights §3 table (incl tp/fp/fn)
                            5) bash packages/decisions/bench/m24-workflow-local.sh <wt> fb240ab 528a257 <out>: 3 steps exit 0, 1 check-runs POST, 0 comment calls, conclusion neutral, 14 s
    frozen files            git diff 8fe43dd HEAD -- m24.ts m24-key.json m24_owners.py bench/m24/ + 3 round-1 test files: empty
    commit order            red feb813d 07:02 < impl 8fe43dd 07:07      v2 overlay 814fed5 07:43 < held-out key 23178c4 07:44 < red 7a2f1ce 07:45 < impl 528a257 07:51      author = commit dates
    passes                  R6 scan (no fetch/https/model in src/check) · permissions {contents: read, checks: write} · no pull-requests/issues write · no comment endpoint · token only as GH_TOKEN env of the POST step · head_sha from pull_request.head.sha · ≤50 annotations · rename → grey unanchored test
```

```notes
1 P1
    P1-1 records read from the PR side: a PR silences the check on lines governed at the base
        what                prCheck loads records from the records root WORKING TREE (loadGraph(recordsRoot)), while CODEOWNERS is read at the merge base      the workflow's checkout is the PR merge commit, so the PR's own edit to a record decides whether that record governs the PR
        why vs contract     done-when 3 "silent on PRs with nothing governed": here something governs at the base and the check says 'nothing governed'      also not deterministic in (base, head): same shas, different payload by checkout      GitHub reads CODEOWNERS at the base for exactly this reason (the code already follows it for owners)
        reproducer          temp repo: src/a.ts#foo record 0001 accepted      PR: change foo + set 0001 status superseded
                            checkout at head: `mole pr-check --base HEAD~1 --head HEAD --no-history` → "nothing governed these lines"
                            checkout at base, same shas → "1 decision govern these lines … 0001 (green)"      (scratch t32rev/ev)
        fix                 load records (and match: items) from mergeBase via git objects (git archive/show into a temp dir, or a git-backed loadGraph)      list records the PR itself adds/edits/supersedes as their own section ("this PR changes decision 0001") instead of letting them govern      add a red test for the reproducer
    P1-2 two check runs named "mole" per push
        what                the workflow job id is `mole` with no `name:`, so GitHub Actions itself creates a check run "mole" on the PR head sha      the action then POSTs a second check run also named "mole"
        why vs contract     done-when 3 "at most 1 check run per push" (the test only counts `gh api` lines in action.yml)      2 same-named runs also make a required-check rule on "mole" ambiguous      GITHUB_TOKEN-created check runs are attached to the GitHub Actions app's suite, so the posted one may show under another workflow in the UI (GitHub behaviour, INFERENCE from docs/community reports, not reproduced here: no push allowed)
        reproducer          .github/workflows/mole-pr-check.yml: `jobs: mole:` (no name) + action.yml `gh api --method POST repos/$GITHUB_REPOSITORY/check-runs` with payload name 'mole' (pr-check.ts CHECK_NAME)
        fix                 either a) drop the POST, emit `::notice file=…,line=…` workflow commands + $GITHUB_STEP_SUMMARY so the job's own check run is the one (cap: 10 annotations per level per step) or b) keep the POST, rename the job (e.g. `name: mole runner`) and have Raymond confirm "1 check run" means 1 Mole check run      update the YAML test to assert the chosen reading
```

```notes
2 P2
    P2-1 owners key is a port of the TS matcher, not independent
        what                m24_owners.py glob_to_regex/matches mirrors codeowners.ts line for line (same `/**` tail case, same "wildcard last segment never covers a folder" rule)      written by the same builder 5 min apart
        evidence            differential run, 20 CODEOWNERS texts × 43 paths ('/docs/', '*.js', 'apps/**/x', '*/build', '/a/*/c/', 'a?', '**', owner-less line, last-match): TS = Python on every path match      they differ only on owner-token validation ('@bad!name', '@x+y': TS drops, Python keeps)
                            shared divergences from GitHub/gitignore: 1) a line with an invalid owner: GitHub docs say the line is SKIPPED (earlier rule applies), TS → unowned, Python → owner '@bad!name' 2) '*.js' vs a folder foo.js/bar.txt: git check-ignore matches, both → []
        why vs contract     §0 "owners in the key from an independent script"      owners 30/30 measures TS ≈ Python, not TS ≈ GitHub
        fix                 score owners against an outside oracle: the public PRs' code-owner review requests (timeline review_requested) or a fixture checked by GitHub      or record the caveat in §2 + runs.jsonl      handle invalid-owner lines as skipped in both
    P2-2 options red test edited after its red commit, not disclosed
        what                528a257 changes pr-check-options.test.ts fixture glob '{pkg,plugins}/*/src/**' → '{pkg,plugins}/src/**' (git diff 7a2f1ce 528a257 -- packages/decisions/test)
        why vs contract     loop rule: frozen tests after the red commit      §3 says "frozen files … untouched" listing only round-1 files
        judgement           a fixture bug, not a loosening: the fixture file is pkg/src/lib.ts, which the old glob can never match (the same file's globToRegExp test asserts that)
        fix                 disclose in §3 + runs.jsonl ("red fixture glob corrected in impl commit, reason")
    P2-3 match: regex: invalid patterns vanish silently, nested quantifiers hang the job
        reproducer          temp repo (scratch t32rev/rx): record 'bad' pattern '(unclosed' + record 'evil' pattern '^(a+)+$' in src/**      PR adds a line of 30 'a' + '!'
        observed            9.3 s for that one line, result "nothing governed", no error for 'bad'      node: 24 chars 140 ms, doubling per char → ~40 chars > the 15-min job timeout
        why                 a record that silently stops governing breaks "never a wrong record / silent only when nothing governs"      with P1-1 an author can add such a record in their own PR
        fix                 report invalid patterns as file:line errors (same path as front-matter errors, and in the check summary)      reject nested quantifiers or use a linear engine (re2), cap tested line length (e.g. 2000 chars)      red tests for both
    P2-4 options round: held-out evidence for option 1 is 2 PRs, half of it by construction
        what                held-out positives: gi#4926 gi-0017 (scope anchor, hit with no option), bs#36488 bs-adr003 + bs-adr004, bs#36180 bs-adr007      option 1's held-out gain = 3 pairs from 2 PRs
                            bs-adr003/004 v2 pattern `^\s*export\s` in {packages,plugins}/*/src/** restates the key's labeling rule ("any added/changed export in a package src/ file counts for bs-adr003 + bs-adr004"), so recall on those pairs is guaranteed, not measured
        also                814fed5 subject says "before reading per-pair misses", but runs.jsonl 07:07 already names them (bs-adr003/004 exports x7, bs-adr009, bs-adr011)      §3 + table do label v2-on-frozen post-hoc, so numbers are honest, the commit subject overstates
                            held-out key committed 67 s after the v2 overlay: commit order proves commit order, not labeling before seeing v2 output (no evidence either way)
        fix                 in §3 verdict: "option 1 lifts recall on 2 held-out PRs (3 pairs, 2 of them the labeling rule as a regex)" instead of "works"      a held-out key with convention pairs labeled by a rule that is not a regex (e.g. 'export changes the package's public API'), before scoring
    P2-5 fork PRs turn the job red
        what                fork pull_request runs get a read-only GITHUB_TOKEN, so the check-runs POST is refused (403) and `gh api` fails the step → red ✗ on every fork PR
        why                 the noise rule wants silent/neutral, not a failing job      header comment documents it but nothing handles it
        fix                 `if: github.event.pull_request.head.repo.full_name == github.repository` on the POST step (or continue-on-error + summary-only fallback)
    P2-6 PR code runs with credentials persisted
        what                actions/checkout defaults persist-credentials: true, then `npm ci` (lifecycle scripts) + PR-built mole run with the token in .git/config
        fix                 `persist-credentials: false` (git reads need no token)      `npm ci --ignore-scripts` if the build allows
    P2-7 the "reusable" action only works in Mole's own repo
        what                action.yml runs `npm ci` + `npx tsc -b packages/daemon` in the caller's checkout      disclosed in §2 "action"
        why vs contract     done-when 1 "a reusable action"      M24's own targets (backstage, govuk) could not use it
        fix                 accept as phase-A scope in done-when wording, or have the action check out Mole at github.action_path
    P2-8 files outside the boundary, undisclosed
        what                packages/decisions/package.json + package-lock.json (+@mole/questions dep), packages/decisions/tsconfig.json (reference ../questions), packages/decisions/src/index.ts (export * from check)
        judgement           needed wiring, small, build + tests green      only the disclosure is missing
        fix                 one line in §2
```

```notes
3 done-when vs evidence
    1 workflow + action + annotations + local proof      met: YAML tests, payload shape test, local rerun at 528a257      caveats P1-2 P2-5 P2-7
    2 M24 30 PRs                                          not met: P 0.63 R 0.52 (targets 0.9 / 0.8), owners 30/30 (P2-1), p95 1.12 s
    3 noise rule                                          partly: neutral + 0 annotations when silent (tested), no comment endpoint      P1-1 false silence, P1-2 two runs
    4 dogfood                                             reported 9/11 (T15, T17 none)      no target in contract
    5 rename → grey unanchored                           met: unit test + bench failure case pass
    6 npm run check                                       met: exit 0, 253 tests
    test gaps               no test that records come from the base (P1-1) · no invalid/slow match: test (P2-3) · "1 check run" checked only as one `gh api` line (P1-2)
```

```notes
4 method
    test diff first         read 4 test files (pr-check, owners, cli, options) before src      mapped each to done-when (§3)
    runs                    commands in §0      differential CODEOWNERS: scratch t32rev/{cases.json, ts.mjs, py.py} + git check-ignore as third oracle
    not done                no push, no GitHub calls, no code edits, no commits, no ledger commands      GitHub-side behaviours (P1-2 suite attach, P2-5 fork 403) from docs, not observed
```
