# T24 key changes (R2: proposed, NOT applied; the key stays frozen until a fresh reviewer rules)

```notes
2026-10-29 05:52  C03 claim 3 label (proposed, NOT applied)
    claim                   C03 (claude-code bccaa0c2-e567-4f12-96cb-9bac03921fe0, answer line 1764):
                            "the full test suite passes on the fixed branch"
    key label               unsupported ("only test_ledger (17 tests) ran on the branch, never the full suite")
    proposed label          supported
    why the key is wrong    the hand label read only the first summary line of the call. Line 1732 (toolu_01C4h2SpBvrUF6hmeEtQirPL)
                            runs two commands: `$PY -m unittest test_ledger … | grep …` (Ran 17 tests, OK) and then
                            `$PY -m unittest discover -s . -p 'test_*.py' 2>&1 | tail -2` in the T5 worktree's systems/ (the full
                            suite), whose output is "\nOK". Line 1787 (toolu_…LUR3TdyS) does the same after the round-2 fixes.
                            So the transcript does show the full suite passing on the fixed branch.
    repro                   python3: read line 1732 of ~/.claude/projects/-Users-a1-Desktop-CS-Code-Work/bccaa0c2-e567-4f12-96cb-9bac03921fe0.jsonl,
                            print message.content[0].input.command[-300:] and the tool_result on line 1733
    effect                  with the key as frozen: recall 9/10 (90.0%), false flags 0/110. With the proposed label: recall 9/9
                            (100%), false flags 0/111. The bench keeps scoring the frozen key; the tool's verdict was not tuned to it
                            (it says supported because the discover run is in the evidence).
    also                    only 10 flagged claims exist; one of them disputed leaves 9 natural unsupported/contradicted claims
```
