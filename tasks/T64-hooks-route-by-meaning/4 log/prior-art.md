# T64 prior art — decisions to the agent before it edits, by meaning (2026-11-02)

```notes
source                                       what it does                                         we borrow
Claude Code hooks reference                  UserPromptSubmit runs before the model sees the       new hook: route the prompt, return
  (code.claude.com/docs/en/hooks, as used     prompt; hookSpecificOutput.additionalContext adds     additionalContext; never block (no
  by this plugin since T15/T37)               text to the context; PreToolUse same field            "decision": "block")
dcbench Config B (brief-hq/dcbench           agent told to consult the decision store BEFORE      same moment (before code), but pushed by
  claude-md.ts, 2026-04)                      any change: `brief decisions search "<topic>"`       the hook, not left to the agent to ask
Cursor rules "Agent Requested" tier          a rule with a description is pulled in when the     ranking by the record's own title + text;
  (already cited in lib.mjs T50 comment)      agent judges it relevant                             Mole stays model-free at hook time (R6)
T53 route/bm25.ts (this repo, integrated)    Okapi BM25 k1 1.2 b 0.75, code-aware tokenizer;      mirrored in lib.mjs (hooks are dependency-
                                             stage 1 of semantic routing, 28/29 caught            free), parity test against bm25.ts
AlignBench (Align, 2026-09-16)               repo search ≈ decision graph for retrieval           pre-edit retrieval alone is not the claim;
                                                                                                   the Stop check stays the verifier
```
Thresholds: score > 0, top REPO_WIDE_CAP (5, T50's existing cap). Not tuned on dcbench (T63 freeze rule).
