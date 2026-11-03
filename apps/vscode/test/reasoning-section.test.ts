// T62: the "Reasoning" section of the sidebar panel (T34 one-panel) -- tests first.
// Data: panelData.ts builds it from 5 runner calls (priorities list / phase in force / compare with the adjacent phase,
// incident suggestions, proposals), each wrapped alone (T34 failure case b, one level down). Render: webview/reasoning.ts,
// a pure data -> HTML function (like webview/since.ts) whose every line comes from the CLI JSON it is given.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildPanelModel, SECTION_IDS, type Runners } from '../src/panelData.js';
import { renderReasoning, type ReasoningData } from '../webview/reasoning.js';

// the real `mole priorities compare launch scale` output from the T61 replay (python-tuf ADR 0002 + illustrative tenets)
const COMPARE = {
  from: 'launch',
  to: 'scale',
  arguments: [
    { id: 'best-effort', before: 'in', after: 'out', flipped: [{ from: 'parallel', to: 'best-effort', fromValue: 'tenet-users', toValue: 'tenet-focus', before: { succeeds: false, ranks: [2, 1] }, after: { succeeds: true, ranks: [1, 2] } }], via: [] },
    { id: 'parallel', before: 'out', after: 'in', flipped: [{ from: 'best-effort', to: 'parallel', fromValue: 'tenet-focus', toValue: 'tenet-users', before: { succeeds: true, ranks: [1, 2] }, after: { succeeds: false, ranks: [2, 1] } }], via: [] },
  ],
  decisions: [{ id: 'ADR-0002', title: 'Pre-1.0 deprecation strategy (python-tuf docs/adr/0002)', before: 'holds', after: 'defeated', because: ['best-effort'], file: '.mole/decisions/adr-0002.md', line: 1 }],
};
const PHASES = [
  { name: 'launch', from: '2021-01-01', order: ['tenet-focus', 'tenet-users'], file: '.mole/priorities.md', line: 3 },
  { name: 'scale', from: '2024-01-01', order: ['tenet-users', 'tenet-focus'], file: '.mole/priorities.md', line: 8 },
];
const EVAL_LAUNCH = { phase: 'launch', audience: ['tenet-focus', 'tenet-users'], labels: { 'best-effort': 'in', parallel: 'out' }, decisions: [{ id: 'ADR-0002', title: 'Pre-1.0 deprecation strategy', state: 'holds', cites: ['best-effort'], file: '.mole/decisions/adr-0002.md', line: 1 }] };
const INCIDENTS = [{ id: 'inc-legacy-users', title: 'Users stuck on the legacy client hit an unpatched bug', candidates: [{ incident: 'inc-legacy-users', argument: 'parallel', text: 'Maintain the legacy code in parallel for a fixed period.', label: 'out', decision: 'ADR-0002', attackers: ['best-effort'], alsoReinstates: [], score: 0.26, evidence: [] }] }];
const PROPOSALS = { baselineRevision: '7b6ff985d6fd4a49bd62f8f4844c8e871799d597', proposals: [
  { name: 'drop-old', branch: 'mole/proposal/drop-old', path: '/tmp/p-drop', baselineRevision: '7b6ff98', changes: { arguments: [], decisions: [] }, notEvaluated: [], problems: [] },
  { name: 'lts-window', branch: 'mole/proposal/lts-window', path: '/tmp/p-lts', baselineRevision: '7b6ff98', changes: { arguments: [{ id: 'security-window', text: 'A one-year LTS window', before: 'absent', after: 'in', source: { file: '.mole/arguments/0002.argdown', line: 6 } }], decisions: [{ id: 'ADR-0002', title: 'Pre-1.0 deprecation strategy', record: { file: '.mole/decisions/adr-0002.md', line: 1 }, before: 'holds', after: 'defeated', because: ['best-effort'] }] }, notEvaluated: [], problems: [] },
] };

const base = (): Runners => ({
  map: async () => ({ state: 'ok', nodes: [], edges: [] }) as never,
  impact: async () => ({ state: 'ok', nodes: [], edges: [] }) as never,
  flows: async () => ({ tests: [], callers: [], callees: [] }) as never,
  noteList: async () => [],
  since: async () => ({ files: [] }) as never,
  check: async () => ({ hunks: [] }) as never,
  questions: async () => ({ questions: [] }) as never,
  decisions: async () => ({ decisions: [], tenets: [] }) as never,
  rules: async () => ({ violations: [] }) as never,
  testsAtLine: () => [],
  claims: async () => ({ claims: [] }) as never,
  collisions: async () => ({ pairs: [] }) as never,
  tried: async () => ({ tried: [] }) as never,
  agentIntent: async () => ({ statuses: [] }) as never,
  oneonone: async () => ({ groups: [], readback: {} }) as never,
  reviewNotes: async () => ({ drafts: [], diagramSvg: undefined }) as never,
  prioritiesList: async () => PHASES,
  priorities: async () => EVAL_LAUNCH,
  prioritiesCompare: async (a: string, b: string) => ({ ...COMPARE, from: a, to: b }),
  prioritiesWhatIf: async () => COMPARE as never,
  incidents: async () => INCIDENTS,
  proposals: async () => PROPOSALS,
});

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mole-t62-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));
const build = (r: Runners) => buildPanelModel({ root: dir, file: 'src/a.ts', line: 1 }, r);

describe('T62 panelData: reasoning section', () => {
  it('is one of the panel sections, with a caption about decisions', async () => {
    expect(SECTION_IDS).toContain('reasoning');
    const m = await build(base());
    expect(m.sections.reasoning!.caption.toLowerCase()).toMatch(/decision/);
  });

  // previous direction compares (previous, current) so lines read forward in time: what changed when the current phase
  // started (replay 11-02: scale→launch read as going back in time)
  it('compares the phase in force with the NEXT phase when there is one, else what changed from the previous', async () => {
    const calls: string[][] = [];
    const r = { ...base(), prioritiesCompare: async (a: string, b: string) => (calls.push([a, b]), { ...COMPARE, from: a, to: b }) };
    const m = await build(r);
    expect(m.sections.reasoning!.status).toBe('ok');
    const d = m.sections.reasoning!.data as ReasoningData;
    expect(calls).toEqual([['launch', 'scale']]);
    expect(d.phase).toEqual(expect.objectContaining({ current: PHASES[0], adjacent: PHASES[1], direction: 'next' }));
    expect(d.phase!.comparison).toEqual({ ...COMPARE, from: 'launch', to: 'scale' });

    calls.length = 0;
    const last = await build({ ...r, priorities: async () => ({ ...EVAL_LAUNCH, phase: 'scale' }) });
    expect(calls).toEqual([['launch', 'scale']]);
    expect((last.sections.reasoning!.data as ReasoningData).phase!.direction).toBe('previous');
  });

  it('one failing sub-source degrades only its own part (T34 failure case b)', async () => {
    const m = await build({ ...base(), incidents: async () => { throw new Error('boom: incident record corrupt\nstack...'); } });
    const s = m.sections.reasoning!;
    expect(s.status).toBe('ok');
    const d = s.data as ReasoningData;
    expect(d.incidents).toEqual({ error: 'boom: incident record corrupt' });
    expect(d.proposals).toEqual(PROPOSALS);
    expect(d.phase!.comparison).toBeDefined();
  });

  it('nothing recorded anywhere -> empty, with one line; never calls compare without two phases', async () => {
    let compared = false;
    const m = await build({
      ...base(),
      prioritiesList: async () => [],
      priorities: async () => ({ labels: {}, decisions: [] }),
      prioritiesCompare: async () => { compared = true; return COMPARE; },
      incidents: async () => [],
      proposals: async () => ({ proposals: [] }),
    });
    expect(compared).toBe(false);
    expect(m.sections.reasoning!.status).toBe('empty');
    expect(m.sections.reasoning!.message!.split('\n')).toHaveLength(1);
  });

  it('every sub-source failing -> error with the first message, other sections untouched', async () => {
    const fail = async () => { throw new Error('mole: not a git repository'); };
    const m = await build({ ...base(), prioritiesList: fail, priorities: fail, incidents: fail, proposals: fail });
    expect(m.sections.reasoning!.status).toBe('unavailable');
    expect(m.sections.decisions.status).not.toBe('error');
  });
});

const DATA: ReasoningData = {
  phase: { current: PHASES[0]!, adjacent: PHASES[1]!, direction: 'next', evaluation: EVAL_LAUNCH as never, comparison: COMPARE as never },
  incidents: INCIDENTS as never,
  proposals: PROPOSALS as never,
};

describe('T62 webview/reasoning.ts renderReasoning', () => {
  it('phase: names the phase in force, its tenet order, and each decision that flips at the next phase with the winning attack, both tenets and ranks', () => {
    const html = renderReasoning(DATA);
    expect(html).toContain('launch');
    expect(html).toMatch(/1\. tenet-focus.*2\. tenet-users/s);
    expect(html).toContain('scale');
    expect(html).toContain('2024-01-01');
    expect(html).toContain('ADR-0002');
    expect(html).toMatch(/holds\s*→\s*defeated/);
    // the attack on the decision's own cited argument that wins at scale: parallel (tenet-users #1) over best-effort (tenet-focus #2)
    expect(html).toMatch(/parallel.*best-effort/s);
    expect(html).toMatch(/tenet-users #1.*tenet-focus #2/s);
    expect(html).toMatch(/was #2.*#1/s);
  });

  it('previous direction: says what changed when the current phase started', () => {
    const html = renderReasoning({ ...DATA, phase: { ...(DATA.phase as object), current: PHASES[1]!, adjacent: PHASES[0]!, direction: 'previous' } as never });
    expect(html).toMatch(/What changed when <b>scale<\/b> started \(2024-01-01\), against <b>launch<\/b>/);
  });

  it('incidents: each suggestion with the argument, the decision it lost in, and the CLI command a person runs to accept', () => {
    const html = renderReasoning(DATA);
    expect(html).toContain('inc-legacy-users');
    expect(html).toContain('parallel');
    expect(html).toContain('mole incident accept inc-legacy-users --argument parallel');
    // accepting an incident stays a person's CLI act, never a button (unlike T73's what-if compare control below)
    const incidentsPart = html.slice(html.indexOf('<h4>Incidents'));
    expect(incidentsPart).not.toMatch(/<button/);
  });

  it('proposals: each proposal with the decisions it changes, or "no decision changes"', () => {
    const html = renderReasoning(DATA);
    expect(html).toMatch(/lts-window[\s\S]*ADR-0002[\s\S]*holds\s*→\s*defeated/);
    expect(html).toMatch(/drop-old[\s\S]*no decision changes/);
  });

  it('a failed part shows its one-line message; an absent part is left out', () => {
    const html = renderReasoning({ ...DATA, incidents: { error: 'boom' }, proposals: undefined });
    expect(html).toContain('boom');
    expect(html).not.toContain('lts-window');
  });

  it('escapes every record-supplied string', () => {
    const evil = { ...INCIDENTS[0]!, id: '<img src=x onerror=alert(1)>', title: '<script>alert(1)</script>' };
    const html = renderReasoning({ ...DATA, incidents: [evil] as never });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });

  it('no priorities file: says decisions are judged without a phase order', () => {
    const html = renderReasoning({ ...DATA, phase: { evaluation: { labels: {}, decisions: [] } as never } });
    expect(html).toMatch(/no \.mole\/priorities\.md/i);
  });

  // T73: the panel's/CLI's "compare with order X" what-if -- a text input + button, pre-filled with the
  // current order, never a write; this IS allowed to be a button (unlike the incidents 'accept', which stays
  // a person's CLI act because accepting commits a record -- comparing never does).
  it('T73: shows a what-if control pre-filled with the current order, pending result empty until run', () => {
    const html = renderReasoning(DATA);
    expect(html).toMatch(/data-whatif-order/);
    expect(html).toMatch(/value="tenet-focus,tenet-users"/);
    expect(html).toMatch(/<button data-whatif-run>Compare<\/button>/);
    expect(html).toMatch(/<div data-whatif-result><\/div>/);
  });

  it('T73: once run, the what-if result renders the order tried and the same comparison shape as the phase diff', () => {
    const html = renderReasoning({ ...DATA, whatIf: { order: ['tenet-users', 'tenet-focus'], comparison: COMPARE as never } });
    expect(html).toMatch(/what-if order: 1\. tenet-users.*2\. tenet-focus/s);
    expect(html).toContain('ADR-0002');
    expect(html).toMatch(/holds\s*→\s*defeated/);
  });

  it('T73: a failed what-if shows its one-line error, not a comparison', () => {
    const html = renderReasoning({ ...DATA, whatIf: { order: ['tenet-nope'], comparison: { error: 'tenet-nope is not a tenet' } } });
    expect(html).toContain('tenet-nope is not a tenet');
    const resultPart = /<div data-whatif-result>([\s\S]*?)<\/div><\/div>/.exec(html)![1]!;
    expect(resultPart).not.toContain('ADR-0002');
  });

  it('T73: no priorities file -> no what-if control (nothing to compare against)', () => {
    const html = renderReasoning({ ...DATA, phase: { evaluation: { labels: {}, decisions: [] } as never } });
    expect(html).not.toMatch(/data-whatif/);
  });
});
