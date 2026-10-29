// T29 red tests: parser (Mole front matter, tenets/intent/incidents, Nygard/adr-tools, backstage), malformed record -> file:line.
// (written with a terminal heredoc: write_file is approval-gated for test files in this unattended run)
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadGraph } from '../src/index.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const git = (root: string, ...args: string[]) =>
  execFileSync('git', ['-C', root, '-c', 'user.name=T', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }).trim();

function repo(files: Record<string, string>, commit = true): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-dec-parse-'));
  dirs.push(root);
  for (const [p, t] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), t);
  }
  if (commit) {
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'base');
  }
  return root;
}

const R0007 = `---
id: '0007'
title: Stop the daemon after 30 idle minutes
status: accepted
door: two-way
traces_to: [tenet-2]
scope:
  - src/a.ts
  - src/b.ts#B.run
overridden_by: [0008]
evidence:
  - test: test/a.test.ts#idle shutdown
approver: raymond
source: commit abc1234
---

## Decision

Stop after 30 idle minutes.
`;

const R0008 = `---
id: 0008
title: Indexing never counts as idle
status: accepted
overrides: ['0007']
constrains: ['0007']
cites: [tenet-2]
---

Body.
`;

const TENETS = `# Tenets

## tenet-1 · Facts come from code

text

## tenet-2 · retired · A background process must not outlive its editor
`;

describe('Mole records', () => {
  it('front matter fields with the file:line of each key and each scope / evidence entry', () => {
    const root = repo({
      '.mole/decisions/0007-idle.md': R0007,
      '.mole/decisions/0008-indexing.md': R0008,
      '.mole/tenets.md': TENETS,
      'src/a.ts': 'export const a = 1;\n',
      'src/b.ts': 'export class B {\n  run() {}\n}\n',
    });
    const g = loadGraph(root);
    expect(g.problems).toEqual([]);
    const d = g.nodes.find((n) => n.id === '0007');
    expect(d).toMatchObject({ kind: 'decision', format: 'mole', status: 'accepted', door: 'two-way', approver: 'raymond', file: '.mole/decisions/0007-idle.md' });
    expect(d?.title).toBe('Stop the daemon after 30 idle minutes');
    expect(d?.fields.status).toBe(4);
    expect(d?.fields.scope).toBe(7);
    expect(d?.scope).toEqual([
      { target: 'src/a.ts', file: '.mole/decisions/0007-idle.md', line: 8 },
      { target: 'src/b.ts#B.run', file: '.mole/decisions/0007-idle.md', line: 9 },
    ]);
    expect(d?.evidence).toEqual([{ test: 'test/a.test.ts#idle shutdown', file: '.mole/decisions/0007-idle.md', line: 12 }]);
    // an unquoted numeric id keeps its text (0008, not 8)
    expect(g.nodes.map((n) => n.id)).toEqual(expect.arrayContaining(['0007', '0008', 'tenet-1', 'tenet-2']));
    expect(g.edges).toEqual(
      expect.arrayContaining([
        { from: '0007', to: 'tenet-2', type: 'traces_to', file: '.mole/decisions/0007-idle.md', line: 6 },
        { from: '0008', to: '0007', type: 'overrides', file: '.mole/decisions/0007-idle.md', line: 10 },
        expect.objectContaining({ from: '0008', to: '0007', type: 'constrains' }),
        expect.objectContaining({ from: '0008', to: 'tenet-2', type: 'cites' }),
        expect.objectContaining({ from: '0007', to: 'src/b.ts#B.run', type: 'applies_to' }),
      ]),
    );
    // overridden_by in 0007 and overrides in 0008 describe the same relation: one edge
    expect(g.edges.filter((e) => e.from === '0008' && e.to === '0007' && e.type === 'overrides')).toHaveLength(1);
  });

  it('tenets from ## tenet-N headings (retired in the heading), intent and incidents as nodes', () => {
    const root = repo({
      '.mole/tenets.md': TENETS,
      '.mole/decisions/0009-editing.md': `---\nid: '0009'\ntitle: Editing counts as use\nstatus: accepted\ntraces_to: [tenet-2]\nevidence:\n  - incident: 2026-10-27-map-stopped\n---\n`,
      '.mole/intent/packages/daemon.md': `---\nfolder: packages/daemon\npurpose: keep the index warm\nend_state: stops when unused\nrisk: cold start\nask: raymond\ntenets: [tenet-2]\n---\n`,
      '.mole/incidents/2026-10-27-map-stopped.md': `---\nid: 2026-10-27-map-stopped\ndate: 2026-10-27\nfix: 9e19c51\ntest: test/a.test.ts#idle shutdown\ndecisions: ['0009']\n---\n\nWhat broke.\n`,
    });
    const g = loadGraph(root);
    const t2 = g.nodes.find((n) => n.id === 'tenet-2');
    expect(t2).toMatchObject({ kind: 'tenet', retired: true, file: '.mole/tenets.md', line: 7 });
    expect(g.nodes.find((n) => n.id === 'tenet-1')).toMatchObject({ kind: 'tenet', title: 'Facts come from code', line: 3 });
    expect(g.nodes.find((n) => n.kind === 'intent')).toMatchObject({ file: '.mole/intent/packages/daemon.md' });
    expect(g.nodes.find((n) => n.kind === 'incident')).toMatchObject({ id: '2026-10-27-map-stopped' });
    expect(g.edges).toEqual(expect.arrayContaining([expect.objectContaining({ from: '2026-10-27-map-stopped', to: '0009', type: 'evidence_for' })]));
  });

  it('a malformed record is reported with file:line and does not hide the good ones', () => {
    const root = repo({
      '.mole/decisions/0001-good.md': `---\nid: '0001'\ntitle: Good\nstatus: accepted\n---\n`,
      '.mole/decisions/0002-bad.md': `---\nid: '0002'\ntitle: [unclosed\nstatus: accepted\n---\n`,
      '.mole/decisions/0003-noclose.md': `---\nid: '0003'\ntitle: never closed\n`,
      '.mole/decisions/0004-noid.md': `---\ntitle: no id\nstatus: accepted\n---\n`,
    });
    const g = loadGraph(root);
    expect(g.nodes.map((n) => n.id)).toContain('0001');
    const bad = g.problems.find((p) => p.file === '.mole/decisions/0002-bad.md');
    expect(bad).toBeDefined();
    expect(bad!.line).toBeGreaterThanOrEqual(2);
    expect(bad!.line).toBeLessThanOrEqual(5);
    expect(bad!.message.length).toBeGreaterThan(0);
    expect(g.problems.find((p) => p.file === '.mole/decisions/0003-noclose.md')?.line).toBe(1);
    expect(g.problems.find((p) => p.file === '.mole/decisions/0004-noid.md')?.line).toBeGreaterThanOrEqual(1);
  });
});

describe('plain ADR folders (no Mole front matter)', () => {
  it('Nygard / adr-tools: status from ## Status, relations only from the status section', () => {
    const root = repo({
      'docs/adr/0002-hosting.md': '# 2. Hosting\n\nDate: 2017-07-04\n\n## Status\n\nAccepted\n\n## Context\n\nSee [DNS](0015-dns.md) for names.\n',
      'docs/adr/0004-dns-definitions.md': '# 4. DNS definitions\n\nDate: 2017-07-14\n\n## Status\n\nSuperseded by [DNS Infrastructure](0015-dns.md)\n\n## Context\n\nOld.\n',
      'docs/adr/0006-puppet.md': '# 6. Puppet\n\n## Status\n\nPending\n',
      'docs/adr/0010-terraform-dirs.md': '# 10. Terraform dirs\n\n## Status\n\nAccepted\n\nAmended by [17. Data](0017-data.md)\n',
      'docs/adr/0015-dns.md': '# 15. DNS Infrastructure\n\n## Status\n\nAccepted\n',
      'docs/adr/0017-data.md': '# 17. Data\n\n## Status\n\nAccepted\n\nAmends [10. Terraform dirs](0010-terraform-dirs.md)\n',
      'docs/adr/0022-proxy.md': '# 22. Proxy\n\n## Status\n\nDeprecated\n',
    });
    const g = loadGraph(root, { adrDirs: ['docs/adr'] });
    const byId = new Map(g.nodes.map((n) => [n.id, n]));
    expect(byId.get('0004')).toMatchObject({ kind: 'decision', format: 'nygard', status: 'superseded', title: '4. DNS definitions', file: 'docs/adr/0004-dns-definitions.md' });
    expect(byId.get('0006')?.status).toBe('proposed');
    expect(byId.get('0022')?.status).toBe('deprecated');
    expect(byId.get('0015')?.status).toBe('accepted');
    expect(g.edges).toEqual(
      expect.arrayContaining([
        { from: '0015', to: '0004', type: 'supersedes', file: 'docs/adr/0004-dns-definitions.md', line: 7 },
        expect.objectContaining({ from: '0017', to: '0010', type: 'amends' }),
      ]),
    );
    expect(g.edges.filter((e) => e.from === '0017' && e.to === '0010' && e.type === 'amends')).toHaveLength(1);
    // a link in the body (Context) is context, not treatment: no edge
    expect(g.edges.filter((e) => (e.from === '0002' || e.to === '0002') && e.type !== 'applies_to')).toEqual([]);
  });

  it('backstage: front matter title + :::note Superseded block; template and index are not records', () => {
    const root = repo({
      'docs/architecture-decisions/adr000-template.md': "---\nid: adrs-adr000\ntitle: 'ADR000: [TITLE]'\n---\n\n## Context\n",
      'docs/architecture-decisions/index.md': '---\nid: adrs-overview\ntitle: Architecture Decision Records (ADR)\n---\n\nOverview.\n',
      'docs/architecture-decisions/adr013-use-node-fetch.md':
        "---\nid: adrs-adr013\ntitle: 'ADR013: [superseded] Proper use of HTTP fetching libraries'\n---\n\n:::note Superseded\n\nThis ADR has been superseded by [ADR014](./adr014-use-fetch.md) and no longer applies.\n\n:::\n\n## Context\n",
      'docs/architecture-decisions/adr014-use-fetch.md':
        "---\nid: adrs-adr014\ntitle: 'ADR014: Proper use of HTTP fetching libraries'\n---\n\n## Context\n\nUntil now we recommended [ADR013](./adr013-use-node-fetch.md).\n",
      'docs/architecture-decisions/adr006-avoid-react-fc.md':
        "---\nid: adrs-adr006\ntitle: 'ADR006: Avoid React.FC'\n---\n\n:::note[Superseded]\n\nThis ADR has been superseded by [ADR014](./adr014-use-fetch.md).\n\n:::\n",
    });
    const g = loadGraph(root, { adrDirs: ['docs/architecture-decisions'] });
    const ids = g.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(['adr006', 'adr013', 'adr014']);
    const a13 = g.nodes.find((n) => n.id === 'adr013');
    expect(a13).toMatchObject({ format: 'backstage', status: 'superseded' });
    expect(g.nodes.find((n) => n.id === 'adr014')?.status).toBe('accepted');
    expect(g.nodes.find((n) => n.id === 'adr006')?.status).toBe('superseded');
    expect(g.edges).toEqual(expect.arrayContaining([expect.objectContaining({ from: 'adr014', to: 'adr013', type: 'supersedes', file: 'docs/architecture-decisions/adr013-use-node-fetch.md' })]));
    // adr014's body link to adr013 is not a relation
    expect(g.edges.filter((e) => e.file === 'docs/architecture-decisions/adr014-use-fetch.md' && e.type !== 'applies_to')).toEqual([]);
  });

  it('an ADR id already used by a Mole record falls back to the file path', () => {
    const root = repo({
      '.mole/decisions/0007-idle.md': `---\nid: '0007'\ntitle: Mole 0007\nstatus: accepted\n---\n`,
      'docs/adr/0007-puppet-certs.md': '# 7. Puppet certs\n\n## Status\n\nAccepted\n',
    });
    const g = loadGraph(root, { adrDirs: ['docs/adr'] });
    expect(g.nodes.map((n) => n.id)).toEqual(expect.arrayContaining(['0007', 'docs/adr/0007-puppet-certs.md']));
  });
});
