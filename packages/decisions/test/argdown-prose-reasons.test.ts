import { describe, expect, it } from 'vitest';
import { evaluate } from '@mole/reasoning';
import { deriveAdrArgumentFramework } from '../src/argdown/derive-adr.js';

describe('ADR prose reasons remain evidence for the chosen option', () => {
  it.each([
    ['same-line', 'Chosen option: "Modern Python", because we need maintained dependencies.'],
    ['next-line', 'Chosen option: "Modern Python", because\nwe need maintained dependencies.'],
    // log4brains 20201026: the reason is the next sentence, opening with "Because"
    ['next-sentence', 'Chosen option: "Modern Python".\nBecause we need maintained dependencies.'],
    // review 2 P0: unquoted name ending at a period, reason later in the same paragraph (Nygard style)
    ['unquoted-then-because', 'Chosen option: Modern Python. We picked it because we need maintained dependencies.'],
  ])('uses explicitly stated %s prose instead of labelling the decision undefended', (_shape, outcome) => {
    const text = [
      '## Considered Options', '- Modern Python', '- Legacy Python',
      '## Decision Outcome', outcome,
      '## Consequences', 'Additional migration effort is required.',
    ].join('\n');
    const derived = deriveAdrArgumentFramework('python-version', text);
    const reasons = derived.arguments.filter((a) => a.role === 'reason');
    expect(reasons).toHaveLength(1);
    expect(reasons[0]!.text).toBe('we need maintained dependencies.');
    expect(evaluate(derived.framework).labels[derived.claimId]).toBe('in');
  });

  it.each([
    'Chosen option: "Modern Python".',
    'Chosen option: "Modern Python", because',
    // review 2 P0: a leading "to" is not a stated reason ("to" purpose clauses were dropped as too ambiguous)
    'Chosen option: "Modern Python", to be revisited after the Q3 audit.',
  ])('does not invent a reason for %s', (outcome) => {
    const text = [
      '## Considered Options', '- Modern Python', '- Legacy Python',
      '## Decision Outcome', outcome,
      '## Consequences', 'Because migration costs money, budget extra time.',
    ].join('\n');
    const derived = deriveAdrArgumentFramework('python-version', text);
    expect(derived.arguments.filter((a) => a.role === 'reason')).toHaveLength(0);
    expect(evaluate(derived.framework).labels[derived.claimId]).toBe('out');
  });

  // python-tuf 0002 / 0008 shape: a quoted chosen option wraps onto a second line and the matching
  // considered-option bullet wraps too (markdown lazy continuation). Before: the quote was cut at the
  // newline, the chosen option counted as its own attacker and the "because" prose was never found.
  it('matches a chosen option whose quote and bullet wrap across lines', () => {
    const text = [
      '## Considered Options', '',
      '* Maintain the code in parallel for a fixed period of time after releasing the',
      '  refactored code.',
      '* Support the old code on a best-effort basis once the refactored',
      'code is released.',
      '',
      '## Decision Outcome', '',
      'Chosen option: "Support the old code on a best-effort basis once the refactored',
      'code is released", because we only have finite resources, and want to focus them.',
      '',
      'We should document this outcome clearly.',
    ].join('\n');
    const derived = deriveAdrArgumentFramework('deprecation', text);
    const options = derived.arguments.filter((a) => a.role === 'considered-option');
    expect(options.map((a) => a.text)).toEqual([
      'Maintain the code in parallel for a fixed period of time after releasing the refactored code.',
    ]);
    expect(derived.arguments.filter((a) => a.role === 'reason').map((a) => a.text))
      .toEqual(['we only have finite resources, and want to focus them.']);
    expect(evaluate(derived.framework).labels[derived.claimId]).toBe('in');
  });

  // review 2 P1 (real log4brains l4b-adr-gitflow-simplified): bullet "Transition to Simplified Git Flow." vs
  // outcome **Simplified Git Flow** -- the chosen option must not be listed as its own rejected alternative
  it('matches a chosen option written in bold or shorter than its bullet, when exactly one bullet fits', () => {
    const text = [
      '## Considered Options', '- Keep Git Flow.', '- Transition to Simplified Git Flow.',
      '## Decision Outcome', 'Chosen option: **Simplified Git Flow**, because releases are rare.',
    ].join('\n');
    const derived = deriveAdrArgumentFramework('gitflow', text);
    expect(derived.arguments.filter((a) => a.role === 'considered-option').map((a) => a.text)).toEqual(['Keep Git Flow.']);
  });

  it('keeps both options when a shortened chosen name fits more than one bullet (no guess)', () => {
    const text = [
      '## Considered Options', '- MADR 2.1.2', '- MADR 2.1.2 with Log4brains patch', '- Nygard',
      '## Decision Outcome', 'Chosen option: "MADR 2.1.2 with Log4brains patch", because it renders.',
    ].join('\n');
    const derived = deriveAdrArgumentFramework('fmt', text);
    expect(derived.arguments.filter((a) => a.role === 'considered-option').map((a) => a.text)).toEqual(['MADR 2.1.2', 'Nygard']);
  });

  // review 3 P1: a "because" about a rejected option is not the chosen option's reason
  it.each([
    'Chosen option: "Modern Python". The team almost chose Legacy Python because it was familiar, but picked Modern Python since it is maintained.',
    'Chosen option: "Modern Python". We kept it because it was there, but this is under review.',
    // review 4 P1: "i.e." used to split the sentence away from the rejected option's name
    'Chosen option: "Modern Python". The team found Legacy Python familiar, i.e. easy to adopt, because it had vendor support. We chose Modern Python since it is maintained long-term.',
  ])('does not take a because-clause about another option or a turned sentence: %s', (outcome) => {
    const text = ['## Considered Options', '- Modern Python', '- Legacy Python', '## Decision Outcome', outcome].join('\n');
    const derived = deriveAdrArgumentFramework('py', text);
    expect(derived.arguments.filter((a) => a.role === 'reason')).toEqual([]);
  });

  // review 4 P1: the prose names the rejected option only by a shortened form ("Legacy")
  it('does not take a because-clause that names a rejected option by one distinctive word', () => {
    const text = ['## Considered Options', '- Modern Python', '- Legacy Python 2.7 Runtime', '## Decision Outcome',
      'Chosen option: "Modern Python". Legacy was favored initially because teams knew it well. We then picked Modern Python since it is maintained.'].join('\n');
    expect(deriveAdrArgumentFramework('py', text).arguments.filter((a) => a.role === 'reason')).toEqual([]);
  });

  it('keeps the stated reason paragraph without absorbing later commentary', () => {
    const text = [
      '## Considered Options', '- Modern Python', '- Legacy Python',
      '## Decision Outcome', 'Chosen option: "Modern Python", because maintained dependencies are required.',
      '', 'Separate implementation commentary is not part of that reason.',
    ].join('\n');
    const derived = deriveAdrArgumentFramework('python-version', text);
    expect(derived.arguments.filter((a) => a.role === 'reason').map((a) => a.text))
      .toEqual(['maintained dependencies are required.']);
  });

  // review finding (first-slice review 11-02): a bare "because" followed by a blank line must not promote
  // the NEXT, unrelated paragraph to a reason.
  it('does not take the paragraph after a blank line as the reason for a bare because', () => {
    const text = [
      '## Considered Options', '- Modern Python', '- Legacy Python',
      '## Decision Outcome', 'Chosen option: "Modern Python", because', '',
      'This is a separate implementation comment, not a reason.',
    ].join('\n');
    const derived = deriveAdrArgumentFramework('python-version', text);
    expect(derived.arguments.filter((a) => a.role === 'reason')).toHaveLength(0);
  });
});
