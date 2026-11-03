// T58: incidents revive recorded dissent (plan update 11-01 §6 steps 1-5). Tests first (red before src/incidents/).
// Every test builds its own temp repo: never write into the live .mole/ (other tests read it).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { evaluate } from '@mole/reasoning';
import { afterEach, describe, expect, it } from 'vitest';
import { acceptIncident, argumentFramework, dismissIncident, evaluatePhase, incidentCli, loadGraph, suggestRevivals } from '../src/index.js';

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

// T68: best-effort (#tenet-focus) <-> parallel (#tenet-users) mutual attack, modelled on the T61 replay fixture
// (python-tuf ADR-0002-style trade-off, ILLUSTRATIVE). Under plain Dung the cycle is undecided on both sides (no
// 'out' candidate at all); under a phase that ranks one tenet first, the loser is 'out' -- a real candidate.
function phaseRepo(priorities: string): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-t68-'));
  roots.push(root);
  write(root, '.mole/tenets.md', ['# Tenets', '', '## tenet-focus · Spend finite maintainer time moving forward', '', '## tenet-users · Do not strand downstream users', ''].join('\n'));
  write(root, '.mole/decisions/adr-0002.md', ['---', 'id: ADR-0002', 'title: Pre-1.0 deprecation strategy', 'status: accepted', 'scope: [tuf/]', 'cites: [best-effort]', '---', ''].join('\n'));
  write(root, '.mole/arguments/0002.argdown', [
    '<best-effort>: Support the legacy code on a best-effort basis. #tenet-focus',
    '  -> <parallel>: Maintain the legacy code in parallel for a fixed period. #tenet-users',
    '',
    '<parallel>',
    '  -> <best-effort>',
    '',
  ].join('\n'));
  write(root, '.mole/incidents/inc-legacy-users.md', ['---', 'id: inc-legacy-users', 'title: Downstream users hit an unpatched bug', 'decisions: [ADR-0002]', '---', '',
    'Users who could not migrate yet needed a maintained legacy client in parallel.', ''].join('\n'));
  write(root, '.mole/priorities.md', priorities);
  return root;
}

describe('T68: incident suggest respects the phase in force (done-when 1, 2)', () => {
  it('plain Dung (no priorities file): the mutual attack is undecided on both sides -> no revival is found', () => {
    const root = phaseRepo('');
    rmSync(join(root, '.mole/priorities.md'));
    expect(labels(root)).toEqual(expect.objectContaining({ 'best-effort': 'undecided', parallel: 'undecided' }));
    expect(suggestRevivals(root, 'inc-legacy-users')).toEqual([]);
  });

  it("a phase that ranks tenet-focus first breaks the tie: parallel is 'out' -- a revival plain Dung never shows, plain-Dung label shown beside it", () => {
    const root = phaseRepo(['# Priorities', '', '## launch · from 2021-01-01', '', '1. tenet-focus', '2. tenet-users', ''].join('\n'));
    const s = suggestRevivals(root, 'inc-legacy-users', { phase: 'launch' });
    expect(s.map((c) => c.argument)).toEqual(['parallel']);
    expect(s[0]).toEqual(expect.objectContaining({ label: 'out', plainLabel: 'undecided', phase: 'launch', attackers: ['best-effort'] }));
  });

  it('the opposite phase ranking flips which side is the dissent (tenet-users first -> best-effort is out, but it is the decision\'s own argument, excluded)', () => {
    const root = phaseRepo(['# Priorities', '', '## scale · from 2021-01-01', '', '1. tenet-users', '2. tenet-focus', ''].join('\n'));
    expect(suggestRevivals(root, 'inc-legacy-users', { phase: 'scale' })).toEqual([]);
  });

  it('done-when 3: default (no --phase/--at) uses the phase in force today, not plain Dung', () => {
    // a single phase 'from' far in the past is in force on any real "today" the test runs on
    const root = phaseRepo(['# Priorities', '', '## always · from 2000-01-01', '', '1. tenet-focus', '2. tenet-users', ''].join('\n'));
    const s = suggestRevivals(root, 'inc-legacy-users');
    expect(s.map((c) => c.argument)).toEqual(['parallel']);
    expect(s[0]).toEqual(expect.objectContaining({ label: 'out', plainLabel: 'undecided', phase: 'always' }));
  });

  it('--at picks the phase in force on that date', () => {
    const root = phaseRepo(['# Priorities', '', '## launch · from 2021-01-01', '', '1. tenet-focus', '2. tenet-users', '',
      '## scale · from 2024-01-01', '', '1. tenet-users', '2. tenet-focus', ''].join('\n'));
    expect(suggestRevivals(root, 'inc-legacy-users', { at: '2022-06-01' }).map((c) => c.argument)).toEqual(['parallel']);
    expect(suggestRevivals(root, 'inc-legacy-users', { at: '2025-06-01' })).toEqual([]);
  });

  it('accept freezes the phase-resolved attacker as a plain Dung attack: it holds under every later phase (D93)', () => {
    const root = phaseRepo(['# Priorities', '', '## launch · from 2021-01-01', '', '1. tenet-focus', '2. tenet-users', '',
      '## scale · from 2024-01-01', '', '1. tenet-users', '2. tenet-focus', ''].join('\n'));
    const r = acceptIncident(root, 'inc-legacy-users', 'parallel', { phase: 'launch' });
    expect(r.written).toEqual(['.mole/incidents/inc-legacy-users.md']);
    expect(readFileSync(join(root, '.mole/incidents/inc-legacy-users.md'), 'utf8')).toMatch(/^attacks: \[best-effort\]$/m);
    // once accepted, the incident's attack is unvalued -> succeeds in EVERY phase (Dung/Bench-Capon: no value on
    // either side = unfiltered), so 'parallel' stays 'in' even under 'scale', where it would otherwise lose
    expect(evaluatePhase(root, { phase: 'scale' }).labels).toEqual(expect.objectContaining({ parallel: 'in', 'best-effort': 'out' }));
  });

  it('an unknown phase is refused, naming it', () => {
    const root = phaseRepo(['# Priorities', '', '## launch · from 2021-01-01', '', '1. tenet-focus', '2. tenet-users', ''].join('\n'));
    expect(() => suggestRevivals(root, 'inc-legacy-users', { phase: 'growth' })).toThrow(/growth/);
  });
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
    expect(r.written).toEqual(['.mole/incidents/inc-42.md']); // review 3: one atomic write, attack targets frozen in the record
    const l = labels(root);
    expect(l).toEqual(expect.objectContaining({ 'incident-inc-42': 'in', fast: 'out', stale: 'in', other: 'in' }));
    expect(readFileSync(join(root, '.mole/incidents/inc-42.md'), 'utf8')).toMatch(/^revives: \[stale\]$/m);
    expect(readFileSync(join(root, '.mole/incidents/inc-42.md'), 'utf8')).toMatch(/^attacks: \[fast\]$/m);
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

describe('T58 review 1 (deleg_27342d20) findings', () => {
  // review 2 (deleg_21ad1cbf): the round-1 "attack already written" shortcut recorded arguments nobody accepted.
  // Now accept records `revives:` FIRST (only after the candidate check), then writes the attack; a re-run with
  // `revives:` present and the attack missing completes the attack.
  // review 3 (deleg_9d69be3e): a re-run "completion" path could attack for a hand-added revives entry, and against
  // attackers that appeared after the accept. Now there is no completion path: one atomic record write holds both
  // `revives:` and the frozen `attacks:` targets; `revives:` alone carries no attack.
  it('HIGH (review 3): a hand-added revives entry without attacks changes no label, and accept does not complete it', () => {
    const root = repo(['decisions: [D1]', 'revives: [text-logs]']);
    const before = labels(root);
    expect(acceptIncident(root, 'inc-42', 'text-logs').written).toEqual([]);
    expect(labels(root)).toEqual(before);
    expect(existsSync(join(root, '.mole/arguments/incidents.argdown'))).toBe(false);
  });

  it('HIGH (review 3): attack targets are frozen at accept; an attacker added later is never attacked by a re-run', () => {
    const root = repo();
    acceptIncident(root, 'inc-42', 'stale');
    write(root, '.mole/arguments/later.argdown', ['<newevidence>: A later benchmark.', '  -> <stale>', ''].join('\n'));
    expect(acceptIncident(root, 'inc-42', 'stale').written).toEqual([]);
    expect(readFileSync(join(root, '.mole/incidents/inc-42.md'), 'utf8')).toMatch(/^attacks: \[fast\]$/m);
    expect(labels(root)).toEqual(expect.objectContaining({ newevidence: 'in', stale: 'out' })); // engine re-labels normally
  });

  it('HIGH (review 2): never records an argument the person did not accept as a candidate', () => {
    // knock-on sibling: stale2 comes back only because accepting stale knocked out <fast>
    const root = repo();
    write(root, '.mole/arguments/case.argdown', [
      '<fast>: Cache reads are fast and safe enough.', '  -> <stale>: Cached reads can serve stale prices.', '  -> <stale2>: Cached reads hide failed writes.', '',
    ].join('\n'));
    write(root, '.mole/decisions/d2.md', ['---', 'id: D2', 'title: Log in JSON', 'status: accepted', 'cites: [other]', '---', ''].join('\n'));
    write(root, '.mole/arguments/d2.argdown', ['<other>: JSON logs are easy to query.', '  -> <d2dissent>: Plain text logs are easier to read.', ''].join('\n'));
    acceptIncident(root, 'inc-42', 'stale');
    expect(() => acceptIncident(root, 'inc-42', 'stale2')).toThrow(/not a candidate/);
    expect(() => acceptIncident(root, 'inc-42', 'd2dissent')).toThrow(/not a candidate/);
    expect(readFileSync(join(root, '.mole/incidents/inc-42.md'), 'utf8')).toMatch(/^revives: \[stale\]$/m);
  });

  it('HIGH (review 2): a hand-written incident attack is not taken as a pending accept', () => {
    const root = repo();
    write(root, '.mole/arguments/incidents.argdown', ['<incident-inc-42>: written by hand', '  -> <fast>', ''].join('\n'));
    expect(() => acceptIncident(root, 'inc-42', 'stale')).toThrow(/not a candidate/);
    expect(readFileSync(join(root, '.mole/incidents/inc-42.md'), 'utf8')).not.toMatch(/revives/);
  });

  it('HIGH (review 2): suggest on a 10,000-argument attack chain stays fast (adjacency BFS, was 71 s)', () => {
    const root = repo();
    const n = 10_000;
    const lines = ['<fast>: Cache reads are fast.', '  -> <a1>: a1.', ''];
    for (let i = 1; i < n; i++) lines.push(`<a${i}>`, `  -> <a${i + 1}>: a${i + 1}.`, '');
    write(root, '.mole/arguments/case.argdown', lines.join('\n'));
    const t0 = Date.now();
    const s = suggestRevivals(root, 'inc-42');
    expect(Date.now() - t0).toBeLessThan(15_000);
    expect(s.length).toBe(20); // shown list is capped (DEFAULT_SUGGEST_LIMIT); accept still checks all 5,000 losers
    expect(s.every((c) => Array.isArray(c.alsoReinstates))).toBe(true);
    const far = `a${n - (n % 2 === 0 ? 1 : 0)}`; // a losing argument at the far end of the chain
    expect(() => acceptIncident(root, 'inc-42', far)).not.toThrow();
  }, 60_000);

  it('MEDIUM: a dissent 5 attack steps from the decision is still found (no hop limit)', () => {
    const root = repo();
    write(root, '.mole/arguments/case.argdown', [
      '<fast>: Cache reads are fast.', '  -> <h1>: h1.', '', '<h1>', '  -> <h2>: h2.', '', '<h2>', '  -> <h3>: h3.', '',
      '<h3>', '  -> <h4>: h4.', '', '<h4>', '  -> <stale>: Cached reads can serve stale prices.', '',
    ].join('\n'));
    expect(suggestRevivals(root, 'inc-42').map((c) => c.argument)).toContain('stale');
  });

  it('LOW (review 2): a blank line inside a block list does not break the duplicate check', () => {
    const root = repo(['decisions: [D1]', 'dismissed:', '  - other', '', '  - stale']);
    expect(dismissIncident(root, 'inc-42', 'stale').written).toEqual([]);
    expect(readFileSync(join(root, '.mole/incidents/inc-42.md'), 'utf8').match(/- stale/g)).toHaveLength(1);
  });

  it('LOW: appends to a block-style YAML list instead of refusing it', () => {
    const root = repo(['decisions: [D1]', 'dismissed:', '  - other']);
    expect(dismissIncident(root, 'inc-42', 'stale').written).toEqual(['.mole/incidents/inc-42.md']);
    const text = readFileSync(join(root, '.mole/incidents/inc-42.md'), 'utf8');
    expect(text).toMatch(/dismissed:\n {2}- other\n {2}- stale\n/);
    expect(suggestRevivals(root, 'inc-42')).toEqual([]);
  });
});

// T62: `mole incident list` for the panel -- every incident with its top suggestions, read-only
describe('mole incident list (T62)', () => {
  it('lists each incident with its top candidates and writes nothing', () => {
    const root = repo();
    const before = snapshot(root);
    const out: string[] = [];
    const log = console.log;
    console.log = (s: string) => void out.push(s);
    try {
      expect(incidentCli(['list'], {}, root)).toBe(0);
    } finally {
      console.log = log;
    }
    const list = JSON.parse(out.join('\n'));
    expect(list).toEqual([{ id: 'inc-42', title: 'Customers saw stale prices from the cache', candidates: suggestRevivals(root, 'inc-42', { limit: 3 }) }]);
    expect(snapshot(root)).toEqual(before);
  });
});
