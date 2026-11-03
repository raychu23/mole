// T80 tests: contestable AI-drafted arguments captured from a MADR record's own structure, with an exact
// source span (file + line/char + quoted text) and provenance, held `draft` until a person approves --
// and never affecting packages/reasoning's evaluate() until that approval (the task's own stop condition).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { evaluate } from '@mole/reasoning';
import { afterEach, describe, expect, it } from 'vitest';
import {
  allCapturedArguments,
  approveCapturedArgument,
  argumentFramework,
  captureAdrArguments,
  CapturedArgumentError,
  loadGraph,
  rejectCapturedArgument,
  saveCapturedArguments,
} from '../src/index.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-arg-capture-'));
  dirs.push(root);
  execFileSync('git', ['-C', root, '-c', 'user.name=T', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', 'init', '-q', '-b', 'main']);
  return root;
}

function writeDecision(root: string, id: string, body: string): string {
  const file = `.mole/decisions/${id}.md`;
  const p = join(root, file);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, `---\nid: '${id}'\ntitle: "${id} title"\nstatus: accepted\n---\n\n${body}`);
  return file;
}

// Real shape, modelled on the vendored m29-madr corpus's 0008/0009/0012/0015/0016 records (prior-art.md
// #3): Considered Options -> Decision Outcome (no bullet reasons) -> Pros and Cons of the Options with
// one `### <option>` per considered option.
const MADR_WITH_PROS_CONS = [
  '## Considered Options',
  '',
  '* Use YAML front matter',
  '* Use badge',
  '',
  '## Decision Outcome',
  '',
  'Chosen option: "Use YAML front matter", because comes out best (see below).',
  '',
  '## Pros and Cons of the Options',
  '',
  '### Use YAML front matter',
  '',
  '* Good, because YAML front matter is supported by most Markdown parsers',
  '',
  '### Use badge',
  '',
  '* Good, because plain markdown',
  '* Bad, because hard to read in markdown source',
  '',
].join('\n');

describe('captureAdrArguments: deterministic extraction (no model) from MADR structure', () => {
  it('extracts claim + considered-option + pro/con arguments, each with a verbatim span', () => {
    const rows = captureAdrArguments('D-adr', '.mole/decisions/D-adr.md', MADR_WITH_PROS_CONS);
    const byRole = (r: string) => rows.filter((x) => x.role === r);
    expect(byRole('claim')).toHaveLength(1);
    expect(byRole('considered-option')).toHaveLength(1); // "Use badge" only -- "Use YAML front matter" is chosen
    expect(byRole('pro')).toHaveLength(2); // one under each ### subsection
    expect(byRole('con')).toHaveLength(1);
    // every row is a draft on first capture, with compiler provenance (never 'model': deterministic parse)
    for (const r of rows) {
      expect(r.status).toBe('draft');
      expect(r.provenance.source).toBe('compiler');
    }
  });

  it('every span is the EXACT literal substring of the source file at its line/char range', () => {
    const rows = captureAdrArguments('D-adr', '.mole/decisions/D-adr.md', MADR_WITH_PROS_CONS);
    const lines = MADR_WITH_PROS_CONS.split('\n');
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      const line = lines[r.span.startLine - 1] ?? '';
      expect(line.slice(r.span.startChar, r.span.endChar)).toBe(r.span.exact);
      expect(r.span.exact).toBe(r.text);
    }
  });

  it('a con attacks the option its subsection names; a pro only supports (display-only, never an attack)', () => {
    const rows = captureAdrArguments('D-adr', '.mole/decisions/D-adr.md', MADR_WITH_PROS_CONS);
    const badgeOption = rows.find((r) => r.role === 'considered-option' && r.text === 'Use badge')!;
    const con = rows.find((r) => r.role === 'con')!;
    expect(con.attacks).toEqual([badgeOption.id]);
    expect(con.supports).toEqual([]);
    const pros = rows.filter((r) => r.role === 'pro');
    for (const p of pros) {
      expect(p.attacks).toEqual([]);
    }
    // the pro under the CHOSEN option ("Use YAML front matter") has no target: derive-adr.ts never turns
    // the chosen option into a graph node, so there is nothing to support -- never fabricated (prior-art #2)
    const chosenPro = pros.find((p) => p.text.includes('YAML front matter is supported'))!;
    expect(chosenPro.supports).toEqual([]);
    // the pro under "Use badge" DOES have a target: that option is a real graph-eligible argument
    const badgePro = pros.find((p) => p.text.includes('plain markdown'))!;
    expect(badgePro.supports).toEqual([badgeOption.id]);
  });
});

describe('T80 stop condition: a DRAFT captured argument never changes a verdict in evaluate()', () => {
  it('a drafted attacker is not in the graph at all, so the claim keeps its unattacked verdict', () => {
    const root = repo();
    const file = writeDecision(root, 'D-stop', MADR_WITH_PROS_CONS);
    const rows = captureAdrArguments('D-stop', file, MADR_WITH_PROS_CONS);
    saveCapturedArguments(root, 'D-stop', rows);

    const graph = loadGraph(root);
    // none of the captured rows (all still draft) became graph nodes
    const capturedIds = new Set(rows.map((r) => r.id));
    expect(graph.nodes.some((n) => capturedIds.has(n.id))).toBe(false);

    const { framework } = argumentFramework(graph);
    expect(framework.args).toHaveLength(0); // no hand-authored .argdown either -- framework is empty
    const result = evaluate(framework);
    expect(result.labels).toEqual({});
  });

  it('after approving the option-attacking con, the option becomes a graph node and evaluate() labels it defeated', () => {
    const root = repo();
    const file = writeDecision(root, 'D-approve', MADR_WITH_PROS_CONS);
    const rows = captureAdrArguments('D-approve', file, MADR_WITH_PROS_CONS);
    saveCapturedArguments(root, 'D-approve', rows);

    const option = rows.find((r) => r.role === 'considered-option')!;
    const con = rows.find((r) => r.role === 'con')!;

    // approve ONLY the option (not yet the con) -- verdict for the option is 'in' (no attacker is approved)
    approveCapturedArgument(root, 'D-approve', option.id, 'alice');
    let graph = loadGraph(root);
    let { framework } = argumentFramework(graph);
    expect(framework.args.map((a) => a.id)).toEqual([option.id]);
    expect(evaluate(framework).labels[option.id]).toBe('in');

    // now approve the con that attacks it -- SAME option id's verdict flips to 'out', only after approval
    approveCapturedArgument(root, 'D-approve', con.id, 'alice');
    graph = loadGraph(root);
    ({ framework } = argumentFramework(graph));
    expect(framework.attacks).toEqual([[con.id, option.id]]);
    const result = evaluate(framework);
    expect(result.labels[con.id]).toBe('in');
    expect(result.labels[option.id]).toBe('out');
    expect(result.why[option.id]?.defeatedBy).toBe(con.id);
  });

  it('rejecting a captured argument also keeps it out of the graph (same as an unreviewed draft)', () => {
    const root = repo();
    const file = writeDecision(root, 'D-reject', MADR_WITH_PROS_CONS);
    const rows = captureAdrArguments('D-reject', file, MADR_WITH_PROS_CONS);
    saveCapturedArguments(root, 'D-reject', rows);
    const con = rows.find((r) => r.role === 'con')!;
    rejectCapturedArgument(root, 'D-reject', con.id, 'not a real drawback, option was dropped for other reasons');

    const graph = loadGraph(root);
    expect(graph.nodes.some((n) => n.id === con.id)).toBe(false);
  });

  it('approving an unknown argument id is a named error, never a silent no-op', () => {
    const root = repo();
    writeDecision(root, 'D-err', MADR_WITH_PROS_CONS);
    expect(() => approveCapturedArgument(root, 'D-err', 'D-err::con:999', 'alice')).toThrow(CapturedArgumentError);
  });
});

describe('re-capture merges fresh text/spans without reverting a stored approval', () => {
  it('a second saveCapturedArguments call keeps an already-approved row approved', () => {
    const root = repo();
    const file = writeDecision(root, 'D-merge', MADR_WITH_PROS_CONS);
    const rows = captureAdrArguments('D-merge', file, MADR_WITH_PROS_CONS);
    saveCapturedArguments(root, 'D-merge', rows);
    const option = rows.find((r) => r.role === 'considered-option')!;
    approveCapturedArgument(root, 'D-merge', option.id, 'alice');

    // re-run capture on the identical text (simulating a re-scan after an unrelated edit elsewhere)
    const again = captureAdrArguments('D-merge', file, MADR_WITH_PROS_CONS);
    const merged = saveCapturedArguments(root, 'D-merge', again);
    const stillApproved = merged.find((r) => r.id === option.id)!;
    expect(stillApproved.status).toBe('approved');
    expect(stillApproved.approvedBy).toBe('alice');
  });

  it('allCapturedArguments lists every decision id that has captured rows, drafts and approved together but tagged', () => {
    const root = repo();
    const file = writeDecision(root, 'D-list', MADR_WITH_PROS_CONS);
    const rows = captureAdrArguments('D-list', file, MADR_WITH_PROS_CONS);
    saveCapturedArguments(root, 'D-list', rows);
    const all = allCapturedArguments(root);
    expect(Object.keys(all)).toEqual(['D-list']);
    const statuses = new Set(all['D-list']!.map((r) => r.status));
    expect(statuses).toEqual(new Set(['draft'])); // nothing approved/rejected yet -- all visibly draft
  });
});
