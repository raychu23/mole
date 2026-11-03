// T58: incidents revive recorded dissent (plan update 11-01 §6 steps 1-5; prior art: tasks/T58-incident-dissent-revival/4 log/prior-art.md).
//
//   suggest   read-only advice. A candidate is a LOSING argument (grounded label 'out') in the attack neighbourhood of a
//             decision the incident shares a node with: named in its `decisions:` list, or whose `scope:` overlaps the
//             incident's `scope:` (Graphiti get_edge_invalidation_candidates: must share a node; similarity only ranks).
//             Ranked by char-3gram Jaccard between the incident text and the argument text. No LLM.
//   accept    the person's step. Writes `<incident>: title` attacking every IN attacker of the dissent into
//             .mole/arguments/incidents.argdown (Dung reinstatement) and `revives: [arg]` into the incident record.
//   dismiss   records `dismissed: [arg]` in the incident record only.
// Decision records are never written: a decision turns contested/defeated only because the engine re-labels its arguments.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { evaluate, type Label } from '@mole/reasoning';
import { argumentFramework } from '../argdown/framework.js';
import { frontMatter, loadGraph } from '../graph.js';
import type { DecisionGraph, GraphNode } from '../types.js';

export class IncidentError extends Error {}

export interface RevivalEvidence {
  kind: 'decision' | 'scope' | 'text';
  value: string;
  /** record + line the evidence comes from */
  file: string;
  line: number;
}

export interface RevivalCandidate {
  incident: string;
  /** the losing argument the incident may vindicate */
  argument: string;
  text: string;
  label: Label;
  /** the decision whose reasoning it lost in */
  decision: string;
  /** its current IN attackers -- what accept would attack */
  attackers: string[];
  /** other arguments that go out -> in if this is accepted (dry run): the knock-on the person approves along with it */
  alsoReinstates: string[];
  score: number;
  evidence: RevivalEvidence[];
}

const ARG_FILE = '.mole/arguments/incidents.argdown';
/** the incident's argument id: the record id itself is already taken by the incident node (the loader keeps the first id) */
export const incidentArgumentId = (incidentId: string): string => `incident-${incidentId}`;
const MAX_HOPS = 3;

interface IncidentRecord {
  id: string;
  file: string;
  text: string;
  title: string;
  decisions: Array<{ value: string; line: number }>;
  scope: Array<{ value: string; line: number }>;
  revives: string[];
  dismissed: string[];
}

function readIncident(root: string, graph: DecisionGraph, id: string): IncidentRecord {
  const node = graph.nodes.find((n) => n.kind === 'incident' && n.id === id);
  if (!node) throw new IncidentError(`no incident record with id '${id}' in .mole/incidents`);
  const text = readFileSync(join(root, node.file), 'utf8');
  const fm = frontMatter(text, node.file);
  if (!fm || 'error' in fm) throw new IncidentError(`incident ${id}: unreadable front matter in ${node.file}`);
  const items = (k: string) => (fm.fields.get(k)?.items ?? []).filter((i) => i.value).map((i) => ({ value: i.value!, line: i.line }));
  const one = (k: string) => fm.fields.get(k)?.value ?? fm.fields.get(k)?.items?.[0]?.value;
  const lines = text.split(/\r?\n/);
  const close = lines.indexOf('---', 1);
  const body = close > 0 ? lines.slice(close + 1).join('\n') : '';
  const title = one('title') ?? id;
  return {
    id,
    file: node.file,
    title,
    text: `${title}\n${body}`,
    decisions: items('decisions'),
    scope: items('scope'),
    revives: items('revives').map((i) => i.value),
    dismissed: items('dismissed').map((i) => i.value),
  };
}

/** '<id>: text' on the argument's own definition line (the parser keys items by title only). */
function argumentText(root: string, n: GraphNode): string {
  try {
    const l = readFileSync(join(root, n.file), 'utf8').split(/\r?\n/)[n.line - 1] ?? '';
    return /[>\]]\s*:\s*(.*)$/.exec(l)?.[1]?.trim() ?? '';
  } catch {
    return '';
  }
}

function trigrams(s: string): Set<string> {
  const t = ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= t.length; i++) out.add(t.slice(i, i + 3));
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** paths overlap when one is a prefix of the other at a path boundary (src/cache/ vs src/cache/prices.ts) */
function overlaps(a: string, b: string): boolean {
  const norm = (p: string) => p.replace(/^\.\//, '').replace(/#.*$/, '');
  const [x, y] = [norm(a), norm(b)];
  const under = (p: string, dir: string) => p === dir || p.startsWith(dir.endsWith('/') ? dir : `${dir}/`);
  return under(x, y) || under(y, x);
}

interface Evaluated {
  graph: DecisionGraph;
  labels: Record<string, Label>;
  attacks: [string, string][];
}

function evaluated(root: string): Evaluated {
  const graph = loadGraph(root);
  const { framework } = argumentFramework(graph);
  return { graph, labels: evaluate(framework).labels, attacks: framework.attacks };
}

/** Arguments within MAX_HOPS attack edges (either direction) of the decision's cited arguments. */
function neighbourhood(ev: Evaluated, decisionId: string): Set<string> {
  const isArg = new Set(ev.graph.nodes.filter((n) => n.kind === 'argument').map((n) => n.id));
  let frontier = ev.graph.edges.filter((e) => e.type === 'cites' && e.from === decisionId && isArg.has(e.to)).map((e) => e.to);
  const seen = new Set(frontier);
  for (let hop = 0; hop < MAX_HOPS && frontier.length; hop++) {
    const next: string[] = [];
    for (const [a, b] of ev.attacks) {
      for (const [x, y] of [[a, b], [b, a]] as const) if (frontier.includes(x) && !seen.has(y)) (seen.add(y), next.push(y));
    }
    frontier = next;
  }
  return seen;
}

/** arguments that would go out -> in if `inc` attacked `targets` (the same framework, one more argument) */
function dryRun(ev: Evaluated, inc: string, targets: string[]): string[] {
  const ids = new Set(Object.keys(ev.labels));
  const attacks: [string, string][] = [...ev.attacks, ...targets.map((t) => [inc, t] as [string, string])];
  const after = evaluate({ args: [...ids, ...(ids.has(inc) ? [] : [inc])].map((id) => ({ id })), attacks }).labels;
  return [...ids].filter((id) => ev.labels[id] === 'out' && after[id] === 'in').sort();
}

function candidates(root: string, ev: Evaluated, inc: IncidentRecord): RevivalCandidate[] {
  const decided = new Set([...inc.revives, ...inc.dismissed]);
  const incText = trigrams(inc.text);
  const nodes = new Map(ev.graph.nodes.map((n) => [n.id, n] as const));
  const byArg = new Map<string, RevivalCandidate>();
  for (const d of ev.graph.nodes.filter((n) => n.kind === 'decision').sort((a, b) => a.id.localeCompare(b.id))) {
    const ties: RevivalEvidence[] = [];
    const named = inc.decisions.find((x) => x.value === d.id);
    if (named) ties.push({ kind: 'decision', value: d.id, file: inc.file, line: named.line });
    for (const s of inc.scope) if (d.scope.some((a) => overlaps(a.target, s.value))) ties.push({ kind: 'scope', value: s.value, file: inc.file, line: s.line });
    if (ties.length === 0) continue; // text overlap alone never admits a candidate
    // a dissent is a losing argument that is NOT one the decision itself rests on (an incident knocking out the
    // decision's own argument is the result of an accept, not a new candidate) and not already hit by an incident
    const own = new Set(ev.graph.edges.filter((e) => e.type === 'cites' && e.from === d.id).map((e) => e.to));
    const hitByIncident = new Set(ev.attacks.filter(([a]) => a.startsWith('incident-')).map(([, b]) => b));
    for (const arg of [...neighbourhood(ev, d.id)].sort()) {
      if (ev.labels[arg] !== 'out' || decided.has(arg) || byArg.has(arg) || own.has(arg) || hitByIncident.has(arg)) continue;
      const n = nodes.get(arg)!;
      const text = argumentText(root, n);
      const score = Math.round(jaccard(incText, trigrams(text)) * 1000) / 1000;
      const attackers = ev.attacks.filter(([a, b]) => b === arg && ev.labels[a] === 'in').map(([a]) => a).sort();
      const alsoReinstates = dryRun(ev, incidentArgumentId(inc.id), attackers).filter((x) => x !== arg);
      byArg.set(arg, {
        incident: inc.id,
        argument: arg,
        text,
        label: ev.labels[arg]!,
        decision: d.id,
        attackers,
        alsoReinstates,
        score,
        evidence: [...ties, { kind: 'text', value: `char-3gram Jaccard ${score}`, file: n.file, line: n.line }],
      });
    }
  }
  return [...byArg.values()].sort((a, b) => b.score - a.score || a.argument.localeCompare(b.argument));
}

export function suggestRevivals(root: string, incidentId: string): RevivalCandidate[] {
  const ev = evaluated(root);
  return candidates(root, ev, readIncident(root, ev.graph, incidentId));
}

/** Add `item` to the front-matter list `key` of the record (creating `key: [item]` before the closing ---). */
function addToList(root: string, file: string, key: string, item: string): boolean {
  const path = join(root, file);
  const text = readFileSync(path, 'utf8');
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const close = lines.indexOf('---', 1);
  if (lines[0] !== '---' || close < 0) throw new IncidentError(`${file}: no front matter`);
  const at = lines.findIndex((l, i) => i > 0 && i < close && new RegExp(`^${key}:`).test(l));
  if (at < 0) {
    lines.splice(close, 0, `${key}: [${item}]`);
  } else {
    const m = /^[^:]+:\s*\[(.*)\]\s*$/.exec(lines[at]!);
    if (!m) throw new IncidentError(`${file}:${at + 1}: ${key} must be a [list] to add to it`);
    const items = m[1]!.split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
    if (items.includes(item)) return false;
    lines[at] = `${key}: [${[...items, item].join(', ')}]`;
  }
  writeFileSync(path, lines.join(nl));
  return true;
}

const ARG_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export interface IncidentWrite {
  incident: string;
  argument: string;
  written: string[];
  /** accept only: the other arguments the accepted attack brought back (same list suggest showed) */
  alsoReinstates?: string[];
}

export function acceptIncident(root: string, incidentId: string, argumentId: string): IncidentWrite {
  const ev = evaluated(root);
  const inc = readIncident(root, ev.graph, incidentId);
  if (!ARG_ID.test(inc.id)) throw new IncidentError(`incident id '${inc.id}' cannot be an Argdown argument title`);
  if (inc.dismissed.includes(argumentId)) throw new IncidentError(`${argumentId} was already dismissed for ${inc.id}`);
  const written: string[] = [];
  let alsoReinstates: string[] = [];
  if (!inc.revives.includes(argumentId)) {
    const c = candidates(root, ev, inc).find((x) => x.argument === argumentId);
    if (!c) throw new IncidentError(`${argumentId} is not a candidate for ${inc.id} (run: mole incident suggest ${inc.id})`);
    alsoReinstates = c.alsoReinstates;
    // the argument first: a crash after it leaves an attack with no `revives:` line, and re-running accept completes it
    const argPath = join(root, ARG_FILE);
    const existing = existsSync(argPath) ? readFileSync(argPath, 'utf8') : '';
    const have = new Set([...existing.matchAll(new RegExp(`^\\s+-> <([^>]+)>`, 'gm'))].map((m) => m[1]));
    const argId = incidentArgumentId(inc.id);
    const head = new RegExp(`^<${argId.replace(/[.]/g, '\\.')}>`, 'm').test(existing);
    const block = [
      ...(head ? [`<${argId}>`] : [`<${argId}>: ${inc.title.replace(/\s+/g, ' ').trim()}`]),
      ...c.attackers.filter((a) => !(head && have.has(a))).map((a) => `  -> <${a}>`),
      '',
    ];
    writeFileSync(argPath, `${existing}${existing && !existing.endsWith('\n') ? '\n' : ''}${existing ? '\n' : ''}${block.join('\n')}`);
    written.push(ARG_FILE);
    addToList(root, inc.file, 'revives', argumentId);
    written.push(inc.file);
  }
  return { incident: inc.id, argument: argumentId, written, alsoReinstates };
}

export function dismissIncident(root: string, incidentId: string, argumentId: string): IncidentWrite {
  const ev = evaluated(root);
  const inc = readIncident(root, ev.graph, incidentId);
  if (inc.revives.includes(argumentId)) throw new IncidentError(`${argumentId} was already accepted for ${inc.id}; dismissing it would need a new record, not an edit`);
  const written = addToList(root, inc.file, 'dismissed', argumentId) ? [inc.file] : [];
  return { incident: inc.id, argument: argumentId, written };
}
