# Decisions and rules

## How to use

Write a decision once, in plain language:

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
  sites via the TypeScript compiler API + `dependency-cruiser`; call sites via Mole's own AST scan) **or**,
  when a `index.scip` file exists at the repo root (or `--scip FILE` names one), a
  [SCIP index](https://github.com/sourcegraph/scip) produced by a separate indexer (e.g.
  `scip-python`) instead — see Limits; an optional `--adr-dir` for plain ADR-folder records.
- **Writes:** `.mole/decisions/*.md` (only via `mole decision new/supersede/link`); `.dependency-cruiser.mole.cjs`
  and `.mole-call-rules.json` only when you pass `--emit` (TypeScript path only). `mole rules` (no `--emit`) writes nothing.

## Limits

- Import/call rules see the import and call *graph*, not runtime behavior — a forbidden call reached only
  through `eval`-built strings or reflection will not be caught.
- TypeScript/TSX and plain JS/CJS/MJS source files, via the TypeScript compiler API, **or** any language a
  SCIP indexer covers, via a pre-built `index.scip` — run the indexer yourself and point `mole rules` at
  its output (`--scip path/to/index.scip`, or just put `index.scip` at the repo root). Verified against
  Python (`scip-python`; `packages/scip/test/fixtures/python`): `forbid: import` and `forbid: call` both
  work there, line-cited, against the same `rules:` records. Not yet wired for Go: `scip-go` installs and
  runs, but the version tested (0.2.9) does not populate `Occurrence.range` in a minimal fixture, so Mole
  cannot cite a line for it — see `tasks/T95-scip-multilang/4 log/prior-art.md` #6. No other SCIP language
  has been tried.
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
