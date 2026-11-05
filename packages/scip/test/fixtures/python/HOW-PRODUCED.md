# How `index.scip` was produced

Real indexer, not hand-written: `@sourcegraph/scip-python` 0.6.8 (npm), run against the `src/` tree
in this fixture.

```sh
mkdir -p /tmp/scip-probe && cd /tmp/scip-probe
npm init -y
npm install @sourcegraph/scip-python   # 72 MB unpacked (pyright + the scip-python CLI)
cp -r <this fixture's pyproject.toml and src/> ./pyfixture/
cd pyfixture && git init -q && git add -A && git commit -q -m init   # scip-python wants a project version; git gives it one
npx scip-python index --project-name fixture --project-version 0.1.0 . --output index.scip
```

Verified 2026-11-04 against scip-python 0.6.8: the command above reproduces this `index.scip`
byte-for-byte modulo the embedded commit hash (scip-python stamps `Metadata` with the git revision
when `--project-version` names one; a fresh `git init` gives a different commit, so re-running the
command above produces a *different but structurally identical* index — same documents, symbols and
occurrences, used only for `index.scip`'s own revision stamp which Mole's reader never reads).
