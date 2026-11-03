// A session in ANOTHER repo must never show up in this repo's coverage. Found 11-03: the T35 worktree fallback
// (WORKTREE_PREFIX, for removed Mole-worktrees/<task> paths) applied to every root, so `mole coverage` on an
// unrelated 7-file repo listed 807 files from Mole's own sessions and took 38 s (mcp bounded-pagination timeout).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { scanCoverage } from '../src/index.js';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
const tmp = (p: string) => {
  const d = mkdtempSync(join(tmpdir(), p));
  dirs.push(d);
  return d;
};
function repo(base: string): string {
  mkdirSync(join(base, 'src'), { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: base });
  writeFileSync(join(base, 'src/a.ts'), 'export const a = 1;\n');
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '.'], { cwd: base });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'], { cwd: base });
  return base;
}
// one Claude Code session that read a file in a (removed) Mole worktree
function claudeLogs(readPath: string, cwd: string): string {
  const d = tmp('mole-cov-claude-');
  mkdirSync(join(d, 'proj'), { recursive: true });
  const lines = [
    { type: 'user', sessionId: 's1', cwd, timestamp: '2026-11-01T10:00:00.000Z', message: { role: 'user', content: 'go' } },
    { type: 'assistant', sessionId: 's1', cwd, timestamp: '2026-11-01T10:00:01.000Z', message: { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: readPath } }] } },
  ];
  writeFileSync(join(d, 'proj/s1.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  return d;
}
const none = (d: string) => ({ hermesDb: join(d, 'none.db'), codexDir: join(d, 'none-codex') });

describe('coverage never attributes another repo\'s files', () => {
  it('a Mole-worktree path does not appear in an unrelated repo', () => {
    const other = repo(tmp('mole-cov-other-'));
    const logs = claudeLogs('/x/Project/Mole-worktrees/T9-gone/src/a.ts', '/x/Project/Mole-worktrees/T9-gone');
    const r = scanCoverage(other, { ...none(other), claudeDir: logs });
    expect(r.files.map((f) => f.file)).toEqual([]);
  });
  it('control: the same session still counts for a Mole checkout (T35 fallback kept)', () => {
    const base = tmp('mole-cov-main-');
    const mole = repo(join(base, 'Project', 'Mole'));
    const logs = claudeLogs('/x/Project/Mole-worktrees/T9-gone/src/a.ts', '/x/Project/Mole-worktrees/T9-gone');
    const r = scanCoverage(mole, { ...none(mole), claudeDir: logs });
    expect(r.files.map((f) => f.file)).toContain('src/a.ts');
  });
});
