# How `index.scip` was produced

Real indexer, not hand-written: `@sourcegraph/scip-python` 0.6.8 (npm), run against the `src/` tree in this
fixture. Covers every case the T95 review asked for: plain import, aliased import, relative import (both
`from . import leaf` and `from .leaf import helper` forms), duplicate import, `TYPE_CHECKING`-only import
alongside a runtime one, re-export via `__init__.py`, a class method call, and a call with no import (a
local, same-file function).

```sh
mkdir -p /tmp/scip-probe && cd /tmp/scip-probe
npm init -y
npm install @sourcegraph/scip-python   # 72 MB unpacked (pyright + the scip-python CLI)
cp -r <this fixture's pyproject.toml and src/> ./counterfixture/
cd counterfixture && git init -q && git add -A && git commit -q -m init   # scip-python wants a project version; git gives it one
npx scip-python index --project-name counterfixture --project-version 0.1.0 . --output index.scip
```

Verified 2026-11-04 against scip-python 0.6.8: the command above reproduces this `index.scip`
byte-for-byte modulo the embedded commit hash (same caveat as `fixtures/python/HOW-PRODUCED.md`).

## What this fixture proved about scip-python's own encoding (cited in `packages/scip/src/reader.ts`)

- **Relative imports are unqualified.** An absolute `from src.pkg.leaf import helper` resolves the module
  reference to the fully-qualified symbol `` `src.pkg.leaf`/__init__: ``, which matches a document's own
  `` `src.pkg.leaf`/__init__: `` definition symbol directly. A *relative* import does not: `from . import leaf`
  (in `src/pkg/case_relative_whole.py`) and `from .leaf import helper` (in `src/pkg/case_relative_name.py`)
  both produce the bare symbol `leaf/__init__:` -- no package prefix, no record of how many dots were written.
  Confirmed by decoding the real index: `scip-python python counterfixture 0.1.0 leaf/__init__:` at the
  `leaf` text's own range in both files, vs. `` `src.pkg.leaf`/__init__: `` everywhere an absolute import
  names the same module. The reader resolves these from the import statement's own source text (the dots +
  any module path) plus the importing file's own `relative_path` -- see `resolveRelativeImport` in reader.ts.
- **The imported *name* itself is still fully qualified by pyright.** In `from .leaf import helper`, the
  `helper` occurrence is `` `src.pkg.leaf`/helper(). `` (correct, full path) even though the `leaf` module
  occurrence right next to it is not -- only the module-reference part of a relative import is unqualified.
- **`TYPE_CHECKING` is not a SCIP concept.** scip-python emits the same occurrence shape for an import inside
  `if TYPE_CHECKING:` as for a runtime one (see `src/case_type_checking.py`: both the `Thing` import on line 4
  and the `helper` import on line 6 resolve to `` `src.pkg.leaf`/__init__: ``, same symbol, same roles). Mole's
  reader detects the block itself from the source text (indentation-based, see `typeCheckingLines`), not from
  anything scip-python writes.
- **A duplicate import of the same target keeps the first occurrence's line** (unchanged from before this
  fixture; `src/case_dup_import.py` imports `helper` once plain and once aliased `as helper2` -- both resolve
  to the same `` `src.pkg.leaf`/__init__: `` module symbol, one `ImportSite` is kept, at the first line).
