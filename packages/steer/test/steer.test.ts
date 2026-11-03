// T74 steer tests (contract tasks/T74-steering-dials/0 start.md): done-when
//  1. `mole steer signal|update|query --session S` writes to a per-session, file-based inbox under .mole/local
//     (never committed) -- never CLAUDE_PLUGIN_DATA, so it works for any session regardless of harness.
//  2. an update is checked by a validator before it is queued; an invalid update is rejected with a reason and
//     never queued for delivery.
//  3. query returns the agent's state (intent, files, decisions in play) from @mole/agentstate's own run graph (T18).
//  4. `deliver` (the hook-side consumer) returns pending signals + accepted updates exactly once; a second call
//     with nothing new pending returns empty.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deliverPending, inboxFile, queryAgentState, readInbox, requestUpdate, sendSignal, validateUpdate } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const cli = resolve(here, '../../daemon/dist/cli.js');

let root: string;
let hermesDb: string;
const H1 = '20261103_100000_steera'; // a run `query` can find

const git = (args: string[]): string =>
  execFileSync('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=f@example.com', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }).trim();
const mole = (args: string[]) => spawnSync(process.execPath, ['--no-warnings', cli, ...args, '--root', root], { encoding: 'utf8', env: { ...process.env, MOLE_HERMES_DB: hermesDb } });

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'mole-steer-'));
  git(['init', '-q', '-b', 'main']);
  writeFileSync(join(root, 'a.ts'), 'export const a = 1;\n');
  git(['add', '.']);
  git(['commit', '-q', '-m', 'init']);
  mkdirSync(join(root, '.mole', 'decisions'), { recursive: true });
  writeFileSync(join(root, '.mole', 'decisions', 'd1.md'), "---\nid: D1\ntitle: keep a.ts simple\nstatus: accepted\napprover: raymond\nscope:\n  - a.ts\n---\n## Decision\nkeep a.ts simple\n");

  hermesDb = join(mkdtempSync(join(tmpdir(), 'mole-steer-db-')), 'state.db');
  const db = new DatabaseSync(hermesDb);
  db.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY, source TEXT NOT NULL, cwd TEXT, parent_session_id TEXT, started_at REAL NOT NULL,
    ended_at REAL, message_count INTEGER DEFAULT 0, tool_call_count INTEGER DEFAULT 0, title TEXT, model TEXT);
  CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT,
    tool_call_id TEXT, tool_calls TEXT, tool_name TEXT, timestamp REAL NOT NULL, _compressed_summary INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1, compacted INTEGER NOT NULL DEFAULT 0);`);
  const t0 = Date.now() / 1000;
  db.prepare('INSERT INTO sessions (id, source, cwd, parent_session_id, started_at, ended_at, message_count, title) VALUES (?,?,?,?,?,?,?,?)').run(H1, 'cli', root, null, t0, t0 + 10, 4, 'editing a.ts');
  const call = (id: string, name: string, args: unknown) => JSON.stringify([{ id, call_id: id, type: 'function', function: { name, arguments: JSON.stringify(args) } }]);
  const ins = db.prepare('INSERT INTO messages (session_id, role, content, tool_call_id, tool_calls, tool_name, timestamp) VALUES (?,?,?,?,?,?,?)');
  ins.run(H1, 'user', 'tidy a.ts', null, null, null, t0 + 1);
  ins.run(H1, 'assistant', null, null, call('c1', 'patch', { path: join(root, 'a.ts'), old_string: 'export const a = 1;', new_string: 'export const a = 2;' }), null, t0 + 2);
  ins.run(H1, 'tool', JSON.stringify({ success: true }), 'c1', null, 'patch', t0 + 3);
  db.close();
  process.env.MOLE_HERMES_DB = hermesDb; // queryAgentState (direct import, no --root-scoped env) reads the default sources
}, 60_000);
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('store: file-based per-session inbox, never under the Claude-Code plugin data dir', () => {
  it('sendSignal/requestUpdate write only under .mole/local (gitignored), not CLAUDE_PLUGIN_DATA', () => {
    sendSignal(root, 'sess-store', 'stop editing a.ts');
    const f = inboxFile(root, 'sess-store');
    expect(f.startsWith(join(root, '.mole', 'local'))).toBe(true);
    expect(existsSync(f)).toBe(true);
    expect(readFileSync(join(root, '.mole', 'local', '.gitignore'), 'utf8')).toContain('*');
    const status = git(['status', '--porcelain', '--ignored']);
    expect(status).toContain('!! .mole/local/');
  });
});

describe('validateUpdate: accept/reject before an update is queued (Update Validator semantics)', () => {
  it('rejects an unknown kind with a reason, and never queues it', () => {
    const r = requestUpdate(root, 'sess-v1', { kind: 'nonsense', text: 'do a thing' });
    expect(r.accepted).toBe(false);
    expect(r.reason).toMatch(/unknown update kind/);
    expect(readInbox(root, 'sess-v1').updates).toHaveLength(0);
  });
  it('rejects stop-editing with no target, and a target outside the repo', () => {
    expect(validateUpdate(root, { kind: 'stop-editing', text: 'x' }).accepted).toBe(false);
    expect(validateUpdate(root, { kind: 'stop-editing', target: '../../etc/passwd', text: 'x' }).accepted).toBe(false);
  });
  it('accepts stop-editing with a target inside the repo', () => {
    const r = requestUpdate(root, 'sess-v2', { kind: 'stop-editing', target: 'a.ts', text: 'stop editing a.ts: it is frozen' });
    expect(r.accepted).toBe(true);
    expect(readInbox(root, 'sess-v2').updates).toHaveLength(1);
  });
  it('decision-superseded: accepts a real decision id, rejects an unknown one with the known ids in the reason', () => {
    expect(requestUpdate(root, 'sess-v3', { kind: 'decision-superseded', target: 'D1', text: 'D1 is superseded by D2' }).accepted).toBe(true);
    const bad = requestUpdate(root, 'sess-v3', { kind: 'decision-superseded', target: 'D99', text: 'D99 is superseded' });
    expect(bad.accepted).toBe(false);
    expect(bad.reason).toContain('D1');
  });
});

describe('deliverPending: exactly-once delivery', () => {
  it('a fresh session with nothing queued delivers nothing', () => {
    expect(deliverPending(root, 'sess-empty')).toEqual({ session: 'sess-empty', signals: [], updates: [] });
  });
  it('delivers a queued signal once, then not again', () => {
    sendSignal(root, 'sess-d1', 'note: decision D1 now covers this file');
    const first = deliverPending(root, 'sess-d1');
    expect(first.signals).toHaveLength(1);
    expect(first.signals[0]!.text).toBe('note: decision D1 now covers this file');
    const second = deliverPending(root, 'sess-d1');
    expect(second.signals).toHaveLength(0);
  });
  it('delivers an accepted update, never a rejected one', () => {
    requestUpdate(root, 'sess-d2', { kind: 'stop-editing', target: 'a.ts', text: 'stop touching a.ts' });
    requestUpdate(root, 'sess-d2', { kind: 'bogus', text: 'nope' });
    const d = deliverPending(root, 'sess-d2');
    expect(d.updates).toHaveLength(1);
    expect(d.updates[0]!.text).toBe('stop touching a.ts');
    expect(deliverPending(root, 'sess-d2').updates).toHaveLength(0);
  });
  it('a second signal queued after delivery is delivered on the next call (not lost, not repeated)', () => {
    sendSignal(root, 'sess-d1', 'second note');
    const d = deliverPending(root, 'sess-d1');
    expect(d.signals.map((s) => s.text)).toEqual(['second note']);
  });
});

describe('queryAgentState: read-only snapshot from @mole/agentstate (T18)', () => {
  it('unknown session: found false, no throw', async () => {
    const s = await queryAgentState(root, 'no-such-session');
    expect(s).toEqual({ session: 'no-such-session', found: false });
  });
  it('a known run: intent, files in play, decisions in play (D1 covers a.ts)', async () => {
    const s = await queryAgentState(root, H1);
    expect(s.found).toBe(true);
    expect(s.harness).toBe('hermes');
    expect(s.filesInPlay).toContain(join(root, 'a.ts'));
    expect((s.decisionsInPlay ?? []).map((d) => d.id)).toContain('D1');
    expect(s.lastStep).toBeTruthy();
  });
});

describe('CLI: mole steer signal|update|query|deliver', () => {
  it('signal --session, then deliver --session returns it once', () => {
    const out = mole(['steer', 'signal', '--session', 'sess-cli1', 'hello from the CLI', '--json']);
    expect(out.status).toBe(0);
    const sent = JSON.parse(out.stdout);
    expect(sent.text).toBe('hello from the CLI');
    const d1 = JSON.parse(mole(['steer', 'deliver', '--session', 'sess-cli1', '--json']).stdout);
    expect(d1.signals.map((s: { text: string }) => s.text)).toEqual(['hello from the CLI']);
    const d2 = JSON.parse(mole(['steer', 'deliver', '--session', 'sess-cli1', '--json']).stdout);
    expect(d2.signals).toHaveLength(0);
  });
  it('update rejected -> non-zero exit and a reason on stdout/json; never queued', () => {
    const out = mole(['steer', 'update', '--session', 'sess-cli2', '--kind', 'nonsense', 'do a thing', '--json']);
    expect(out.status).toBe(1);
    const r = JSON.parse(out.stdout);
    expect(r.accepted).toBe(false);
    expect(r.reason).toMatch(/unknown update kind/);
    expect(JSON.parse(mole(['steer', 'deliver', '--session', 'sess-cli2', '--json']).stdout).updates).toHaveLength(0);
  });
  it('query --session --json on the fixture hermes run', () => {
    const out = mole(['steer', 'query', '--session', H1, '--json']);
    expect(out.status).toBe(0);
    const s = JSON.parse(out.stdout);
    expect(s.found).toBe(true);
    expect(s.harness).toBe('hermes');
  });
});
