// T95 review follow-up: a committed counter-fixture, indexed by the real `scip-python` 0.6.8 (see
// fixtures/counterfixture/HOW-PRODUCED.md), covering every case the review listed as a correctness gap:
// plain import, aliased import, relative import (both `from . import x` and `from .x import y` forms),
// duplicate import, `TYPE_CHECKING`-only import (alone, and alongside a runtime import of the same target),
// re-export via `__init__.py`, a class method call, and a call with no import (same-file definition).
// Review round-2 HIGH-2 adds: a multi-line parenthesized relative import (`from . import (\n    leaf,\n)`),
// a two-name parenthesized two-dot relative import (`from .. import (leaf,\n other)`), and a backslash-
// continued relative import (`from . import \\\n    leaf`).
//
// Ground truth table: for each file, the import this reader must find (file, target, isPath, typeOnly) and
// the calls it must find (file, line, callee). Anything not listed here must NOT appear in the reader's output
// -- asserted by checking exact set membership, not just `.find()` hits (a `.find()`-only test would not catch
// the review's bug #2, where a relative import produced an extra site under the wrong target rather than
// nothing at all).
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readScipIndex, scipSites } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, 'fixtures/counterfixture');

const GROUND_TRUTH_IMPORTS = [
  { file: 'src/case_alias.py', line: 1, target: 'src/pkg/leaf.py', isPath: true }, // from src.pkg.leaf import helper as h
  { file: 'src/case_dup_import.py', line: 1, target: 'src/pkg/leaf.py', isPath: true }, // imported twice; first occurrence kept
  { file: 'src/case_method.py', line: 1, target: 'src/pkg/leaf.py', isPath: true },
  { file: 'src/case_plain.py', line: 1, target: 'src/pkg/leaf.py', isPath: true },
  { file: 'src/case_reexport_use.py', line: 1, target: 'src/pkg2/__init__.py', isPath: true }, // from src.pkg2 import helper
  { file: 'src/case_type_checking.py', line: 1, target: 'typing', isPath: false },
  // runtime import (line 6) wins over the TYPE_CHECKING-only import of the same target (line 4): no typeOnly label
  { file: 'src/case_type_checking.py', line: 6, target: 'src/pkg/leaf.py', isPath: true },
  { file: 'src/case_type_checking_only.py', line: 1, target: 'typing', isPath: false },
  // no runtime import of Thing exists in this file -> labelled typeOnly
  { file: 'src/case_type_checking_only.py', line: 4, target: 'src/pkg/leaf.py', isPath: true, typeOnly: true },
  // from .leaf import helper (relative, named submodule) -- scip-python emits an unqualified `leaf/__init__:`
  { file: 'src/pkg/case_relative_name.py', line: 1, target: 'src/pkg/leaf.py', isPath: true },
  // from . import leaf (relative, whole submodule) -- same unqualified symbol, also referenced again at the
  // z = leaf.helper() usage site; must NOT produce a second site under the raw name 'leaf'
  { file: 'src/pkg/case_relative_whole.py', line: 1, target: 'src/pkg/leaf.py', isPath: true },
  { file: 'src/pkg2/__init__.py', line: 1, target: 'src/pkg/leaf.py', isPath: true }, // the re-export itself
  // case_noimport.py: no import at all (local_fn is defined and called in the same file)
  // Review round-2 HIGH-2: multi-line parenthesized / backslash-continued relative imports. scip-python puts
  // each name's own occurrence on ITS OWN line (the continuation line), not the `from ... import (` line.
  { file: 'src/pkg/case_multiline_parens.py', line: 2, target: 'src/pkg/leaf.py', isPath: true }, // from . import (\n    leaf,\n)
  { file: 'src/pkg/case_backslash_continuation.py', line: 2, target: 'src/pkg/leaf.py', isPath: true }, // from . import \\\n    leaf
  // from .. import (leaf,\n other) -- two names in one parenthesized two-dot relative import, each on its own line
  { file: 'src/pkg/sub/case_multiline_dotdot.py', line: 1, target: 'src/pkg/leaf.py', isPath: true },
  { file: 'src/pkg/sub/case_multiline_dotdot.py', line: 2, target: 'src/pkg/other.py', isPath: true },
  // round-3 review HIGH-1: unbalanced brackets inside a comment, docstring and string must not shift statement starts
  { file: 'src/pkg/sub/case_comment_paren.py', line: 2, target: 'src/pkg/sub/decoy.py', isPath: true }, // from . import decoy  # (
  { file: 'src/pkg/sub/case_comment_paren.py', line: 4, target: 'src/pkg/leaf.py', isPath: true }, // from .. import leaf (NOT sub/leaf.py)
] as const;

const GROUND_TRUTH_CALLS = [
  { file: 'src/case_alias.py', line: 3, callee: 'src.pkg.leaf.helper' },
  { file: 'src/case_dup_import.py', line: 4, callee: 'src.pkg.leaf.helper' },
  { file: 'src/case_dup_import.py', line: 5, callee: 'src.pkg.leaf.helper' },
  { file: 'src/case_method.py', line: 4, callee: 'src.pkg.leaf.Thing.method' }, // class method call
  { file: 'src/case_noimport.py', line: 4, callee: 'src.case_noimport.local_fn' }, // call without import
  { file: 'src/case_plain.py', line: 3, callee: 'src.pkg.leaf.helper' },
  { file: 'src/case_reexport_use.py', line: 3, callee: 'src.pkg.leaf.helper' },
  { file: 'src/case_type_checking.py', line: 9, callee: 'src.pkg.leaf.helper' },
  { file: 'src/pkg/case_relative_name.py', line: 3, callee: 'src.pkg.leaf.helper' },
  { file: 'src/pkg/case_relative_whole.py', line: 3, callee: 'src.pkg.leaf.helper' },
  { file: 'src/pkg/case_multiline_parens.py', line: 5, callee: 'src.pkg.leaf.helper' },
  { file: 'src/pkg/case_backslash_continuation.py', line: 4, callee: 'src.pkg.leaf.helper' },
  { file: 'src/pkg/sub/case_multiline_dotdot.py', line: 4, callee: 'src.pkg.leaf.helper' },
  { file: 'src/pkg/sub/case_multiline_dotdot.py', line: 5, callee: 'src.pkg.other.other_helper' },
  { file: 'src/pkg/sub/case_comment_paren.py', line: 8, callee: 'src.pkg.leaf.helper' },
] as const;

describe('scipSites on the counter-fixture (real scip-python 0.6.8 index)', () => {
  it('finds exactly the ground-truth import sites, no more and no fewer', () => {
    const idx = readScipIndex(join(fixture, 'index.scip'));
    const { imports } = scipSites(idx, fixture);
    const normalize = (s: { file: string; line: number; target: string; isPath: boolean; typeOnly?: boolean }) => ({
      file: s.file,
      line: s.line,
      target: s.target,
      isPath: s.isPath,
      ...(s.typeOnly ? { typeOnly: true } : {}),
    });
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

  it('resolves `from .leaf import helper` (relative, named submodule) to the real file, not an external module', () => {
    const idx = readScipIndex(join(fixture, 'index.scip'));
    const { imports } = scipSites(idx, fixture);
    const hit = imports.find((s) => s.file === 'src/pkg/case_relative_name.py');
    expect(hit).toMatchObject({ target: 'src/pkg/leaf.py', isPath: true });
  });

  it('resolves `from . import leaf` (relative, whole submodule) without a spurious second site under the bare name', () => {
    const idx = readScipIndex(join(fixture, 'index.scip'));
    const { imports } = scipSites(idx, fixture);
    const hits = imports.filter((s) => s.file === 'src/pkg/case_relative_whole.py');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ target: 'src/pkg/leaf.py', isPath: true });
  });

  it('labels a TYPE_CHECKING-only import, but reports the runtime import line when both exist for the same target', () => {
    const idx = readScipIndex(join(fixture, 'index.scip'));
    const { imports } = scipSites(idx, fixture);
    const both = imports.find((s) => s.file === 'src/case_type_checking.py' && s.target === 'src/pkg/leaf.py');
    expect(both).toMatchObject({ line: 6 }); // the runtime import line, not the TYPE_CHECKING-only one at line 4
    expect(both?.typeOnly).toBeUndefined();

    const onlyType = imports.find((s) => s.file === 'src/case_type_checking_only.py' && s.target === 'src/pkg/leaf.py');
    expect(onlyType).toMatchObject({ line: 4, typeOnly: true });
  });

  it('a duplicate import of the same target keeps one site, at the first occurrence', () => {
    const idx = readScipIndex(join(fixture, 'index.scip'));
    const { imports } = scipSites(idx, fixture);
    const hits = imports.filter((s) => s.file === 'src/case_dup_import.py');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ line: 1, target: 'src/pkg/leaf.py' });
  });

  it('a call with no import in the file (same-file definition) produces no import site', () => {
    const idx = readScipIndex(join(fixture, 'index.scip'));
    const { imports, calls } = scipSites(idx, fixture);
    expect(imports.some((s) => s.file === 'src/case_noimport.py')).toBe(false);
    expect(calls.find((c) => c.file === 'src/case_noimport.py')).toMatchObject({ line: 4, callee: 'src.case_noimport.local_fn' });
  });

  it('resolves a multi-line parenthesized relative import (review round-2 HIGH-2)', () => {
    const idx = readScipIndex(join(fixture, 'index.scip'));
    const { imports } = scipSites(idx, fixture);
    const hit = imports.find((s) => s.file === 'src/pkg/case_multiline_parens.py');
    expect(hit).toMatchObject({ target: 'src/pkg/leaf.py', isPath: true });
  });

  it('resolves a backslash-continued relative import (review round-2 HIGH-2)', () => {
    const idx = readScipIndex(join(fixture, 'index.scip'));
    const { imports } = scipSites(idx, fixture);
    const hit = imports.find((s) => s.file === 'src/pkg/case_backslash_continuation.py');
    expect(hit).toMatchObject({ target: 'src/pkg/leaf.py', isPath: true });
  });

  it('resolves both names of a two-dot, two-name parenthesized relative import, each on its own line (review round-2 HIGH-2)', () => {
    const idx = readScipIndex(join(fixture, 'index.scip'));
    const { imports } = scipSites(idx, fixture);
    const hits = imports.filter((s) => s.file === 'src/pkg/sub/case_multiline_dotdot.py');
    expect(hits).toHaveLength(2);
    expect(hits).toContainEqual(expect.objectContaining({ target: 'src/pkg/leaf.py', isPath: true }));
    expect(hits).toContainEqual(expect.objectContaining({ target: 'src/pkg/other.py', isPath: true }));
  });
});
