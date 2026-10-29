// Loaders: .mole/tenets.md, .mole/decisions/*.md, .mole/intent/**/*.md, .mole/incidents/*.md (YAML front matter, MADR-style)
// and plain ADR folders (Nygard / adr-tools `## Status` sections, backstage `:::note Superseded` blocks). Every field keeps its file:line.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, isAbsolute, join, relative, sep } from 'node:path';
import { isMap, isScalar, isSeq, LineCounter, parseDocument, type Node as YNode } from 'yaml';
import type { Anchor, DecisionGraph, EdgeType, EvidenceRef, GraphEdge, GraphNode, LoadOptions, Problem } from './types.js';

export const MOLE_DIR = '.mole';

const posix = (p: string) => p.split(sep).join('/');

/** A YAML value with the 1-based file line where it is written. */
interface Item {
  value: string;
  line: number;
  map?: Record<string, string>;
}
interface Field {
  line: number;
  value?: string; // scalar
  items?: Item[]; // sequence (a scalar written for a list key becomes one item)
  map?: Record<string, string>;
}
type FrontMatter = { fields: Map<string, Field>; end: number } | { error: Problem } | undefined;

/** Normalize a status sentence to one word of the flag rules. */
export function normStatus(text: string | undefined): string {
  const s = (text ?? '').trim().toLowerCase();
  if (!s) return 'unknown';
  if (/^(partly|partially)\s+superseded/.test(s)) return 'partly-superseded';
  if (/^superseded/.test(s)) return 'superseded';
  if (/^deprecated/.test(s)) return 'deprecated';
  if (/^(accepted|approved|adopted|agreed|decided|done)\b/.test(s)) return 'accepted';
  if (/^(proposed|pending|draft|open|in review|under review)\b/.test(s)) return 'proposed';
  if (/^(rejected|declined|withdrawn)\b/.test(s)) return 'rejected';
  if (/^retired/.test(s)) return 'retired';
  return 'unknown';
}

/** Parse `---` YAML front matter at the top of a markdown file, keeping file lines. */
export function frontMatter(text: string, file: string): FrontMatter {
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
  const lineAt = (offset: number) => lc.linePos(offset).line + 1; // +1: the opening ---
  if (doc.errors.length > 0) {
    const e = doc.errors[0]!;
    return { error: { file, line: lineAt(e.pos[0]), message: `YAML: ${e.message.split('\n')[0]}` } };
  }
  const raw = (n: YNode | null | undefined): string => {
    if (!n) return '';
    if (isScalar(n)) {
      if (n.type === 'PLAIN' && n.range) return src.slice(n.range[0], n.range[1]).trim(); // keeps 0007, not 7
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
  const fields = new Map<string, Field>();
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

const RELATIONS: Record<string, { type: EdgeType; reverse: boolean }> = {
  supersedes: { type: 'supersedes', reverse: false },
  superseded_by: { type: 'supersedes', reverse: true },
  overrides: { type: 'overrides', reverse: false },
  overridden_by: { type: 'overrides', reverse: true },
  amends: { type: 'amends', reverse: false },
  amended_by: { type: 'amends', reverse: true },
  traces_to: { type: 'traces_to', reverse: false },
  constrains: { type: 'constrains', reverse: false },
  forbids: { type: 'forbids', reverse: false },
  enables: { type: 'enables', reverse: false },
  subsumes: { type: 'subsumes', reverse: false },
  conflicts_with: { type: 'conflicts_with', reverse: false },
  comprises: { type: 'comprises', reverse: false },
  alternative_to: { type: 'alternative_to', reverse: false },
  cites: { type: 'cites', reverse: false },
};

class Builder {
  nodes: GraphNode[] = [];
  edges: GraphEdge[] = [];
  problems: Problem[] = [];
  private ids = new Set<string>();
  private edgeKeys = new Set<string>();
  constructor(readonly root: string) {}

  has(id: string): boolean {
    return this.ids.has(id);
  }
  node(n: GraphNode): void {
    if (this.ids.has(n.id)) {
      this.problems.push({ file: n.file, line: n.line, message: `duplicate id ${n.id} (first one kept)` });
      return;
    }
    this.ids.add(n.id);
    this.nodes.push(n);
  }
  edge(e: GraphEdge): void {
    if (!e.from || !e.to || e.from === e.to) return;
    const k = `${e.from}\0${e.to}\0${e.type}`;
    if (this.edgeKeys.has(k)) return;
    this.edgeKeys.add(k);
    this.edges.push(e);
  }
}

function mdFiles(dir: string, recursive: boolean): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (recursive) out.push(...mdFiles(p, true));
    } else if (e.isFile() && e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

function loadTenets(b: Builder): void {
  const abs = join(b.root, MOLE_DIR, 'tenets.md');
  if (!existsSync(abs)) return;
  const file = `${MOLE_DIR}/tenets.md`;
  readFileSync(abs, 'utf8')
    .split(/\r?\n/)
    .forEach((l, i) => {
      const m = /^##\s+(tenet-[\w.-]+)\s*(.*)$/i.exec(l);
      if (!m) return;
      const retired = /\bretired\b/i.test(m[2] ?? '');
      const title = (m[2] ?? '')
        .replace(/^[·:\-–—\s]+/, '')
        .replace(/^retired\b[\s·:\-–—]*/i, '')
        .trim();
      b.node({ id: m[1]!, kind: 'tenet', title, status: retired ? 'retired' : 'accepted', format: 'tenets', file, line: i + 1, retired, scope: [], evidence: [], fields: { heading: i + 1 } });
    });
}

function str(f: Field | undefined): string | undefined {
  if (!f) return undefined;
  if (f.value !== undefined) return f.value;
  return f.items?.[0]?.value;
}

function relationEdges(b: Builder, id: string, fields: Map<string, Field>, file: string): void {
  for (const [key, rel] of Object.entries(RELATIONS)) {
    const f = fields.get(key);
    if (!f) continue;
    for (const it of f.items ?? []) {
      if (!it.value) continue;
      b.edge({ from: rel.reverse ? it.value : id, to: rel.reverse ? id : it.value, type: rel.type, file, line: it.line });
    }
  }
}

function loadMoleDecisions(b: Builder): void {
  for (const abs of mdFiles(join(b.root, MOLE_DIR, 'decisions'), false)) {
    const file = posix(relative(b.root, abs));
    const fm = frontMatter(readFileSync(abs, 'utf8'), file);
    if (!fm) {
      b.problems.push({ file, line: 1, message: 'no front matter (--- at line 1)' });
      continue;
    }
    if ('error' in fm) {
      b.problems.push(fm.error);
      continue;
    }
    const f = fm.fields;
    const id = str(f.get('id'));
    if (!id) {
      b.problems.push({ file, line: 1, message: 'front matter has no id' });
      continue;
    }
    const lines: Record<string, number> = {};
    for (const [k, v] of f) lines[k] = v.line;
    const scope: Anchor[] = (f.get('scope')?.items ?? []).filter((i) => i.value).map((i) => ({ target: i.value, file, line: i.line }));
    const evidence: EvidenceRef[] = (f.get('evidence')?.items ?? []).map((i) => {
      if (i.map?.incident !== undefined) return { incident: i.map.incident, file, line: i.line };
      return { test: i.map?.test ?? i.value, file, line: i.line };
    });
    const statusText = str(f.get('status'));
    b.node({
      id,
      kind: 'decision',
      title: str(f.get('title')) ?? id,
      status: normStatus(statusText),
      statusText,
      format: 'mole',
      door: str(f.get('door')),
      approver: str(f.get('approver')),
      confirmed: str(f.get('confirmed')) || undefined,
      source: str(f.get('source')),
      file,
      line: 1,
      scope,
      evidence,
      fields: lines,
    });
    if (!b.has(id) || b.nodes[b.nodes.length - 1]?.file !== file) continue; // duplicate id: keep the first record's edges only
    relationEdges(b, id, f, file);
    for (const a of scope) b.edge({ from: id, to: a.target, type: 'applies_to', file, line: a.line });
  }
}

function loadIntent(b: Builder): void {
  const dir = join(b.root, MOLE_DIR, 'intent');
  for (const abs of mdFiles(dir, true)) {
    const file = posix(relative(b.root, abs));
    const fm = frontMatter(readFileSync(abs, 'utf8'), file);
    if (fm && 'error' in fm) {
      b.problems.push(fm.error);
      continue;
    }
    const f = fm?.fields ?? new Map<string, Field>();
    const folder = str(f.get('folder')) ?? posix(relative(dir, abs)).replace(/\.md$/, '');
    const id = `intent:${folder}`;
    const lines: Record<string, number> = {};
    for (const [k, v] of f) lines[k] = v.line;
    b.node({ id, kind: 'intent', title: folder, status: 'recorded', format: 'mole', file, line: 1, scope: [{ target: `${folder}/`, file, line: f.get('folder')?.line ?? 1 }], evidence: [], fields: lines });
    for (const t of f.get('tenets')?.items ?? []) b.edge({ from: id, to: t.value, type: 'traces_to', file, line: t.line });
    b.edge({ from: id, to: `${folder}/`, type: 'applies_to', file, line: f.get('folder')?.line ?? 1 });
  }
}

function loadIncidents(b: Builder): void {
  for (const abs of mdFiles(join(b.root, MOLE_DIR, 'incidents'), false)) {
    const file = posix(relative(b.root, abs));
    const fm = frontMatter(readFileSync(abs, 'utf8'), file);
    if (fm && 'error' in fm) {
      b.problems.push(fm.error);
      continue;
    }
    const f = fm?.fields ?? new Map<string, Field>();
    const id = str(f.get('id')) ?? basename(abs, '.md');
    const lines: Record<string, number> = {};
    for (const [k, v] of f) lines[k] = v.line;
    b.node({ id, kind: 'incident', title: id, status: 'recorded', format: 'mole', file, line: 1, scope: [], evidence: [], fields: lines });
    for (const d of f.get('decisions')?.items ?? []) b.edge({ from: id, to: d.value, type: 'evidence_for', file, line: d.line });
  }
}

// ---- plain ADR folders

const SKIP = /template|^index\.md$|^readme\.md$/i;
const idOfName = (name: string): string | undefined => /^(adr[-_]?\d+|\d+)/i.exec(name)?.[1]?.toLowerCase().replace(/[-_]/, '');

const LINK = /\]\(([^)\s]+)\)/g;
const ADR_RELATIONS: Array<{ re: RegExp; type: EdgeType; reverse: boolean }> = [
  { re: /^superseded\s+by\b/i, type: 'supersedes', reverse: true },
  { re: /^(supersedes|replaces)\b/i, type: 'supersedes', reverse: false },
  { re: /^amended\s+by\b/i, type: 'amends', reverse: true },
  { re: /^amends\b/i, type: 'amends', reverse: false },
  { re: /^overridden\s+by\b/i, type: 'overrides', reverse: true },
  { re: /^overrides\b/i, type: 'overrides', reverse: false },
  { re: /^conflicts\s+with\b/i, type: 'conflicts_with', reverse: false },
  { re: /^(clarified\s+by)\b/i, type: 'cites', reverse: true },
  { re: /^clarifies\b/i, type: 'cites', reverse: false },
];

function loadAdrDir(b: Builder, dirArg: string): void {
  const dir = isAbsolute(dirArg) ? dirArg : join(b.root, dirArg);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    b.problems.push({ file: posix(relative(b.root, dir)) || dirArg, line: 1, message: 'ADR folder not found' });
    return;
  }
  const files = mdFiles(dir, false).filter((p) => !SKIP.test(basename(p)));
  // ids first, so status links resolve to ids
  const idOf = new Map<string, string>(); // file name -> id
  const byPrefix = new Map<string, string>(); // adr013 -> id (links to a renamed file still resolve)
  for (const abs of files) {
    const name = basename(abs);
    const pref = idOfName(name);
    let id = pref ?? name.replace(/\.md$/, '');
    if (b.has(id) || [...idOf.values()].includes(id)) id = posix(relative(b.root, abs));
    idOf.set(name, id);
    if (pref && !byPrefix.has(pref)) byPrefix.set(pref, id);
  }
  const resolveLink = (href: string): string | undefined => {
    const name = basename(href.split('#')[0] ?? '');
    if (!name.endsWith('.md')) return undefined;
    const pref = idOfName(name);
    return idOf.get(name) ?? (pref ? byPrefix.get(pref) ?? pref : undefined);
  };
  for (const abs of files) {
    const file = posix(relative(b.root, abs));
    const id = idOf.get(basename(abs))!;
    const text = readFileSync(abs, 'utf8');
    const lines = text.split(/\r?\n/);
    const fm = frontMatter(text, file);
    if (fm && 'error' in fm) {
      b.problems.push(fm.error);
      continue;
    }
    const start = fm ? fm.end : 0;
    let title = fm ? str(fm.fields.get('title')) : undefined;
    let titleLine = fm?.fields.get('title')?.line ?? 1;
    if (!title)
      for (let i = start; i < lines.length; i++) {
        const m = /^#\s+(.+)$/.exec(lines[i] ?? '');
        if (m) {
          title = m[1]!.trim();
          titleLine = i + 1;
          break;
        }
      }
    let status: string | undefined;
    let statusText: string | undefined;
    let statusLine = titleLine;
    const fields: Record<string, number> = { title: titleLine };
    const relLine = (line: string, n: number) => {
      const t = line.trim().replace(/^[-*]\s+/, '');
      for (const r of ADR_RELATIONS) {
        if (!r.re.test(t)) continue;
        for (const m of t.matchAll(LINK)) {
          const other = resolveLink(m[1]!);
          if (other) b.edge({ from: r.reverse ? other : id, to: r.reverse ? id : other, type: r.type, file, line: n });
        }
        return;
      }
    };
    // Nygard / adr-tools: ## Status section (first non-empty line = status; relation lines anywhere in it)
    const sIdx = lines.findIndex((l, i) => i >= start && /^#{2,3}\s+status\b/i.test(l));
    if (sIdx >= 0) {
      fields.status = sIdx + 1;
      for (let i = sIdx + 1; i < lines.length; i++) {
        const l = lines[i] ?? '';
        if (/^#{1,3}\s/.test(l)) break;
        if (!l.trim()) continue;
        if (statusText === undefined) {
          statusText = l.trim().replace(/^[-*]\s+/, '');
          statusLine = i + 1;
        }
        relLine(l, i + 1);
      }
      status = normStatus(statusText);
      if (statusText !== undefined) fields.status = statusLine; // the status sentence, not the heading
    }
    // backstage: :::note Superseded / :::note[Superseded] block (+ [superseded] in the title)
    const nIdx = lines.findIndex((l, i) => i >= start && /^:::\s*note[\s[]*superseded/i.test(l.trim()));
    if (nIdx >= 0) {
      status = 'superseded';
      statusText = 'Superseded';
      statusLine = nIdx + 1;
      fields.status = nIdx + 1;
      for (let i = nIdx + 1; i < lines.length && (lines[i] ?? '').trim() !== ':::'; i++) {
        const l = lines[i] ?? '';
        if (/superseded\s+by|replaced\s+by/i.test(l))
          for (const m of l.matchAll(LINK)) {
            const other = resolveLink(m[1]!);
            if (other) b.edge({ from: other, to: id, type: 'supersedes', file, line: i + 1 });
          }
      }
    } else if (status === undefined && title && /\[superseded\]/i.test(title)) {
      status = 'superseded';
      statusText = 'Superseded';
      statusLine = titleLine;
      fields.status = titleLine;
    }
    if (status === undefined) {
      // backstage records carry no status: a published record is accepted; a bare Nygard file without a Status is unknown
      status = fm ? 'accepted' : 'unknown';
      statusText = status;
    }
    if (fields.status === undefined) fields.status = statusLine;
    b.node({ id, kind: 'decision', title: title ?? id, status, statusText, format: fm ? 'backstage' : 'nygard', file, line: 1, scope: [], evidence: [], fields });
  }
}

/** Load the decision graph of a repository: Mole records under .mole/ plus any plain ADR folders. */
export function loadGraph(root: string, opts: LoadOptions = {}): DecisionGraph {
  const b = new Builder(root);
  loadTenets(b);
  loadMoleDecisions(b);
  loadIntent(b);
  loadIncidents(b);
  for (const d of opts.adrDirs ?? []) if (d) loadAdrDir(b, d);
  return { root, nodes: b.nodes, edges: b.edges, problems: b.problems };
}
