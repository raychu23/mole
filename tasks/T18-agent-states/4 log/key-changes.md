# T18 key/bench changes (R2): proposals only, waiting for the fresh reviewer

Nothing here is applied. The benches and tests from the red commit 9add41d stay as they are until a reviewer (or Raymond) rules.

```notes
KC-1  M6 commit-link evidence when `git commit -q` printed no sha      PROPOSED 2026-10-29 00:58 · mole-agent-states
    bench rule now      commit link verified only if the commit-making call's RESULT contains the commit's 7-char sha
    problem             agents commit with `git commit -qm "<subject>"` (quiet: prints nothing) · the sha then appears only in
                        later, unrelated `git log` outputs, so the true step can never satisfy the rule
    evidence            hermes messages.id 34064 (session local-fc6c6dc0…, builder chat) at 21:41:08 = bff4ba9's commit second:
                        `cd …/Mole-worktrees/T11-l2-memory-notes && git add "…/runs.jsonl" && git commit -qm "T11 run log: round 4 after review fixes (M1 at target, 77/77)"`
                        result 34065 has no sha (quiet commit + an unrelated grep) · same pattern for 8 more commits, 26 file edits
                        ledger moves with empty output: 637956f (T2 verified → integrated) from ledger call 19208, output ""
    effect now         M6 94.8% (514/542) under the frozen rule · 28 edits fail only on "result does not contain the sha"
    proposed rule       ALSO verified when the commit-making call's ARGUMENTS name the commit: its -m subject prefix
                        (first ≤50 chars up to the first quote/$/backslash/backtick, ≥12 chars) or, for a ledger commit
                        'ledger move: <task> <a> → <b>', a ledger command naming <task> and <b>; and the call time is in
                        [commit time − 1800 s, commit time + 60 s]
    why not loosening   same strength as the sha rule: the call both makes a commit and names that exact commit; the sha rule
                        is kept as is · a wrong match needs two commit-making calls with the same subject inside 30 min
    with the rule       M6 would be 542/542 (computed by the library: those 28 links are kind 'commit' via subject)
    decision            reviewer: accept (edit m6.ts verify() only, nothing else) · or reject (M6 stays 94.8%, task stops on the metric)

KC-2  key.md compaction count      NOTE (fact fix, not a key change) 2026-10-29
    key.md says         "26 compactions" (copied from the key subagent's summary)
    the key file has    25 (4+3+2+7+1+3+2+1+1+1, its own per-session table sums to 25) · bench prints 25 · key sha256 unchanged
```
