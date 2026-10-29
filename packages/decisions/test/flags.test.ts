// T29 red tests: every flag rule of tasks/T29-decision-graph-core/2 insights.md section 0, incl. done-when 4
// (a scope path that no longer exists -> red 'orphaned', never green), propagation to a fixed point, file:line on every reason.
// (written with a terminal heredoc: write_file is approval-gated for test files in this unattended run)
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { computeFlags, loadGraph, type FlagResult } from '../src/index.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const git = (root: string, ...args: string[]) =>
  execFileSync('git', ['-C', root, '-c', 'user.name=T', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }).trim();

function write(root: string, files: Record<string, string>): void {
  for (const [p, t] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), t);
  }
}
function commit(root: string, msg: string): string {
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '--allow-empty', '-m', msg);
  return git(root, 'rev-parse', 'HEAD');
}
function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-dec-flags-'));
  dirs.push(root);
  git(root, 'init', '-q', '-b', 'main');
  write(root, files);
  commit(root, 'base');
  return root;
}
const edit = (root: string, p: string, from: string, to: string) => {
  const t = readFileSync(join(root, p), 'utf8');
  if (!t.includes(from)) throw new Error(`fixture: ${from} not in ${p}`);
  writeFileSync(join(root, p), t.replace(from, to));
};

const flags = (root: string, ctx = {}, adrDirs: string[] = []): Map<string, FlagResult> =>
  new Map(computeFlags(loadGraph(root, { adrDirs }), ctx).map((f) => [f.id, f]));

const rec = (id: string, extra: string, status = 'accepted') => `---\nid: '${id}'\ntitle: Decision ${id}\nstatus: ${status}\ndoor: two-way\n${extra}approver: raymond\nsource: test\n---\n\nBody of ${id}.\n`;

const CODE = `export class Daemon {
  start(): void {
    this.watch();
  }

  /** idle clock */
  watch(): number {
    return Math.max(50, 1000 / 4);
  }
}

export function helper(x: number): number {
  return x + 1;
}
`;
const TEST = `import { it } from 'vitest';
describe('idle shutdown (T9)', () => {
  it('stops', () => {});
});
`;
const TENETS = '# Tenets\n\n## tenet-1 · Facts come from code\n\n## tenet-2 · A background process must not outlive its editor\n';

/** 0007 scoped to src/server.ts#Daemon.watch + src/cli.ts, evidence test; confirmed falls back to the record's last commit */
function base(): string {
  return repo({
    '.mole/tenets.md': TENETS,
    '.mole/decisions/0007-idle.md': rec('0007', "traces_to: [tenet-2]\nscope:\n  - src/server.ts#Daemon.watch\n  - src/cli.ts\nevidence:\n  - test: test/daemon.test.ts#idle shutdown (T9)\n"),
    'src/server.ts': CODE,
    'src/cli.ts': 'export function main(): number {\n  return 0;\n}\n',
    'src/other.ts': 'export const other = 1;\n',
    'test/daemon.test.ts': TEST,
  });
}
// line numbers inside rec('0007', ...): 1 ---, 2 id, 3 title, 4 status, 5 door, 6 traces_to, 7 scope, 8 server#watch, 9 cli.ts, 10 evidence, 11 test
const FILE = '.mole/decisions/0007-idle.md';

function everyReasonHasFileLine(all: Map<string, FlagResult>): void {
  for (const f of all.values()) {
    expect(f.file.length).toBeGreaterThan(0);
    expect(f.line).toBeGreaterThan(0);
    for (const r of f.reasons) {
      expect(typeof r.file).toBe('string');
      expect(r.line).toBeGreaterThan(0);
      expect(r.text.length).toBeGreaterThan(0);
    }
  }
}

describe('green and grey', () => {
  it('accepted, anchors intact, evidence present -> green with no reasons; tenets green', () => {
    const f = flags(base());
    expect(f.get('0007')).toMatchObject({ flag: 'green', reasons: [], kind: 'decision', file: FILE });
    expect(f.get('tenet-1')?.flag).toBe('green');
  });
  it('proposed and rejected -> grey; no scope and no evidence listed is not a flag', () => {
    const root = base();
    write(root, {
      '.mole/decisions/0020-p.md': rec('0020', 'traces_to: [tenet-1]\n', 'proposed'),
      '.mole/decisions/0021-r.md': rec('0021', '', 'rejected'),
      '.mole/decisions/0022-bare.md': rec('0022', ''),
    });
    commit(root, 'more');
    const f = flags(root);
    expect(f.get('0020')?.flag).toBe('grey');
    expect(f.get('0021')?.flag).toBe('grey');
    expect(f.get('0022')?.flag).toBe('green');
  });
});

describe('yellow: scope changed since confirmed', () => {
  it('a body change in a scoped symbol after the record was committed -> yellow scope_changed at the scope entry line', () => {
    const root = base();
    edit(root, 'src/server.ts', 'Math.max(50, 1000 / 4)', 'Math.max(100, 1000 / 4)');
    commit(root, 'edit watch');
    const f = flags(root);
    expect(f.get('0007')?.flag).toBe('yellow');
    expect(f.get('0007')?.reasons).toEqual(expect.arrayContaining([expect.objectContaining({ flag: 'yellow', code: 'scope_changed', file: FILE, line: 8 })]));
    everyReasonHasFileLine(f);
  });
  it('an uncommitted working-tree edit counts too', () => {
    const root = base();
    edit(root, 'src/cli.ts', 'return 0;', 'return 1;');
    expect(flags(root).get('0007')?.reasons).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'scope_changed', line: 9 })]));
  });
  it('whitespace-only and comment-only edits in scope stay green', () => {
    const root = base();
    edit(root, 'src/server.ts', '  /** idle clock */\n  watch(): number {\n    return', '  /** idle clock, polled */\n  watch(): number {\n    // four polls per period\n\n      return');
    edit(root, 'src/cli.ts', 'return 0;', 'return   0; // ok');
    commit(root, 'cosmetic');
    expect(flags(root).get('0007')?.flag).toBe('green');
  });
  it('an edit outside every scope stays green (another symbol in the same file, another file)', () => {
    const root = base();
    edit(root, 'src/server.ts', 'return x + 1;', 'return x + 2;');
    edit(root, 'src/other.ts', '= 1', '= 2');
    commit(root, 'outside');
    expect(flags(root).get('0007')?.flag).toBe('green');
  });
  it('an explicit confirmed sha wins over the record commit; re-confirming at the new sha turns it green', () => {
    const root = base();
    const first = git(root, 'rev-parse', 'HEAD');
    edit(root, 'src/server.ts', 'Math.max(50, 1000 / 4)', 'Math.max(100, 1000 / 4)');
    commit(root, 'edit watch');
    // the record is committed after the edit, but says the approver confirmed the first commit
    edit(root, FILE, 'approver: raymond\n', `approver: raymond\nconfirmed: ${first}\n`);
    const later = commit(root, 'record confirmed at first');
    expect(flags(root).get('0007')?.flag).toBe('yellow');
    edit(root, FILE, `confirmed: ${first}`, `confirmed: ${later}`);
    commit(root, 're-confirm');
    expect(flags(root).get('0007')?.flag).toBe('green');
  });
  it('a folder scope changes when a file under it changes', () => {
    const root = repo({
      '.mole/decisions/0030-f.md': rec('0030', 'scope:\n  - lib/\n'),
      'lib/a.ts': 'export const a = 1;\n',
      'lib/b.ts': 'export const b = 1;\n',
    });
    expect(flags(root).get('0030')?.flag).toBe('green');
    edit(root, 'lib/b.ts', '= 1', '= 2');
    commit(root, 'edit lib');
    expect(flags(root).get('0030')?.reasons).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'scope_changed' })]));
  });
});

describe('done-when 4: anchors gone', () => {
  it('the only scope path no longer exists -> red orphaned, never green', () => {
    const root = repo({
      '.mole/decisions/0011-notes.md': rec('0011', 'scope:\n  - src/notes.ts\n'),
      'src/notes.ts': 'export function addNote(): void {}\n',
    });
    rmSync(join(root, 'src/notes.ts'));
    commit(root, 'delete notes');
    const f = flags(root).get('0011');
    expect(f?.flag).toBe('red');
    expect(f?.flag).not.toBe('green');
    expect(f?.reasons).toEqual(expect.arrayContaining([expect.objectContaining({ flag: 'red', code: 'orphaned', file: '.mole/decisions/0011-notes.md', line: 7 })]));
  });
  it('every anchor gone (a deleted symbol + a deleted file) -> red orphaned', () => {
    const root = base();
    edit(root, 'src/server.ts', '  /** idle clock */\n  watch(): number {\n    return Math.max(50, 1000 / 4);\n  }\n', '');
    rmSync(join(root, 'src/cli.ts'));
    commit(root, 'remove both');
    expect(flags(root).get('0007')).toMatchObject({ flag: 'red' });
    expect(flags(root).get('0007')?.reasons.map((r) => r.code)).toContain('orphaned');
  });
  it('a missing folder scope is gone too', () => {
    const root = repo({ '.mole/decisions/0031-f.md': rec('0031', 'scope:\n  - lib/\n'), 'lib/a.ts': 'export const a = 1;\n' });
    rmSync(join(root, 'lib'), { recursive: true });
    commit(root, 'rm lib');
    expect(flags(root).get('0031')?.flag).toBe('red');
  });
  it('one of two anchors gone -> yellow anchor_gone at that entry line', () => {
    const root = base();
    rmSync(join(root, 'src/cli.ts'));
    commit(root, 'delete cli');
    const f = flags(root).get('0007');
    expect(f?.flag).toBe('yellow');
    expect(f?.reasons).toEqual(expect.arrayContaining([expect.objectContaining({ flag: 'yellow', code: 'anchor_gone', file: FILE, line: 9 })]));
  });
});

describe('yellow: evidence', () => {
  it('the evidence test name is gone -> yellow evidence_missing at the evidence line', () => {
    const root = base();
    edit(root, 'test/daemon.test.ts', "describe('idle shutdown (T9)'", "describe('daemon lifetime'");
    commit(root, 'rename test');
    expect(flags(root).get('0007')?.reasons).toEqual(expect.arrayContaining([expect.objectContaining({ flag: 'yellow', code: 'evidence_missing', file: FILE, line: 11 })]));
  });
  it('the evidence test file is gone -> yellow evidence_missing', () => {
    const root = base();
    rmSync(join(root, 'test/daemon.test.ts'));
    commit(root, 'rm test');
    expect(flags(root).get('0007')?.flag).toBe('yellow');
  });
  it('an incident named as evidence that has no record -> yellow evidence_missing', () => {
    const root = repo({ '.mole/decisions/0009-e.md': rec('0009', 'evidence:\n  - incident: 2026-10-27-nothing\n') });
    expect(flags(root).get('0009')?.reasons.map((r) => r.code)).toContain('evidence_missing');
  });
  it('a failing test in a vitest JSON report -> yellow evidence_failing; a passing one stays green', () => {
    const root = base();
    const report = (status: string) => ({
      testResults: [{ name: join(root, 'test/daemon.test.ts'), status, assertionResults: [{ ancestorTitles: ['idle shutdown (T9)'], title: 'stops', fullName: 'idle shutdown (T9) stops', status }] }],
    });
    const file = join(root, '..', `${root.split('/').pop()}-report.json`);
    dirs.push(file);
    writeFileSync(file, JSON.stringify(report('failed')));
    const f = flags(root, { testReport: file }).get('0007');
    expect(f?.flag).toBe('yellow');
    expect(f?.reasons).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'evidence_failing', file: FILE, line: 11 })]));
    expect(flags(root, { testReport: report('passed') }).get('0007')?.flag).toBe('green');
  });
});

describe('red and yellow from other records', () => {
  it('status superseded / deprecated / superseded_by -> red', () => {
    const root = base();
    write(root, {
      '.mole/decisions/0040-s.md': rec('0040', '', 'superseded'),
      '.mole/decisions/0041-d.md': rec('0041', '', 'deprecated'),
      '.mole/decisions/0042-b.md': rec('0042', "superseded_by: ['0007']\n"),
    });
    commit(root, 'statuses');
    const f = flags(root);
    expect(f.get('0040')?.flag).toBe('red');
    expect(f.get('0041')?.flag).toBe('red');
    expect(f.get('0042')?.flag).toBe('red');
    everyReasonHasFileLine(f);
  });
  it('a new ACCEPTED record superseding 0007 -> 0007 red, the exception overriding 0007 yellow (propagation)', () => {
    const root = base();
    write(root, {
      '.mole/decisions/0008-x.md': rec('0008', "traces_to: [tenet-2]\noverrides: ['0007']\n"),
      '.mole/decisions/0016-new.md': rec('0016', "traces_to: [tenet-2]\nsupersedes: ['0007']\n"),
    });
    commit(root, 'supersede');
    const f = flags(root);
    expect(f.get('0007')?.flag).toBe('red');
    expect(f.get('0007')?.reasons).toEqual(expect.arrayContaining([expect.objectContaining({ flag: 'red', code: 'superseded', by: '0016' })]));
    expect(f.get('0008')?.flag).toBe('yellow');
    expect(f.get('0008')?.reasons).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'inherited', by: '0007' })]));
    expect(f.get('0016')?.flag).toBe('green');
  });
  it('a new PROPOSED record that conflicts with / supersedes / overrides an accepted one -> yellow; the proposal itself stays grey', () => {
    const root = base();
    write(root, {
      '.mole/decisions/0010-a.md': rec('0010', ''),
      '.mole/decisions/0011-b.md': rec('0011', ''),
      '.mole/decisions/0016-p.md': rec('0016', "conflicts_with: ['0007']\nsupersedes: ['0010']\noverrides: ['0011']\n", 'proposed'),
    });
    commit(root, 'proposal');
    const f = flags(root);
    for (const id of ['0007', '0010', '0011']) {
      expect(f.get(id)?.flag).toBe('yellow');
      expect(f.get(id)?.reasons).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'proposed_change', by: '0016' })]));
    }
    expect(f.get('0016')?.flag).toBe('grey');
  });
  it('a retired tenet is red and every decision tracing to it turns yellow', () => {
    const root = base();
    edit(root, '.mole/tenets.md', '## tenet-2 · A background', '## tenet-2 · retired · A background');
    commit(root, 'retire');
    const f = flags(root);
    expect(f.get('tenet-2')).toMatchObject({ flag: 'red', kind: 'tenet' });
    expect(f.get('tenet-2')?.reasons).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'retired', file: '.mole/tenets.md', line: 5 })]));
    expect(f.get('0007')?.flag).toBe('yellow');
    expect(f.get('0007')?.reasons).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'inherited', by: 'tenet-2', file: FILE, line: 6 })]));
  });
  it('propagation runs to a fixed point along traces_to / overrides / cites, and terminates on cycles', () => {
    const root = base();
    write(root, {
      '.mole/decisions/0008-o.md': rec('0008', "overrides: ['0007']\n"),
      '.mole/decisions/0050-t.md': rec('0050', "traces_to: ['0008']\n"),
      '.mole/decisions/0051-c.md': rec('0051', "cites: ['0050']\n"),
      '.mole/decisions/0052-u.md': rec('0052', "traces_to: [tenet-1]\n"),
      '.mole/decisions/0060-x.md': rec('0060', "traces_to: ['0061']\n"),
      '.mole/decisions/0061-y.md': rec('0061', "traces_to: ['0060']\n"),
    });
    commit(root, 'chain');
    expect(flags(root).get('0051')?.flag).toBe('green');
    edit(root, 'src/server.ts', 'Math.max(50, 1000 / 4)', 'Math.max(100, 1000 / 4)');
    commit(root, 'edit');
    const f = flags(root);
    expect(['0007', '0008', '0050', '0051'].map((id) => f.get(id)?.flag)).toEqual(['yellow', 'yellow', 'yellow', 'yellow']);
    expect(f.get('0052')?.flag).toBe('green');
    expect(f.get('0060')?.flag).toBe('green');
    expect(f.get('0061')?.flag).toBe('green');
    everyReasonHasFileLine(f);
  });
});

describe('plain ADR folders', () => {
  it('Superseded by / Deprecated -> red, Amends a yellow record -> yellow, Pending -> grey, body links ignored', () => {
    const root = repo({
      'docs/adr/0004-dns.md': '# 4. DNS\n\n## Status\n\nSuperseded by [DNS Infrastructure](0015-dns.md)\n',
      'docs/adr/0010-dirs.md': '# 10. Dirs\n\n## Status\n\nAccepted\n\nAmended by [17. Data](0017-data.md)\n',
      'docs/adr/0015-dns.md': '# 15. DNS\n\n## Status\n\nAccepted\n\n## Context\n\nReplaces [4](0004-dns.md).\n',
      'docs/adr/0017-data.md': '# 17. Data\n\n## Status\n\nAccepted\n\nAmends [10. Dirs](0010-dirs.md)\n',
      'docs/adr/0022-proxy.md': '# 22. Proxy\n\n## Status\n\nDeprecated\n',
      'docs/adr/0031-sg.md': '# 31. SG\n\n## Status\n\nPending\n',
    });
    let f = flags(root, {}, ['docs/adr']);
    expect(f.get('0004')?.flag).toBe('red');
    expect(f.get('0004')?.reasons[0]).toMatchObject({ file: 'docs/adr/0004-dns.md', line: 5 });
    expect(f.get('0022')?.flag).toBe('red');
    expect(f.get('0031')?.flag).toBe('grey');
    expect(f.get('0015')?.flag).toBe('green');
    expect(f.get('0017')?.flag).toBe('green');
    write(root, { 'docs/adr/0040-new.md': '# 40. New dirs\n\n## Status\n\nProposed\n\nSupersedes [10. Dirs](0010-dirs.md)\n' });
    commit(root, 'proposal');
    f = flags(root, {}, ['docs/adr']);
    expect(f.get('0010')?.flag).toBe('yellow');
    expect(f.get('0017')?.flag).toBe('yellow');
    expect(f.get('0040')?.flag).toBe('grey');
  });
});
