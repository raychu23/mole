// T43 red tests (tasks/T43-full-rationale-records/0 start.md done-when 1-3): agent-facing decision output
// must carry the FULL Decision + Context/Rationale + Consequences text, not only summaryOf()'s 240-char
// list/hover preview (packages/decisions/src/tree/core.ts:398-429, still used there unchanged -- done-when 2).
// Section names follow MADR (Context and Problem Statement / Decision Drivers / Decision Outcome / Consequences)
// and Nygard/adr-tools (Context / Decision / Consequences), which the ADR loader (graph.ts loadAdrDir) already
// recognizes for status parsing -- this file borrows the same vocabulary rather than inventing new headings.
import { describe, expect, it } from 'vitest';
import { formatSections, RATIONALE_BUDGET, sectionsOf } from '../src/rationale.js';

const LONG = 'Lorem ipsum dolor sit amet consectetur adipiscing elit. '.repeat(30); // ~1,770 chars

describe('sectionsOf: MADR / Nygard section extraction', () => {
  it('pulls Decision, Context and Consequences bodies by heading, case-insensitively', () => {
    const text = `---\nid: '0099'\ntitle: Test\nstatus: accepted\n---\n\n## Context and Problem Statement\n\n${LONG}\n\n## Decision\n\nWe picked option A because it is simplest.\n\n## Consequences\n\nFuture changes must keep A compatible.\n`;
    const s = sectionsOf(text);
    expect(s.context).toContain('Lorem ipsum');
    expect(s.decision).toContain('We picked option A');
    expect(s.consequences).toContain('Future changes must keep A compatible');
  });

  it('accepts Nygard-style Decision/Rationale headings as context, not just MADR wording', () => {
    const text = `# ADR 7: Use SQLite\n\n## Decision\n\nUse SQLite for the index.\n\n## Rationale\n\nIt needs no server and ships with node.\n\n## Consequences\n\nQueries must stay simple enough for SQLite.\n`;
    const s = sectionsOf(text);
    expect(s.decision).toContain('Use SQLite for the index');
    expect(s.context).toContain('needs no server');
    expect(s.consequences).toContain('Queries must stay simple');
  });

  it('falls back to the whole body as the decision bucket when no section headings exist', () => {
    const s = sectionsOf('Just a short note, no headings at all.');
    expect(s.decision).toBe('Just a short note, no headings at all.');
    expect(s.context).toBeUndefined();
  });

  it('also falls back to the whole body when headings exist but none match a recognized bucket (e.g. a spec-style ADR using Background/Format/Envelope instead of Context/Decision/Consequences)', () => {
    const text = '## Background\n\nSome history.\n\n## Format\n\nThe actual shape chosen and why.\n';
    const s = sectionsOf(text);
    expect(s.decision).toContain('Some history');
    expect(s.decision).toContain('The actual shape chosen and why');
  });

  it('strips YAML front matter before scanning for headings', () => {
    const text = `---\nid: x\ntitle: "## Decision inside front matter, must be ignored"\n---\n\n## Decision\n\nReal decision text.\n`;
    const s = sectionsOf(text);
    expect(s.decision).toBe('Real decision text.');
  });

  it('keeps an unmatched sibling section (Backstage adr001-style Discussion/Risks next to a matched Decision heading) instead of silently dropping it (P0 regression)', () => {
    const text = [
      '## Decision',
      '',
      'A decision was made to store ADRs in a log in the project repository.',
      '',
      '## Discussion',
      '',
      'There is a need to store big decisions made in a log as a reference point for the team.',
      '',
      '## Risks',
      '',
      'People stop adding ADRs to the log and context gets lost.',
      '',
    ].join('\n');
    const s = sectionsOf(text);
    expect(s.decision).toContain('A decision was made to store ADRs');
    expect(s.context).toMatch(/^Discussion: There is a need/);
    expect(s.context).toContain('Risks: People stop adding ADRs');
    // document order: Discussion before Risks
    expect(s.context!.indexOf('Discussion:')).toBeLessThan(s.context!.indexOf('Risks:'));
  });

  it('a record with no heading matching a recognized bucket at all (Backstage adr009-style Background + Entity References headings, none MADR/Nygard) falls back to the whole body, nothing dropped', () => {
    const text = [
      '## Background',
      '',
      'Guidance was not provided as to how to reference entities in the catalog.',
      '',
      '## Entity References in YAML files',
      '',
      'The textual format is `[<kind>:][<namespace>/]<name>`.',
      '',
      '## Entity References in URLs',
      '',
      'The URL form is `:namespace/:kind/:name`.',
      '',
    ].join('\n');
    const s = sectionsOf(text);
    // whole-body fallback: every section's content survives, just as undifferentiated Decision text
    expect(s.decision).toContain('Guidance was not provided');
    expect(s.decision).toContain('[<kind>:][<namespace>/]<name>');
    expect(s.decision).toContain(':namespace/:kind/:name');
    expect(s.context).toBeUndefined();
  });
});

describe('formatSections: a documented budget, section-aware, never mid-Decision', () => {
  it('renders every present section, named, when everything fits under budget', () => {
    const out = formatSections({ decision: 'Use SQLite.', context: 'No server needed.', consequences: 'Keep queries simple.' });
    expect(out).toMatch(/Decision:\s*Use SQLite\./);
    expect(out).toMatch(/Context\/Rationale:\s*No server needed\./);
    expect(out).toMatch(/Consequences:\s*Keep queries simple\./);
  });

  it('is bounded by the documented RATIONALE_BUDGET and never exceeds it', () => {
    const out = formatSections({ decision: LONG, context: LONG, consequences: LONG });
    expect(out.length).toBeLessThanOrEqual(RATIONALE_BUDGET + 60); // + small allowance for section labels/notes
  });

  it('truncates Consequences and Context before ever touching a full-fitting Decision section (never mid-Decision)', () => {
    const decision = 'This is the whole decision in one short sentence.';
    const out = formatSections({ decision, context: LONG, consequences: LONG }, 400);
    expect(out).toContain(`Decision: ${decision}`); // the short Decision section survives intact
    expect(out).toMatch(/Context\/Rationale:/); // still named, even if clipped
  });

  it('an ADR with a 1,500-char rationale is carried through intact when it is the only section (done-when 1)', () => {
    const rationale = 'R. '.repeat(500); // 1,500 chars
    const text = `## Decision\n\n${rationale}\n`;
    const s = sectionsOf(text);
    expect(s.decision?.length).toBeGreaterThanOrEqual(1400);
    const out = formatSections(s);
    expect(out).toContain('Decision:');
    expect(out.length).toBeGreaterThanOrEqual(1400);
  });
});
