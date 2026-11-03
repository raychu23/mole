// T68: proposal comparison respects the phase in force (T60 priorities) instead of plain Dung, with the
// plain-Dung reading always shown beside it (STOP clause: never pick silently). Tests first.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createProposal, evaluateProposal } from '../src/index.js';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
function tmp(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}
const ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
function git(root: string, ...args: string[]): string {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', env: ENV }).trim();
}
function write(root: string, file: string, text: string): void {
  const path = join(root, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

// T61 replay case (best-effort #tenet-focus <-> parallel #tenet-users mutual attack; python-tuf ADR-0002-style
// trade-off, ILLUSTRATIVE): ADR-0002 cites best-effort. The 'lts-window' proposal adds an UNTAGGED
// <security-window> attacking best-effort -- unconditional in every phase (Dung/Bench-Capon: no value, no filter).
function baseline(priorities: string): string {
  const root = tmp('mole-t68-prop-');
  git(root, 'init', '-q', '-b', 'main');
  write(root, '.mole/tenets.md', ['# Tenets', '', '## tenet-focus · Spend finite maintainer time moving forward', '', '## tenet-users · Do not strand downstream users', ''].join('\n'));
  write(root, '.mole/decisions/adr-0002.md', ['---', 'id: ADR-0002', 'title: Pre-1.0 deprecation strategy', 'status: accepted', 'cites: [best-effort]', '---', ''].join('\n'));
  write(root, '.mole/arguments/0002.argdown', [
    '<best-effort>: Support the legacy code on a best-effort basis. #tenet-focus',
    '  -> <parallel>: Maintain the legacy code in parallel for a fixed period. #tenet-users',
    '',
    '<parallel>',
    '  -> <best-effort>',
    '',
  ].join('\n'));
  write(root, '.mole/priorities.md', priorities);
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'baseline');
  return root;
}

function ltsWindowProposal(root: string, name = 'lts-window'): string {
  const p = join(tmp('mole-t68-prop-wt-'), name);
  createProposal({ repo: root, name, path: p });
  write(p, '.mole/arguments/0002.argdown', [
    '<best-effort>: Support the legacy code on a best-effort basis. #tenet-focus',
    '  -> <parallel>: Maintain the legacy code in parallel for a fixed period. #tenet-users',
    '',
    '<parallel>',
    '  -> <best-effort>',
    '',
    '<security-window>: A one-year LTS window lets users who cannot migrate yet still get security fixes.',
    '  -> <best-effort>',
    '',
  ].join('\n'));
  return p;
}

const LAUNCH_FIRST = ['# Priorities', '', '## launch · from 2021-01-01', '', '1. tenet-focus', '2. tenet-users', ''].join('\n');
const USERS_FIRST = ['# Priorities', '', '## scale · from 2021-01-01', '', '1. tenet-users', '2. tenet-focus', ''].join('\n');

describe('T68: evaluateProposal under the phase in force (done-when 1, 2, STOP)', () => {
  it('plain Dung always shows the change (the cycle breaks because security-window is unranked and unattacked)', () => {
    const root = baseline(LAUNCH_FIRST);
    const r = evaluateProposal(ltsWindowProposal(root), { phase: 'launch' });
    expect(r.plainDung.arguments.map((c) => [c.id, c.before, c.after]).sort()).toEqual([
      ['best-effort', 'undecided', 'out'], ['parallel', 'undecided', 'in'], ['security-window', 'absent', 'in'],
    ]);
    expect(r.plainDung.decisions).toEqual([expect.objectContaining({ id: 'ADR-0002', before: 'contested', after: 'defeated' })]);
  });

  it("under 'launch' (tenet-focus wins at baseline) the phase-resolved change is REAL: best-effort holds, then the untagged attacker defeats it in every phase", () => {
    const root = baseline(LAUNCH_FIRST);
    const r = evaluateProposal(ltsWindowProposal(root), { phase: 'launch' });
    expect(r.changes.decisions).toEqual([expect.objectContaining({ id: 'ADR-0002', before: 'holds', after: 'defeated' })]);
    expect(r.phase).toEqual({ before: 'launch', after: 'launch' });
  });

  it("under 'scale' (tenet-users already wins at baseline) ADR-0002 is ALREADY defeated: the proposal's phase-resolved change is a NO-OP, unlike plain Dung's contested->defeated (the T61 replay case)", () => {
    const root = baseline(USERS_FIRST);
    const r = evaluateProposal(ltsWindowProposal(root), { phase: 'scale' });
    expect(r.changes.decisions).toEqual([]); // no new change under the phase: it was already defeated
    expect(r.changes.arguments.map((c) => c.id)).toEqual(['security-window']); // new argument shows; best-effort/parallel (already out/in under scale) are unaffected by it
    expect(r.plainDung.decisions).toEqual([expect.objectContaining({ id: 'ADR-0002', before: 'contested', after: 'defeated' })]); // plain Dung still shows a change
  });

  it('done-when 3: default (no --phase/--at) uses the phase in force today, not plain Dung', () => {
    const root = baseline(['# Priorities', '', '## always · from 2000-01-01', '', '1. tenet-focus', '2. tenet-users', ''].join('\n'));
    const r = evaluateProposal(ltsWindowProposal(root));
    expect(r.phase).toEqual({ before: 'always', after: 'always' });
    expect(r.changes.decisions).toEqual([expect.objectContaining({ id: 'ADR-0002', before: 'holds', after: 'defeated' })]);
  });

  it('--at resolves each side against its own priorities.md', () => {
    const root = baseline(['# Priorities', '', '## launch · from 2021-01-01', '', '1. tenet-focus', '2. tenet-users', '',
      '## scale · from 2024-01-01', '', '1. tenet-users', '2. tenet-focus', ''].join('\n'));
    const r1 = evaluateProposal(ltsWindowProposal(root, 'lts-window-1'), { at: '2022-06-01' });
    expect(r1.phase).toEqual({ before: 'launch', after: 'launch' });
    const r2 = evaluateProposal(ltsWindowProposal(root, 'lts-window-2'), { at: '2025-06-01' });
    expect(r2.phase).toEqual({ before: 'scale', after: 'scale' });
    expect(r2.changes.decisions).toEqual([]);
  });

  it('no priorities file: changes equals plainDung (T60 no-audience fallback, unchanged)', () => {
    const root = baseline(LAUNCH_FIRST);
    rmSync(join(root, '.mole/priorities.md'));
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'drop priorities');
    const p = ltsWindowProposal(root);
    const r = evaluateProposal(p);
    expect(r.phase).toEqual({});
    expect(r.changes).toEqual(r.plainDung);
  });
});
