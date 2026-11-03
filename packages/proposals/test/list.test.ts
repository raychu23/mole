// T62: proposal discovery moves here from packages/mcp (T61 repoProposals) so the MCP tool, the daemon CLI
// (`mole proposals`) and the VS Code panel share ONE implementation. Tests first.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compareProposals, createProposal, evaluateProposal, listProposals, summarizeProposals } from '../src/index.js';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
const ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (root: string, ...a: string[]): string => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', env: ENV }).trim();
const tmp = (p: string): string => { const d = mkdtempSync(join(tmpdir(), p)); dirs.push(d); return d; };
function write(root: string, file: string, text: string): void {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), text);
}
function repo(): string {
  const root = tmp('mole-t62-props-');
  git(root, 'init', '-q', '-b', 'main');
  write(root, '.mole/decisions/d1.md', ['---', 'id: D1', 'title: Cache reads', 'status: accepted', 'cites: [A]', '---', ''].join('\n'));
  write(root, '.mole/arguments/case.argdown', ['<A>: Cache reads are safe.', '  -> <B>: Cache reads can serve stale data.', ''].join('\n'));
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'baseline');
  return root;
}

describe('T62 listProposals / summarizeProposals (one source for MCP, CLI and panel)', () => {
  it('lists only worktrees createProposal made for this repo, on their own branch, sorted by name', () => {
    const root = repo();
    const b = tmp('mole-t62-wt-');
    createProposal({ repo: root, name: 'zeta', path: join(b, 'z') });
    createProposal({ repo: root, name: 'alpha', path: join(b, 'a') });
    git(root, 'worktree', 'add', '-q', '-b', 'unrelated', join(b, 'u'), 'HEAD');
    expect(listProposals(root).map((p) => [p.meta.name, realpathSync(p.path)])).toEqual([['alpha', realpathSync(join(b, 'a'))], ['zeta', realpathSync(join(b, 'z'))]]);
  });
  it('summarize: none -> no proposals; one -> its evaluation; two+ -> compareProposals; unknown name refused', () => {
    const root = repo();
    expect(summarizeProposals(root)).toEqual({ proposals: [] });
    const b = tmp('mole-t62-wt-');
    const a = createProposal({ repo: root, name: 'alpha', path: join(b, 'a') });
    expect(summarizeProposals(root)).toEqual({ baselineRevision: a.baselineRevision, proposals: [evaluateProposal(join(b, 'a'))] });
    createProposal({ repo: root, name: 'beta', path: join(b, 'b') });
    expect(summarizeProposals(root)).toEqual(compareProposals([join(b, 'a'), join(b, 'b')]));
    expect(summarizeProposals(root, ['beta'])).toEqual({ baselineRevision: a.baselineRevision, proposals: [evaluateProposal(join(b, 'b'))] });
    expect(() => summarizeProposals(root, ['nope'])).toThrow(/unknown proposal nope/);
  });
});
