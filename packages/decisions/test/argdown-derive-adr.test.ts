// T54 red tests: deriving a Dung argument framework from an ADR's OWN MADR/Nygard sections (no
// hand-authored .mole/arguments/*.argdown file -- the real shape of every ADR in the M2 v2 bench), then
// evaluating it with packages/reasoning's grounded semantics (T42). Two-level shape per prior-art.md #4:
// a `## Considered Options` entry other than the chosen one ATTACKS the claim; a stated reason in
// `## Decision Outcome`'s "because" bullets ATTACKS each non-chosen option back, defending the claim.
import { evaluate } from '@mole/reasoning';
import { describe, expect, it } from 'vitest';
import { deriveAdrArgumentFramework } from '../src/argdown/derive-adr.js';

const MADR_ADR = [
  '# Use Markdown Architectural Decision Records',
  '',
  '- Status: accepted',
  '',
  '## Context and Problem Statement',
  '',
  'We want to record architectural decisions made in this project. Which format should these records follow?',
  '',
  '## Considered Options',
  '',
  '- MADR 2.1.2 with Log4brains patch',
  '- MADR 2.1.2 -- the original format',
  "- Michael Nygard's template",
  '- Formless -- no conventions',
  '',
  '## Decision Outcome',
  '',
  'Chosen option: "MADR 2.1.2 with Log4brains patch", because',
  '',
  '- The MADR format is lean and fits our development style.',
  '- The Log4brains patch adds more features, like tags.',
  '',
  '## Consequences',
  '',
  'Every new decision now needs its own markdown file, which is a bit more ceremony than a wiki page.',
  '',
].join('\n');

const NO_OPTIONS_ADR = ['## Decision', '', 'The catalog file format must follow the entity schema (full text for the LLM tier).', ''].join('\n');

describe('deriveAdrArgumentFramework: MADR Considered Options / Decision Outcome -> Dung framework', () => {
  it('builds one claim argument, one attacker per rejected option, one defender per stated reason', () => {
    const derived = deriveAdrArgumentFramework('D-adr', MADR_ADR);
    const roles = derived.arguments.map((a) => ({ id: a.id, role: a.role }));
    expect(roles.filter((r) => r.role === 'claim')).toHaveLength(1);
    // 4 considered options, 1 is the chosen one -> 3 rejected-option attackers
    expect(roles.filter((r) => r.role === 'considered-option')).toHaveLength(3);
    // 2 "because" bullets -> 2 reason arguments
    expect(roles.filter((r) => r.role === 'reason')).toHaveLength(2);
    // every rejected option attacks the claim
    for (const opt of derived.arguments.filter((a) => a.role === 'considered-option')) {
      expect(derived.framework.attacks).toContainEqual([opt.id, derived.claimId]);
    }
    // every reason attacks every rejected option (defends the claim)
    const reasonIds = derived.arguments.filter((a) => a.role === 'reason').map((a) => a.id);
    const optionIds = derived.arguments.filter((a) => a.role === 'considered-option').map((a) => a.id);
    for (const r of reasonIds) for (const o of optionIds) expect(derived.framework.attacks).toContainEqual([r, o]);
  });

  it('evaluated with grounded semantics: reasons are in (undefended attackers none), options are out (defeated), claim is in (defended)', () => {
    const derived = deriveAdrArgumentFramework('D-adr', MADR_ADR);
    const result = evaluate(derived.framework);
    for (const a of derived.arguments.filter((x) => x.role === 'reason')) expect(result.labels[a.id]).toBe('in');
    for (const a of derived.arguments.filter((x) => x.role === 'considered-option')) expect(result.labels[a.id]).toBe('out');
    expect(result.labels[derived.claimId]).toBe('in');
  });

  it('Consequences text is carried for display but never appears in the evaluated framework', () => {
    const derived = deriveAdrArgumentFramework('D-adr', MADR_ADR);
    expect(derived.consequences).toMatch(/ceremony/);
    expect(derived.framework.args.some((a) => a.id.includes('consequence'))).toBe(false);
  });

  it('Context text (background/problem-statement prose) is carried for display, never dropped', () => {
    const derived = deriveAdrArgumentFramework('D-adr', MADR_ADR);
    expect(derived.context).toMatch(/record architectural decisions/);
  });

  it('a record with no Considered Options / Decision Outcome degrades to a single undefeated claim', () => {
    const derived = deriveAdrArgumentFramework('D-simple', NO_OPTIONS_ADR);
    expect(derived.arguments).toHaveLength(1);
    expect(derived.arguments[0]!.role).toBe('claim');
    expect(derived.arguments[0]!.text).toMatch(/entity schema/);
    expect(derived.framework.attacks).toHaveLength(0);
    const result = evaluate(derived.framework);
    expect(result.labels[derived.claimId]).toBe('in');
  });
});
