import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readScipIndex, scipSites } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, 'fixtures/python');

// Real index.scip produced by the real `@sourcegraph/scip-python` 0.6.8 indexer (see
// fixtures/python/HOW-PRODUCED.md), not a hand-written stub.
describe('scipSites on a real scip-python index', () => {
  it('lists every indexed document', () => {
    const idx = readScipIndex(join(fixture, 'index.scip'));
    const { files } = scipSites(idx, fixture);
    expect(files.sort()).toEqual(
      ['src/__init__.py', 'src/api/__init__.py', 'src/api/client.py', 'src/db/__init__.py', 'src/db/query.py', 'src/ui/__init__.py', 'src/ui/view.py'].sort(),
    );
  });

  it('finds the import of src.db.query from src/ui/view.py, at the import line', () => {
    const idx = readScipIndex(join(fixture, 'index.scip'));
    const { imports } = scipSites(idx, fixture);
    const hit = imports.find((s) => s.file === 'src/ui/view.py' && s.target === 'src/db/query.py');
    expect(hit).toMatchObject({ line: 2, isPath: true });
  });

  it('finds the external stdlib import (urllib.request) by module name, not path', () => {
    const idx = readScipIndex(join(fixture, 'index.scip'));
    const { imports } = scipSites(idx, fixture);
    const hit = imports.find((s) => s.file === 'src/api/client.py' && s.target === 'urllib.request');
    expect(hit).toMatchObject({ line: 1, isPath: false });
  });

  it('finds the cross-file call q() in src/ui/view.py, with its dotted callee name', () => {
    const idx = readScipIndex(join(fixture, 'index.scip'));
    const { calls } = scipSites(idx, fixture);
    const hit = calls.find((c) => c.file === 'src/ui/view.py' && c.line === 8);
    expect(hit).toMatchObject({ callee: 'src.db.query.q' });
  });

  it('never reports the `from src.db.query import q` binding itself as a call to q', () => {
    const idx = readScipIndex(join(fixture, 'index.scip'));
    const { calls } = scipSites(idx, fixture);
    // line 2 is the import statement; q() is only really called on line 8
    expect(calls.some((c) => c.file === 'src/ui/view.py' && c.line === 2)).toBe(false);
  });
});
