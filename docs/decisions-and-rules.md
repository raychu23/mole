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

## MADR 4 and adrkit compatibility (D71)

`.mole/decisions/*.md` is a real [MADR 4](https://github.com/adr/madr) file: Mole's loader
(`packages/decisions/src/graph.ts`) reads and `mole init` writes MADR 4's optional metadata fields —
`status`, `date` (`YYYY-MM-DD`), `decision-makers` (also accepts the legacy MADR ≤3 / log4brains `deciders:`
key), `consulted`, `informed` — as a sequence (`[a, b]` / `- a\n  - b`) or a comma-separated scalar (MADR's
own template wording, "list everyone..."). Adding any of these fields is optional and additive: a record
written before this support, with none of them, still loads exactly as before.

`mole init`'s scaffold and `mole decision new`'s body now use MADR 4's three **required** body sections —
`## Context and Problem Statement`, `## Considered Options`, `## Decision Outcome`
([template](https://github.com/adr/madr/blob/4.0.0/template/adr-template.md)) — with the template's optional
sections (`Decision Drivers`, `Consequences`, ...) kept as the same `<!-- This is an optional element. -->`
comment the upstream template uses. Mole's own rationale extraction
(`packages/decisions/src/rationale.ts`, read by `mole decisions`/the MCP tools/the Claude Code hook) already
recognized `Context and Problem Statement`/`Considered Options` as context-bucket headings and `Decision
Outcome` as the decision-bucket heading, so no loader change was needed to stay compatible with the new body
shape.

Mole also reads [adrkit](https://github.com/mbeacom/adrkit)'s `affects` field — a list of
`{ type: path|package|api|resource|entity|data, pattern: <glob or id> }` entries naming what a decision
governs. Only `type: path` entries participate in Mole's own flag computation: each is matched as a **glob**
against the repo's current files (`node:path`'s
[`matchesGlob`](https://nodejs.org/api/path.html#pathmatchesglobpath-pattern), added Node 22.5 — this repo
already requires Node ≥22.13) and folded into the same `scope` / `applies_to` graph edges a plain `scope:`
entry produces (file:line-cited), so existing Mole consumers (the flag computation, `mole decisions`) see a
`type: path` entry for free. `package`/`api`/`resource`/`entity`/`data` entries are **never** anchored — they
name a dependency, endpoint, etc., not a path in this repo's tree (a `package` entry could additionally be
cross-checked against `package.json`'s dependencies; not implemented). The raw `affects` list is always kept
on the node for a faithful round trip, regardless of type. An `affects` entry with no `pattern:` is malformed
and is dropped with a warning (`mole decisions`/`mole rules` report it at its file:line) rather than silently
matching nothing or everything.

Because `affects` names what a decision **governs** — a forward-looking convention area — rather than
asserting code already exists there (unlike Mole's own `scope:`), a `type: path` glob that currently matches
no file is not automatically "orphaned": it only turns red when git history shows the pattern *used to* match
something at the record's confirmed/last-committed sha and no longer does (a real removal). A glob that has
never matched anything (e.g. `mole init`'s own scaffold, `affects: [{type: path, pattern: src/ui/**}]`, in a
brand-new repo with no `src/ui/` yet) stays unflagged on that account alone.

**Behavior change for an existing `affects:` record** (round 2 fix, same task as the compatibility note below):
before this fix, every `affects` entry — any `type`, and literal-path-only matching (no glob support) — was
folded into `scope`, so a `pattern` containing `**` or any non-`path` type (e.g. `package`) could never
anchor and read as permanently red/orphaned. If you already added `affects:` before this fix shipped, re-run
`mole decisions`/`mole rules`: a record that was wrongly red for this reason now computes its flag correctly
(green when its path pattern's glob currently matches, not auto-orphaned when it does not).

```yaml
---
id: D010-use-pg-boss
title: Use pg-boss for the job queue
status: accepted
date: 2026-11-04
decision-makers: [alice, bob]
consulted: [platform-team]
affects:
  - type: path
    pattern: packages/server/src/queue/**
  - type: package
    pattern: pg-boss
rules:               # Mole's own extension -- not part of MADR or adrkit
  - forbid: import
    from: src/ui/
    to: src/db/
    why: ...
---
```

**Interop, verified 2026-11-05** (`npx @adrkit/cli@0.20.0`, `tasks/T100-madr-adrkit-compat/4 log/`): a
Mole-written MADR 4 + `affects` file run through adrkit's own `adr migrate --from madr` round-trips
`title`/`status`/`date`/`affects` (type and pattern) correctly. Three things do **not** round-trip, and all
three are adrkit's own format boundary, not something Mole's loader is missing:
- adrkit's `madr` importer still reads the legacy `deciders:` key, not MADR 4's renamed `decision-makers:` —
  a decision written with only `decision-makers:` imports into adrkit with an empty `deciders: []`.
- `adr migrate` drops Mole's `rules:` block entirely (an unrecognized key); adrkit's own strict `adr lint`
  rejects both `decision-makers` and `rules` as `strict-unknown-key` on an unmigrated file.
- adrkit requires a 4+-digit numeric or ULID `id` (`adr lint`: `invalid-format`); Mole's own id scheme
  (`D001-example-decision`) is not an adrkit-valid id until `adr migrate` rewrites it.

Net: a Mole decisions directory round-trips through `adr migrate --from madr` without hand-editing, which is
the compatibility D71 asked for ("any ADR tool reads them"); becoming a fully-validating adrkit corpus
additionally needs `deciders:` (not just `decision-makers:`) and a numeric/ULID id, which `adr migrate`
itself already handles. `mole decisions --export madr` was not needed: `.mole/decisions/*.md` already **is**
MADR 4, so there is nothing to export — only `adr migrate` (adrkit's own importer) is needed to add adrkit's
remaining required fields.

## What it reads / writes

- **Reads:** every `.mole/decisions/*.md` file's YAML front matter and body; the repo's source tree (import
  sites via the TypeScript compiler API + `dependency-cruiser`; call sites via Mole's own AST scan) **or**,
  when a `index.scip` file exists at the repo root (or `--scip FILE` names one), a
  [SCIP index](https://github.com/sourcegraph/scip) produced by a separate indexer (e.g.
  `scip-python`) instead — see Limits; an optional `--adr-dir` for plain ADR-folder records.
- **Writes:** `.mole/decisions/*.md` (only via `mole init`, which writes one example record, or
  `mole decision new/supersede/link`); `.dependency-cruiser.mole.cjs` and `.mole-call-rules.json` only when
  you pass `--emit` (TypeScript path only). `mole rules` (no `--emit`) writes nothing. `mole init
  --agents-snippet` additionally appends one marked sentence to AGENTS.md and/or CLAUDE.md (creating
  AGENTS.md if neither exists).

## Limits

- Import/call rules see the import and call *graph*, not runtime behavior — a forbidden call reached only
  through `eval`-built strings or reflection will not be caught.
- TypeScript/TSX and plain JS/CJS/MJS source files, via the TypeScript compiler API, **or** any language a
  SCIP indexer covers, via a pre-built `index.scip` — run the indexer yourself and point `mole rules` at
  its output (`--scip path/to/index.scip`, or just put `index.scip` at the repo root). Verified against
  Python (`scip-python`; `packages/scip/test/fixtures/python`) and Go (`scip-go`;
  `packages/scip/test/fixtures/go`): `forbid: import` and `forbid: call` both work there, line-cited,
  against the same `rules:` records. T95 reported Go as "not wired" because `scip-go` 0.2.9's occurrences
  decoded with empty ranges — T106 found that was a stale-bindings bug in Mole's own SCIP decoder
  (`@c4312/scip`, generated from `sourcegraph/scip`'s old `scip.proto`), not a `scip-go` bug: the project
  moved to `scip-code/scip` and retyped `Occurrence.range` into a typed `oneof` (`single_line_range`/
  `multi_line_range`) that `@c4312/scip` doesn't know about. Switching to `@scip-code/scip` (the
  maintained org's own npm package, version-paired with the Go bindings `scip-go` itself depends on) fixed
  it for both languages — see `packages/scip/test/fixtures/go/HOW-PRODUCED.md` for the full trace. No
  other SCIP language has been tried.
- A `from:`/`to:` path that matches no file in the repo is reported as a warning (likely a typo), not
  silently ignored (TypeScript path only; the SCIP path only sees files the SCIP index actually covers).
- SCIP path staleness: before reading an `index.scip`, `mole rules` checks it against a content-hash manifest
  (`index.scip.manifest.json`, next to the index) written by `mole scip stamp` -- run that right after the SCIP
  indexer, before committing `index.scip`:
  ```sh
  scip-python index --project-name myproj --project-version 0.1.0 . --output index.scip
  mole scip stamp                         # writes index.scip.manifest.json next to it
  mole scip stamp --index path/to/other.scip   # names a different index (default: root/index.scip)
  ```
  Line endings count as content: a repo checked out with `core.autocrlf=true` on Windows hashes differently from
  the LF checkout that was stamped, so stamp in the same checkout that runs `mole rules` (e.g. index + stamp in CI
  after checkout), or keep Python sources LF via `.gitattributes` (`*.py text eol=lf`).
  Relative imports are resolved from the import statement's own text with Python's line-joining rules (brackets
  and backslashes inside comments and strings are ignored), so multi-line `from . import (\n a,\n)` works.
  `mole rules` then compares every CURRENT source file of the index's own language(s) (by extension; walked with
  `git ls-files --cached --others --exclude-standard` when the repo is a git repo, so `.gitignore` is respected
  and a huge ignored directory like `.venv/` costs nothing — otherwise a plain walk skipping `node_modules`,
  `dist`, `build`, `.git`, `.mole`, `.venv`, `venv`, `site-packages`, `__pycache__`) against that manifest's
  per-file sha256 hashes: identical content is **fresh regardless of file mtimes** (a `git clone`/CI checkout
  always writes a fresh mtime on every file, including a committed `index.scip`, so an mtime comparison used to
  false-positive on every single clone — content hashes do not have that problem); a changed, added or removed
  source file of the indexed language makes it **stale**. Either way (a real staleness finding, or no
  `index.scip.manifest.json` at all, or one whose own `indexSha256` doesn't match the current `index.scip` --
  i.e. re-indexed without re-stamping, "stale-unknown") the whole check **fails with exit code 3** (distinct
  from 0 clean / 1 violations / 2 rule-syntax-errors) and a clear message naming `mole scip stamp`, never a
  silent 0-violation pass. `--allow-stale-scip` runs against the index anyway.
- SCIP path relative imports: scip-python 0.6.8 encodes a *relative* import's module reference (`from .
  import x`, `from .pkg import y`) as an unqualified symbol with no package prefix and no record of how many
  dots were written (verified against a real index — see
  `packages/scip/test/fixtures/counterfixture/HOW-PRODUCED.md`), unlike an absolute import, which resolves to
  the module's own fully-qualified symbol. Mole recovers the real target from the import statement's own
  source text (the dots + any module path) plus the importing file's own path, so `forbid: import` still
  catches it — including a multi-line parenthesized import (`from . import (\n    leaf,\n)`) or a
  backslash-continued one (`from . import \\\n    leaf`), where the imported name's own source line is not the
  `from ... import` line: Mole scans back to the statement's real start (through still-open parens or a
  trailing `\`, the way Python itself joins continuation lines) before matching (review round-2 HIGH-2).
- SCIP path `TYPE_CHECKING`-only imports: Mole detects `if TYPE_CHECKING:` (or `if typing.TYPE_CHECKING:`)
  blocks from the source text (SCIP does not distinguish them) and labels an import found only inside one
  (`typeOnly: true` in `--json` output); when both a `TYPE_CHECKING`-only and a runtime import of the same
  target exist, the reported line is the runtime one. `forbid: import` still flags a `TYPE_CHECKING`-only
  import **by default** — unlike the TypeScript path, which drops a type-only import unless the rule sets
  `types: true` — because an erased import can still describe a dependency the decision forbids; the label
  is there so a reviewer can tell the two cases apart, not to silently exempt them.
- `status: superseded|deprecated|rejected` records are syntax-checked but **not enforced** — their rules
  never produce a violation.
- Rule checking is local and deterministic: 0 model calls, no network.
