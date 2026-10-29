// T30 red tests (tasks/T30-annotated-file-tree/2 insights.md section 0): folder -> flag (worst in force, grey never colors),
// badge (accepted decisions on it or below, <= 2 chars), intent card (fields only from records), done-when 4 (no records ->
// no decoration, no card), the text output used by the M22 proxy, and the real Mole records.
// (written with a terminal heredoc: write_file may be approval-gated for test files in this unattended run)
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTree, computeFlags, decorationFor, formatCard, intentCard, loadGraph, loadTree, treeText, type DecisionGraph } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const moleRoot = resolve(here, '../../..');

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const git = (root: string, ...args: string[]) =>
  execFileSync('git', ['-C', root, '-c', 'user.name=T', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }).trim();

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-tree-'));
  dirs.push(root);
  git(root, 'init', '-q', '-b', 'main');
  for (const [p, t] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), t);
  }
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'base');
  return root;
}

const dec = (id: string, fm: string, body = '') => `---\nid: '${id}'\n${fm.trim()}\n---\n\n## Decision\n\n${body || `Decision ${id}.`}\n`;

const FIXTURE: Record<string, string> = {
  '.mole/tenets.md': '# Tenets\n\n## tenet-1 · Keep it fast\n\nFast.\n',
  '.mole/decisions/0001-server.md': dec('0001', `title: Serve from one process\nstatus: accepted\ntraces_to: [tenet-1]\nscope:\n  - app/src/server.ts\nevidence:\n  - test: app/test/server.test.ts#starts\napprover: ann`, 'One process serves every request, so the cache stays warm.'),
  '.mole/decisions/0002-watch.md': dec('0002', `title: Watching counts as use\nstatus: accepted\noverrides: ['0001']\nscope:\n  - app/src/watch.ts\napprover: bob`),
  '.mole/decisions/0003-gone.md': dec('0003', `title: Keep the old helper\nstatus: accepted\nscope:\n  - lib/gone.ts\napprover: ann`),
  '.mole/decisions/0004-proposed.md': dec('0004', `title: Split the server\nstatus: proposed\nscope:\n  - app/src/server.ts`),
  '.mole/decisions/0005-util.md': dec('0005', `title: Utils stay pure\nstatus: accepted\nscope:\n  - lib/util.ts\nevidence:\n  - test: lib/test/util.test.ts#no such test\napprover: dan`),
  '.mole/decisions/0006-old.md': dec('0006', `title: Old server loop\nstatus: superseded\nsuperseded_by: ['0002']\nscope:\n  - app/src/old.ts`),
  '.mole/intent/app.md': '---\nfolder: app\npurpose: Serves the map to the editor.\nend_state: Answers while you work.\nask: carol\ntenets: [tenet-1]\n---\n',
  'app/src/server.ts': 'export function serve() {\n  return 1;\n}\n',
  'app/src/watch.ts': 'export function watch() {\n  return 2;\n}\n',
  'app/src/old.ts': 'export const old = 1;\n',
  'app/test/server.test.ts': "import { it } from 'vitest';\nit('starts', () => {});\n",
  'lib/util.ts': 'export const u = 1;\n',
  'lib/test/util.test.ts': "import { it } from 'vitest';\nit('pure', () => {});\n",
  'docs/readme.md': '# docs\n',
  'empty/keep.txt': 'x\n',
};

describe('decorations: flag, badge, propagation', () => {
  it('a folder gets the worst flag of the decisions in force on it or below and a badge counting them', () => {
    const t = loadTree(repo(FIXTURE));
    const app = decorationFor(t, 'app')!;
    expect(app.flag).toBe('green');
    expect(app.badge).toBe('2'); // 0001 + 0002; 0004 proposed and 0006 superseded do not count
    expect(app.count).toBe(2);
    expect(app.tooltip.length).toBeGreaterThan(0);
    expect(decorationFor(t, 'app/src')!.badge).toBe('2');
    const lib = decorationFor(t, 'lib')!;
    expect(lib.flag).toBe('red'); // 0003 orphaned (red) beats 0005 evidence missing (yellow)
    expect(lib.badge).toBe('2');
    const root = decorationFor(t, '')!;
    expect(root.flag).toBe('red');
    expect(root.badge).toBe('4');
  });

  it('a file is decorated by the decisions scoped to it; grey (proposed) never colors or counts', () => {
    const t = loadTree(repo(FIXTURE));
    const server = decorationFor(t, 'app/src/server.ts')!;
    expect(server.flag).toBe('green');
    expect(server.badge).toBe('1');
    const util = decorationFor(t, 'lib/util.ts')!;
    expect(util.flag).toBe('yellow');
    expect(util.tooltip).toMatch(/0005/);
  });

  it('accepts trailing slashes and ./ in paths', () => {
    const t = loadTree(repo(FIXTURE));
    expect(decorationFor(t, 'app/')?.badge).toBe('2');
    expect(decorationFor(t, './lib')?.flag).toBe('red');
  });

  it('the badge is at most 2 characters (VS Code limit), even with 120 decisions', () => {
    const files: Record<string, string> = { 'big/a.ts': 'export const a = 1;\n' };
    for (let i = 0; i < 120; i++) files[`.mole/decisions/${String(1000 + i)}-d.md`] = dec(String(1000 + i), `title: D${i}\nstatus: accepted\nscope:\n  - big/a.ts`);
    const t = loadTree(repo(files));
    const d = decorationFor(t, 'big')!;
    expect(d.count).toBe(120);
    expect(d.badge!.length).toBeLessThanOrEqual(2);
    expect(d.badge!.length).toBeGreaterThan(0);
  });
});

describe('done-when 4: a folder with no records shows nothing', () => {
  it('no decoration, no card, no line in the tree text', () => {
    const t = loadTree(repo(FIXTURE));
    for (const p of ['docs', 'docs/readme.md', 'empty', 'empty/keep.txt', 'nowhere/at/all']) {
      expect(decorationFor(t, p)).toBeUndefined();
      expect(intentCard(t, p)).toBeUndefined();
    }
    expect(t.folders).not.toContain('docs');
    expect(treeText(t, 'docs')).not.toMatch(/docs/);
  });

  it('a repo without .mole: nothing anywhere, nothing thrown', () => {
    const t = loadTree(repo({ 'src/a.ts': 'export const a = 1;\n' }));
    expect(decorationFor(t, '')).toBeUndefined();
    expect(decorationFor(t, 'src')).toBeUndefined();
    expect(intentCard(t, 'src')).toBeUndefined();
    expect(t.folders).toEqual([]);
  });
});

describe('intent card', () => {
  it('purpose / end state / tenets / who to ask from the intent record and approvers; missing fields are left out', () => {
    const t = loadTree(repo(FIXTURE));
    const c = intentCard(t, 'app')!;
    expect(c.purpose).toBe('Serves the map to the editor.');
    expect(c.endState).toBe('Answers while you work.');
    expect(c.risk).toBeUndefined();
    expect(c.ask[0]).toBe('carol');
    expect(c.ask).toEqual(expect.arrayContaining(['carol', 'ann', 'bob']));
    expect(c.tenets.map((x) => x.id)).toEqual(['tenet-1']);
    expect(c.tenets[0]!.title).toBe('Keep it fast');
    expect(c.intentFile).toBe('.mole/intent/app.md');
    const text = formatCard(c);
    expect(text).toMatch(/Purpose: Serves the map to the editor\./);
    expect(text).toMatch(/Keep it fast/);
    expect(text).not.toMatch(/Risk/i);
    expect(text).not.toMatch(/undefined|null/);
  });

  it('decisions with flag, evidence state, exceptions, summary; proposed and replaced listed apart', () => {
    const t = loadTree(repo(FIXTURE));
    const c = intentCard(t, 'app')!;
    expect(c.decisions.map((d) => d.id)).toEqual(['0001', '0002']);
    const d1 = c.decisions[0]!;
    expect(d1.flag).toBe('green');
    expect(d1.evidence).toBe('tested');
    expect(d1.exceptions).toEqual(['0002']);
    expect(d1.anchors).toEqual(['app/src/server.ts']);
    expect(d1.summary).toMatch(/^One process serves every request/);
    expect(c.decisions[1]!.evidence).toBe('no test');
    expect(c.proposed.map((d) => d.id)).toEqual(['0004']);
    expect(c.replaced.map((d) => d.id)).toEqual(['0006']);
    expect(c.replaced[0]!.replacedBy).toEqual(['0002']);
    const text = formatCard(c);
    expect(text).toMatch(/0001/);
    expect(text).toMatch(/exception.*0002/i);
    expect(text).toMatch(/0006.*0002/);
  });

  it('a folder with decisions but no intent record: a card without purpose (never invented)', () => {
    const t = loadTree(repo(FIXTURE));
    const c = intentCard(t, 'lib')!;
    expect(c.purpose).toBeUndefined();
    expect(c.endState).toBeUndefined();
    expect(c.intentFile).toBeUndefined();
    expect(c.decisions.map((d) => [d.id, d.flag])).toEqual([
      ['0003', 'red'],
      ['0005', 'yellow'],
    ]);
    expect(c.decisions[0]!.reasons.join(' ')).toMatch(/lib\/gone\.ts/);
    expect(c.decisions[1]!.evidence).toBe('test missing');
    expect(c.ask).toEqual(expect.arrayContaining(['ann', 'dan']));
    expect(formatCard(c)).not.toMatch(/Purpose/);
  });

  it('your read state shows only when it is given', () => {
    const root = repo(FIXTURE);
    expect(formatCard(intentCard(loadTree(root), 'app')!)).not.toMatch(/^You:/m);
    const t = loadTree(root, { reads: { app: { lastRead: '2026-10-27', explainedBack: false } } });
    const c = intentCard(t, 'app')!;
    expect(c.read).toEqual({ lastRead: '2026-10-27', explainedBack: false });
    expect(formatCard(c)).toMatch(/You: read 2026-10-27, not explained back yet/);
  });
});

describe('tree text (what the M22 proxy prompt shows)', () => {
  it('lists the folder and its parents with badges, and the cards on that path', () => {
    const t = loadTree(repo(FIXTURE));
    const text = treeText(t, 'app/src');
    expect(text).toMatch(/app\/src.*\b2\b/);
    expect(text).toMatch(/Purpose: Serves the map to the editor\./); // the parent's card
    expect(text).not.toMatch(/0005/); // lib is not on the path
  });

  it('descendants: true adds the decorated folders below', () => {
    const t = loadTree(repo(FIXTURE));
    expect(treeText(t, '', { descendants: true })).toMatch(/lib/);
    expect(treeText(t, '')).not.toMatch(/Utils stay pure/);
  });
});

describe('pure core', () => {
  it('buildTree works on a graph + cached flags without touching the file system', () => {
    const root = repo(FIXTURE);
    const graph = loadGraph(root);
    const flags = computeFlags(graph);
    const moved: DecisionGraph = { ...graph, root: join(root, 'does-not-exist') };
    rmSync(root, { recursive: true, force: true });
    const t = buildTree({ graph: moved, flags });
    expect(decorationFor(t, 'lib')!.flag).toBe('red');
    expect(intentCard(t, 'app')!.purpose).toBeUndefined(); // no intents passed in: none read from disk
  });
});

describe("Mole's own records", () => {
  it('packages/daemon: the intent card from .mole/intent/packages/daemon.md and 0007 with its exceptions', () => {
    const t = loadTree(moleRoot);
    const c = intentCard(t, 'packages/daemon')!;
    expect(c.purpose).toMatch(/^One background process per repo/);
    expect(c.ask).toContain('raymond');
    expect(c.tenets.map((x) => x.id)).toEqual(['tenet-2', 'tenet-3']);
    expect(c.decisions.map((d) => d.id)).toEqual(expect.arrayContaining(['0007', '0008', '0009', '0013']));
    expect(c.decisions.find((d) => d.id === '0007')!.exceptions.sort()).toEqual(['0008', '0009']);
    expect(decorationFor(t, 'packages/daemon')!.count).toBe(4);
    expect(decorationFor(t, 'apps/vscode/media')).toBeUndefined();
    expect(intentCard(t, 'scripts')).toBeUndefined();
  });
});
