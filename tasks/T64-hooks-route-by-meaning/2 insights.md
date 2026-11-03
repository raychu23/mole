# T64 insights — decisions reach the agent before it edits, by meaning

## Summary
Mole's Claude Code hooks now surface decisions that have no file scope, ranked by meaning (BM25, zero model calls):
a new UserPromptSubmit hook adds the decisions a task prompt is about, and PreToolUse ranks them against the edited path
+ new text. Before this, unscoped records never reached the agent pre-edit (only the post-edit check saw them). On
dcbench's 8 scored tasks with its 15 decisions as unscoped records, the hook surfaces 15/18 scored decisions in the top
5 before coding (was 0/18), plus ~2 unrelated ones per prompt. Recorded, not tuned (T63 freeze rule).

```notes
code            lib.mjs bm25Tokenize/bm25Rank (mirror of route/bm25.ts, parity test) · readDecisionRecords: inline
                `scope: [a, b]` now parsed (was ignored) + `unscoped` flag · governingDecisions({text}): repo-wide +
                unscoped ranked by BM25 over title + rationale, score > 0, top REPO_WIDE_CAP, 'by meaning' target;
                no text = old T50 behaviour · user-prompt-submit.mjs (new, hooks.json UserPromptSubmit, once per
                decision per session, shared set with PreToolUse) · pre-tool-use passes rel path + new text
tests           test/route-by-meaning.test.ts 7 (red 6/7 first; the 7th asserts old behaviour kept) · plugin 28
replay          4 log/replay.txt · paper 8 tasks: 15/18 gotcha decisions surfaced pre-edit (misses: D-008 TASK-004,
                D-014 TASK-006, D-004 TASK-009) · all 15 tasks listed
limits          INFERENCE: precision ~ 15/40 of surfaced slots are scored decisions (others may still be relevant) ·
                BM25 = shared words; a prompt that never names the concept misses it (D-008 feature flags)
```
