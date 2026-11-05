// T96: `mole init` -- fresh repo, existing AGENTS.md, existing CLAUDE.md, rerun idempotent, --dry-run writes
// nothing. Reads the plan/result through runInit() directly (same function initCli() calls) so assertions are
// on structured data, not console text; one end-to-end spawn test covers the real CLI wiring (cmd === 'init').
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { AGENTS_MARKER_START, EXAMPLE_DECISION_ID, EXAMPLE_DECISION_REL, PRECEDENCE_SENTENCE, planInit, runInit } from '../src/init.js';
import { loadGraph } from '@mole/decisions';

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..');
const cliDist = join(pkg, 'dist/cli.js');

let dirs: string[] = [];
function freshRepo(): string {
  const d = mkdtempSync(join(tmpdir(), 'mole-init-test-'));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('T96: mole init -- fresh repo', () => {
  it('writes exactly one example decision record, with id/title/status/rules front matter', async () => {
    const root = freshRepo();
    const result = await runInit(root, {});
    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(false);
    const abs = join(root, EXAMPLE_DECISION_REL);
    expect(existsSync(abs)).toBe(true);
    const text = readFileSync(abs, 'utf8');
    expect(text).toMatch(/^---\nid: D001-example-decision\n/);
    expect(text).toContain('title:');
    expect(text).toContain('status: accepted');
    expect(text).toContain('rules:');
    expect(text).toContain('forbid: import');
  });

  it('T100 (D71): writes real MADR 4 fields (date, decision-makers) plus adrkit\'s affects, loadable by loadGraph', async () => {
    const root = freshRepo();
    await runInit(root, {});
    const text = readFileSync(join(root, EXAMPLE_DECISION_REL), 'utf8');
    expect(text).toMatch(/\ndate: \d{4}-\d{2}-\d{2}\n/);
    expect(text).toContain('decision-makers:');
    expect(text).toContain('affects:');
    expect(text).toContain('type: path');
    const g = loadGraph(root);
    expect(g.problems).toEqual([]);
    const d = g.nodes.find((n) => n.id === EXAMPLE_DECISION_ID);
    expect(d?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(d?.deciders).toEqual(['your-name']);
    expect(d?.affects).toEqual([{ type: 'path', pattern: 'src/ui/**' }]);
  });

  it('with no --agents-snippet / --yes / TTY, never touches AGENTS.md or CLAUDE.md (non-interactive default: off)', async () => {
    const root = freshRepo();
    await runInit(root, {});
    expect(existsSync(join(root, 'AGENTS.md'))).toBe(false);
    expect(existsSync(join(root, 'CLAUDE.md'))).toBe(false);
  });

  it('--yes alone still leaves AGENTS.md/CLAUDE.md untouched (accepts the prompt default, which is No)', async () => {
    const root = freshRepo();
    await runInit(root, { yes: true });
    expect(existsSync(join(root, 'AGENTS.md'))).toBe(false);
  });

  it('--agents-snippet with neither file present creates AGENTS.md (not CLAUDE.md) with the precedence sentence, wrapped in markers', async () => {
    const root = freshRepo();
    const result = await runInit(root, { 'agents-snippet': true });
    expect(existsSync(join(root, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(root, 'CLAUDE.md'))).toBe(false);
    const text = readFileSync(join(root, 'AGENTS.md'), 'utf8');
    expect(text).toContain(AGENTS_MARKER_START);
    expect(text).toContain(PRECEDENCE_SENTENCE);
    expect(result.agentsSnippet).toBe(true);
  });

  it('--no-agents-snippet forces it off even if other flags would turn it on', async () => {
    const root = freshRepo();
    await runInit(root, { 'agents-snippet': true, 'no-agents-snippet': true });
    expect(existsSync(join(root, 'AGENTS.md'))).toBe(false);
  });
});

describe('T96: mole init -- existing AGENTS.md', () => {
  it('appends the precedence sentence to an existing AGENTS.md, once, without touching its prior content', async () => {
    const root = freshRepo();
    writeFileSync(join(root, 'AGENTS.md'), '# My project rules\n\nAlways run the tests.\n');
    await runInit(root, { 'agents-snippet': true });
    const text = readFileSync(join(root, 'AGENTS.md'), 'utf8');
    expect(text).toContain('# My project rules');
    expect(text).toContain('Always run the tests.');
    expect(text).toContain(PRECEDENCE_SENTENCE);
    expect(existsSync(join(root, 'CLAUDE.md'))).toBe(false); // CLAUDE.md is not created when AGENTS.md already exists
  });

  it('does not duplicate the sentence if AGENTS.md already has it', async () => {
    const root = freshRepo();
    writeFileSync(join(root, 'AGENTS.md'), `# rules\n\n${AGENTS_MARKER_START}\n${PRECEDENCE_SENTENCE}\n<!-- mole:agents-precedence:end -->\n`);
    const before = readFileSync(join(root, 'AGENTS.md'), 'utf8');
    const result = await runInit(root, { 'agents-snippet': true });
    const after = readFileSync(join(root, 'AGENTS.md'), 'utf8');
    expect(after).toBe(before);
    expect(result.items.find((i) => i.path === 'AGENTS.md')?.action).toBe('skip-has-snippet');
  });

  it('review FAIL #1: does not duplicate the sentence if it is already present WITHOUT the HTML markers', async () => {
    const root = freshRepo();
    // hand-typed by a user: the exact sentence text, no mole:agents-precedence markers at all
    writeFileSync(join(root, 'AGENTS.md'), `# rules\n\n${PRECEDENCE_SENTENCE}\n`);
    const before = readFileSync(join(root, 'AGENTS.md'), 'utf8');
    const result = await runInit(root, { 'agents-snippet': true });
    const after = readFileSync(join(root, 'AGENTS.md'), 'utf8');
    expect(after).toBe(before); // no second copy appended
    const item = result.items.find((i) => i.path === 'AGENTS.md');
    expect(item?.action).toBe('skip-has-snippet');
    expect(item?.reason).toBe('precedence sentence already present');
  });

  it('review FAIL #1: detects the sentence across whitespace/line-ending differences (re-wrapped, CRLF)', async () => {
    const root = freshRepo();
    const rewrapped = PRECEDENCE_SENTENCE.replace(/ /g, '\r\n'); // same words, re-wrapped with CRLF
    writeFileSync(join(root, 'AGENTS.md'), `# rules\r\n\r\n${rewrapped}\r\n`);
    const before = readFileSync(join(root, 'AGENTS.md'), 'utf8');
    const result = await runInit(root, { 'agents-snippet': true });
    const after = readFileSync(join(root, 'AGENTS.md'), 'utf8');
    expect(after).toBe(before);
    expect(result.items.find((i) => i.path === 'AGENTS.md')?.action).toBe('skip-has-snippet');
  });
});

describe('T96: mole init -- existing CLAUDE.md (no AGENTS.md)', () => {
  it('appends the sentence to CLAUDE.md and does not create AGENTS.md', async () => {
    const root = freshRepo();
    writeFileSync(join(root, 'CLAUDE.md'), '# Claude instructions\n');
    await runInit(root, { 'agents-snippet': true });
    expect(existsSync(join(root, 'AGENTS.md'))).toBe(false);
    const text = readFileSync(join(root, 'CLAUDE.md'), 'utf8');
    expect(text).toContain('# Claude instructions');
    expect(text).toContain(PRECEDENCE_SENTENCE);
  });

  it('with both AGENTS.md and CLAUDE.md present, appends to both, once each', async () => {
    const root = freshRepo();
    writeFileSync(join(root, 'AGENTS.md'), '# a\n');
    writeFileSync(join(root, 'CLAUDE.md'), '# c\n');
    const result = await runInit(root, { 'agents-snippet': true });
    expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toContain(PRECEDENCE_SENTENCE);
    expect(readFileSync(join(root, 'CLAUDE.md'), 'utf8')).toContain(PRECEDENCE_SENTENCE);
    expect(result.items.filter((i) => i.action === 'append-snippet')).toHaveLength(2);
  });

  it('review FAIL #3: a CRLF AGENTS.md gets a CRLF-appended block, not a mixed-LF block', async () => {
    const root = freshRepo();
    writeFileSync(join(root, 'AGENTS.md'), '# My project rules\r\n\r\nAlways run the tests.\r\n');
    await runInit(root, { 'agents-snippet': true });
    const text = readFileSync(join(root, 'AGENTS.md'), 'utf8');
    expect(text).toContain('# My project rules');
    expect(text).toContain(PRECEDENCE_SENTENCE);
    expect(text).not.toMatch(/[^\r]\n/); // every \n in the file is part of a \r\n pair -- no bare LF introduced
    expect(text.includes('\r\n')).toBe(true);
  });
});

describe('T96: mole init -- rerun is idempotent', () => {
  it('never overwrites the example decision record on a second run, even if it was hand-edited', async () => {
    const root = freshRepo();
    await runInit(root, {});
    const abs = join(root, EXAMPLE_DECISION_REL);
    writeFileSync(abs, 'hand-edited content, not valid front matter');
    const second = await runInit(root, {});
    expect(readFileSync(abs, 'utf8')).toBe('hand-edited content, not valid front matter');
    expect(second.items.find((i) => i.path === EXAMPLE_DECISION_REL)?.action).toBe('skip-exists');
  });

  it('a second run with --agents-snippet does not duplicate the sentence or re-create AGENTS.md', async () => {
    const root = freshRepo();
    await runInit(root, { 'agents-snippet': true });
    const after1 = readFileSync(join(root, 'AGENTS.md'), 'utf8');
    await runInit(root, { 'agents-snippet': true });
    const after2 = readFileSync(join(root, 'AGENTS.md'), 'utf8');
    expect(after2).toBe(after1);
    expect(after2.split(AGENTS_MARKER_START).length - 1).toBe(1); // marker appears exactly once
  });
});

describe('T96: mole init -- --dry-run writes nothing', () => {
  it('reports the plan but creates no files at all, on a totally empty repo', async () => {
    const root = freshRepo();
    const result = await runInit(root, { 'dry-run': true, 'agents-snippet': true });
    expect(result.dryRun).toBe(true);
    expect(existsSync(join(root, EXAMPLE_DECISION_REL))).toBe(false);
    expect(existsSync(join(root, '.mole'))).toBe(false);
    expect(existsSync(join(root, 'AGENTS.md'))).toBe(false);
    expect(existsSync(join(root, 'CLAUDE.md'))).toBe(false);
    expect(result.items.some((i) => i.action === 'create')).toBe(true);
  });

  it('--dry-run on a repo that already has the decision + snippet reports skips, still writes nothing', async () => {
    const root = freshRepo();
    await runInit(root, { 'agents-snippet': true });
    const beforeAgents = readFileSync(join(root, 'AGENTS.md'), 'utf8');
    const beforeDecision = readFileSync(join(root, EXAMPLE_DECISION_REL), 'utf8');
    const result = await runInit(root, { 'dry-run': true, 'agents-snippet': true });
    expect(result.dryRun).toBe(true);
    expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toBe(beforeAgents);
    expect(readFileSync(join(root, EXAMPLE_DECISION_REL), 'utf8')).toBe(beforeDecision);
    expect(result.items.every((i) => i.action === 'skip-exists' || i.action === 'skip-has-snippet')).toBe(true);
  });
});

describe('T96: mole init -- --json output', () => {
  it('planInit + runInit stay in agreement on the plan for a given flag set', async () => {
    const root = freshRepo();
    const plan = await planInit(root, true);
    const result = await runInit(root, { 'agents-snippet': true, 'dry-run': true });
    expect(result.items).toEqual(plan);
  });
});

describe('T96: mole init -- end to end through the real CLI (dist/cli.js)', () => {
  it('`mole init --json` on a fresh repo creates the example decision and prints valid JSON', () => {
    const root = freshRepo();
    const r = spawnSync(process.execPath, [cliDist, 'init', '--json', '--root', root], { encoding: 'utf8', timeout: 15_000 });
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(true);
    expect(existsSync(join(root, EXAMPLE_DECISION_REL))).toBe(true);
  });

  it('`mole --help` / no-args usage mentions init', () => {
    const r = spawnSync(process.execPath, [cliDist], { encoding: 'utf8', timeout: 15_000 });
    expect(`${r.stdout}${r.stderr}`).toMatch(/\binit\b/);
  });

  it('a second `mole init --json` run (rerun) is idempotent end to end', () => {
    const root = freshRepo();
    spawnSync(process.execPath, [cliDist, 'init', '--json', '--root', root], { encoding: 'utf8', timeout: 15_000 });
    const before = readFileSync(join(root, EXAMPLE_DECISION_REL), 'utf8');
    const r2 = spawnSync(process.execPath, [cliDist, 'init', '--json', '--root', root], { encoding: 'utf8', timeout: 15_000 });
    expect(r2.status).toBe(0);
    expect(readFileSync(join(root, EXAMPLE_DECISION_REL), 'utf8')).toBe(before);
    const parsed = JSON.parse(r2.stdout);
    expect(parsed.items.find((i: { path: string }) => i.path === EXAMPLE_DECISION_REL).action).toBe('skip-exists');
  });
});
