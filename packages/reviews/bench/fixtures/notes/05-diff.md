# Design review: diff parsing

- DECIDED: `parseGitDiff()` always takes `-U0` diff text; callers must not pass a diff with context lines, it changes hunk math.
- also discussed whether to support `git diff --stat`, punted
