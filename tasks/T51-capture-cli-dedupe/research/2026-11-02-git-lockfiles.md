# Git lockfile update protocol

- Fetched: 2026-11-02
- URL: https://git-scm.com/docs/api-lockfile/2.2.3
- Primary source: Git's lockfile API documentation.
- Relevant behavior: create an exclusive lock, write replacement contents,
  rename the lock into place to commit, and remove locks to roll back. Readers
  see old or new contents when rename is atomic.
- T51 fit: stage all changed records and a transaction manifest under
  `.mole/decisions/.capture-txn/`; commit only after staging succeeds; retain a
  manifest plus originals on a mid-commit failure so `mole decision recover`
  can restore the before-state. Node `rename` can overwrite, so targets are
  checked before staging and every destination is explicit.
