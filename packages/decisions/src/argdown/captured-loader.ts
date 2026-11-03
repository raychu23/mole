// T80: turns APPROVED captured arguments (capture/captured-store.ts) into the same `kind: 'argument'`
// graph nodes + supports/attacks/undercuts edges T48's loadArgdown already produces, so framework.ts's
// `argumentFramework()` and packages/reasoning's `evaluate()` pick them up with NO changes of their own --
// extending the existing capture path (T48/T43/T67) rather than a parallel store/evaluator
// (prior-art.md's design choice #1).
//
// A `draft` (or `rejected`) row is skipped entirely: it never becomes a graph node, so it is structurally
// invisible to `argumentFramework()`/`evaluate()` -- this is the whole mechanism behind "a draft argument
// never changes a verdict until approved" (tested in test/argument-capture.test.ts).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import type { CapturedArgument } from '../capture/arguments.js';
import { capturedDir } from '../capture/captured-store.js';
import type { GraphBuilder } from './loader.js';

/** One call from graph.ts, right after loadArgdown (same convention as that loader's own doc comment). */
export function loadCapturedArguments(b: GraphBuilder): void {
  const dir = capturedDir(b.root);
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
    const file = `.mole/arguments/captured/${name}`;
    const rows = JSON.parse(readFileSync(`${dir}/${name}`, 'utf8')) as CapturedArgument[];
    for (const row of rows) {
      if (row.status !== 'approved') continue; // draft/rejected: never a graph node (prior-art.md #1)
      if (b.has(row.id)) {
        b.problems.push({ file, line: row.span.startLine, message: `duplicate argument id '${row.id}': already defined elsewhere (this captured argument skipped)` });
        continue;
      }
      b.node({
        id: row.id,
        kind: 'argument',
        title: row.text,
        status: 'recorded',
        statusText: row.role,
        format: 'argdown',
        file: row.span.file,
        line: row.span.startLine,
        scope: [],
        evidence: [],
        fields: {},
      });
    }
  }
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
    const file = `.mole/arguments/captured/${name}`;
    const rows = JSON.parse(readFileSync(`${dir}/${name}`, 'utf8')) as CapturedArgument[];
    for (const row of rows) {
      if (row.status !== 'approved') continue;
      for (const to of row.attacks) b.edge({ from: row.id, to, type: 'attacks', file, line: row.span.startLine });
      for (const to of row.supports) b.edge({ from: row.id, to, type: 'supports', file, line: row.span.startLine });
    }
  }
}
