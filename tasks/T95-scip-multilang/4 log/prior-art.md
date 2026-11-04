## Summary
SCIP (github.com/sourcegraph/scip) is Sourcegraph's protobuf-based successor to LSIF for precise
code-navigation indexes; it's what Mole reuses for D71 ("TAKE: read SCIP" for every non-TypeScript
language). Bindings: an existing npm package (`@c4312/scip`) already ships TypeScript types generated
straight from the official `scip.proto` via `@bufbuild/protobuf`/`buf generate` — Mole uses it as-is
rather than regenerating or hand-writing a decoder. Indexers: `@sourcegraph/scip-python` (npm, real,
used for the fixture in packages/scip/test/fixtures/python) and `scip-go` (Go, installs via `go
install`, ran, but this version's output omits occurrence ranges in a minimal fixture — documented
below, not wired). Consumers: Sourcegraph's own code navigation is the reference consumer; GitHub's
"stack graphs" is a different (non-SCIP, incremental, graph-based) approach to the same problem,
not an SCIP consumer.

## Sources (fetched 2026-11-04, newest-first where dated; GitHub repos have no single "publish date" —
noted as "current main" where that applies)

1. **sourcegraph/scip — `scip.proto`** (current `main`, fetched via
   `raw.githubusercontent.com/sourcegraph/scip/main/scip.proto`). The protocol's own source of truth:
   `Index` → `Document[]` → `Occurrence[]`/`SymbolInformation[]`; the `Symbol` string grammar
   (`<scheme> <manager> <package-name> <version> <descriptor>+`, each descriptor suffixed by a kind
   character — `/` namespace, `#` type, `.` term, `:` meta, `().` method); `SymbolRole` bitset
   (`Definition=1, Import=2, WriteAccess=4, ReadAccess=8, ...`). Mole's reader
   (`packages/scip/src/reader.ts`) classifies import-like vs call-like references from this grammar's
   descriptor suffix, generically across languages, instead of a per-language parser (the task's stop
   condition). Confirmed empirically (§below) that at least `scip-python` 0.6.8 does **not** set the
   `Import` role bit on either `import x` or `from x import y` — occurrences there carry only
   `ReadAccess` (8) — so Mole's classifier reads symbol shape, not the role bitset, for import-vs-call.

2. **sourcegraph/scip (announcement) — "SCIP - a better code indexing format than LSIF"**,
   https://sourcegraph.com/blog/announcing-scip — SCIP's own case for existing over LSIF: a flatter,
   faster-to-parse protobuf schema (vs LSIF's graph-of-JSON-lines), used instead of inventing a Mole-own
   index format. D71's reuse call (read SCIP rather than hand-roll per-language graph extraction) rests
   on this.

3. **sourcegraph/scip — "The future of SCIP"**, https://sourcegraph.com/blog/the-future-of-scip — SCIP's
   maintained-tooling story: it's the format `scip-typescript`, `scip-python`, `scip-go`, `scip-java`,
   `scip-ruby`, `scip-clang` and others target; it is what Sourcegraph's own code navigation runs on.
   The primary real consumer of SCIP today is Sourcegraph itself (precise code navigation / "go to
   definition" / "find references" across languages), not a third party.

4. **`@c4312/scip` on npm**, https://www.npmjs.com/package/@c4312/scip (checked via `npm view` 2026-11-04:
   v0.1.0, Apache-2.0, 133.2 kB unpacked, dependency `@bufbuild/protobuf@^2.0.0`). Its own
   `package.json` scripts (`compile:fetch` = `curl .../sourcegraph/scip/main/scip.proto`, `compile:ts`
   = `buf generate`) show it is a direct, mechanical `protoc-gen-es` generation from the official
   `scip.proto`, not a reimplementation — the "is there already an npm package with generated TS
   bindings?" answer from the task brief. Mole depends on it directly (`packages/scip/package.json`)
   instead of writing or regenerating protobuf bindings.

5. **sourcegraph/scip-python on npm**, https://github.com/sourcegraph/scip-python (checked via
   `npm view @sourcegraph/scip-python` 2026-11-04: v0.6.8, MIT, 20.3 MB unpacked, bundles a pyright
   fork). Installed in scratch (`/Users/a1/.hermes/cache/scratch/scip-probe`, 72 MB with deps — within
   the "small enough to install" bar) and run for real against a 7-file fixture
   (`packages/scip/test/fixtures/python`); see that fixture's `HOW-PRODUCED.md` for the exact command.
   This is the real indexer the task asked to try first, not a stub.

6. **scip-code/scip-go** (moved from `sourcegraph/scip-go`; `go install
   github.com/scip-code/scip-go/cmd/scip-go@latest` resolves and builds, v0.2.9, confirmed 2026-11-04).
   Installed and run against a 2-file Go fixture (module `fixture`, packages `db`/`ui`, one cross-package
   call). It produced valid `Document`/`Occurrence`/`SymbolInformation` records whose symbol strings
   follow the exact same grammar (`` `fixture/db`/ `` namespace, `` `fixture/db`/Q(). `` method) that
   Mole's classifier already reads for Python — confirming the generic, suffix-based approach really is
   language-agnostic, not scip-python-specific. However, in this minimal fixture every `Occurrence.range`
   this scip-go version wrote back was an empty array (not `[startLine, startChar, endChar]` as the spec
   requires), so Mole cannot report a line number for a Go violation from it. **Not wired**: Mole's rules
   checker only takes the SCIP path on Python today; Go is left for a follow-up once a scip-go version
   (or indexing flag) that populates ranges is confirmed. This is reported here rather than silently
   dropped, per the task's "and Go if the indexer installs" wording — it installed and ran, but its
   output wasn't usable for line-cited violations.

7. **GitHub "stack graphs"**, https://github.blog/engineering/architecture-optimization/stack-graphs-how-we-designed-a-new-approach-to-precise-code-navigation/
   (referenced via search, not a primary SCIP source) — a different architecture for precise code
   navigation: an incremental, name-resolution graph built once per file and stitched at query time,
   designed for GitHub's code-navigation feature. It is not a SCIP consumer or producer; it solves the
   same "precise code nav across a monorepo" problem with a different mechanism (graph construction +
   path-finding instead of a flat serialized index). Mentioned for completeness ("who else works this
   problem"), not reused: SCIP's reuse case (one flat, versioned format read by Mole + many existing
   indexers) is what D71 asked for, not a bespoke per-file graph engine.

## What Mole built on this (not prior art, for cross-reference)
- `packages/scip` (`@mole/scip`): `readScipIndex()` (thin wrapper on `@c4312/scip`'s `deserializeSCIP`)
  + `scipSites()` (SCIP index → import/call sites, language-agnostic via the descriptor-suffix grammar
  in source #1, plus a one-character "does the next non-space char open a call?" check against the real
  source file to tell a call from a plain name reference to the same method-shaped symbol — not a parser).
- `packages/decisions/src/rules/scip.ts` (`checkRulesScip`): the SCIP-path twin of `check.ts`'s
  `checkRules`, matching the same `RuleSpec[]` (`from`/`to`/`callee`/`except`) with the same regex
  helpers (`pathRegex`/`toRegex`/`anyOf` from `rules/parse.ts`), so `forbid: import` / `forbid: call`
  behave the same whichever path ran.
- `checkRules()` in `check.ts` auto-selects the SCIP path when `root/index.scip` exists (or `--scip
  FILE`/`{scip}` option names one); the TypeScript path (dependency-cruiser + Mole's own TS AST scan)
  is byte-for-byte unchanged otherwise (packages/decisions/test/rules-check.test.ts,
  rules-review-fixes.test.ts, pr-check-rules-wiring.test.ts all still pass).
