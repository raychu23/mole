// T82: sweep every record in the vendored bench corpora + test fixtures through frontMatter() twice -- once with
// the pre-T82 logic (inlined verbatim from git HEAD, before the folded-list-item check) and once with the current
// (post-fix) graph.ts -- and assert the two runs agree on every file except ones that actually hit the new check.
// This is the "load every record before/after, identical except the fixed cases" sweep the task asked for; the
// actual before/after text diff is written to 4 log/snapshot-diff.txt for the record.
import { isMap, isScalar, isSeq, LineCounter, parseDocument, type Node as YNode } from 'yaml';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { frontMatter as frontMatterNew } from '../src/graph.js';
import type { Problem } from '../src/types.js';

// --- verbatim pre-T82 frontMatter() (git HEAD before this task's patch) -------------------------------------
interface OldItem { value: string; line: number; map?: Record<string, string> }
interface OldField { line: number; value?: string; items?: OldItem[]; map?: Record<string, string> }
type OldFrontMatter = { fields: Map<string, OldField>; end: number } | { error: Problem } | undefined;

function frontMatterOld(text: string, file: string): OldFrontMatter {
  const lines = text.split(/\r?\n/);
  if ((lines[0] ?? '').trim() !== '---') return undefined;
  let end = -1;
  for (let i = 1; i < lines.length; i++)
    if ((lines[i] ?? '').trim() === '---') {
      end = i;
      break;
    }
  if (end < 0) return { error: { file, line: 1, message: 'front matter is not closed with ---' } };
  const src = lines.slice(1, end).join('\n');
  const lc = new LineCounter();
  const doc = parseDocument(src, { lineCounter: lc, prettyErrors: false });
  const lineAt = (offset: number) => lc.linePos(offset).line + 1;
  if (doc.errors.length > 0) {
    const e = doc.errors[0]!;
    return { error: { file, line: lineAt(e.pos[0]), message: `YAML: ${e.message.split('\n')[0]}` } };
  }
  const raw = (n: YNode | null | undefined): string => {
    if (!n) return '';
    if (isScalar(n)) {
      if (n.type === 'PLAIN' && n.range) return src.slice(n.range[0], n.range[1]).trim();
      return n.value === null || n.value === undefined ? '' : String(n.value);
    }
    return String((n as { toJSON?: () => unknown }).toJSON?.() ?? '');
  };
  const nodeLine = (n: YNode | null | undefined, fallback: number) => (n && n.range ? lineAt(n.range[0]) : fallback);
  const asMap = (n: YNode): Record<string, string> | undefined => {
    if (!isMap(n)) return undefined;
    const m: Record<string, string> = {};
    for (const p of n.items) m[raw(p.key as YNode)] = raw(p.value as YNode);
    return m;
  };
  const fields = new Map<string, OldField>();
  const root = doc.contents;
  if (root === null || root === undefined) return { fields, end: end + 1 };
  if (!isMap(root)) return { error: { file, line: 2, message: 'front matter is not a key: value map' } };
  for (const pair of root.items) {
    const k = pair.key as YNode;
    const v = pair.value as YNode | null;
    const key = raw(k);
    const line = nodeLine(k, 2);
    if (v && isSeq(v)) {
      fields.set(key, {
        line,
        items: v.items.map((it) => {
          const n = it as YNode;
          const map = asMap(n);
          return { value: map ? Object.values(map)[0] ?? '' : raw(n), line: nodeLine(n, line), map };
        }),
      });
    } else if (v && isMap(v)) fields.set(key, { line, map: asMap(v) });
    else fields.set(key, { line, value: raw(v), items: v && raw(v) !== '' ? [{ value: raw(v), line: nodeLine(v, line) }] : [] });
  }
  return { fields, end: end + 1 };
}
// ---------------------------------------------------------------------------------------------------------------

function mdFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  let entries: import('node:fs').Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true, encoding: 'utf8' });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...mdFilesRecursive(p));
    else if (e.isFile() && e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

const here = fileURLToPath(new URL('.', import.meta.url));
const pkgRoot = join(here, '..');

describe('T82: before/after snapshot of every bench-corpora + fixture record through frontMatter()', () => {
  it('agrees with the pre-fix parse on every file except the ones the fix actually changes', () => {
    const roots = [join(pkgRoot, 'bench', 'corpora'), join(pkgRoot, 'bench', 'm24v2'), join(pkgRoot, 'test', 'fixtures')];
    const files = roots.flatMap((r) => mdFilesRecursive(r));
    expect(files.length).toBeGreaterThan(50); // sanity: the sweep actually covers the vendored corpora

    const changed: Array<{ file: string; before: string; after: string }> = [];
    for (const abs of files) {
      const text = readFileSync(abs, 'utf8');
      const rel = relative(pkgRoot, abs);
      const before = frontMatterOld(text, rel);
      const after = frontMatterNew(text, rel);
      const serialize = (fm: typeof before) => {
        if (fm === undefined) return 'undefined';
        if ('error' in fm) return `error: ${fm.error.line}: ${fm.error.message}`;
        return JSON.stringify([...fm.fields.entries()]);
      };
      const b = serialize(before);
      const a = serialize(after);
      if (b !== a) changed.push({ file: rel, before: b, after: a });
    }

    const logDir = join(pkgRoot, '..', '..', 'tasks', 'T82-incident-loader-indent', '4 log');
    mkdirSync(logDir, { recursive: true });
    const report = changed.length
      ? changed.map((c) => `${c.file}\n  before: ${c.before}\n  after:  ${c.after}\n`).join('\n')
      : '(no vendored corpus or fixture record changed its frontMatter() result: the fix only changes records that\nfold a list item into the previous one, and none of the vendored records do that)\n';
    writeFileSync(join(logDir, 'snapshot-diff.txt'), report);

    // every changed file must be one where the OLD parse hid a folded list item with no error, and the NEW parse
    // now reports it (the fix only ever turns a silent fold into a reported error, never the reverse, and never
    // touches a file that didn't have this shape at all).
    for (const c of changed) {
      expect(c.before.startsWith('error:')).toBe(false);
      expect(c.after.startsWith('error:')).toBe(true);
    }
  });
});
