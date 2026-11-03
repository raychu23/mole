// T60: tenets reranked as priorities shift (launch → scale). Prior art: tasks/T60-phase-priorities/4 log/prior-art.md.
//
//   .mole/priorities.md    `## <phase> · from YYYY-MM-DD` headings, each followed by an ordered list of tenet ids
//                          (`1. tenet-x` or `- tenet-x`), most preferred first = a Bench-Capon audience
//   #tenet-x tag           on an argument's Argdown definition line = the value it promotes
//   evaluatePhase          the engine (@mole/reasoning evaluate) under that phase's audience; no phase = no audience
//   comparePhases          every argument whose label differs, with the attacks whose success flipped (both tenets,
//                          both ranks) or the changed attackers it moved through, plus decisions resting on them
// Read-only. Records are never written except by setPriorities (T73: a person's CLI act, never MCP).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { evaluate, type Label } from '@mole/reasoning';
import { argumentDefinitions } from './argdown/definitions.js';
import { argumentFramework } from './argdown/framework.js';
import { loadGraph } from './graph.js';
import type { DecisionGraph } from './types.js';

export class PrioritiesError extends Error {}

export interface Phase {
  name: string;
  from: string;
  /** tenet ids, most preferred first */
  order: string[];
  file: string;
  line: number;
}

const FILE = '.mole/priorities.md';
const HEADING = /^##\s+([A-Za-z0-9][\w.-]*)\s*(?:[·:\-–—]\s*)?from\s+(\S+)\s*$/i;
const ITEM = /^\s*(?:\d+[.)]|[-*])\s+(\S+)\s*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function tenetIds(graph: DecisionGraph): Set<string> {
  return new Set(graph.nodes.filter((n) => n.kind === 'tenet').map((n) => n.id));
}

export function readPriorities(root: string, graph: DecisionGraph = loadGraph(root)): Phase[] {
  const path = join(root, FILE);
  if (!existsSync(path)) return [];
  const tenets = tenetIds(graph);
  const phases: Phase[] = [];
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  let cur: Phase | undefined;
  lines.forEach((l, i) => {
    const at = `${FILE}:${i + 1}`;
    const h = /^##\s/.test(l) ? HEADING.exec(l) : null;
    if (/^##\s/.test(l)) {
      if (!h) throw new PrioritiesError(`phase heading must be '## <name> · from YYYY-MM-DD' (${at})`);
      const [, name, from] = h as unknown as [string, string, string];
      // review 1 LOW: Date.parse rolls 2026-02-30 over to March; round-trip the date to catch impossible days
      if (!DATE.test(from) || new Date(`${from}T00:00:00Z`).toISOString().slice(0, 10) !== from) throw new PrioritiesError(`phase ${name}: '${from}' is not a YYYY-MM-DD date (${at})`);
      const prev = phases[phases.length - 1];
      if (prev && from <= prev.from) throw new PrioritiesError(`phase ${name} must start after ${prev.name} (${prev.from}) (${at})`);
      if (phases.some((p) => p.name === name)) throw new PrioritiesError(`phase ${name} is defined twice (${at})`);
      cur = { name, from, order: [], file: FILE, line: i + 1 };
      phases.push(cur);
      return;
    }
    const m = ITEM.exec(l);
    if (!m || !cur) return;
    const t = m[1]!;
    if (!tenets.has(t)) throw new PrioritiesError(`phase ${cur.name}: ${t} is not a tenet in .mole/tenets.md (${at})`);
    if (cur.order.includes(t)) throw new PrioritiesError(`phase ${cur.name}: ${t} is ranked twice (${at})`);
    cur.order.push(t);
  });
  return phases;
}

/** The phase in force on `date`: the latest one whose `from` is on or before it. */
export function phaseAt(phases: Phase[], date: string): Phase {
  if (!DATE.test(date)) throw new PrioritiesError(`'${date}' is not a YYYY-MM-DD date`);
  const p = [...phases].reverse().find((x) => x.from <= date);
  if (!p) throw new PrioritiesError(phases.length ? `${date} is before the first phase (${phases[0]!.name} from ${phases[0]!.from})` : `no phases in ${FILE}`);
  return p;
}

/** argument id -> the tenet its DEFINITION line tags (#tenet-x; review 1: not node.line, which may be an earlier bare
 *  reference). Unknown tenet, or two definitions with different tenet tags, refused with file:line.
 *  T68: exported so packages/decisions/src/incidents/revive.ts and @mole/proposals can apply the same phase's
 *  audience to their own evaluations (one source of truth, AGENTS.md #5), instead of a second tag reader. */
export function tenetValues(graph: DecisionGraph): Map<string, string> {
  const tenets = tenetIds(graph);
  const out = new Map<string, string>();
  for (const [id, defs] of argumentDefinitions(graph)) {
    const tagged = defs.map((d) => ({ d, t: d.tags.filter((x) => x.startsWith('tenet-')).pop() })).filter((x) => x.t);
    if (tagged.length === 0) continue;
    const distinct = [...new Set(tagged.map((x) => x.t))];
    if (distinct.length > 1) throw new PrioritiesError(`argument ${id} is tagged with different tenets: ${tagged.map((x) => `#${x.t} (${x.d.file}:${x.d.line})`).join(', ')}`);
    const { d, t } = tagged[0]!;
    if (!tenets.has(t!)) throw new PrioritiesError(`argument ${id} is tagged #${t}, which is not a tenet (${d.file}:${d.line})`);
    out.set(id, t!);
  }
  return out;
}

export type DecisionState = 'holds' | 'contested' | 'defeated' | 'uncited';

export interface PhaseEvaluation {
  phase?: string;
  audience?: string[];
  labels: Record<string, Label>;
  decisions: Array<{ id: string; title: string; state: DecisionState; cites: string[]; file: string; line: number }>;
}

function decisionStates(graph: DecisionGraph, labels: Record<string, Label>): PhaseEvaluation['decisions'] {
  const args = new Set(Object.keys(labels));
  return graph.nodes
    .filter((n) => n.kind === 'decision')
    .map((d) => {
      const cites = [...new Set(graph.edges.filter((e) => e.type === 'cites' && e.from === d.id && args.has(e.to)).map((e) => e.to))].sort();
      const ls = cites.map((c) => labels[c]!);
      const state: DecisionState = ls.length === 0 ? 'uncited' : ls.includes('out') ? 'defeated' : ls.includes('undecided') ? 'contested' : 'holds';
      return { id: d.id, title: d.title, state, cites, file: d.file, line: d.line };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

interface Loaded {
  graph: DecisionGraph;
  phases: Phase[];
  values: Map<string, string>;
  attacks: [string, string][];
  args: string[];
}

function load(root: string): Loaded {
  const graph = loadGraph(root);
  const phases = readPriorities(root, graph);
  const values = tenetValues(graph);
  const { framework } = argumentFramework(graph);
  return { graph, phases, values, attacks: framework.attacks, args: framework.args.map((a) => a.id) };
}

function run(l: Loaded, phase?: Phase): PhaseEvaluation {
  const labels = evaluate({ args: l.args.map((id) => ({ id, ...(l.values.has(id) ? { value: l.values.get(id)! } : {}) })), attacks: l.attacks }, phase?.order).labels;
  return { ...(phase ? { phase: phase.name, audience: phase.order } : {}), labels, decisions: decisionStates(l.graph, labels) };
}

/** Resolve a `{ phase, at }` selector against an explicit phase list (no graph/file I/O): `phase` by name,
 *  `at` = the phase in force on that date, neither = no audience. T68: exported so incident/proposals callers
 *  that already loaded their own `Phase[]` do not re-implement this resolution rule. */
export function selectPhase(phases: Phase[], sel: { phase?: string; at?: string }): Phase | undefined {
  if (sel.phase !== undefined) {
    const p = phases.find((x) => x.name === sel.phase);
    if (!p) throw new PrioritiesError(`no phase '${sel.phase}' in ${FILE} (have: ${phases.map((x) => x.name).join(', ') || 'none'})`);
    return p;
  }
  if (sel.at !== undefined) return phaseAt(phases, sel.at);
  return undefined;
}

function pick(l: Loaded, sel: { phase?: string; at?: string }): Phase | undefined {
  return selectPhase(l.phases, sel);
}

/** Labels + decision states under one phase's tenet order (`phase` name or the phase in force `at` a date); neither = no audience.
 *  Unchanged T60 behaviour: with neither `phase` nor `at`, this is plain Dung (no audience) -- `mole priorities`'s own default.
 *  T68's incident/proposals tools use `phaseInForce` below instead, whose default is the phase in force today. */
export function evaluatePhase(root: string, sel: { phase?: string; at?: string } = {}): PhaseEvaluation {
  const l = load(root);
  return run(l, pick(l, sel));
}

export const today = (): string => new Date().toISOString().slice(0, 10);

/** T68 D93: the phase selector for incident suggest / proposals compare and their MCP tools. Explicit `phase` or
 *  `at` wins; absent both, the phase in force TODAY (matching mole_priorities's own pre-existing doc comment,
 *  reasoning-tools.ts, which `evaluatePhase`'s own default never implemented); no `.mole/priorities.md` = no
 *  audience, same fallback T60 already uses. Each caller resolves against its OWN root's phases (its own file),
 *  so a proposal/baseline pair with different priorities.md files is still compared fairly, one side at a time. */
export function phaseInForce(root: string, sel: { phase?: string; at?: string } = {}, graph?: DecisionGraph): Phase | undefined {
  const phases = readPriorities(root, graph);
  if (sel.phase !== undefined || sel.at !== undefined) return selectPhase(phases, sel);
  return phases.length ? phaseAt(phases, today()) : undefined;
}

export interface FlippedAttack {
  from: string;
  to: string;
  fromValue: string;
  toValue: string;
  before: { succeeds: boolean; ranks: [number, number] };
  after: { succeeds: boolean; ranks: [number, number] };
}

export interface PhaseComparison {
  from: string;
  to: string;
  arguments: Array<{ id: string; before: Label; after: Label; flipped: FlippedAttack[]; via: string[] }>;
  decisions: Array<{ id: string; title: string; before: DecisionState; after: DecisionState; because: string[]; file: string; line: number }>;
}

/** Bench-Capon rule, same as engine.ts attackSucceeds: fails only if both values ranked and the target's is preferred */
function succeeds(order: string[], va?: string, vb?: string): boolean {
  if (va === undefined || vb === undefined) return true;
  const ia = order.indexOf(va);
  const ib = order.indexOf(vb);
  return ia === -1 || ib === -1 || !(ib < ia);
}

export function comparePhases(root: string, a: string, b: string): PhaseComparison {
  const l = load(root);
  const pa = pick(l, { phase: a })!;
  const pb = pick(l, { phase: b })!;
  return diffPhases(l, pa, pb);
}

/** Shared by comparePhases (two named phases) and compareWithOrder (T73: a what-if order, never a named phase). */
function diffPhases(l: Loaded, pa: { name: string; order: string[] }, pb: { name: string; order: string[] }): PhaseComparison {
  const ea = run(l, pa as Phase);
  const eb = run(l, pb as Phase);
  const changed = l.args.filter((id) => ea.labels[id] !== eb.labels[id]).sort();
  const changedSet = new Set(changed);
  const rank = (order: string[], v: string) => order.indexOf(v) + 1; // 1-based, 0 = unranked
  const argumentsChanged = changed.map((id) => {
    const incoming = l.attacks.filter(([, t]) => t === id);
    const flipped: FlippedAttack[] = [];
    for (const [f, t] of incoming) {
      const vf = l.values.get(f);
      const vt = l.values.get(t);
      const sa = succeeds(pa.order, vf, vt);
      const sb = succeeds(pb.order, vf, vt);
      if (sa === sb || vf === undefined || vt === undefined) continue;
      flipped.push({ from: f, to: t, fromValue: vf, toValue: vt, before: { succeeds: sa, ranks: [rank(pa.order, vf), rank(pa.order, vt)] }, after: { succeeds: sb, ranks: [rank(pb.order, vf), rank(pb.order, vt)] } });
    }
    // no flipped attack of its own: it moved because an attacker's label changed
    const via = flipped.length ? [] : [...new Set(incoming.map(([f]) => f).filter((f) => changedSet.has(f)))].sort();
    return { id, before: ea.labels[id]!, after: eb.labels[id]!, flipped, via };
  });
  const decisions = ea.decisions
    .map((d) => ({ d, e: eb.decisions.find((x) => x.id === d.id)! }))
    .filter(({ d, e }) => d.state !== e.state)
    .map(({ d, e }) => ({ id: d.id, title: d.title, before: d.state, after: e.state, because: d.cites.filter((c) => changedSet.has(c)), file: d.file, line: d.line }));
  return { from: pa.name, to: pb.name, arguments: argumentsChanged, decisions };
}

/** T73: `mole priorities set --phase P --order a,b,c` -- a person's act (never over MCP, which stays read-only,
 *  T61). Updates an existing phase's order in place (same `from` date, same position in the file) or, for a
 *  phase name not yet in the file, appends a new phase dated today, after the latest one (same ordering
 *  invariant readPriorities already enforces). Every tenet must exist and be ranked once, like readPriorities.
 *  Re-reads the written file through readPriorities before returning, so a malformed write is caught HERE
 *  (round trip, T73 done-when 3), not by the next CLI call. */
export function setPriorities(root: string, phase: string, order: string[], graph: DecisionGraph = loadGraph(root)): Phase[] {
  if (order.length === 0) throw new PrioritiesError('order must list at least one tenet');
  const tenets = tenetIds(graph);
  const seen = new Set<string>();
  for (const t of order) {
    if (!tenets.has(t)) throw new PrioritiesError(`${t} is not a tenet in .mole/tenets.md`);
    if (seen.has(t)) throw new PrioritiesError(`${t} is ranked twice`);
    seen.add(t);
  }
  const path = join(root, FILE);
  const text = existsSync(path) ? readFileSync(path, 'utf8') : '# Priorities\n';
  const lines = text.split(/\r?\n/);
  const items = order.map((t, i) => `${i + 1}. ${t}`);
  const headingIdx = lines.findIndex((l) => { const h = /^##\s/.test(l) ? HEADING.exec(l) : null; return !!h && h[1] === phase; });
  if (headingIdx !== -1) {
    let nextHeadingIdx = lines.length;
    for (let i = headingIdx + 1; i < lines.length; i++) {
      if (/^##\s/.test(lines[i]!)) { nextHeadingIdx = i; break; }
    }
    const out = [...lines.slice(0, headingIdx + 1), '', ...items, '', ...lines.slice(nextHeadingIdx)];
    writeFileSync(path, out.join('\n'));
  } else {
    const existing = readPriorities(root, graph); // validates the EXISTING file first (file:line errors as usual)
    const last = existing[existing.length - 1];
    const from = today();
    if (last && from <= last.from) throw new PrioritiesError(`a new phase must start after ${last.name} (${last.from}); today (${from}) is not after it`);
    const out = [text.replace(/\s+$/, ''), '', `## ${phase} · from ${from}`, '', ...items, ''];
    writeFileSync(path, out.join('\n'));
  }
  return readPriorities(root, graph); // round trip: the write this function just made, re-parsed
}

/** T73: the panel's/CLI's \"compare with order X\" what-if -- the engine judged under an arbitrary tenet order
 *  that is NEVER read from or written to .mole/priorities.md (STOP clause: a what-if never writes). `name`
 *  labels the result (default 'what-if'); every tenet in `order` must exist, like a stored phase's order. */
export function evaluateOrder(root: string, order: string[], name = 'what-if'): PhaseEvaluation {
  const l = load(root);
  const tenets = tenetIds(l.graph);
  for (const t of order) if (!tenets.has(t)) throw new PrioritiesError(`${t} is not a tenet in .mole/tenets.md`);
  return run(l, { name, from: '', order, file: FILE, line: 0 });
}

/** T73: the phase in force (or a named/`--at` phase, same selector evaluatePhase/phaseInForce use) compared
 *  against a what-if order -- never read from or written to .mole/priorities.md. No phase in force (or no
 *  priorities file) compares against plain Dung (empty order), T60's existing no-audience fallback. */
export function compareWithOrder(root: string, order: string[], sel: { phase?: string; at?: string } = {}): PhaseComparison {
  const l = load(root);
  const tenets = tenetIds(l.graph);
  for (const t of order) if (!tenets.has(t)) throw new PrioritiesError(`${t} is not a tenet in .mole/tenets.md`);
  const current = pick(l, sel);
  const a = current ? { name: current.name, order: current.order } : { name: 'no phase', order: [] };
  return diffPhases(l, a, { name: 'what-if', order });
}
