import { describe, expect, it } from 'vitest';
import { evaluate } from '@mole/reasoning';
import { deriveAdrArgumentFramework } from '../src/argdown/derive-adr.js';

describe('ADR prose reasons remain evidence for the chosen option', () => {
  it.each([
    ['same-line', 'Chosen option: "Modern Python", because we need maintained dependencies.'],
    ['next-line', 'Chosen option: "Modern Python", because\nwe need maintained dependencies.'],
    // log4brains 20201026: the reason is the next sentence, opening with "Because"
    ['next-sentence', 'Chosen option: "Modern Python".\nBecause we need maintained dependencies.'],
    // python-tuf 0004: a purpose clause ("to ...") states the reason
    ['purpose-clause', 'Chosen option: "Modern Python", to we need maintained dependencies.'],
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

  it.each(['Chosen option: "Modern Python".', 'Chosen option: "Modern Python", because'])('does not invent a reason for %s', (outcome) => {
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
