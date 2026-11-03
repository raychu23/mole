// Where each Argdown argument is DEFINED (`<id>: text` / `[id]: text`), with its text and #tags.
//
// The graph loader (argdown/loader.ts) keys nodes by title and keeps the FIRST mention's line, which can be a bare
// `-> <id>` reference inside another argument's block (T60 review 1). Anything that needs the argument's own text
// or tags must look up its definition line here instead of trusting `node.line`.
// Read-only. Scans every file the loader reads arguments from (.mole/arguments/** .argdown/.md, .mole/decisions/*.md)
// plus the files the graph's argument nodes and edges came from.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { DecisionGraph } from '../types.js';

export interface ArgumentDefinition {
  id: string;
  file: string;
  line: number;
  /** text after the colon, tags included */
  text: string;
  /** #tags on the definition line, in order */
  tags: string[];
}

// optional relation prefix: Argdown also defines an argument inline after an arrow (`  -> <b>: text`)
const DEF = /^\s*(?:(?:->|<-|\+>|<\+|_>|<_|-|\+)\s+)?[<[]([^>\]]+)[>\]]\s*:\s*(.*)$/;
const TAG = /#([\w.-]+)/g;

/** id -> every definition of it (usually one) across the graph's argument files, sorted by file then line */
export function argumentDefinitions(graph: DecisionGraph): Map<string, ArgumentDefinition[]> {
  const ids = new Set(graph.nodes.filter((n) => n.kind === 'argument').map((n) => n.id));
  const walk = (dir: string, deep: boolean): string[] =>
    !existsSync(dir) ? [] : readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? (deep ? walk(join(dir, e.name), deep) : []) : /\.(argdown|md)$/.test(e.name) ? [relative(graph.root, join(dir, e.name)).split('\\').join('/')] : []);
  const files = new Set([
    ...walk(join(graph.root, '.mole/arguments'), true),
    ...walk(join(graph.root, '.mole/decisions'), false),
    ...graph.nodes.filter((n) => n.kind === 'argument').map((n) => n.file), ...graph.edges.filter((e) => ids.has(e.from) || ids.has(e.to)).map((e) => e.file)]);
  const out = new Map<string, ArgumentDefinition[]>();
  for (const file of [...files].sort()) {
    let lines: string[];
    try {
      lines = readFileSync(join(graph.root, file), 'utf8').split(/\r?\n/);
    } catch {
      continue;
    }
    lines.forEach((l, i) => {
      const m = DEF.exec(l);
      if (!m || !ids.has(m[1]!.trim())) return;
      const id = m[1]!.trim();
      const text = m[2]!.trim();
      const def = { id, file, line: i + 1, text, tags: [...text.matchAll(TAG)].map((t) => t[1]!) };
      out.set(id, [...(out.get(id) ?? []), def]);
    });
  }
  return out;
}
