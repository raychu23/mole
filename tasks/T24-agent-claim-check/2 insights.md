# T24 insights (assumptions, decisions, limits)

```notes
assumptions (Raymond away; written down instead of asked)
    answer                  "final answer" = the last assistant text before the next user message (Hermes row / JSONL line);
                            `mole claims <run>` checks the run's last one, `--at ROW` an earlier one; the bench also checks one
                            agent-written runs.jsonl line (H21) via claims(run, { text, before })
    evidence                the run's own tool calls + results strictly before the answer; a subagent's report
                            (delegate_task / Agent / Task / SendMessage result) is never evidence: a relayed claim is unsupported.
                            git is used to tell an unknown sha (contradicted: in no repo the run cd'ed into) from an unshown one
    verdict per clause      a clause can carry several categories (merged … (sha)); the worst verdict decides
    staleness               a pass claim with no count is backed only by a passing run that no later code edit (non-doc file)
                            made stale; doc/log writes (.md .json .jsonl …) do not make it stale
    index.ts                one line `export * from './claims/index.js'` added to packages/agentstate/src/index.ts (outside
                            src/claims/**) so MCP and library users get claims() from '@mole/agentstate'
    CLI dispatch            the brief said "add 'claims' to the dispatch list"; I first did, then replaced it with ONE separate
                            line `if (cmd === 'claims') return (await import('@mole/agentstate/dist/src/claims/cli.js')).claimsCli(…)`
                            (still one import + one call, the contract's boundary). Reason, measured: importing '@mole/agentstate'
                            loads LangGraph + checkpoint-sqlite + the TypeScript compiler (@mole/memory): 1.4 s idle, 5.3 s at
                            load 130, so the CLI tests timed out at 5 s and the Stop hook would pay it on every stop. The light
                            entry runs `mole claims` in 0.3 s at load 130. agentCli('claims') still works (same function).
    tests written           claims.test.ts and claims-hook.test.ts via terminal heredoc (cat > file <<'EOF') in the red commit
key
    labelled by me before any src/claims code existed; one label later found wrong (C03, see 4 log/key-changes.md), left frozen
loop
    round 1 (4ca908a)       recall 5/10, false flags 6/110: edit-tool diffs and code-printing commands counted as test runs,
                            'Test Files 8 passed' read as 8 tests, topic words matched outputs instead of commands, a branch name
                            ('…/t4-reddit-saved') read as a file 'saved', all-digit fixture sha (8619148) not read as a sha
    round 2                 recall 9/10, false flags 0/110 after: runs = commands (or process waits) with a test-summary output,
                            topic words matched on commands only, counts only in pass/test context, full-suite claims need a
                            suite-level command segment, durations ('3m47s') must show in an output, known places
                            ('Claude Code's local plugin folder' → .claude/plugins) must be written to, push = first person/passive
environment
    load average 90-140 from other builders during every full `npm run check`; 15+ unrelated tests time out at vitest's 5 s
    default (T18/T20 CLI tests, daemon call-site tests, hooks, key guard); a rerun at lower load is the honest fix, not a timeout edit
limits
    patterns are English and tuned on 40 answers (32 Hermes, 8 Claude Code), no Codex answer in the key
    claims outside the key that the tool flags are reported by the bench (14), not scored; most are metric prose ("M2 is 5/5 on
    the test cases") and descriptions of behaviour ("the wrong-hash ruling also exits 1")
    a claim whose clause has a negation/plan word (not, until, will, without, …) or names another agent is skipped, so e.g.
    "It now fails without the fix" is not checked
```
