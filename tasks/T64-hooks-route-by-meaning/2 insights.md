# T64 insights — decisions reach the agent before it edits, by meaning

## Summary
Mole's Claude Code hooks now surface decisions that have no file scope, ranked by meaning (BM25, zero model calls):
a new UserPromptSubmit hook adds the decisions a task prompt is about, and PreToolUse ranks them against the edited path
+ new text. Before this, unscoped records never reached the agent pre-edit (only the post-edit check saw them). On
dcbench's 8 scored tasks with its 15 decisions as unscoped records, the hook surfaces 15/18 scored decisions in the top
5 before coding (was 0/18), plus ~2 unrelated ones per prompt; on all 15 repo tasks 21/27 (78%). The 8 are the
tasks dcbench's paper scores (T63 protocol.md `tasks`), not picked by us. Recorded, not tuned (T63 freeze rule).

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

## Review 1 (deleg_48a30a8b) FAIL → fixed tests-first
```notes
F1 HIGH     PreToolUse ranked literal repo-wide decisions by meaning → one sharing no word with the edit vanished      fix: repo-wide = T50
            path unchanged (by id, cap 5); only records with NO scope are ranked by meaning (separate cap 5)
F2 MED      `scope: [a, [b, c]]` parsed as unscoped      fix: inline list flattened (brackets stripped)
F3 MED      word matches read as "governed by … follow them"      fix: each by-meaning line ends "matched by words, not by file:
            check it applies"; prompt header "may bear on this task (word matches …)"
F4 LOW      15/18 subset undocumented      fix: summary names the paper's 8 + adds 21/27 on all 15
passed      bm25 parity fuzz 0 diffs · no hook throws/blocks · dedupe per session · 500 decisions 0.3-0.4 s · 375 tests
after fix   plugin + decisions 378 pass (3 new tests red first)
```
