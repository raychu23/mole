// T24 red tests (contract tasks/T24-agent-claim-check/0 start.md): done-when 1 (`mole claims <run>`: each claim -> evidence
// (tool call id, exit code, commit) -> supported / unsupported / contradicted; deterministic split + patterns), 3 (the MCP
// tool mole_claims, same JSON as the CLI), 4 (an answer with no checkable claim -> 'nothing to check', exit 0).
// Fixtures are synthetic copies of the real formats (Hermes state.db rows, Claude Code JSONL) + a fixture git repo.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { claims, finalAnswers, formatClaims, splitClaims, type Claim, type Sources } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const cli = resolve(here, '../../daemon/dist/cli.js');
const mcpBin = resolve(here, '../../mcp/dist/cli.js');

const HA = '20261102_100000_claima'; // fixed, tested, committed; claims a push and hover checks only a subagent reported
const HB = '20261102_110000_claimb'; // says tests pass, the last run failed
const HC = '20261102_120000_claimc'; // no checkable claim
const HD = '20261102_130000_claimd'; // a commit sha it never made
const CA = '33333333-2222-4333-8444-555555555555'; // Claude Code: wrote a file, tests pass

let base: string;
let root: string;
let src: Required<Sources>;
let sha7: string;
const rows: Record<string, number> = {};

const git = (args: string[]): string =>
  execFileSync('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=f@example.com', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }).trim();
const env = (): Record<string, string> =>
  ({ ...process.env, MOLE_HERMES_DB: src.hermesDb, MOLE_CLAUDE_DIR: src.claudeDir, MOLE_CODEX_DIR: src.codexDir }) as Record<string, string>;
const mole = (args: string[]) => spawnSync(process.execPath, ['--no-warnings', cli, ...args, '--root', root], { encoding: 'utf8', env: env() });
const byText = (cs: Claim[], re: RegExp): Claim | undefined => cs.find((c) => re.test(c.text));

const HA_FINAL = () =>
  `Fixed the add bug in \`src/a.ts\`. All 4 tests pass. Committed as ${sha7}. I pushed it to origin. 9/9 hover checks pass in a clean profile.`;

function hermesDb(file: string, t0: number): void {
  const db = new DatabaseSync(file);
  db.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY, source TEXT NOT NULL, cwd TEXT, parent_session_id TEXT, started_at REAL NOT NULL,
    ended_at REAL, message_count INTEGER DEFAULT 0, tool_call_count INTEGER DEFAULT 0, title TEXT, model TEXT);
  CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT,
    tool_call_id TEXT, tool_calls TEXT, tool_name TEXT, timestamp REAL NOT NULL, _compressed_summary INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1, compacted INTEGER NOT NULL DEFAULT 0);`);
  const ses = db.prepare('INSERT INTO sessions (id, source, cwd, parent_session_id, started_at, ended_at, title) VALUES (?,?,?,?,?,?,?)');
  for (const [i, s] of [HA, HB, HC, HD].entries()) ses.run(s, 'cli', root, null, t0 + i * 1000, t0 + i * 1000 + 100, s);
  const ins = db.prepare('INSERT INTO messages (session_id, role, content, tool_call_id, tool_calls, tool_name, timestamp) VALUES (?,?,?,?,?,?,?)');
  const call = (id: string, name: string, args: unknown): string => JSON.stringify([{ id, call_id: id, type: 'function', function: { name, arguments: JSON.stringify(args) } }]);
  const m = (s: string, role: string, content: string | null, cid: string | null, calls: string | null, t: number): number =>
    Number(ins.run(s, role, content, cid, calls, role === 'tool' ? 'terminal' : null, t).lastInsertRowid);
  const out = (o: string, code: number) => JSON.stringify({ output: o, exit_code: code, error: null });
  let t = t0;
  m(HA, 'user', 'add is wrong, fix it', null, null, ++t);
  m(HA, 'assistant', null, null, call('ha1', 'terminal', { command: 'npm test' }), ++t);
  m(HA, 'tool', out(' Test Files  1 failed (1)\n      Tests  1 failed | 3 passed (4)', 1), 'ha1', null, ++t);
  rows.HA_afterFail = m(HA, 'assistant', null, null, call('ha2', 'patch', { path: join(root, 'src/a.ts'), old_string: 'a - b', new_string: 'a + b' }), ++t);
  m(HA, 'tool', JSON.stringify({ success: true, diff: '-a - b\n+a + b' }), 'ha2', null, ++t);
  m(HA, 'assistant', null, null, call('ha3', 'terminal', { command: 'npm test' }), ++t);
  m(HA, 'tool', out(' Test Files  1 passed (1)\n      Tests  4 passed (4)', 0), 'ha3', null, ++t);
  m(HA, 'assistant', null, null, call('ha4', 'terminal', { command: `cd ${root} && git commit -qam "fix add" && git log --oneline -1` }), ++t);
  m(HA, 'tool', out(`${sha7} fix add`, 0), 'ha4', null, ++t);
  m(HA, 'assistant', null, null, call('ha5', 'delegate_task', { goal: 'push the branch and run the hover checks' }), ++t);
  m(HA, 'tool', JSON.stringify({ results: [{ status: 'completed', summary: 'pushed to origin; 9/9 hover checks pass' }] }), 'ha5', null, ++t);
  rows.HA_first = m(HA, 'assistant', 'First pass: the bug is in `src/a.ts`.', null, null, ++t);
  m(HA, 'user', 'go on', null, null, ++t);
  rows.HA_final = m(HA, 'assistant', HA_FINAL(), null, null, ++t);

  t = t0 + 1000;
  m(HB, 'user', 'make the tests pass', null, null, ++t);
  m(HB, 'assistant', null, null, call('hb1', 'terminal', { command: 'npm test' }), ++t);
  m(HB, 'tool', out('      Tests  2 failed | 2 passed (4)', 1), 'hb1', null, ++t);
  m(HB, 'assistant', 'Done: npm test passes (4 tests).', null, null, ++t);

  t = t0 + 2000;
  m(HC, 'user', 'what should we do next?', null, null, ++t);
  m(HC, 'assistant', 'Here are three options; pick one and I will start.', null, null, ++t);

  t = t0 + 3000;
  m(HD, 'user', 'commit it', null, null, ++t);
  m(HD, 'assistant', null, null, call('hd1', 'terminal', { command: 'ls src' }), ++t);
  m(HD, 'tool', out('a.ts', 0), 'hd1', null, ++t);
  m(HD, 'assistant', 'Committed the change as `deadbee`.', null, null, ++t);
  db.close();
}

function claudeFile(dir: string, t0: number): void {
  const iso = (s: number) => new Date((t0 + s) * 1000).toISOString();
  const base = { sessionId: CA, cwd: root, version: '2.1.0' };
  const lines = [
    { ...base, type: 'user', timestamp: iso(1), message: { role: 'user', content: 'write the docs and run the tests' } },
    { ...base, type: 'assistant', timestamp: iso(2), message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_ca1', name: 'Bash', input: { command: 'npm test' } }] } },
    { ...base, type: 'user', timestamp: iso(3), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_ca1', content: '      Tests  2 passed (2)' }] }, toolUseResult: { stdout: '      Tests  2 passed (2)', stderr: '', interrupted: false } },
    { ...base, type: 'assistant', timestamp: iso(4), message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_ca2', name: 'Write', input: { file_path: join(root, 'docs/x.md'), content: '# x\n' } }] } },
    { ...base, type: 'user', timestamp: iso(5), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_ca2', content: `File created successfully at: ${join(root, 'docs/x.md')}` }] } },
    { ...base, type: 'assistant', timestamp: iso(6), message: { role: 'assistant', content: [{ type: 'text', text: 'Wrote `docs/x.md`, and the tests pass (2/2).' }] } },
  ];
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${CA}.jsonl`), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
}

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'mole-claims-'));
  root = join(base, 'repo');
  mkdirSync(join(root, 'src'), { recursive: true });
  execFileSync('git', ['init', '-q', '-b', 'main', root]);
  writeFileSync(join(root, 'src/a.ts'), 'export const add = (a: number, b: number) => a - b;\n');
  git(['add', '.']);
  git(['commit', '-qm', 'add']);
  writeFileSync(join(root, 'src/a.ts'), 'export const add = (a: number, b: number) => a + b;\n');
  git(['commit', '-qam', 'fix add']);
  sha7 = git(['rev-parse', '--short=7', 'HEAD']);
  src = { hermesDb: join(base, 'state.db'), claudeDir: join(base, 'claude'), codexDir: join(base, 'no-codex') };
  const t0 = Math.floor(Date.now() / 1000) - 3600;
  hermesDb(src.hermesDb, t0);
  claudeFile(join(src.claudeDir, '-fixture-repo'), t0 + 5000);
});
afterAll(() => rmSync(base, { recursive: true, force: true }));

describe('splitClaims: sentence split + patterns, no model', () => {
  it('finds test, commit and push claims with offsets into the text', () => {
    const t = 'All 12 tests pass and I committed it as abc1234. I pushed the branch.';
    const cs = splitClaims(t);
    expect(cs.map((c) => c.category)).toEqual(expect.arrayContaining(['test', 'commit', 'push']));
    for (const c of cs) expect(t.slice(c.start, c.end)).toBe(c.text);
  });
  it('plans, negatives and questions are not claims', () => {
    expect(splitClaims('Next I will merge it. Nothing was pushed. Should I run the tests?')).toEqual([]);
  });
});

describe('claims(run): each claim -> evidence -> verdict (done-when 1)', () => {
  it('the final answer of a Hermes run: supported claims cite the tool call; relayed and missing actions are unsupported', () => {
    const r = claims(HA, src);
    expect(r.answer?.row).toBe(rows.HA_final);
    expect(r.answer?.text).toBe(HA_FINAL());
    expect(r.nothing).toBe(false);
    const test = byText(r.claims, /All 4 tests pass/);
    expect(test?.category).toBe('test');
    expect(test?.verdict).toBe('supported');
    expect(test?.evidence[0]?.callId).toBe('ha3');
    expect(test?.evidence[0]?.exit).toBe(0);
    const commit = byText(r.claims, new RegExp(sha7));
    expect(commit?.verdict).toBe('supported');
    expect(commit?.evidence[0]?.commit).toBe(sha7);
    expect(commit?.evidence[0]?.callId).toBe('ha4');
    expect(byText(r.claims, /pushed/)?.verdict).toBe('unsupported'); // only the subagent said so
    expect(byText(r.claims, /9\/9 hover/)?.verdict).toBe('unsupported'); // relayed from a subagent report
    expect(byText(r.claims, /Fixed the add bug/)?.verdict).toBe('supported');
    expect(r.summary).toEqual({ supported: r.claims.filter((c) => c.verdict === 'supported').length, unsupported: 2, contradicted: 0 });
  });
  it('tests claimed to pass while the last run failed -> contradicted, with the failing call and its exit code', () => {
    const c = byText(claims(HB, src).claims, /passes/);
    expect(c?.verdict).toBe('contradicted');
    expect(c?.evidence[0]?.callId).toBe('hb1');
    expect(c?.evidence[0]?.exit).toBe(1);
  });
  it('a commit sha the run never made is flagged', () => {
    const c = byText(claims(HD, src).claims, /deadbee/);
    expect(c?.category).toBe('commit');
    expect(['unsupported', 'contradicted']).toContain(c?.verdict);
  });
  it("a runs.jsonl line the agent wrote: 'exit 0' after a failing run -> contradicted (text + before)", () => {
    const line = JSON.stringify({ time: 'x', commit: sha7, cmd: 'npm test', exit: 0, check: 'pass: 4 passed (4)' });
    const c = byText(claims(HA, { ...src, text: line, before: rows.HA_afterFail }).claims, /exit/);
    expect(c?.category).toBe('exit');
    expect(c?.verdict).toBe('contradicted');
    expect(c?.evidence[0]?.callId).toBe('ha1');
  });
  it('a Claude Code run: file written + tests pass (2/2) are supported', () => {
    const r = claims(CA, src);
    expect(r.harness).toBe('claude-code');
    expect(byText(r.claims, /docs\/x\.md/)?.verdict).toBe('supported');
    expect(byText(r.claims, /2\/2/)?.verdict).toBe('supported');
  });
  it('every turn-final answer is listed; at picks an earlier one', () => {
    const rowsList = finalAnswers(HA, src).map((a) => a.row);
    expect(rowsList).toEqual([rows.HA_first, rows.HA_final]);
    expect(claims(HA, { ...src, at: rows.HA_first }).answer?.row).toBe(rows.HA_first);
  });
  it("no checkable claim -> nothing: true and 'nothing to check' (done-when 4)", () => {
    const r = claims(HC, src);
    expect(r.claims).toEqual([]);
    expect(r.nothing).toBe(true);
    expect(formatClaims(r)).toContain('nothing to check');
  });
});

describe('mole claims <run> (CLI) and mole_claims (MCP)', () => {
  it('text view: one line per claim with its verdict; --json = the library result', () => {
    const t = mole(['claims', HA]);
    expect(t.status).toBe(0);
    expect(t.stdout).toContain('unsupported');
    expect(t.stdout).toContain('I pushed it to origin');
    expect(t.stdout).toContain('ha3');
    const j = mole(['claims', HA, '--json']);
    expect(j.status).toBe(0);
    expect(JSON.parse(j.stdout)).toEqual(JSON.parse(JSON.stringify(claims(HA, src))));
  });
  it("no checkable claim -> 'nothing to check', exit 0; an unknown run -> exit 1", () => {
    const n = mole(['claims', HC]);
    expect(n.status).toBe(0);
    expect(n.stdout).toContain('nothing to check');
    expect(mole(['claims', 'no-such-run-xyz']).status).toBe(1);
  });
  it('MCP mole_claims is listed and returns the CLI --json', async () => {
    const client = new Client({ name: 'test', version: '0' });
    await client.connect(new StdioClientTransport({ command: process.execPath, args: ['--no-warnings', mcpBin], env: { ...env(), MOLE_ROOT: root } }));
    try {
      const names = (await client.listTools()).tools.map((t) => t.name);
      expect(names).toEqual(expect.arrayContaining(['mole_claims']));
      const res = await client.callTool({ name: 'mole_claims', arguments: { run: HA } });
      const text = (res.content as Array<{ type: string; text: string }>)[0]!.text;
      expect(JSON.parse(text)).toEqual(JSON.parse(mole(['claims', HA, '--json']).stdout));
    } finally {
      await client.close();
    }
  }, 30_000);
});
