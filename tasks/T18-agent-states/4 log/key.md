# T18 M7 key (R1: written before the implementation, by a separate subagent)

```notes
key                     .mole/local/bench/m7-key.json in the main checkout (gitignored: it quotes chat text, never committed)
    sha256              1c1cb6c84e19023caf606910a8395c3e5559c498a6e222569086fc134ed7916f
    items               3116 (2767 command · 349 test · outcomes 2943 pass · 151 fail · 22 unknown)
    sessions            10 = 9 Hermes + 1 Claude Code · 26 compactions
    written             2026-10-29T00:24:22-05:00 by a delegate_task subagent (no implementation existed; given only the session ids + the rule + output schema)
    rule                "list commands/tests tried before each compaction, with outcome" · items under compaction k = after k-1, before k
    sessions list       hermes 20261013_171309_0d3665 (4) · 20261013_231752_0135ee (3) · 20261015_061241_8d76d5 (2) · 20261015_064949_38dbe5 (7)
                        20261015_093703_d0be16 (1) · 20261017_092042_a6584e (3) · 20261019_180211_ec7893 (2) · 20261027_165516_e608ed (1) · 20261027_165516_e6ae5f (1)
                        claude-code 940c0cc7-4804-4a75-9a43-6388e8312e4f (1)
    vs contract         contract said "7 Hermes + 4 Claude Code" (counted 2026-10-28); on 2026-10-29 state.db has 9 Hermes sessions with a compaction
                        summary row and only 1 Claude Code transcript has a compact_boundary (the other 46 have none) → key covers what exists
    subagent's calls    commands = Hermes terminal + execute_code (full code), Claude Bash + Monitor · deduped by tool-call id · test exit 0 with failures in output = fail
                        grep-no-match / git diff exit 1 = pass for non-tests · background without completion = unknown
check                   packages/agentstate/bench/m7.ts recomputes the sha256 and fails on a mismatch (R2)
```
