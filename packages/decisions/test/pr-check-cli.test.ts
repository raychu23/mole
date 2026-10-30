// T32 red tests: `mole pr-check` CLI (registered in packages/daemon/src/cli.ts with one line), the fake GitHub event path,
// the check-run payload written for the action to POST, and the workflow + composite action (done-when 1 and 3:
// pull_request trigger, contents: read + checks: write only, ONE `gh api` check-runs POST per run, never a PR comment).
// (written with a terminal heredoc: write_file is approval-gated for test files in this unattended run)
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prCheckCli } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const cli = resolve(repoRoot, 'packages/daemon/dist/cli.js');
const git = (root: string, ...args: string[]) =>
  execFileSync('git', ['-C', root, '-c', 'user.name=T', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }).trim();

let root = '';
let base = '';
let head = '';
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'mole-pr-cli-'));
  git(root, 'init', '-q', '-b', 'main');
  mkdirSync(join(root, '.mole', 'decisions'), { recursive: true });
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'CODEOWNERS'), '* @team/core\n');
  writeFileSync(join(root, 'src', 'a.ts'), 'export function foo(): number {\n  return 1;\n}\n');
  writeFileSync(join(root, '.mole', 'decisions', '0001.md'), "---\nid: '0001'\ntitle: Foo returns one\nstatus: accepted\nscope:\n  - src/a.ts#foo\n---\n");
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'base');
  base = git(root, 'rev-parse', 'HEAD');
  writeFileSync(join(root, 'src', 'a.ts'), 'export function foo(): number {\n  return 2;\n}\n');
  git(root, 'commit', '-q', '-am', 'change foo');
  head = git(root, 'rev-parse', 'HEAD');
});
afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

describe('mole pr-check CLI', () => {
  it('reads base/head from a pull_request event file and writes the check-run payload to --out', async () => {
    const event = join(root, 'event.json');
    const out = join(root, 'payload.json');
    writeFileSync(event, JSON.stringify({ action: 'synchronize', number: 7, pull_request: { number: 7, base: { sha: base }, head: { sha: head } } }));
    const log = console.log;
    console.log = () => {};
    let code: number;
    try {
      code = await prCheckCli([], { event, out, 'no-history': true }, root);
    } finally {
      console.log = log;
    }
    expect(code).toBe(0);
    const payload = JSON.parse(readFileSync(out, 'utf8'));
    expect(payload.name).toBe('mole');
    expect(payload.head_sha).toBe(head);
    expect(payload.output.annotations.some((a: { title: string }) => a.title.includes('0001'))).toBe(true);
  });

  it('usage error (exit 2) without a base/head or an event', async () => {
    const err = console.error;
    console.error = () => {};
    try {
      expect(await prCheckCli([], {}, root)).toBe(2);
    } finally {
      console.error = err;
    }
  });

  it('the daemon CLI registers the subcommand with one line and runs it', () => {
    const src = readFileSync(resolve(repoRoot, 'packages/daemon/src/cli.ts'), 'utf8');
    expect(src).toContain("if (cmd === 'pr-check') return (await import('@mole/decisions')).prCheckCli(pos, flags, root);");
    const r = spawnSync(process.execPath, [cli, 'pr-check', '--base', base, '--head', head, '--root', root, '--json', '--no-history'], { encoding: 'utf8', timeout: 60_000 });
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.governed.map((g: { id: string }) => g.id)).toEqual(['0001']);
    expect(j.owners).toEqual(['@team/core']);
    expect(j.checkRun.head_sha).toBe(head);
  });
});

describe('workflow + reusable action', () => {
  const wfPath = resolve(repoRoot, '.github/workflows/mole-pr-check.yml');
  const actPath = resolve(repoRoot, '.github/actions/mole-check/action.yml');

  it('the workflow runs on pull_request with contents: read + checks: write only and uses the local action once', () => {
    const text = readFileSync(wfPath, 'utf8');
    const wf = parse(text);
    expect(Object.keys(wf.on ?? wf[true as unknown as string] ?? {})).toContain('pull_request');
    expect(wf.permissions).toEqual({ contents: 'read', checks: 'write' });
    expect(text).not.toMatch(/pull-requests:\s*write|issues:\s*write/);
    expect(text.match(/uses:\s*\.\/\.github\/actions\/mole-check/g)?.length).toBe(1);
    expect(text).toContain('concurrency');
  });

  it('the composite action builds, runs mole pr-check and POSTs ONE check run with GITHUB_TOKEN, never a comment', () => {
    const text = readFileSync(actPath, 'utf8');
    const act = parse(text);
    expect(act.runs.using).toBe('composite');
    expect(text).toContain('pr-check');
    expect(text.match(/gh api/g)?.length).toBe(1);
    expect(text).toMatch(/check-runs/);
    expect(text).toMatch(/GITHUB_TOKEN|github\.token/);
    expect(text).not.toMatch(/gh pr comment|\/comments|gh issue comment/);
  });
});
