// T24 review 1 P2-4: the Stop hook stays silent (no stdout, no stderr line) when `mole claims` does not know the session.
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, expect, it } from 'vitest';

const plugin = join(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(plugin, '../../packages/daemon/dist/cli.js');
let base = '';
let root = '';

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'mole-claims-quiet-'));
  root = join(base, 'repo');
  mkdirSync(join(base, 'claude'), { recursive: true });
  mkdirSync(root);
  execFileSync('git', ['init', '-q', '-b', 'main', root]);
  writeFileSync(join(root, 'a.txt'), 'a\n');
  execFileSync('git', ['-C', root, '-c', 'user.name=F', '-c', 'user.email=f@example.com', 'add', '.']);
  execFileSync('git', ['-C', root, '-c', 'user.name=F', '-c', 'user.email=f@example.com', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'a']);
});
afterAll(() => rmSync(base, { recursive: true, force: true }));

it('unknown session id: exit 0, no stdout, no stderr', () => {
  const r = spawnSync(process.execPath, [join(plugin, 'scripts', 'stop.mjs')], {
    input: JSON.stringify({ session_id: 'no-such-session-7f3a', cwd: root, hook_event_name: 'Stop', stop_hook_active: false }),
    encoding: 'utf8',
    env: { ...process.env, MOLE_BIN: cli, MOLE_CLAUDE_DIR: join(base, 'claude'), MOLE_HERMES_DB: join(base, 'none.db'), MOLE_CODEX_DIR: join(base, 'none'), CLAUDE_PLUGIN_DATA: join(base, 'data') },
    timeout: 60_000,
  });
  expect(r.status).toBe(0);
  expect(r.stdout.trim()).toBe('');
  expect(r.stderr.trim()).toBe('');
}, 60_000);
