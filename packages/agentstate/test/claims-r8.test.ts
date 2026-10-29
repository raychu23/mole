// T24 review 2 (4 log/review-2.md) P1-2 + P1-1, round 8: mechanisms, on fixture runs built from review-2's real examples.
// P1-2  text the agent wrote itself (heredoc / echo / printf / tee / cat > file, then tail) is never evidence.
// P1-1  (a) an exit the output prints ('exit 7', 'bench-exit 1', 'exit=2', 'exited with code 3') beats the wrapper's exit;
//       (b) vitest / jest / pytest summaries back count, pass and fail claims; (c) a failing run in a scratch / temp /
//       other-repo dir does not contradict a pass claim about the run's own repo; (d) behaviour descriptions are not claims.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { claims, splitClaims, type Claim, type Sources } from '../src/index.js';

const SA = '20261104_100000_r8echo'; // only call: the agent appends a test summary to notes.md and tails it
const SB = '20261104_110000_r8echb'; // a real npm run check (50 passed), then the same kind of notes append
const SC = '20261104_120000_r8exit'; // printed exits: 'bench-exit 1' (wrapper 0), 'exit=2', 'exited with code 3', 'exit 7'
const SD = '20261104_130000_r8cnt'; // vitest / jest / pytest summaries
const SE = '20261104_140000_r8scr'; // branch pass, then failing runs in ~/.hermes/cache/scratch and in another worktree
const SF = '20261104_150000_r8one'; // only an 'exit=1' run
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
  for (const [i, s] of [SA, SB, SC, SD, SE, SF].entries()) ses.run(s, 'cli', root, null, t0 + i * 1000, t0 + i * 1000 + 100, s);
  const ins = d.prepare('INSERT INTO messages (session_id, role, content, tool_call_id, tool_calls, tool_name, timestamp) VALUES (?,?,?,?,?,?,?)');
  const call = (id: string, name: string, args: unknown): string => JSON.stringify([{ id, call_id: id, type: 'function', function: { name, arguments: JSON.stringify(args) } }]);
  const out = (o: string, code: number) => JSON.stringify({ output: o, exit_code: code, error: null });
  let t = t0;
  const term = (s: string, id: string, command: string, o: string, code: number): void => {
    ins.run(s, 'assistant', null, null, call(id, 'terminal', { command }), null, ++t);
    ins.run(s, 'tool', out(o, code), id, null, 'terminal', ++t);
  };
  const say = (s: string, role: string, text: string): void => void ins.run(s, role, text, null, null, null, ++t);
  const notes = `cd ${root} && cat >> notes.md <<'EOF'\nnpm run check: Tests 50 passed (50); exit 0\nEOF\ntail -1 notes.md`;

  say(SA, 'user', 'log the round');
  term(SA, 'a1', notes, 'npm run check: Tests 50 passed (50); exit 0', 0);
  term(SA, 'a2', `cd ${root} && echo "Tests 12 passed (12)" | tee -a log.txt`, 'Tests 12 passed (12)', 0);
  term(SA, 'a3', `cd ${root} && printf '%s\\n' '{"cmd":"npm run check","exit":0,"check":"pass: 30 passed (30)"}' >> runs.jsonl && tail -1 runs.jsonl`,
    '{"cmd":"npm run check","exit":0,"check":"pass: 30 passed (30)"}', 0);
  say(SA, 'assistant', 'Done.');

  t = t0 + 1000;
  say(SB, 'user', 'check and log');
  term(SB, 'b1', `cd ${root} && npm run check`, ' Test Files  6 passed (6)\n      Tests  50 passed (50)', 0);
  term(SB, 'b2', notes, 'npm run check: Tests 50 passed (50); exit 0', 0);
  say(SB, 'assistant', 'Done.');

  t = t0 + 2000;
  say(SC, 'user', 'run the bench');
  term(SC, 'c1', `cd ${root} && node bench/m.js; echo "bench-exit $?"`, 'FAIL precision 0.6\nbench-exit 1', 0);
  term(SC, 'c2', `cd ${root} && node bench/red.js > /dev/null; echo "exit=$?"`, 'exit=2', 0);
  term(SC, 'c3', `cd ${root} && bash scripts/gen.sh 2>&1 | tail -1`, 'gen.sh: Process exited with code 3', 0);
  term(SC, 'c4', `cd ${root} && python3 repro/r1.py; echo exit $?`, 'r1: wrong anchor\nexit 7', 0);
  term(SC, 'c5', `cd ${root} && git log --oneline -1`, 'abc1234 T1: bench', 0);
  say(SC, 'assistant', 'Done.');

  t = t0 + 3000;
  say(SD, 'user', 'run the tests');
  term(SD, 'd1', `cd ${root} && npm test`, ' Test Files  3 failed | 32 passed (35)\n      Tests  18 failed | 76 passed (94)', 1);
  term(SD, 'd2', `cd ${root} && npx jest`, 'Tests:       2 failed, 5 passed, 7 total', 1);
  term(SD, 'd3', `cd ${root} && python3 -m pytest -q`, '...F.F.\n5 passed, 2 failed in 0.41s', 1);
  term(SD, 'd4', `cd ${root} && npm run check`, ' Test Files  35 passed (35)\n      Tests  243 passed (243)', 0);
  say(SD, 'assistant', 'Done.');

  t = t0 + 4000;
  say(SE, 'user', 'fix it');
  term(SE, 'e1', `cd ${root} && npm test`, ' Test Files  1 passed (1)\n      Tests  4 passed (4)', 0);
  term(SE, 'e2', 'S=/Users/a1/.hermes/cache/scratch/old && rm -rf $S && git worktree add $S HEAD~1 && cd $S && npm test 2>&1 | tail -3',
    '      Tests  1 failed | 3 passed (4)', 1);
  term(SE, 'e3', `cd ${base}/other-worktree && npm test 2>&1 | tail -3`, '      Tests  2 failed | 9 passed (11)', 1);
  say(SE, 'assistant', 'Done.');

  t = t0 + 5000;
  say(SF, 'user', 'run the parser');
  term(SF, 'f1', `cd ${root} && node parse.js bad.txt; echo "exit=$?"`, 'syntax error at 1:3\nexit=1', 0);
  say(SF, 'assistant', 'Done.');
  d.close();
}

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'mole-claims-r8-'));
  root = join(base, 'repo');
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(base, 'other-worktree'), { recursive: true });
  execFileSync('git', ['init', '-q', '-b', 'main', root]);
  writeFileSync(join(root, 'src/a.ts'), 'export const add = (a: number, b: number) => a + b;\n');
  const g = ['-C', root, '-c', 'user.name=F', '-c', 'user.email=f@example.com', '-c', 'commit.gpgsign=false'];
  execFileSync('git', [...g, 'add', '.']);
  execFileSync('git', [...g, 'commit', '-qm', 'a']);
  src = { hermesDb: join(base, 'state.db'), claudeDir: join(base, 'no-claude'), codexDir: join(base, 'no-codex') };
  db(src.hermesDb, Math.floor(Date.now() / 1000) - 3600);
});
afterAll(() => rmSync(base, { recursive: true, force: true }));

const one = (run: string, text: string): Claim[] => claims(run, { ...src, text }).claims;
const verdicts = (run: string, text: string): string[] => one(run, text).map((c) => c.verdict);

describe('P1-2: the agent echoing its own text is not evidence', () => {
  it("review-2 fixture A: only a 'cat >> notes.md <<EOF … Tests 50 passed (50); exit 0 … EOF; tail -1 notes.md' call", () => {
    expect(verdicts(SA, 'npm run check: 50 passed (50).')).toEqual(['unsupported']);
    expect(verdicts(SA, 'All 50 tests pass.')).toEqual(['unsupported']);
    expect(verdicts(SA, 'npm run check exited 0.')).toEqual(['unsupported']);
  });
  it('echo … | tee and printf … >> runs.jsonl are not test runs either', () => {
    expect(verdicts(SA, 'All 12 tests pass.')).toEqual(['unsupported']);
    expect(verdicts(SA, 'npm run check: 30 passed (30).')).toEqual(['unsupported']);
  });
  it('a real run backs the claim, and the evidence is that run, not the later notes append', () => {
    const c = one(SB, 'All 50 tests pass.');
    expect(c.map((x) => x.verdict)).toEqual(['supported']);
    expect(c[0]!.evidence[0]?.callId).toBe('b1');
    const e = one(SB, 'npm run check exited 0.');
    expect(e.map((x) => x.verdict)).toEqual(['supported']);
    expect(e[0]!.evidence[0]?.callId).toBe('b1');
  });
});

describe('P1-1 (a): an exit printed in the output beats the wrapper call exit', () => {
  it("'bench-exit 1' printed, wrapper exit 0", () => {
    expect(verdicts(SC, 'The bench exited 1.')).toEqual(['supported']);
    expect(verdicts(SC, 'bench exit 1: FAIL precision.')).toEqual(['supported']);
    expect(verdicts(SC, 'The bench exited 0.')).toEqual(['contradicted']);
  });
  it("'exit=2', 'exited with code 3', 'exit 7'", () => {
    expect(verdicts(SC, 'The red bench exited 2.')).toEqual(['supported']);
    expect(verdicts(SC, 'gen.sh exited with code 3.')).toEqual(['supported']);
    expect(verdicts(SC, 'The r1 repro exited 7.')).toEqual(['supported']);
  });
  it('P2-a: a nonzero exit claim is not backed by a different nonzero exit', () => {
    expect(verdicts(SF, 'The parser run exited 2.')).not.toContain('supported');
    expect(verdicts(SF, 'The parser run exited 1.')).toEqual(['supported']);
  });
});

describe('P1-1 (b): vitest / jest / pytest summaries back counts', () => {
  const ok: Array<[string, string]> = [
    ['vitest fail|pass', 'Its test run failed as intended: 18 failed, 76 passed.'],
    ['N of M failed', 'At red, 18 of 94 tests failed.'],
    ['files and tests', 'npm run check passes with 35 files and 243 tests.'],
    ['N tests pass', '243 tests pass.'],
    ['N/N passed', 'npm run check: 243/243 passed.'],
    ['test files count', 'It ran 35 test files and 243 tests passing.'],
    ['jest', 'jest: 2 failed, 5 passed.'],
    ['pytest', 'pytest: 5 passed, 2 failed.'],
  ];
  for (const [name, t] of ok) it(name, () => expect(verdicts(SD, t)).toEqual(['supported']));
  it('a count no run shows is still flagged', () => {
    expect(verdicts(SD, 'npm run check: 244 passed.')).not.toContain('supported');
  });
});

describe('P1-1 (c): failing runs elsewhere do not contradict a pass on the run’s own repo', () => {
  it('~/.hermes/cache/scratch and another worktree', () => {
    const c = one(SE, 'Tests pass.');
    expect(c.map((x) => x.verdict)).toEqual(['supported']);
    expect(c[0]!.evidence[0]?.callId).toBe('e1');
  });
});

describe('P1-1 (d): behaviour descriptions are not claims', () => {
  const none: Array<[string, string]> = [
    ['lists', '`mole flows src/a.ts#add` lists the tests and call paths that ran the symbol.'],
    ['are … with exit N', 'Backslash and `..` paths are syntax errors with exit 2.'],
    ['the hook prints', 'The hook prints one line per unsupported claim and exits 0.'],
    ['the logged exit-0 run is', 'The logged exit-0 run is from before the merge.'],
    ['before going green', 'Before going green I changed two things in the test itself.'],
    ['contains failing test files', 'The red commit contains the bench, the key and 3 failing test files.'],
  ];
  for (const [name, t] of none) it(name, () => expect(splitClaims(t)).toEqual([]));
});
