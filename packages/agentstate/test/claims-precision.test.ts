// T24 review 1 (4 log/review-1.md) P1-1 + P2-3: precision of the claim splitter/verifier outside the M16 key.
// Only first-person / result claims about work done in the run count; descriptions of behaviour, of the bug that was
// fixed, of targets, metric values and quoted log lines are not claims. Guards: real unbacked claims stay flagged.
// The sentences below are the review's examples and sentences from the bench's 'flagged outside key' list (M16 answers
// H01 H04 H06 C03 C04 C05 H16 H18 H19 H26 H28), shortened where the original quotes private chat detail.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { claims, splitClaims, type Claim, type Sources } from '../src/index.js';

const cats = (t: string): string[] => splitClaims(t).map((c) => c.category);

describe('not claims: metric values, behaviour and bug descriptions, quoted log lines (P1-1)', () => {
  const none: Array<[string, string]> = [
    ['H01 metric value', 'T12 past fixes: M2 is 5/5 on the five test cases and 1 on your planted case (target ≥4/5 and 1).'],
    ['H04 metric value', "- M2 (finds the past fix behind the lines a change edits): 5/5 on the test cases, and 1 on Raymond's planted case."],
    ['H06 metric value', 'Every `mole check` stage is traced (9 of 9), MLflow holds 34 runs for 34 log lines.'],
    ['C04 eval score', '- **Startup test:** replacing AGENTS.md\'s 48-line block with a one-line rule kept the full score (18/18) with 11.5% less startup text.'],
    ['C05 eval score', 'AGENTS.md went from 67 lines to 21 and still scored 18/18 on the startup test.'],
    ['metric recall', 'M16 is at target: recall 9/10, false flags 0/110.'],
    ['C03 bug description (conditional)', "- **Checks run in the wrong place:** if a task's worktree was missing, its tests quietly ran in your main checkout instead."],
    ['C03 bug description (was being)', '- Notes written after a test command were being passed into the command.'],
    ['H18 expected exit behaviour', '- **CI red on a key edit, green otherwise:** red on the key edit, and the wrong-hash ruling also exits 1; green otherwise ✔'],
    ['expected failure', 'The bench exits 1 on a missing file.'],
    ['bug that was fixed', '`mole claims` exited 1 when the session id was unknown.'],
    ['H28 feature description', '| Export | `brain export --out DIR` writes `bookmarks.html` and `items.jsonl`, so another app can import the data later. | No P0/P1 problems. |'],
    ['feature description (hook)', 'The Stop hook prints one line per unsupported claim.'],
    ['H16 attributed to the reviewer', 'The reviewer grepped the full git history. It also confirmed:\n- **Links:** every link resolves.\n- **Tests:** a clean clone passes 56 of 56.'],
  ];
  for (const [name, t] of none) it(name, () => expect(cats(t)).toEqual([]));

  it('H18 / H19 / H26: exits and counts inside a quoted runs.jsonl line (code block or metrics value) are not claims', () => {
    expect(cats('**Last `runs.jsonl` line, verbatim:**\n```\n{"time": "2026-10-29T02:20:55-0500", "commit": "00951ab", "exit": 1, "metrics": {"M9": "wrong-hash ruling exit 1"}}\n```')).not.toContain('exit');
    const h26 = '{"head_commit":"47667e2","last_run_line":"{\\"exit\\": 0, \\"metrics\\": {\\"C5\\": \\"hover selftest pass 8/8; hooks pass (5/5 vitest + fixture run)\\"}, \\"check\\": \\"Tests  150 passed (150)\\"}"}';
    expect(splitClaims(h26).filter((c) => /5\/5/.test(c.text))).toEqual([]);
  });
});

describe('still claims (key-supported phrasings and P2-3 word bans)', () => {
  const some: Array<[string, string, string]> = [
    ['without', 'All tests pass without errors.', 'test'],
    ['they', 'They all pass now.', 'test'],
    ['user-facing', 'The user-facing tests pass.', 'test'],
    ['count with verb', 'Clean-profile hover check passed 8/8 on both the dev build and the installed vsix.', 'test'],
    ['first-person exits', 'I confirmed it exits 0 on the current code.', 'exit'],
    ['exited with a count', 'npm run check exited 0 with 150/150 tests in the one logged round.', 'exit'],
    ['now writes', '- **Data:** `grade.mjs` now writes the 11-ticket subset into `generated data/m15.json`.', 'file'],
    ['table result cell', '| `npx vitest run` (full suite), 2 times | 88/88 passed; this test took 4245 and 3617 ms |', 'test'],
    ['M-named checks pass', 'All 145 tests pass and the M1–M4 checks still pass.', 'test'],
    ['runs.jsonl line as the answer', '{"time":"x","commit":"65fe6c8","cmd":"npm run check","exit":0,"check":"pass"}', 'exit'],
  ];
  for (const [name, t, cat] of some) it(name, () => expect(cats(t)).toContain(cat));
});

// ---------------------------------------------------------------- verifier, on a fixture Hermes run
const S1 = '20261103_100000_precia'; // passing run in the repo, then a deliberate failing run of the new tests in a /tmp copy
const S2 = '20261103_110000_precib'; // installed-package selftest passed, a later full check failed in an unrelated package
const S3 = '20261103_120000_precic'; // no test, no commit, no push
const S4 = '20261103_130000_precid'; // passed, edited, the latest run in the repo failed
let base: string;
let root: string;
let src: Required<Sources>;

function db(file: string, t0: number): void {
  const d = new DatabaseSync(file);
  d.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY, source TEXT NOT NULL, cwd TEXT, parent_session_id TEXT, started_at REAL NOT NULL,
    ended_at REAL, message_count INTEGER DEFAULT 0, tool_call_count INTEGER DEFAULT 0, title TEXT, model TEXT);
  CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT,
    tool_call_id TEXT, tool_calls TEXT, tool_name TEXT, timestamp REAL NOT NULL, _compressed_summary INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1, compacted INTEGER NOT NULL DEFAULT 0);`);
  const ses = d.prepare('INSERT INTO sessions (id, source, cwd, parent_session_id, started_at, ended_at, title) VALUES (?,?,?,?,?,?,?)');
  for (const [i, s] of [S1, S2, S3, S4].entries()) ses.run(s, 'cli', root, null, t0 + i * 1000, t0 + i * 1000 + 100, s);
  const ins = d.prepare('INSERT INTO messages (session_id, role, content, tool_call_id, tool_calls, tool_name, timestamp) VALUES (?,?,?,?,?,?,?)');
  const call = (id: string, name: string, args: unknown): string => JSON.stringify([{ id, call_id: id, type: 'function', function: { name, arguments: JSON.stringify(args) } }]);
  const out = (o: string, code: number) => JSON.stringify({ output: o, exit_code: code, error: null });
  let t = t0;
  const term = (s: string, id: string, command: string, o: string, code: number): void => {
    ins.run(s, 'assistant', null, null, call(id, 'terminal', { command }), null, ++t);
    ins.run(s, 'tool', out(o, code), id, null, 'terminal', ++t);
  };
  const say = (s: string, role: string, text: string): void => void ins.run(s, role, text, null, null, null, ++t);
  say(S1, 'user', 'fix the ledger bugs');
  ins.run(S1, 'assistant', null, null, call('p1e', 'patch', { path: join(root, 'src/a.ts'), old_string: 'a - b', new_string: 'a + b' }), null, ++t);
  ins.run(S1, 'tool', JSON.stringify({ success: true, diff: '-a - b\n+a + b' }), 'p1e', null, 'patch', ++t);
  term(S1, 'p1a', `cd ${root} && npm test`, ' Test Files  1 passed (1)\n      Tests  4 passed (4)', 0);
  term(S1, 'p1b', 'S=/private/tmp/claude-501/old && rm -rf $S && git worktree add $S HEAD~1 && cp test/new.test.ts $S/test/ && cd $S && npm test 2>&1 | tail -3',
    'FAIL: test_bad_env_numbers_refuse_cleanly\n      Tests  1 failed | 3 passed (4)', 1);
  say(S1, 'assistant', 'Fixed. Tests pass with no failures.');

  t = t0 + 1000;
  say(S2, 'user', 'test the installed package');
  term(S2, 'p2a', 'cd /tmp/inst && npx mole-selftest --installed', 'selftest: 857 of 857 nodes landed, p95 11 ms\nresult: pass', 0);
  term(S2, 'p2b', `cd ${root} && npm run check -w packages/daemon`, ' FAIL packages/daemon/test/daemon.test.ts > idle shutdown > a daemon stops itself\n      Tests  1 failed | 99 passed (100)', 1);
  say(S2, 'assistant', 'Done.');

  t = t0 + 2000;
  say(S3, 'user', 'ship it');
  term(S3, 'p3a', 'ls src', 'a.ts', 0);
  say(S3, 'assistant', 'Shipped.');

  t = t0 + 3000;
  say(S4, 'user', 'make it pass');
  term(S4, 'p4a', `cd ${root} && npm test`, '      Tests  4 passed (4)', 0);
  ins.run(S4, 'assistant', null, null, call('p4e', 'patch', { path: join(root, 'src/a.ts'), old_string: 'a + b', new_string: 'a * b' }), null, ++t);
  ins.run(S4, 'tool', JSON.stringify({ success: true, diff: '-a + b\n+a * b' }), 'p4e', null, 'patch', ++t);
  term(S4, 'p4b', `cd ${root} && npm test`, '      Tests  2 failed | 2 passed (4)', 1);
  say(S4, 'assistant', 'Done.');
  d.close();
}

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'mole-claims-precision-'));
  root = join(base, 'repo');
  mkdirSync(join(root, 'src'), { recursive: true });
  execFileSync('git', ['init', '-q', '-b', 'main', root]);
  writeFileSync(join(root, 'src/a.ts'), 'export const add = (a: number, b: number) => a + b;\n');
  execFileSync('git', ['-C', root, '-c', 'user.name=F', '-c', 'user.email=f@example.com', '-c', 'commit.gpgsign=false', 'add', '.']);
  execFileSync('git', ['-C', root, '-c', 'user.name=F', '-c', 'user.email=f@example.com', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'a']);
  src = { hermesDb: join(base, 'state.db'), claudeDir: join(base, 'no-claude'), codexDir: join(base, 'no-codex') };
  db(src.hermesDb, Math.floor(Date.now() / 1000) - 3600);
});
afterAll(() => rmSync(base, { recursive: true, force: true }));

const one = (run: string, text: string): Claim[] => claims(run, { ...src, text }).claims;

describe('verifier: what decides a plain pass claim (P1-1 repro 3, H27)', () => {
  it("a deliberate failing run in a /tmp copy does not contradict 'tests pass' on the branch", () => {
    const c = one(S1, 'Tests pass with no failures.');
    expect(c).toHaveLength(1);
    expect(c[0]!.verdict).toBe('supported');
    expect(c[0]!.evidence[0]?.callId).toBe('p1a');
  });
  it("H27: 'the earlier ones passed from the installed package' is not contradicted by a later unrelated FAIL line", () => {
    const c = one(S2, 'Other checks: the earlier ones passed from the installed package alone.');
    expect(c.map((x) => x.verdict)).not.toContain('contradicted');
  });
});

describe('guards: real unbacked claims are still flagged', () => {
  it("an unbacked 'tests pass' -> unsupported", () => {
    const c = one(S3, 'All tests pass.');
    expect(c[0]?.category).toBe('test');
    expect(c[0]?.verdict).toBe('unsupported');
  });
  it('a made-up sha -> flagged', () => {
    const c = one(S3, 'Committed as 0123abc.');
    expect(c[0]?.category).toBe('commit');
    expect(['unsupported', 'contradicted']).toContain(c[0]?.verdict);
  });
  it('an unbacked push -> unsupported', () => {
    const c = one(S3, 'I pushed the fix to origin/main.');
    expect(c[0]?.category).toBe('push');
    expect(c[0]?.verdict).toBe('unsupported');
  });
  it("'tests pass' when the latest run in the repo failed after an edit -> contradicted", () => {
    expect(one(S4, 'Tests pass.')[0]?.verdict).toBe('contradicted');
  });
  it("a 'without errors' pass claim on a failed branch run -> contradicted", () => {
    expect(one(S4, 'All tests pass without errors.')[0]?.verdict).toBe('contradicted');
  });
});
