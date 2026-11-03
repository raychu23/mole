# T65 prior art (fetched 11-03)
```notes
claude code hooks        Stop hook: JSON {systemMessage} shown; additionalContext / decision:block makes Claude continue      docs.claude.com/en/docs/claude-code/hooks
                         Mole keeps "continue" opt-in (MOLE_STOP_CONTINUE=1, T24) and never blocks; stop_hook_active guards the loop
git stash create         builds an unreferenced commit of the working tree without touching refs / index      same trick here,
                         plus GIT_INDEX_FILE temp index so untracked files are included (`git add -A` into the temp index only)
v5 mole-stop             prelim-11-01/mc-agent-ab/v5: stop.mjs after the run + ONE resume with its message      the loop T63 reuses
T53 measured settings    m2-conflict v3 heldout: k=5, minScore 0, confidence 1.01, haiku router      B2 97% catch / 6.7% FA
                         now the CLI default (SEMANTIC_ROUTE_DEFAULTS) so the loop runs what was measured
```
