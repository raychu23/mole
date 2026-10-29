// T29 red tests: `mole decisions [--json] [--root] [--adr-dir] [--test-report]` (done-when 1), MCP mole_decisions returns the
// same JSON (tool list checked with toContain: a shared registry), Mole's own .mole records load with every anchor present,
// and the package makes no network/model calls (R6).
// (written with a terminal heredoc: write_file is approval-gated for test files in this unattended run)
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterEach, describe, expect, it } from 'vitest';
import { decisions } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const cli = resolve(here, '../../daemon/dist/cli.js');
const mcpBin = resolve(here, '../../mcp/dist/cli.js');
const repoRoot = resolve(here, '../../..');

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c();
});

const git = (root: string, ...args: string[]) =>
  execFileSync('git', ['-C', root, '-c', 'user.name=T', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }).trim();

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-dec-cli-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  const files: Record<string, string> = {
    '.mole/tenets.md': '# Tenets\n\n## tenet-1 · Facts come from code\n',
    '.mole/decisions/0001-keep.md': "---\nid: '0001'\ntitle: Keep a\nstatus: accepted\ntraces_to: [tenet-1]\nscope:\n  - src/a.ts\nevidence:\n  - test: test/a.test.ts#a works\n---\n",
    '.mole/decisions/0002-gone.md': "---\nid: '0002'\ntitle: Gone b\nstatus: accepted\nscope:\n  - src/b.ts\n---\n",
    '.mole/decisions/0003-prop.md': "---\nid: '0003'\ntitle: Proposal\nstatus: proposed\n---\n",
    'src/a.ts': 'export const a = 1;\n',
    'src/b.ts': 'export const b = 1;\n',
    'test/a.test.ts': "it('a works', () => {});\n",
    'docs/adr/0004-old.md': '# 4. Old\n\n## Status\n\nSuperseded by [New](0005-new.md)\n',
    'docs/adr/0005-new.md': '# 5. New\n\n## Status\n\nAccepted\n',
  };
  for (const [p, t] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), t);
  }
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'base');
  rmSync(join(root, 'src/b.ts'));
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'delete b');
  return root;
}

const run = (...args: string[]) => spawnSync(process.execPath, ['--no-warnings', cli, 'decisions', ...args], { encoding: 'utf8', timeout: 20000 });

describe('mole decisions (done-when 1)', () => {
  it('--json lists every decision and tenet with flag + reasons + file:line', () => {
    const root = fixture();
    const r = run('--json', '--root', root, '--adr-dir', 'docs/adr');
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout) as { root: string; decisions: Array<Record<string, unknown>>; problems: unknown[] };
    expect(out.root).toBe(root);
    expect(Array.isArray(out.problems)).toBe(true);
    const byId = new Map(out.decisions.map((d) => [d.id as string, d]));
    expect([...byId.keys()].sort()).toEqual(['0001', '0002', '0003', '0004', '0005', 'tenet-1']);
    for (const d of out.decisions) {
      expect(d).toEqual(expect.objectContaining({ id: expect.any(String), kind: expect.any(String), title: expect.any(String), status: expect.any(String), flag: expect.any(String), file: expect.any(String), line: expect.any(Number), reasons: expect.any(Array) }));
    }
    expect(byId.get('0001')).toMatchObject({ flag: 'green', file: '.mole/decisions/0001-keep.md', line: 1 });
    expect(byId.get('0002')).toMatchObject({ flag: 'red', reasons: [expect.objectContaining({ flag: 'red', code: 'orphaned', file: '.mole/decisions/0002-gone.md', line: 6 })] });
    expect(byId.get('0003')?.flag).toBe('grey');
    expect(byId.get('0004')).toMatchObject({ flag: 'red', file: 'docs/adr/0004-old.md' });
    expect(byId.get('0005')?.flag).toBe('green');
  });

  it('text output: one line per decision with flag, id and file:line, reasons indented with file:line', () => {
    const root = fixture();
    const r = run('--root', root);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/red\s+0002\b.*\.mole\/decisions\/0002-gone\.md:1/);
    expect(r.stdout).toMatch(/orphaned.*\.mole\/decisions\/0002-gone\.md:6/);
    expect(r.stdout).toMatch(/green\s+0001\b/);
  });

  it('--test-report makes a decision with failing evidence yellow', () => {
    const root = fixture();
    const report = join(root, 'report.json');
    writeFileSync(report, JSON.stringify({ testResults: [{ name: join(root, 'test/a.test.ts'), status: 'failed', assertionResults: [{ ancestorTitles: [], title: 'a works', fullName: 'a works', status: 'failed' }] }] }));
    const out = JSON.parse(run('--json', '--root', root, '--test-report', report).stdout) as { decisions: Array<{ id: string; flag: string; reasons: Array<{ code: string }> }> };
    const d = out.decisions.find((x) => x.id === '0001');
    expect(d?.flag).toBe('yellow');
    expect(d?.reasons.map((x) => x.code)).toContain('evidence_failing');
  });

  it("Mole's own .mole records load without problems and every scope anchor exists", () => {
    const r = decisions(repoRoot);
    expect(r.problems).toEqual([]);
    const ids = r.decisions.map((d) => d.id);
    expect(ids).toEqual(expect.arrayContaining(['tenet-1', 'tenet-2', 'tenet-3', '0007', '0008', '0009', '0010', '0011', '0012', '0013', '0014', '0015']));
    for (const d of r.decisions) {
      const codes = d.reasons.map((x) => x.code);
      expect(codes, `${d.id} ${JSON.stringify(d.reasons)}`).not.toContain('orphaned');
      expect(codes, `${d.id} ${JSON.stringify(d.reasons)}`).not.toContain('anchor_gone');
      expect(codes, `${d.id} ${JSON.stringify(d.reasons)}`).not.toContain('evidence_missing');
      expect(d.flag).not.toBe('red');
    }
  });
});

describe('MCP mole_decisions', () => {
  it('is in the tool list (toContain) and returns the same JSON as the CLI', async () => {
    const root = fixture();
    const env = { ...process.env, MOLE_ROOT: root, MOLE_STATE_DIR: join(root, '.state') } as Record<string, string>;
    const client = new Client({ name: 'test', version: '0' });
    await client.connect(new StdioClientTransport({ command: process.execPath, args: ['--no-warnings', mcpBin], env }));
    cleanups.push(() => client.close());
    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name)).toContain('mole_decisions');
    const res = await client.callTool({ name: 'mole_decisions', arguments: { adrDir: ['docs/adr'] } });
    expect(res.isError).toBeFalsy();
    const text = (res.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    const viaCli = JSON.parse(run('--json', '--root', root, '--adr-dir', 'docs/adr').stdout);
    expect(JSON.parse(text)).toEqual(viaCli);
  }, 30000);
});

describe('R6: no model or network calls', () => {
  it('the package source imports no network client and calls no fetch', () => {
    const src = resolve(here, '../src');
    const bad = /\bfetch\s*\(|from\s+['"](?:node:)?(?:http|https|http2|net|tls|dgram|undici)['"]|openai|anthropic|@ai-sdk/;
    const files = readdirSync(src).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(bad.test(readFileSync(join(src, f), 'utf8')), f).toBe(false);
  });
});
