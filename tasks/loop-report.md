# Mole build loop report (L1–L3, T11–T15)

Goals, metrics, rules: `tasks/loop-goals.json` · live status: `python3 tasks/loop_status.py` · each task's evidence: `tasks/<T>/4 log/runs.jsonl`, reviews in `tasks/<T>/4 log/review-*.md`.

## C2 (2026-10-28 21:55): T11 + T12 integrated

```notes
metric      latest (on main 7b47c51)                                   target                                  verdict
    M1          recall 100% (136/136) · false flags 0% (0/1151) · ws/comment-only flagged 0      recall 100% · false ≤5% · ws/comment 0      MET
    M2          R1-R5 5/5 (strict: every key fix named + sha + file:line) · R6 1                 ≥4/5 and R6 = 1                             MET
    M5          p95 370 ms over 53 changes (max 656 ms) · 0 model calls                         p95 < 2 s · 0 model calls                   MET
    B2 / B3     B2 21/21 changes get ≥1 past fix · B3 names 9e19c51 + "editing counts as use" + idle shutdown (T9) test
how it went
    T11         red 8a065c6 → impl da6279b → review 1: P1 (deleted symbol re-anchored by name only) → fixed f86c708 with regression tests that fail without it → review 2 verified
    T12         red 8297d8a → impl ddba63d → bench red on 1 item: fresh reviewer ruled the key wrong (fix did not last write the line), approved 2-line edit (4 log/key-ruling-1.md) → review verified
    reviews     fresh subagents, contract + diff only · T11 2 rounds, T12 1 round + 1 key ruling
what missed / risks
    flake       npm run check on main: 1 of 4 runs had 1 failed test under load avg ~23 (T11 CLI test, 5 s timeout, spawns 3 node+TypeScript processes)
    M1 key      all whitespace/comment-only cases are synthetic (no real commit had one) · moved+edited symbol → orphaned (by contract: tail + body hash)
    M2 bench    "0 model calls" counter is never incremented (claim holds: src has only git calls) · bench doesn't check file:line equals the key's line
    T12 P2s     fix rule also matches the commit BODY → feature commits with "regression tests" in the body count as fixes (R4 lists afa3a65 feat sticky notes)
                a diff that doesn't apply to --base prints "no past fixes" exit 0 (looks safe when it isn't)
    test gate   Hermes test-write gate blocked write_file on test files in this unattended run; tests were written via terminal (R1 requires them). T12 kept its red tests as a frozen draft in the red commit, copied in after the ruling
next
    T13 + T14 in parallel (graph), then C3 report, then C4 dogfood (mole check on Mole's last 13 changes), then T15
    candidate follow-up    T12 P2-1 (subject-only fix rule) before T14 relies on past fixes for questions
```
