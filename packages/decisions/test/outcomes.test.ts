// T81 (D66): outcome ledger -- prediction + later outcome on a decision record, due/overdue checks, a staged
// rollout's named treated/holdout scopes (recording only), and a contradicted outcome surfaced as a SUGGESTED
// incident draft through the existing T58 revival path (never written, never auto-accepted).
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { outcomesCli, outcomesReport } from '../src/outcomes/report.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-outcomes-'));
  roots.push(root);
  return root;
}

function write(root: string, relFile: string, text: string): void {
  const abs = join(root, relFile);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, text, 'utf8');
}

describe('outcomesReport', () => {
  it('ignores a decision record with no prediction: block entirely', () => {
    const root = repo();
    write(root, '.mole/decisions/plain.md', '---\nid: plain\ntitle: No prediction\nstatus: accepted\n---\n\n## Decision\n');
    const r = outcomesReport(root);
    expect(r.entries).toEqual([]);
  });

  it('reads a prediction with no outcome yet as not due before check_at', () => {
    const root = repo();
    write(
      root,
      '.mole/decisions/future.md',
      ['---', 'id: future', 'title: Future check', 'status: accepted', 'prediction:', "  expected: 'latency drops'", "  signal: 'p95 latency'", "  check_at: '2099-01-01'", '---', ''].join('\n'),
    );
    const r = outcomesReport(root, { today: '2026-11-03' });
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]).toMatchObject({ decisionId: 'future', due: false, overdue: false });
  });

  it('marks a check due and overdue once check_at has passed with no outcome recorded', () => {
    const root = repo();
    write(
      root,
      '.mole/decisions/overdue.md',
      ['---', 'id: overdue', 'title: Overdue check', 'status: accepted', 'prediction:', "  expected: 'x'", "  signal: 'y'", "  check_at: '2020-01-01'", '---', ''].join('\n'),
    );
    const r = outcomesReport(root, { today: '2026-11-03' });
    expect(r.entries[0]).toMatchObject({ due: true, overdue: true });
    expect(r.entries[0]!.daysOverdue).toBeGreaterThan(0);
    const filtered = outcomesReport(root, { today: '2026-11-03', due: true });
    expect(filtered.entries).toHaveLength(1);
  });

  it('--due excludes a check that is not due yet', () => {
    const root = repo();
    write(
      root,
      '.mole/decisions/future.md',
      ['---', 'id: future', 'title: Future', 'status: accepted', 'prediction:', "  expected: 'x'", "  signal: 'y'", "  check_at: '2099-01-01'", '---', ''].join('\n'),
    );
    const r = outcomesReport(root, { today: '2026-11-03', due: true });
    expect(r.entries).toEqual([]);
  });

  it('a recorded outcome is read verbatim: observed, date, who, result', () => {
    const root = repo();
    write(
      root,
      '.mole/decisions/checked.md',
      [
        '---',
        'id: checked',
        'title: Checked',
        'status: accepted',
        'prediction:',
        "  expected: 'latency drops'",
        "  signal: 'p95 latency'",
        "  check_at: '2020-01-01'",
        'outcome:',
        "  observed: 'latency dropped 12%'",
        "  date: '2026-01-05'",
        '  who: alice',
        '  result: confirmed',
        '---',
        '',
      ].join('\n'),
    );
    const r = outcomesReport(root, { today: '2026-11-03' });
    expect(r.entries[0]!.outcome).toMatchObject({ observed: 'latency dropped 12%', date: '2026-01-05', who: 'alice', result: 'confirmed' });
    // an outcome is already recorded: no longer due, even though check_at is long past
    expect(r.entries[0]!.due).toBe(false);
    expect(r.entries[0]!.contradicts).toBe(false);
    expect(r.entries[0]!.suggestedIncident).toBeUndefined();
  });

  it('a contradicted outcome is flagged and carries a SUGGESTED incident draft, never written to disk', () => {
    const root = repo();
    write(
      root,
      '.mole/decisions/wrong.md',
      [
        '---',
        'id: wrong',
        'title: Wrong guess',
        'status: accepted',
        'prediction:',
        "  expected: 'churn falls'",
        "  signal: '30-day churn'",
        "  check_at: '2020-01-01'",
        'outcome:',
        "  observed: 'churn rose 4%'",
        "  date: '2026-01-05'",
        '  who: bob',
        '  result: contradicted',
        '---',
        '',
      ].join('\n'),
    );
    const r = outcomesReport(root, { today: '2026-11-03' });
    expect(r.entries[0]!.contradicts).toBe(true);
    expect(r.entries[0]!.suggestedIncident).toBeDefined();
    expect(r.entries[0]!.suggestedIncident!.decisions).toEqual(['wrong']);
    expect(r.entries[0]!.suggestedIncident!.draft).toContain('decisions:');
    expect(r.entries[0]!.suggestedIncident!.draft).toContain('- wrong');
    // never written anywhere -- the report is the only trace
    expect(() => readdirSync(join(root, '.mole/incidents'))).toThrow();
  });

  it('reads a staged-rollout record\'s treated and holdout scopes (recording only)', () => {
    const root = repo();
    write(
      root,
      '.mole/decisions/staged.md',
      ['---', 'id: staged', 'title: Staged rollout', 'status: accepted', 'prediction:', "  expected: 'x'", "  signal: 'y'", "  check_at: '2099-01-01'", 'rollout:', '  treated: packages/payments/', '  holdout: packages/billing/', '---', ''].join('\n'),
    );
    const r = outcomesReport(root, { today: '2026-11-03' });
    expect(r.entries[0]!.rollout).toMatchObject({ treated: 'packages/payments/', holdout: 'packages/billing/' });
  });

  it('rejects a non-ISO check_at: malformed, not due/overdue (never silently dropped)', () => {
    const root = repo();
    write(
      root,
      '.mole/decisions/bad-check.md',
      ['---', 'id: bad-check', 'title: Bad check date', 'status: accepted', 'prediction:', "  expected: 'x'", "  signal: 'y'", "  check_at: 'not-a-date'", '---', ''].join('\n'),
    );
    const r = outcomesReport(root, { today: '2026-11-03' });
    expect(r.entries[0]!.due).toBe(false);
    expect(r.entries[0]!.overdue).toBe(false);
    expect(r.malformed).toHaveLength(1);
    expect(r.malformed[0]).toMatchObject({ decisionId: 'bad-check', block: 'prediction', field: 'check_at', value: 'not-a-date' });
  });

  it('rejects a calendar-invalid date like 2026-02-30 (T78 learned: Date rollover must not pass silently)', () => {
    const root = repo();
    write(
      root,
      '.mole/decisions/bad-calendar.md',
      ['---', 'id: bad-calendar', 'title: Bad calendar date', 'status: accepted', 'prediction:', "  expected: 'x'", "  signal: 'y'", "  check_at: '2026-02-30'", '---', ''].join('\n'),
    );
    const r = outcomesReport(root, { today: '2026-11-03' });
    expect(r.malformed).toHaveLength(1);
    expect(r.malformed[0]).toMatchObject({ decisionId: 'bad-calendar', field: 'check_at', value: '2026-02-30' });
  });

  it('rejects an unrecognized outcome result: unassured verdict, listed malformed, never treated as contradicted', () => {
    const root = repo();
    write(
      root,
      '.mole/decisions/bad-result.md',
      [
        '---',
        'id: bad-result',
        'title: Bad result',
        'status: accepted',
        'prediction:',
        "  expected: 'x'",
        "  signal: 'y'",
        "  check_at: '2020-01-01'",
        'outcome:',
        "  observed: 'z'",
        "  date: '2026-01-01'",
        '  who: alice',
        '  result: maybe',
        '---',
        '',
      ].join('\n'),
    );
    const r = outcomesReport(root, { today: '2026-11-03' });
    expect(r.entries[0]!.contradicts).toBe(false);
    expect(r.entries[0]!.outcome!.result).toBeUndefined();
    expect(r.malformed.some((m) => m.decisionId === 'bad-result' && m.field === 'result' && m.value === 'maybe')).toBe(true);
  });

  it('rejects a rollout missing either scope: malformed, rollout left undefined', () => {
    const root = repo();
    write(
      root,
      '.mole/decisions/half-rollout.md',
      ['---', 'id: half-rollout', 'title: Half rollout', 'status: accepted', 'prediction:', "  expected: 'x'", "  signal: 'y'", "  check_at: '2099-01-01'", 'rollout:', '  treated: packages/payments/', '---', ''].join('\n'),
    );
    const r = outcomesReport(root, { today: '2026-11-03' });
    expect(r.entries[0]!.rollout).toBeUndefined();
    expect(r.malformed.some((m) => m.decisionId === 'half-rollout' && m.block === 'rollout')).toBe(true);
  });

  it('CLI prints JSON with --json and a non-zero exit never happens on a clean report', () => {
    const root = repo();
    write(
      root,
      '.mole/decisions/ok.md',
      ['---', 'id: ok', 'title: OK', 'status: accepted', 'prediction:', "  expected: 'x'", "  signal: 'y'", "  check_at: '2099-01-01'", '---', ''].join('\n'),
    );
    const code = outcomesCli([], { json: true }, root);
    expect(code).toBe(0);
  });

  it('--due filters the CLI text output to only due/overdue entries', () => {
    const root = repo();
    write(root, '.mole/decisions/a.md', ['---', 'id: a', 'title: A', 'status: accepted', 'prediction:', "  expected: 'x'", "  signal: 'y'", "  check_at: '2020-01-01'", '---', ''].join('\n'));
    write(root, '.mole/decisions/b.md', ['---', 'id: b', 'title: B', 'status: accepted', 'prediction:', "  expected: 'x'", "  signal: 'y'", "  check_at: '2099-01-01'", '---', ''].join('\n'));
    const full = outcomesReport(root, { today: '2026-11-03' });
    expect(full.entries).toHaveLength(2);
    const due = outcomesReport(root, { today: '2026-11-03', due: true });
    expect(due.entries).toHaveLength(1);
    expect(due.entries[0]!.decisionId).toBe('a');
  });
});
