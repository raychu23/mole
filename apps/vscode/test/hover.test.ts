// T15 done-when 1 (hover content: past fix reason + test + source, links that open the commit / the file) and
// done-when 6 (daemon not running -> no hover, no gutter mark, nothing thrown). Pure: no vscode import.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildHover, HOVER_COMMANDS, Touched, touchedRanges, type CheckJson, type HoverNote } from '../src/hover.js';

const SHA = '9e19c51865114310db5e40c6114123e1b32a6995';
const FILE = 'packages/daemon/src/server.ts';
const fix = {
  sha: SHA,
  shortSha: '9e19c51',
  subject: 'T9 review fixes: Node-too-old message shown in panel, idle clock counts editing',
  date: '2026-10-27T22:57:30-05:00',
  author: 'Raymond Chu',
  reason: 'T9 review fixes: Node-too-old message shown in panel | comment packages/daemon/src/server.ts:211: editing counts as use: a person typing in one file for an hour must not lose the map',
  reasonSources: [
    { kind: 'commit' as const, text: 'T9 review fixes: Node-too-old message shown in panel, idle clock counts editing' },
    { kind: 'comment' as const, path: FILE, line: 211, text: 'editing counts as use: a person typing in one file for an hour must not lose the map' },
  ],
  tests: [{ file: 'packages/daemon/test/daemon.test.ts', names: ['idle shutdown (T9)', 'default sources (T9)'], via: 'fix' as const }],
  source: { sha: SHA, file: FILE, line: 211 },
  lines: [211, 212],
};
// the planted M8 change (bdeff14 + planted-m8.diff), as `mole check --worktree --json` prints it
const check: CheckJson = {
  change: { kind: 'worktree', ref: 'working tree', base: 'bdeff14ce689273faa080d2a0c739483c7995799' },
  fixRule: '^(fix|revert)\\b|regression|review fixes',
  hunks: [
    { file: FILE, oldStart: 211, oldLines: 2, newStart: 210, newLines: 0, pastFixes: [fix] },
    { file: FILE, oldStart: 215, oldLines: 0, newStart: 214, newLines: 1, pastFixes: [] },
    { file: FILE, oldStart: 217, oldLines: 1, newStart: 215, newLines: 0, pastFixes: [{ ...fix, source: { sha: SHA, file: FILE, line: 217 }, lines: [217] }] },
    { file: 'other.ts', oldStart: 3, oldLines: 2, newStart: 3, newLines: 2, pastFixes: [] },
  ],
  noPastFixes: false,
  ms: 41,
  questions: [
    {
      rank: 1,
      kind: 'past-fix',
      text: 'You edit packages/daemon/src/server.ts:211-212, lines 9e19c51 wrote as a fix. Does your change keep that fix working?',
      cites: { sha: SHA },
      source: { file: FILE, line: 211, sha: SHA },
    },
  ],
};
const note: HoverNote = { file: '.mole/notes/daemon-startwatching.md', symbol: `${FILE}#Daemon.startWatching`, path: FILE, status: 'stale', changed: true, text: 'the watcher keeps the idle clock honest', startLine: 208, endLine: 225 };

/** every command link in a markdown string: [name, decoded JSON args] */
const links = (md: string): Array<[string, unknown[]]> =>
  [...md.matchAll(/\]\(command:([\w.]+)\?([^)\s]+)\)/g)].map((m) => [m[1] as string, JSON.parse(decodeURIComponent(m[2] as string)) as unknown[]]);

describe('touched lines (gutter marks)', () => {
  it('maps hunks to their NEW-side lines; a pure deletion marks the two lines around the gap; hunks with nothing to say get no mark', () => {
    const r = touchedRanges(check, [], FILE).map((t) => [t.startLine, t.endLine]);
    expect(r).toEqual([[210, 211], [215, 216]]);
    expect(touchedRanges(check, [], 'other.ts')).toEqual([]);
    expect(touchedRanges(undefined, [], FILE)).toEqual([]);
  });

  it('a hunk with no past fix still gets a mark when one of your notes sits on its lines', () => {
    expect(touchedRanges(check, [note], FILE).map((t) => [t.startLine, t.endLine])).toEqual([[210, 211], [214, 214], [215, 216]]);
  });
});

describe('buildHover (done-when 1)', () => {
  const md = buildHover(check, [note], FILE, 210) ?? '';

  it('shows the past fix: short sha + subject, why, the guarding test (file + name) and the source', () => {
    expect(md).toContain('9e19c51');
    expect(md).toContain('T9 review fixes');
    expect(md).toContain('editing counts as use');
    expect(md).toContain('packages/daemon/test/daemon.test.ts');
    expect(md).toContain('idle shutdown (T9)');
    expect(md).toMatch(/server\.ts:211/);
  });

  it('links open the commit (mole.showCommit) and the source file:line in the fix (mole.openAt), and nothing else', () => {
    const l = links(md);
    expect(l).toContainEqual(['mole.showCommit', [SHA]]);
    expect(l).toContainEqual(['mole.openAt', [FILE, 211, SHA]]);
    for (const [cmd] of l) expect(HOVER_COMMANDS as readonly string[]).toContain(cmd);
    expect([...HOVER_COMMANDS].sort()).toEqual(['mole.openAt', 'mole.showCommit']);
  });

  it("shows the change's questions that cite this hunk, and your note on these lines with its stale flag", () => {
    expect(md).toContain('Does your change keep that fix working?');
    expect(md).toContain('the watcher keeps the idle clock honest');
    expect(md).toMatch(/stale/);
    expect(md).toContain('Daemon.startWatching');
  });

  it('nothing for a line no change touched, for an unmarked hunk, for another file, or without a check', () => {
    expect(buildHover(check, [note], FILE, 100)).toBeUndefined();
    expect(buildHover(check, [], FILE, 214)).toBeUndefined();
    expect(buildHover(check, [], 'other.ts', 3)).toBeUndefined();
    expect(buildHover(undefined, [note], FILE, 210)).toBeUndefined();
  });

  it('text from commits cannot add links or commands (markdown is escaped)', () => {
    const evil: CheckJson = { ...check, questions: [], hunks: [{ ...check.hunks[0]!, pastFixes: [{ ...fix, subject: 'fix [click](command:workbench.action.quit) <img src=x>', reasonSources: [{ kind: 'comment', path: FILE, line: 1, text: '[x](https://evil.example)' }] }] }] };
    const out = buildHover(evil, [], FILE, 210) ?? '';
    expect(out).toContain('9e19c51');
    for (const [cmd] of links(out)) expect(HOVER_COMMANDS as readonly string[]).toContain(cmd);
    expect(out).not.toMatch(/\]\(command:workbench/);
    expect(out).not.toMatch(/\]\(https:\/\/evil/);
    expect(out).not.toContain('<img');
  });
});

describe('Touched: daemon not running (done-when 6)', () => {
  const deps = (up: boolean, calls: string[]) => ({
    daemonUp: async () => (calls.push('ping'), up),
    check: async () => (calls.push('check'), check),
    notes: async () => (calls.push('notes'), [note]),
    log: (m: string) => calls.push(`log:${m}`),
  });

  it('daemon up: refresh loads the check, the file gets marks and the touched line a hover', async () => {
    const calls: string[] = [];
    const t = new Touched(deps(true, calls));
    expect(await t.refresh()).toBe(true);
    expect(t.ranges(FILE).length).toBeGreaterThan(0);
    expect(await t.hover(FILE, 210)).toContain('9e19c51');
  });

  it('daemon down: no marks, no hover, the check is never run, nothing thrown', async () => {
    const calls: string[] = [];
    const t = new Touched(deps(false, calls));
    expect(await t.refresh()).toBe(false);
    expect(t.ranges(FILE)).toEqual([]);
    expect(await t.hover(FILE, 210)).toBeUndefined();
    expect(calls).not.toContain('check');
  });

  it('daemon goes down after a refresh: the cached hover and marks disappear on the next refresh/hover', async () => {
    let up = true;
    const t = new Touched({ daemonUp: async () => up, check: async () => check, notes: async () => [] });
    await t.refresh();
    expect(await t.hover(FILE, 210)).toBeDefined();
    up = false;
    expect(await t.hover(FILE, 210)).toBeUndefined();
    await t.refresh();
    expect(t.ranges(FILE)).toEqual([]);
  });

  it('a failing check (CLI crash, bad JSON) is logged, never thrown: no hover', async () => {
    const logs: string[] = [];
    const t = new Touched({ daemonUp: async () => true, check: async () => Promise.reject(new Error('boom')), notes: async () => [], log: (m) => logs.push(m) });
    await expect(t.refresh()).resolves.toBe(false);
    expect(await t.hover(FILE, 210)).toBeUndefined();
    expect(t.ranges(FILE)).toEqual([]);
    expect(logs.join(' ')).toContain('boom');
  });

  it('the extension never raises an error/warning popup for Mole data (output channel only)', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/extension.ts'), 'utf8');
    expect(src).not.toMatch(/show(Error|Warning)Message/);
    expect(src).toContain("registerHoverProvider");
  });
});
