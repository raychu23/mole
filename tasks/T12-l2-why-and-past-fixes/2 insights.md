```notes
T12 insights (assumptions, decisions; INFERENCE = not verified)

blocked     vitest file not created: writing packages/history/test/*.test.ts needs a Hermes "test/CI edit" approval that this
            unattended (single-query) run cannot get. Not bypassed. The tests are drafted in proposed-tests/history.test.ts.txt
            (done-when 1, 3, 6); the same behaviors run as the bench's contract items (C) + B3. Needs Raymond: approve + copy.
            Draft not executed as vitest (INFERENCE: passes except the worktree assertion logged in 4 log/key-changes.md).
blocks      one block per run of -/+ lines (= a `git diff -U0` hunk), parsed the same way for -U0 output and context diff files
pure adds   oldLines = 0 -> nothing old to blame -> no past fixes (same as B2's method, which counts only edited old lines)
blame       one `git blame --porcelain -L a,b -L c,d <base> -- <old path>` per file, files in parallel (8); a diff that does not
            apply to the base (blame error) gives no past fixes for that file rather than failing the run
shallow     in a shallow clone the boundary commit "wrote" every older line: boundary lines are ignored (only when shallow)
fix rule    subject OR body matches; default '^(fix|revert)\b|regression|review fixes' (case-insensitive); --fix-rule /
            opts.fixRule > .mole/config.json fixRule > default. Bench uses each repo's B2 rule.
reason      subject + body without trailers / '---' lines (600 chars) + up to 3 comment lines the fix added in that file (nearest
            the blamed lines first; within 20 lines, topped up from farther ones) + task goal line when the subject names T<n>
            and tasks/T<n>-*/0 start.md exists at the BASE (read from git objects, not the disk) + .mole/notes/*.md lines that
            contain the short sha (read from disk)
tests       test files the fix commit touched, with describe/it titles from its added lines and its hunk-header context (this is
            how B3 gets 'idle shutdown (T9)': 9e19c51 added tests right after that describe); plus up to 5 test files at the base
            that reference the hunk's enclosing symbol (git grep -w, via 'symbol')
source      fix sha + the file path and line in the fix commit's own version (blame's original line/filename); `lines` = base-side
read-only   only diff/blame/log/show/ls-tree/grep/rev-parse with --no-optional-locks; excalidraw clone status unchanged after bench
cli         `mole check <sha | --diff FILE [--base SHA] | --worktree> [--json] [--fix-rule RE] [--root DIR]`, exit 0 also when empty
            (stderr shows Node's SQLite ExperimentalWarning because cli.ts imports the daemon; stdout is clean)
bench       strict M2 (every key fix named + source) and lenient reported; key lines are diagnostic only
results     round 1 (ddba63d): M2 5/5 strict, R6 1, B3 pass, B2 21/21 (53/53 listed fix shas found), M5 p95 694 ms / 53 changes,
            0 model calls; contract 6/7 (the logged wrong expectation)
```
