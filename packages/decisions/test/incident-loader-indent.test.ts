// T82 (backlog incident-loader-indent, found T58 review 2): a .mole incident record whose block list mixes
// indentation can confuse frontMatter() (graph.ts) in two different ways:
//  1. items at DECREASING indent within the same list (4-space then 2-space) is genuinely invalid YAML --
//     the `yaml` library already reports a parse error for this, and loadIncidents already turns that into a
//     Problem with file:line instead of crashing. Kept here as a named regression guard.
//  2. items at INCREASING indent within the same list (2-space then 4-space) is NOT a `yaml` library parse
//     error: YAML's own plain-scalar folding rule silently merges the later, more-indented '- x' lines into the
//     text of the FIRST item ('d1 - d2 - d3' as one string) -- so frontMatter() returned a list with the wrong
//     item COUNT and no problem at all. The record wasn't dropped, but its evidence/relation list silently lost
//     members, which is the same silent-data-loss failure mode as dropping the whole record. This is the T58
//     review 2 reproducer: fixed so this shape is reported as a Problem (file:line) instead of silently folded.
//  3. Genuinely different (but internally consistent) indentation between two SIBLING lists (e.g. `decisions:`
//     at 4-space, `attacks:` at 2-space) is ordinary, valid YAML and must keep loading exactly as before.
import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { frontMatter, loadGraph } from '../src/graph.js';

function mkRoot(incidentBody: string, name = 'inc-1.md'): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-t82-'));
  mkdirSync(join(root, '.mole', 'incidents'), { recursive: true });
  writeFileSync(join(root, '.mole', 'incidents', name), incidentBody);
  return root;
}

describe('T82: incident loader vs. mixed-indentation block lists', () => {
  it('decreasing indent within one list (4-space then 2-space) is a real YAML error: reported, not dropped silently', () => {
    const root = mkRoot(`---
id: inc-1
title: decreasing
decisions:
    - d1
  - d2
---
body
`);
    const g = loadGraph(root);
    expect(g.nodes.find((n) => n.id === 'inc-1')).toBeUndefined(); // genuinely unparsable: no node
    expect(g.problems).toEqual([expect.objectContaining({ file: '.mole/incidents/inc-1.md', line: expect.any(Number) })]);
    expect(g.problems[0]!.message).toMatch(/YAML/);
  });

  it('increasing indent within one list (2-space then 4-space) folds into one scalar with no YAML error: must be reported, items must not silently vanish', () => {
    const root = mkRoot(
      `---
id: inc-2
title: increasing
decisions:
  - d1
    - d2
    - d3
---
body
`,
      'inc-2.md',
    );
    const fm = frontMatter(
      `---
id: inc-2
title: increasing
decisions:
  - d1
    - d2
    - d3
---
body
`,
      '.mole/incidents/inc-2.md',
    );
    expect(fm && 'error' in fm).toBe(true); // reported, not silently folded into one item

    const g = loadGraph(root);
    // the record must not be silently dropped with no trace, and it must not silently keep a corrupted
    // 1-item list that actually names 3 ids -- one or the other, but never silent.
    const node = g.nodes.find((n) => n.id === 'inc-2');
    if (node) expect(g.problems.some((p) => p.file === '.mole/incidents/inc-2.md')).toBe(true);
    else expect(g.problems.some((p) => p.file === '.mole/incidents/inc-2.md')).toBe(true);
  });

  it('false positive guard: a plain scalar field whose continuation line merely looks like a list item, but is not itself a sequence item, must not be flagged (reviewer reproducer)', () => {
    const fm = frontMatter(
      `---
id: inc-6
title: prose with dash continuation
description: root cause was X
  - this happened because of Y
---
body
`,
      '.mole/incidents/inc-6.md',
    );
    expect(fm && 'error' in fm).toBe(false); // valid prose, no list anywhere: must not be reported
  });

  it('false positive guard: a map value inside a seq item whose continuation starts with "-" is folded into that VALUE, not a lost list item, so it must not be flagged', () => {
    const fm = frontMatter(
      `---
id: inc-7
title: map value inside seq item
things:
  - key: hello
      - world
---
body
`,
      '.mole/incidents/inc-7.md',
    );
    expect(fm && 'error' in fm).toBe(false);
  });

  it('false positive guard: a block scalar (|) field with a dash-looking line in its body must not be flagged', () => {
    const fm = frontMatter(
      `---
id: inc-8
title: block scalar body
description: |
  root cause was X
  - this happened because of Y
---
body
`,
      '.mole/incidents/inc-8.md',
    );
    expect(fm && 'error' in fm).toBe(false);
  });

  it('false positive guard: a quoted scalar field with a dash-looking continuation must not be flagged', () => {
    const fm = frontMatter(
      `---
id: inc-9
title: quoted scalar
description: "root cause was X
  - this happened because of Y"
---
body
`,
      '.mole/incidents/inc-9.md',
    );
    expect(fm && 'error' in fm).toBe(false);
  });

  it('sibling lists at genuinely different (self-consistent) indentation still load fine, unchanged', () => {
    const root = mkRoot(
      `---
id: inc-3
title: sibling lists
decisions:
    - d1
    - d2
attacks:
  - d3
  - d4
---
body
`,
      'inc-3.md',
    );
    const g = loadGraph(root);
    expect(g.nodes.map((n) => n.id)).toEqual(expect.arrayContaining(['inc-3', 'incident-inc-3']));
    expect(g.problems.filter((p) => p.file === '.mole/incidents/inc-3.md' && /indent|fold/i.test(p.message))).toEqual([]);
  });
});
