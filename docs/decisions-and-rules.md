# Decisions and rules

## How to use

New repo? `mole init` scaffolds `.mole/decisions/` with one example decision (plain front matter + a
`rules:` block) so there is something to look at and run `mole rules` against immediately — never overwrites
a file that is already there, so it is always safe to re-run. `--dry-run` shows the plan without writing
anything; `--json` for scripting; `--agents-snippet` additionally adds a one-sentence precedence note to
AGENTS.md/CLAUDE.md (see "AGENTS.md / CLAUDE.md precedence" in the project README) — off by default outside
an interactive terminal, so a scripted `mole init --yes` never edits another file unasked:

```sh
npx -y -p mole-code mole init                 # scaffold + prompt (interactive TTY) about the AGENTS.md note
npx -y -p mole-code mole init --yes            # scaffold only, no prompt, no AGENTS.md/CLAUDE.md edit
npx -y -p mole-code mole init --agents-snippet # scaffold + add the precedence sentence, no prompt
npx -y -p mole-code mole init --dry-run --json # show the plan, write nothing
```

Write a decision by hand, in plain language:

```sh
mole decision new --id D001 --title "Payments never imports the legacy billing client directly" \
  --body "src/payments/ talks to src/billing/ only. legacy-billing has no refund path."
```

This writes `.mole/decisions/D001-....md`: plain markdown with YAML front matter (`id`, `title`, `status`).
Everyone on the team can read it as a normal file in the repo; `mole decisions` lists every decision with a
flag (`red`/`yellow`/`green`/`grey`) computed from the decision graph (supersessions, incidents, premises).

To make a decision **enforced**, add a `rules:` block to the front matter:

```yaml
---
id: D001
title: Payments never imports the legacy billing client directly
status: accepted
rules:
  - forbid: import
    from: src/payments/
    to: src/legacy-billing/
    why: legacy-billing has no refund path; payments must go through src/billing/
---
```

`forbid: import` blocks an import/require/dynamic-import matching `from:`/`to:`; `forbid: call` blocks a
named function call (`callee:`) in files matching `from:`. Run the check:

```sh
mole rules            # text report
mole rules --json     # machine-readable
mole rules --emit     # also write .dependency-cruiser.mole.cjs + .mole-call-rules.json for CI
```

Try the whole loop without touching your own repo: `npx mole-code demo`.

## What it reads / writes

- **Reads:** every `.mole/decisions/*.md` file's YAML front matter and body; the repo's source tree (import
  sites via the TypeScript compiler API + `dependency-cruiser`; call sites via Mole's own AST scan); an
  optional `--adr-dir` for plain ADR-folder records.
- **Writes:** `.mole/decisions/*.md` (only via `mole init`, which writes one example record, or
  `mole decision new/supersede/link`); `.dependency-cruiser.mole.cjs` and `.mole-call-rules.json` only when
  you pass `--emit`. `mole rules` (no `--emit`) writes nothing. `mole init --agents-snippet` additionally
  appends one marked sentence to AGENTS.md and/or CLAUDE.md (creating AGENTS.md if neither exists).

## Limits

- Import/call rules see the import and call *graph*, not runtime behavior — a forbidden call reached only
  through `eval`-built strings or reflection will not be caught.
- TypeScript/TSX and plain JS/CJS/MJS source files only.
- A `from:`/`to:` path that matches no file in the repo is reported as a warning (likely a typo), not
  silently ignored.
- `status: superseded|deprecated|rejected` records are syntax-checked but **not enforced** — their rules
  never produce a violation.
- Rule checking is local and deterministic: 0 model calls, no network.
