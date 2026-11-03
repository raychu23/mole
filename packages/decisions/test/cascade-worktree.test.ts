// T65: Mole's measured verifier (cascade + T53 semantic routing) on UNCOMMITTED work, and in the agent's Stop hook.
// Tests first. The snapshot must never touch the user's index, refs or files.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cascadeCheck, cascadeCheckCli, loadGraph, semanticRouteDocs, snapshotWorktree } from '../src/index.js';
import type { LlmClient } from '../src/compile/types.js';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
const ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (root: string, ...a: string[]) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', env: ENV }).trim();
function write(root: string, file: string, text: string): void {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), text);
}

// an unscoped decision (no anchors: only semantic routing can find it) + a scoped one that the change does not touch.
// Title avoids the word 'export': prCheck's export-convention title heuristic would claim it crisply (T66 owns that bug).
function repo(): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-t65-'));
  dirs.push(root);
  git(root, 'init', '-q', '-b', 'main');
  write(root, 'src/api/report.ts', 'export function report() {\n  return [];\n}\n');
  write(root, 'src/ui/button.ts', 'export const Button = 1;\n');
  write(root, '.mole/decisions/d1.md', ['---', 'id: D1', 'title: Audit every data download', 'status: accepted', '---', '', '## Decision', '', 'Every data export endpoint must call withAuditLog() before it streams rows.', ''].join('\n'));
  write(root, '.mole/decisions/d2.md', ['---', 'id: D2', 'title: Buttons use the design system', 'status: accepted', 'scope:', '  - src/ui/', '---', '', '## Decision', '', 'Buttons come from the design system.', ''].join('\n'));
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'base');
  return root;
}

// the agent's uncommitted work: a modified tracked file, a new untracked export route, a staged-only change
function agentWork(root: string): void {
  write(root, 'src/api/report.ts', 'export function report() {\n  return [1];\n}\n');
  write(root, 'src/api/export/route.ts', 'export async function GET() {\n  const rows = await loadRows();\n  return new Response(toCsv(rows));\n}\n');
  write(root, 'src/api/staged.ts', 'export const staged = true;\n');
  git(root, 'add', 'src/api/staged.ts');
}

const state = (root: string) => ({
  status: git(root, 'status', '--porcelain', '--untracked-files=all'),
  cached: git(root, 'diff', '--cached'),
  index: createHash('sha256').update(readFileSync(join(root, '.git/index'))).digest('hex'),
  refs: git(root, 'show-ref'),
  head: git(root, 'rev-parse', 'HEAD'),
});

// fake model: routes to candidate 1, judges any export without withAuditLog as a violation
const fakeLlm = (): LlmClient & { prompts: string[] } => {
  const prompts: string[] = [];
  return {
    prompts,
    async complete(prompt: string) {
      prompts.push(prompt);
      if (prompt.includes('PICK:')) return { text: 'PICK: 1', usage: {} };
      const violates = prompt.includes('toCsv') && !/\+.*withAuditLog/.test(prompt);
      return { text: violates ? 'VERDICT: violates the export streams rows without withAuditLog()' : 'VERDICT: compliant ok', usage: {} };
    },
  };
};

describe('T65 snapshotWorktree', () => {
  it('captures tracked edits, untracked files and staged changes as a commit; index, refs, status and files untouched', () => {
    const root = repo();
    agentWork(root);
    const before = state(root);
    const snap = snapshotWorktree(root);
    expect(snap.base).toBe(before.head);
    const files = git(root, 'diff', '--name-only', snap.base, snap.head).split('\n');
    expect(files.sort()).toEqual(['src/api/export/route.ts', 'src/api/report.ts', 'src/api/staged.ts']);
    expect(state(root)).toEqual(before);
    expect(readFileSync(join(root, 'src/api/report.ts'), 'utf8')).toContain('[1]');
  });
  it('leaves .mole/ out of the snapshot (records are not code under check)', () => {
    const root = repo();
    agentWork(root);
    write(root, '.mole/decisions/d3.md', '---\nid: D3\ntitle: new\nstatus: accepted\n---\n');
    const snap = snapshotWorktree(root);
    expect(git(root, 'diff', '--name-only', snap.base, snap.head)).not.toContain('.mole/');
  });
  it('review 1: a nested pkg/.mole is left out too', () => {
    const root = repo();
    agentWork(root);
    write(root, 'pkg/.mole/decisions/d9.md', '---\nid: D9\ntitle: nested\nstatus: accepted\n---\n');
    const snap = snapshotWorktree(root);
    expect(git(root, 'diff', '--name-only', snap.base, snap.head)).not.toContain('.mole/');
  });
  it('review 1: a repo with no commit yet has nothing to check (no throw)', () => {
    const root = mkdtempSync(join(tmpdir(), 'mole-t65-empty-'));
    dirs.push(root);
    git(root, 'init', '-q', '-b', 'main');
    write(root, 'a.ts', 'export const a = 1;\n');
    expect(snapshotWorktree(root)).toEqual({ base: '', head: '' });
  });
  it('a clean worktree gives head === base (nothing to check)', () => {
    const root = repo();
    const snap = snapshotWorktree(root);
    expect(snap.head).toBe(snap.base);
  });
});

describe('T65 mole cascade-check --worktree', () => {
  it('routes the unscoped decision by meaning and reports its violation; same verdicts as cascadeCheck on the snapshot commit', async () => {
    const root = repo();
    agentWork(root);
    const out: string[] = [];
    const log = console.log;
    console.log = (s: string) => void out.push(s);
    try {
      expect(await cascadeCheckCli([], { worktree: true, json: true }, root, fakeLlm())).toBe(0);
    } finally {
      console.log = log;
    }
    const r = JSON.parse(out.join('\n'));
    const d1 = r.verdicts.find((v: { decision: string }) => v.decision === 'D1');
    expect(d1).toEqual(expect.objectContaining({ flag: 'violates', tier: 'llm' }));
    expect(r.routing.find((x: { decision: string }) => x.decision === 'D1').hitKinds).toContain('semantic');
    expect(r.verdicts.map((v: { decision: string }) => v.decision)).not.toContain('D2');
    // equal to the library on the same snapshot
    const snap = snapshotWorktree(root);
    const lib = await cascadeCheck({ root, base: snap.base, head: snap.head, llm: fakeLlm(), decisionText: () => readFileSync(join(root, '.mole/decisions/d1.md'), 'utf8'), semanticRoute: { decisions: semanticRouteDocs(root, loadGraph(root)), topK: 5, minScore: 0, confidenceRatio: 1.01, llm: fakeLlm() } });
    expect(lib.verdicts.map((v) => [v.decision, v.flag])).toEqual(r.verdicts.map((v: { decision: string; flag: string }) => [v.decision, v.flag]));
  });
  it('the compliant version is not flagged', async () => {
    const root = repo();
    agentWork(root);
    write(root, 'src/api/export/route.ts', 'export async function GET() {\n  return withAuditLog(async () => new Response(toCsv(await loadRows())));\n}\n');
    const out: string[] = [];
    const log = console.log;
    console.log = (s: string) => void out.push(s);
    try {
      await cascadeCheckCli([], { worktree: true, json: true }, root, fakeLlm());
    } finally {
      console.log = log;
    }
    const r = JSON.parse(out.join('\n'));
    expect(r.verdicts.filter((v: { flag: string }) => v.flag === 'violates')).toEqual([]);
  });
  it('--base/--head still required without --worktree (exit 2)', async () => {
    const err = console.error;
    console.error = () => undefined;
    try {
      expect(await cascadeCheckCli([], {}, repo(), fakeLlm())).toBe(2);
    } finally {
      console.error = err;
    }
  });
});
