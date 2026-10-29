// T18 (after key ruling 1): `git commit -q` prints no sha, so attribution names the commit by its -m subject, and only a
// call that was running when the commit happened counts (a failed retry right after must not be linked). Background
// commands (Hermes proc_*) report their output in a later poll: the commit sha found there links the launching call.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, expect, it } from 'vitest';
import { attribute, tried } from '../src/index.js';

const base = mkdtempSync(join(tmpdir(), 'mole-attr-q-'));
afterAll(() => rmSync(base, { recursive: true, force: true }));

it('links a quiet commit by its subject, not the failed retry after it; a background commit by the sha in its later poll', () => {
  const root = join(base, 'repo');
  mkdirSync(root);
  const git = (a: string[], env?: Record<string, string>) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', env: { ...process.env, ...env } }).trim();
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.email', 't@t']);
  git(['config', 'user.name', 't']);
  const at = (s: number) => ({ GIT_AUTHOR_DATE: `${s} +0000`, GIT_COMMITTER_DATE: `${s} +0000` });
  const T = 1_800_000_000;
  writeFileSync(join(root, 'log.jsonl'), '{}\n');
  git(['add', '-A']);
  git(['commit', '-qm', 'quiet run log: round 1 green'], at(T));
  writeFileSync(join(root, 'b.txt'), 'b\n');
  git(['add', '-A']);
  git(['commit', '-qm', 'background check then commit'], at(T + 100));
  const [q, b] = git(['log', '--reverse', '--format=%H']).split('\n') as [string, string];
  const db = new DatabaseSync(join(base, 'state.db'));
  db.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY, source TEXT NOT NULL, cwd TEXT, parent_session_id TEXT, started_at REAL NOT NULL, ended_at REAL, title TEXT);
    CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT, tool_call_id TEXT,
      tool_calls TEXT, tool_name TEXT, timestamp REAL NOT NULL, _compressed_summary INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, compacted INTEGER NOT NULL DEFAULT 0);`);
  db.prepare('INSERT INTO sessions (id, source, cwd, started_at) VALUES (?,?,?,?)').run('S', 'cli', root, T - 10);
  const ins = db.prepare('INSERT INTO messages (session_id, role, content, tool_call_id, tool_calls, tool_name, timestamp) VALUES (?,?,?,?,?,?,?)');
  const call = (id: string, name: string, args: unknown, t: number) =>
    ins.run('S', 'assistant', null, null, JSON.stringify([{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }]), null, t);
  const res = (id: string, content: unknown, t: number, tool = 'terminal') => ins.run('S', 'tool', JSON.stringify(content), id, null, tool, t);
  call('q1', 'terminal', { command: 'git add -A && git commit -qm "quiet run log: round 1 green"' }, T - 0.5);
  res('q1', { output: '', exit_code: 0, error: null }, T + 0.3);
  call('q2', 'terminal', { command: 'git commit -qm "quiet run log: round 1 green"' }, T + 4); // retry after the fact: nothing to commit
  res('q2', { output: 'nothing to commit, working tree clean', exit_code: 1, error: null }, T + 4.2);
  call('b1', 'terminal', { command: 'npm run check && git add -A && git commit -m "background check then commit"', background: true }, T + 40);
  res('b1', { output: 'Background process started', session_id: 'proc_abc123def456', exit_code: 0, error: null }, T + 40.1);
  call('b2', 'process_manage', { action: 'wait', session_id: 'proc_abc123def456' }, T + 90);
  res('b2', { status: 'exited', exit_code: 0, output: `ok\n[main ${b.slice(0, 7)}] background check then commit` }, T + 101, 'process_manage');
  db.close();
  const src = { hermesDb: join(base, 'state.db'), claudeDir: join(base, 'none'), codexDir: join(base, 'none') };
  const all = attribute(root, 'HEAD', src);
  expect(all).toHaveLength(2);
  const byCommit = new Map(all.map((x) => [x.commit, x]));
  expect(byCommit.get(q)?.link).toMatchObject({ kind: 'commit', step: 'S:q1' });
  expect(byCommit.get(b)?.link).toMatchObject({ kind: 'commit', step: 'S:b1' });
  // the background launch's outcome comes from the later poll
  expect(tried('S', src).items.find((i) => i.step === 'S:b1')).toMatchObject({ kind: 'test', outcome: 'pass' });
});
