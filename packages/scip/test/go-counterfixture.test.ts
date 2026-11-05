// T106: a committed Go counter-fixture, indexed by the real `scip-go` 0.2.9 (see
// fixtures/go/HOW-PRODUCED.md), covering every case the brief asked for: plain import, aliased import,
// dot import, blank import, a method call, a call with no import (same-file definition), a vendored
// module (local-replace, no network fetch), and an internal/ package.
//
// Ground truth table: for each file, the import this reader must find (file, target, isPath) and the
// calls it must find (file, line, callee). Anything not listed here must NOT appear in the reader's
// output -- asserted by checking exact set membership (same discipline as the Python counterfixture test).
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readScipIndex, scipSites } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, 'fixtures/go');

const GROUND_TRUTH_IMPORTS = [
  { file: 'case_alias.go', line: 3, target: 'pkg/leaf/leaf.go', isPath: true }, // import lf "counterfixture/pkg/leaf"
  { file: 'case_blank.go', line: 3, target: 'pkg/leaf/leaf.go', isPath: true }, // import _ "counterfixture/pkg/leaf"
  { file: 'case_dot.go', line: 3, target: 'pkg/leaf/leaf.go', isPath: true }, // import . "counterfixture/pkg/leaf"
  { file: 'case_internal.go', line: 3, target: 'internal/ipkg/ipkg.go', isPath: true }, // internal/ package import
  { file: 'case_method.go', line: 3, target: 'pkg/leaf/leaf.go', isPath: true },
  { file: 'case_plain.go', line: 3, target: 'pkg/leaf/leaf.go', isPath: true },
  // vendored module: vendor/github.com/example/greet is NOT an index document, so this resolves like an
  // external module, not a repo path (see HOW-PRODUCED.md).
  { file: 'case_vendored.go', line: 3, target: 'github.com/example/greet', isPath: false },
  // case_noimport.go: no import at all (localFn is defined and called in the same file)
  // main.go: calls casePlain/caseAlias/.../caseVendored, all defined in OTHER files of the same package
  // (`package main`) -- Go needs no import for that, so main.go must produce no import sites either.
] as const;

const GROUND_TRUTH_CALLS = [
  { file: 'case_alias.go', line: 6, callee: 'counterfixture/pkg/leaf.Helper' },
  { file: 'case_dot.go', line: 6, callee: 'counterfixture/pkg/leaf.Helper' },
  { file: 'case_internal.go', line: 6, callee: 'counterfixture/internal/ipkg.InternalHelper' },
  { file: 'case_method.go', line: 7, callee: 'counterfixture/pkg/leaf.Thing.Method' }, // method call
  { file: 'case_noimport.go', line: 6, callee: 'counterfixture.localFn' }, // call without import
  { file: 'case_plain.go', line: 6, callee: 'counterfixture/pkg/leaf.Helper' },
  { file: 'case_vendored.go', line: 6, callee: 'github.com/example/greet.Greet' },
  { file: 'main.go', line: 4, callee: 'counterfixture.casePlain' },
  { file: 'main.go', line: 5, callee: 'counterfixture.caseAlias' },
  { file: 'main.go', line: 6, callee: 'counterfixture.caseDot' },
  { file: 'main.go', line: 7, callee: 'counterfixture.caseBlank' },
  { file: 'main.go', line: 8, callee: 'counterfixture.caseMethod' },
  { file: 'main.go', line: 9, callee: 'counterfixture.caseNoImport' },
  { file: 'main.go', line: 10, callee: 'counterfixture.caseInternal' },
  { file: 'main.go', line: 11, callee: 'counterfixture.caseVendored' },
] as const;

describe('scipSites on the Go counter-fixture (real scip-go 0.2.9 index)', () => {
  it('finds exactly the ground-truth import sites, no more and no fewer', () => {
    const idx = readScipIndex(join(fixture, 'index.scip'));
    const { imports } = scipSites(idx, fixture);
    const normalize = (s: { file: string; line: number; target: string; isPath: boolean }) => ({ file: s.file, line: s.line, target: s.target, isPath: s.isPath });
    const got = imports.map(normalize).sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
    const want = GROUND_TRUTH_IMPORTS.map((s) => normalize(s as never)).sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
    expect(got).toEqual(want);
  });

  it('finds exactly the ground-truth call sites, no more and no fewer', () => {
    const idx = readScipIndex(join(fixture, 'index.scip'));
    const { calls } = scipSites(idx, fixture);
    const got = calls.map((c) => ({ file: c.file, line: c.line, callee: c.callee })).sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
    const want = [...GROUND_TRUTH_CALLS].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
    expect(got).toEqual(want);
  });

  it('lists every indexed Go document', () => {
    const idx = readScipIndex(join(fixture, 'index.scip'));
    const { files } = scipSites(idx, fixture);
    expect(files.sort()).toEqual(
      ['case_alias.go', 'case_blank.go', 'case_dot.go', 'case_internal.go', 'case_method.go', 'case_noimport.go', 'case_plain.go', 'case_vendored.go', 'internal/ipkg/ipkg.go', 'main.go', 'pkg/leaf/leaf.go'].sort(),
    );
  });

  it('a dot import (`import . "pkg"`) resolves the bare call to the real file, same as a qualified one', () => {
    const idx = readScipIndex(join(fixture, 'index.scip'));
    const { imports, calls } = scipSites(idx, fixture);
    expect(imports.find((s) => s.file === 'case_dot.go')).toMatchObject({ target: 'pkg/leaf/leaf.go', isPath: true });
    expect(calls.find((c) => c.file === 'case_dot.go')).toMatchObject({ callee: 'counterfixture/pkg/leaf.Helper' });
  });

  it('a blank import (`import _ "pkg"`) produces an import site but no call site', () => {
    const idx = readScipIndex(join(fixture, 'index.scip'));
    const { imports, calls } = scipSites(idx, fixture);
    expect(imports.find((s) => s.file === 'case_blank.go')).toMatchObject({ target: 'pkg/leaf/leaf.go', isPath: true });
    expect(calls.some((c) => c.file === 'case_blank.go')).toBe(false);
  });

  it('a vendored module resolves like an external module, not a repo path', () => {
    const idx = readScipIndex(join(fixture, 'index.scip'));
    const { imports } = scipSites(idx, fixture);
    const hit = imports.find((s) => s.file === 'case_vendored.go');
    expect(hit).toMatchObject({ target: 'github.com/example/greet', isPath: false });
  });

  it('an internal/ package import resolves to the real file, same as any other package', () => {
    const idx = readScipIndex(join(fixture, 'index.scip'));
    const { imports } = scipSites(idx, fixture);
    const hit = imports.find((s) => s.file === 'case_internal.go');
    expect(hit).toMatchObject({ target: 'internal/ipkg/ipkg.go', isPath: true });
  });

  it('a call with no import in the file (same-file definition) produces no import site', () => {
    const idx = readScipIndex(join(fixture, 'index.scip'));
    const { imports, calls } = scipSites(idx, fixture);
    expect(imports.some((s) => s.file === 'case_noimport.go')).toBe(false);
    expect(calls.find((c) => c.file === 'case_noimport.go')).toMatchObject({ line: 6, callee: 'counterfixture.localFn' });
  });

  it('cross-file calls within the same Go package need no import (main.go calling the case_* files)', () => {
    const idx = readScipIndex(join(fixture, 'index.scip'));
    const { imports, calls } = scipSites(idx, fixture);
    expect(imports.some((s) => s.file === 'main.go')).toBe(false);
    expect(calls.filter((c) => c.file === 'main.go').length).toBe(8);
  });
});
