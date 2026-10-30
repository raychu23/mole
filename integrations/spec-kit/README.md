# Mole x spec-kit

What this does for Mole's purpose (D31 -- the decisions behind the code, shown where the developer
already works): a team that already runs [GitHub spec-kit](https://github.com/github/spec-kit)
(`.specify/memory/constitution.md`, `specs/NNN-*/{spec,plan,research}.md`) gets Mole's flags, hover
and view on exactly those records -- zero new documentation work. Mole's decision graph
(`@mole/decisions`, task T29) already reads `.specify/memory/constitution.md`'s Core Principles as
tenets and each `specs/*/research.md`'s `## D-NNN:` decision + rationale blocks as decisions, anchored
to the code paths they name, automatically (no config) whenever `.specify/` exists under the project
root being checked. This folder adds the other half: a hook that runs after `/speckit.implement` so the
agent sees which of those decisions its change touched, before it moves on.

## Install

Copy `scripts/post-implement.sh` into your spec-kit project (e.g. next to
`.specify/scripts/bash/`) and point your agent's `/speckit.implement` prompt (or a git
`post-commit` hook, or a CI step) at it after implementation finishes:

```bash
bash integrations/spec-kit/scripts/post-implement.sh
```

It shells out to `mole check --worktree --spec-kit`, which:
1. runs Mole's normal check (past fixes guarding the lines this change edited), and
2. loads the decision graph (`.mole/*` + any `--adr-dir` folders + spec-kit's own
   `specs/*/research.md`) and prints every decision whose anchored code path this change touched,
   with its current flag (`red`/`yellow`/`green`/`grey`).

Requires `mole` on PATH (`npm install -g` the daemon package, or run it from the monorepo with
`node packages/daemon/dist/cli.js`). No network calls, no model calls, no paid API: it is the same
deterministic flag computation `mole decisions` already does (T29), just filtered to this change's
files.

## Example

```
$ bash integrations/spec-kit/scripts/post-implement.sh
mole check working tree (base 8ec8841, fix rule ...)
1 hunk: no past fixes on these lines

decisions touched (2):
  yellow speckit:001-llm-perf-analytics:D-001  Spring Boot Embedded React — Build Strategy  (frontend/)
  green  speckit:001-llm-perf-analytics:D-010  Database Migration — Flyway  (src/main/resources/db/migration/)
```

## Non-goals

No GitHub App, no marketplace listing, no Slack workspace, no model/LLM call from this script or from
Mole's importer -- it is markdown + YAML parsing and git diffs only (R6: deterministic checks, never a
model as the check itself).
