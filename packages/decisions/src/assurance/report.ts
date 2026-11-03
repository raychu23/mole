// T78 (D65): per-link assurance on `door: one-way` decisions only. See `GraphNode.door` (graph.ts) --
// door is a human-authored front-matter string; this module NEVER infers it (prior-art.md: Mole has no
// door classifier, and 0/146 real vendored ADRs carry a door field at all). A record with no
// `door: one-way` is simply outside assurance's scope.
import { readFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { frontMatter, loadGraph } from '../graph.js';
import { ALCOA_PLUS_ATTRS, type AlcoaAttr, type AssuranceFolder, type AssuranceLink, type AssuranceReport } from '../types.js';

const posix = (p: string) => p.split(sep).join('/');

function parseAlcoa(raw: string | undefined): AlcoaAttr[] {
  if (!raw) return [];
  const have = new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
  return ALCOA_PLUS_ATTRS.filter((a) => have.has(a));
}

/** Reads the `assurance:` front-matter list of one `.mole/decisions/*.md` record. Returns one
 * AssuranceLink per list item; a `to` field is required (it says which link this entry assures) and a
 * missing one is dropped rather than guessed. */
export function parseAssurance(text: string, file: string): AssuranceLink[] {
  const fm = frontMatter(text, file);
  if (!fm || 'error' in fm) return [];
  const field = fm.fields.get('assurance');
  const out: AssuranceLink[] = [];
  for (const item of field?.items ?? []) {
    const m = item.map;
    if (!m?.to) continue;
    out.push({
      to: m.to,
      doubt: m.doubt as AssuranceLink['doubt'],
      provenance: m.provenance as AssuranceLink['provenance'],
      author: m.author,
      approver: m.approver,
      alcoa: parseAlcoa(m.alcoa),
      reverifyBy: m.reverify_by,
      file,
      line: item.line,
    });
  }
  return out;
}

function isAssured(link: AssuranceLink, today: string): boolean {
  if (!link.doubt || !link.provenance) return false;
  if (!link.author || !link.approver || link.author === link.approver) return false;
  if (link.alcoa.length !== ALCOA_PLUS_ATTRS.length) return false;
  if (!link.reverifyBy || link.reverifyBy < today) return false;
  return true;
}

export interface AssuranceOptions {
  /** restrict to decision records whose file lives under this repo-relative folder */
  folder?: string;
  /** ISO date to treat as "today" for overdue checks; defaults to the real clock */
  today?: string;
}

type Slot = { decisionId: string; link: AssuranceLink };

/** The folder(s) a decision governs: one per `scope:` anchor ('folder/' as-is, 'path' or
 * 'path#Symbol' reduced to its directory), or the record file's own folder when there is no scope --
 * a one-way door decision always lands in at least one folder, never silently uncounted. */
function governedFolders(scopeTargets: string[], recordFile: string): string[] {
  if (scopeTargets.length === 0) return [posix(dirname(recordFile))];
  const folders = scopeTargets.map((t) => {
    const clean = t.replace(/#.*$/, '');
    return posix(clean.endsWith('/') ? clean.slice(0, -1) : dirname(clean));
  });
  return [...new Set(folders)];
}

/** `mole assurance [--folder X] [--json]`: assured share of door: one-way decisions, grouped by the
 * folder(s) they govern (their `scope:` anchors), plus every overdue re-verification. Read-only, no
 * model call -- see this file's header for why door is never inferred. */
export function assuranceReport(root: string, opts: AssuranceOptions = {}): AssuranceReport {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const wantFolder = opts.folder ? posix(opts.folder).replace(/\/$/, '') : undefined;
  const graph = loadGraph(root);
  const byFolder = new Map<string, { oneWayDoors: number; slots: Slot[] }>();
  for (const n of graph.nodes) {
    if (n.kind !== 'decision' || n.door !== 'one-way') continue;
    const folders = governedFolders(n.scope.map((a) => a.target), n.file).filter((f) => !wantFolder || f === wantFolder);
    if (folders.length === 0) continue;
    let text: string;
    try {
      text = readFileSync(resolve(root, n.file), 'utf8');
    } catch {
      continue; // an unreadable file would already be a graph problem; this report doesn't duplicate that
    }
    const links = parseAssurance(text, n.file);
    const slots: Slot[] = links.length
      ? links.map((link) => ({ decisionId: n.id, link }))
      // an unassured one-way door with no `assurance:` entries at all is one unassured slot, not zero
      : [{ decisionId: n.id, link: { to: '(none)', alcoa: [], file: n.file, line: n.line } }];
    for (const folder of folders) {
      const bucket = byFolder.get(folder) ?? { oneWayDoors: 0, slots: [] };
      bucket.oneWayDoors++;
      bucket.slots.push(...slots);
      byFolder.set(folder, bucket);
    }
  }
  const folders: AssuranceFolder[] = [];
  let totalOneWayDoors = 0;
  let totalLinks = 0;
  let totalAssured = 0;
  for (const [folder, bucket] of [...byFolder.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    let assured = 0;
    const overdue: AssuranceFolder['overdue'] = [];
    for (const { decisionId, link } of bucket.slots) {
      if (isAssured(link, today)) assured++;
      if (link.reverifyBy && link.reverifyBy < today) overdue.push({ decisionId, to: link.to, reverifyBy: link.reverifyBy, file: link.file, line: link.line });
    }
    folders.push({ folder, oneWayDoors: bucket.oneWayDoors, links: bucket.slots.length, assured, assuredShare: bucket.slots.length ? assured / bucket.slots.length : 0, overdue });
    totalOneWayDoors += bucket.oneWayDoors;
    totalLinks += bucket.slots.length;
    totalAssured += assured;
  }
  return { root, generatedAt: new Date().toISOString(), folders, totalOneWayDoors, totalLinks, totalAssured, assuredShare: totalLinks ? totalAssured / totalLinks : 0 };
}

function formatAssurance(r: AssuranceReport): string {
  const out: string[] = [];
  if (r.folders.length === 0) out.push('mole assurance: no door: one-way decision records found');
  for (const f of r.folders) {
    out.push(`${f.folder}  one-way=${f.oneWayDoors}  links=${f.links}  assured=${f.assured}/${f.links} (${(f.assuredShare * 100).toFixed(0)}%)`);
    for (const o of f.overdue) out.push(`  overdue  ${o.decisionId} -> ${o.to}  reverify_by ${o.reverifyBy}  ${o.file}:${o.line}`);
  }
  out.push(`total: ${r.totalAssured}/${r.totalLinks} assured (${(r.assuredShare * 100).toFixed(0)}%) across ${r.totalOneWayDoors} one-way door record(s)`);
  return out.join('\n');
}

const str = (v: string | true | undefined): string | undefined => (typeof v === 'string' ? v : undefined);

/** CLI entry used by packages/daemon/src/cli.ts. */
export function assuranceCli(_pos: string[], flags: Record<string, string | true>, root: string): number {
  const r = assuranceReport(root, { folder: str(flags.folder) });
  console.log(flags.json ? JSON.stringify(r, null, 2) : formatAssurance(r));
  return 0;
}
