# T56 prior art and safety fit check

Date: 2026-11-02

This slice adopts Git's linked worktrees as the isolation mechanism. It does not
create commits, approve records, infer meaning from prose, or update the approved
checkout.

| Primary source | Retrieved | Relevant fact | T56 consequence |
| --- | --- | --- | --- |
| [Git worktree](https://git-scm.com/docs/git-worktree) | 2026-11-02 | Linked worktrees share refs/common data but have separate `HEAD` and index metadata. | Create proposal paths with `git worktree add`; never copy a mutable checkout. |
| [Git check-ref-format](https://git-scm.com/docs/git-check-ref-format) | 2026-11-02 | Git rejects ambiguous/unsafe ref names. | Validate the generated proposal branch through `git check-ref-format --branch`; names are additionally restricted to a small slug. |
| [Git rev-parse](https://git-scm.com/docs/git-rev-parse) | 2026-11-02 | `--verify --end-of-options REV^{commit}` checks an untrusted revision as a commit. | Pin the baseline to a resolved commit before worktree creation; never interpolate a user revision in a shell. |
| [Git status](https://git-scm.com/docs/git-status) | 2026-11-02 | porcelain status is stable for scripts and reports tracked/untracked changes. | T56 does not require the source checkout to be clean because it evaluates a pinned detached worktree; it does reject an unsafe source/non-Git repo, branch/path collisions, and existing targets. |
| [Git update-ref](https://git-scm.com/docs/git-update-ref) | 2026-11-02 | Git's ref operations support existence checks and atomic transactions. | Reuse Git's branch/worktree safeguards; preflight both branch and destination so expected failures write nothing. |
| [AWS ADR process](https://docs.aws.amazon.com/prescriptive-guidance/latest/architectural-decision-records/adr-process.html) | 2026-11-02 | ADRs move from Proposed to Accepted only when approved; replacements supersede older records. | A proposal worktree is not approval and no command changes status in the baseline. |
| [Argdown relations](https://argdown.org/syntax/) | 2026-11-02 | Argdown explicitly represents argument/statement relations. | Evaluation accepts only structured records already loadable by Mole; arbitrary prose is emitted as unsupported, never fabricated into arguments. |

## Fit check

- Dirty source checkout: supported. The baseline is an immutable resolved commit and
  evaluation loads a detached temporary worktree at that commit, so dirty files are
  neither read nor changed. A non-Git source is rejected.
- Branch/path collision: rejected before `git worktree add`; existing directories,
  existing branch refs, and existing registered worktree paths are never overwritten.
- Malicious names/revisions/paths: subprocesses use `execFile` argument arrays;
  branch names are slug-restricted and then checked by Git; revisions use
  `--end-of-options`; the destination must be a non-existent absolute path outside
  Git's common directory.
- Common-dir / linked-worktree: repository commands are rooted using `git -C`; Git
  resolves the shared common dir and maintains per-worktree metadata. T56 never
  assumes `.git` is a directory.
- Revision pinning: branch creation starts from the full resolved commit hash; compare
  requires both metadata files to name the same baseline hash.
- Failure recovery: all collision/malformed-input checks run before mutation. If a
  later creation step fails, cleanup only removes the worktree/ref recorded as newly
  created by this invocation.

## Scope boundary

This is a structured what-if evaluator, not a natural-language proposal oracle and
not a rollout system. `supports` remains display-only because the existing Dung
engine does not evaluate bipolar support semantics.
