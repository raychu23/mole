# How `index.scip` was produced (the Go counter-fixture)

Real indexer, not hand-written: `scip-go` (`github.com/scip-code/scip-go`, formerly `sourcegraph/scip-go`)
v0.2.9, run against the Go module `counterfixture` in this fixture. Covers every case T106's brief asked
for: plain import, aliased import, dot import, blank import, a method call, a call with no import (a
local, same-file function), a vendored module (via `go mod vendor`, no network fetch needed -- vendors a
tiny local-replace module `github.com/example/greet`, see `local/greet/`), and an `internal/` package
(`internal/ipkg`, imported by `case_internal.go`).

```sh
mkdir -p /tmp/scip-go-probe/gopath && cd /tmp/scip-go-probe
GOPATH=$PWD/gopath GOBIN=$PWD/bin go install github.com/scip-code/scip-go/cmd/scip-go@latest   # v0.2.9

mkdir counterfixture && cd counterfixture
go mod init counterfixture
# ... write case_*.go, pkg/leaf, internal/ipkg, local/greet (see this fixture's own files) ...
go mod tidy && go mod vendor   # vendors local/greet without any network fetch
go build ./...                # must be clean before indexing

git init -q && git add -A && git -c user.name=t -c user.email=t@t commit -q -m init   # scip-go wants a module version; git gives it one, same reason as the Python fixture

PATH=/tmp/scip-go-probe/bin:$PATH GOPATH=/tmp/scip-go-probe/gopath \
  scip-go index --output=index.scip --module-version=0.1.0
```

Verified 2026-11-05 against scip-go 0.2.9 (installed via `go install github.com/scip-code/scip-go/cmd/
scip-go@latest`, the current `@latest` as of this date -- also the same version T95 tried and reported
"no occurrence ranges").

## What this fixture proved about scip-go's own encoding (cited in `packages/scip/src/reader.ts`)

- **T95's "scip-go doesn't emit ranges" finding was a stale-bindings bug in Mole's own decoder, not a
  scip-go bug.** `scip-go` 0.2.9 is unchanged since T95 (same version, no newer release exists as of
  2026-11-05 -- `scip-code/scip-go`'s own GitHub releases page lists v0.2.9, published 2026-10-22, as
  latest). Decoding this fixture's `index.scip` with the npm package Mole depended on at the time
  (`@c4312/scip` 0.1.0, generated from `sourcegraph/scip`'s **old** `scip.proto`) gives every occurrence
  an empty `range: []`, reproducing T95's finding exactly (confirmed with `@c4312/scip` directly against
  this same `index.scip`, then discarded -- not committed as a dependency).
- **The real cause: `sourcegraph/scip` moved to `scip-code/scip` and retyped `Occurrence.range`.**
  `scip-code/scip` PR #387 ("Make ranges typed `oneof`s") deprecated the flat `repeated int32 range = 1`
  field and added `oneof typed_range { SingleLineRange single_line_range = 8; MultiLineRange
  multi_line_range = 9; }` (scip.proto, `scip-code/scip` `main`, fetched 2026-11-05). Current `scip-go`
  (whose `go.mod` depends on `github.com/scip-code/scip/bindings/go/scip v0.10.0`) writes ONLY the typed
  form -- confirmed by decoding this fixture's raw protobuf bytes: every occurrence's field-8 bytes decode
  to a valid 3-field `SingleLineRange` (e.g. the `leaf` import token in `case_alias.go` decodes to line 2
  (0-based), columns 7-9). `@c4312/scip`'s decoder predates field 8/9 and silently drops them into its
  unknown-fields bucket, so `occ.range` reads back empty -- not because scip-go omitted the data, but
  because Mole's TypeScript bindings didn't know the new field existed.
- **The fix: switch to `@scip-code/scip`** (https://www.npmjs.com/package/@scip-code/scip), the maintained
  org's own published npm package -- version-paired (0.10.0) with the exact Go bindings `scip-go` itself
  depends on, so no further drift between the Go and TypeScript decoders of the same wire format. It
  decodes `occ.typedRange.case`/`occ.typedRange.value` for scip-go's output AND still decodes the
  deprecated flat `occ.range` for scip-python 0.6.8's index.scip (that indexer predates the typed-range
  PR and still writes only the deprecated field) -- verified both existing Python fixtures
  (`fixtures/python`, `fixtures/counterfixture`) still produce byte-identical `scipSites()` output and all
  32 pre-existing `packages/scip` tests pass unchanged after the switch. `reader.ts`'s `occurrenceRange()`
  normalizes either encoding to the same flat-array shape the rest of the file already expected, so no
  other code in this package or in `packages/decisions/src/rules/scip.ts` had to change.
- **A vendored dependency is not itself an indexed document.** `vendor/github.com/example/greet/greet.go`
  does not appear in `index.scip`'s own `documents` list even though it's on disk and scip-go resolves the
  import through it to build the index -- so `case_vendored.go`'s import resolves like an external module
  (`isPath: false`, target `github.com/example/greet`), the same shape as a Python stdlib import, not a
  same-repo path. `reader.ts`'s generic "does `definedIn` have this symbol's own document" check already
  handles this with no Go-specific code.
- **An `internal/` package indexes and resolves exactly like any other package.** `case_internal.go`'s
  import of `counterfixture/internal/ipkg` resolves to `internal/ipkg/ipkg.go` (`isPath: true`) with no
  special-casing needed -- Go's `internal/` visibility rule is a compiler-enforced build constraint, not a
  different SCIP symbol shape.
- **Go's package-path descriptor is one backtick-escaped name, not a dotted chain.** Go symbols encode the
  whole import path as one escaped descriptor (e.g. `` `counterfixture/pkg/leaf`/Helper(). ``, not
  `counterfixture.pkg.leaf.Helper()`), so `reader.ts`'s existing `descriptorNames()` (built for Python's
  dotted descriptors) yields a dotted *callee* string that still contains the literal `/` from the Go
  import path, e.g. `counterfixture/pkg/leaf.Helper` -- correct and matched the same way (exact, or a
  `.<callee>` suffix) Mole's rule engine already matches Python/TypeScript callees; no reader change was
  needed for this, it's reported here as a cross-language shape difference worth knowing about when
  writing a Go `forbid: call` rule (`callee:` should still just be the trailing name, e.g. `Helper`, which
  matches via the existing suffix rule).
