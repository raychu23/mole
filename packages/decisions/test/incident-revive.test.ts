// T58: incidents revive recorded dissent (plan update 11-01 §6 steps 1-5). Tests first (red before src/incidents/).
// Every test builds its own temp repo: never write into the live .mole/ (other tests read it).
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { evaluate } from '@mole/reasoning';
import { afterEach, describe, expect, it } from 'vitest';
import { acceptIncident, argumentFramework, dismissIncident, incidentCli, loadGraph, suggestRevivals } from '../src/index.js';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((r) => rmSync(r, { recursive: true, force: true })));

function write(root: string, file: string, text: string): void {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), text);
}

// D1 rests on <fast>; the recorded dissent <stale> lost to it. Unrelated D2/<other> share nothing with the incident.
function repo(incident: string[] = ['decisions: [D1]']): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-t58-'));
  roots.push(root);
  write(root, '.mole/decisions/d1.md', ['---', 'id: D1', 'title: Serve reads from the cache', 'status: accepted', 'scope: [src/cache/]', 'cites: [fast]', '---', ''].join('\n'));
  write(root, '.mole/decisions/d2.md', ['---', 'id: D2', 'title: Log in JSON', 'status: accepted', 'cites: [other]', '---', ''].join('\n'));
  write(root, '.mole/arguments/case.argdown', [
    '<fast>: Cache reads are fast and safe enough.',
    '  -> <stale>: Cached reads can serve stale prices after an update.',
    '',
    '<other>: JSON logs are easy to query.',
    '  -> <text-logs>: Plain text logs are easier to read.',
    '',
  ].join('\n'));
  write(root, '.mole/incidents/inc-42.md', ['---', 'id: inc-42', 'title: Customers saw stale prices from the cache', ...incident, '---', '', 'After a price update the cache served stale prices for 20 minutes.', ''].join('\n'));
  return root;
}

const labels = (root: string) => evaluate(argumentFramework(loadGraph(root)).framework).labels;
const snapshot = (root: string) => readdirSync(join(root, '.mole'), { recursive: true }).map(String).sort().map((f) => {
  try { return [f, readFileSync(join(root, '.mole', f), 'utf8')]; } catch { return [f, '<dir>']; }
});

describe('mole incident suggest (done-when 2): read-only, deterministic, evidence on every candidate', () => {
  it('lists the losing argument of a decision the incident names, with the evidence, and nothing unrelated', () => {
    const root = repo();
    const before = snapshot(root);
    const s = suggestRevivals(root, 'inc-42');
    expect(s.map((c) => c.argument)).toEqual(['stale']);
    expect(s[0]).toEqual(expect.objectContaining({ decision: 'D1', label: 'out', attackers: ['fast'] }));
    expect(s[0]!.evidence).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'decision', value: 'D1' })]));
    expect(s[0]!.score).toBeGreaterThan(0);
    expect(snapshot(root)).toEqual(before);
    expect(suggestRevivals(root, 'inc-42')).toEqual(s);
  });

  it('finds the same candidate through a shared scope path when the incident names no decision', () => {
    const s = suggestRevivals(repo(['scope: [src/cache/prices.ts]']), 'inc-42');
    expect(s.map((c) => c.argument)).toEqual(['stale']);
    expect(s[0]!.evidence).toEqual([expect.objectContaining({ kind: 'scope', value: 'src/cache/prices.ts' }), expect.objectContaining({ kind: 'text' })]);
  });

  it('text overlap alone never admits a candidate (Graphiti rule: must share a node)', () => {
    expect(suggestRevivals(repo([]), 'inc-42')).toEqual([]);
  });

  it('an unknown incident is an error naming the id', () => {
    expect(() => suggestRevivals(repo(), 'nope')).toThrow(/nope/);
  });
});

describe('mole incident accept / dismiss (done-when 3, 4)', () => {
  it('accept reinstates the dissent: stale in, the decision\'s own argument out, incident is the reason; only 2 files written', () => {
    const root = repo();
    expect(labels(root)).toEqual(expect.objectContaining({ fast: 'in', stale: 'out' }));
    const r = acceptIncident(root, 'inc-42', 'stale');
    expect(r.written.sort()).toEqual(['.mole/arguments/incidents.argdown', '.mole/incidents/inc-42.md']);
    const l = labels(root);
    expect(l).toEqual(expect.objectContaining({ 'incident-inc-42': 'in', fast: 'out', stale: 'in', other: 'in' }));
    expect(readFileSync(join(root, '.mole/incidents/inc-42.md'), 'utf8')).toMatch(/^revives: \[stale\]$/m);
    expect(readFileSync(join(root, '.mole/decisions/d1.md'), 'utf8')).toMatch(/status: accepted/); // never flips status
    expect(suggestRevivals(root, 'inc-42')).toEqual([]); // already decided
  });

  it('a candidate shows every OTHER argument its accept would also bring back (dry run), so the person sees the knock-on', () => {
    // <shared> beats both dissents; reviving <stale> means attacking <shared>, which also brings back <slow>
    const root = repo();
    write(root, '.mole/arguments/case.argdown', [
      '<fast>: Cache reads are fast and safe enough.',
      '  -> <stale>: Cached reads can serve stale prices after an update.',
      '',
      '<shared>: One code path is cheaper to run.',
      '  -> <stale>',
      '  -> <slow>: A second read path slows deploys.',
      '',
      '<fast>',
      '  -> <slow>',
      '',
      '<other>: JSON logs are easy to query.',
      '',
    ].join('\n'));
    write(root, '.mole/decisions/d1.md', ['---', 'id: D1', 'title: Serve reads from the cache', 'status: accepted', 'cites: [fast, shared]', '---', ''].join('\n'));
    const c = suggestRevivals(root, 'inc-42').find((x) => x.argument === 'stale')!;
    expect(c.attackers).toEqual(['fast', 'shared']);
    expect(c.alsoReinstates).toEqual(['slow']);
    expect(acceptIncident(root, 'inc-42', 'stale').alsoReinstates).toEqual(['slow']);
  });

  it('accept is idempotent', () => {
    const root = repo();
    acceptIncident(root, 'inc-42', 'stale');
    const once = snapshot(root);
    acceptIncident(root, 'inc-42', 'stale');
    expect(snapshot(root)).toEqual(once);
  });

  it('dismiss writes only the incident record, changes no label, and hides the candidate', () => {
    const root = repo();
    const before = labels(root);
    const r = dismissIncident(root, 'inc-42', 'stale');
    expect(r.written).toEqual(['.mole/incidents/inc-42.md']);
    expect(readFileSync(join(root, '.mole/incidents/inc-42.md'), 'utf8')).toMatch(/^dismissed: \[stale\]$/m);
    expect(labels(root)).toEqual(before);
    expect(suggestRevivals(root, 'inc-42')).toEqual([]);
    dismissIncident(root, 'inc-42', 'stale');
    expect(readFileSync(join(root, '.mole/incidents/inc-42.md'), 'utf8').match(/dismissed/g)).toHaveLength(1);
  });

  it('refuses an argument that is not a current candidate, and one already accepted cannot be dismissed', () => {
    const root = repo();
    expect(() => acceptIncident(root, 'inc-42', 'other')).toThrow(/not a candidate/);
    acceptIncident(root, 'inc-42', 'stale');
    expect(() => dismissIncident(root, 'inc-42', 'stale')).toThrow(/already accepted/);
  });
});

describe('mole incident CLI', () => {
  it('is registered in the daemon CLI with one line (shared-file rule: toContain)', () => {
    const daemon = readFileSync(new URL('../../daemon/src/cli.ts', import.meta.url), 'utf8');
    expect(daemon).toContain("cmd === 'incident'");
    expect(daemon).toContain('incidentCli(pos, flags, root)');
  });

  it('suggest exits 0, accept without --argument and an unknown incident exit 2', () => {
    const root = repo();
    const quiet = (fn: () => number) => {
      const [log, err] = [console.log, console.error];
      console.log = console.error = () => undefined;
      try { return fn(); } finally { [console.log, console.error] = [log, err]; }
    };
    expect(quiet(() => incidentCli(['suggest', 'inc-42'], {}, root))).toBe(0);
    expect(quiet(() => incidentCli(['accept', 'inc-42'], {}, root))).toBe(2);
    expect(quiet(() => incidentCli(['suggest', 'nope'], {}, root))).toBe(2);
    expect(quiet(() => incidentCli(['accept', 'inc-42'], { argument: 'stale' }, root))).toBe(0);
  });
});
