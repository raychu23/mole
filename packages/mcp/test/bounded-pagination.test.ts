// T50 done-when 3 (core-audit agent-surfaces.md rank 2; Serena tools_base.py max_answer_chars + the official MCP
// pagination convention, mcp-builder's mcp_best_practices.md: "Always respect limit... Return has_more,
// next_offset, total_count... Never load all results into memory"): mole_check/mole_decisions/mole_coverage had no
// limit/offset/maxAnswerChars on their array-shaped results (hunks / decisions / files) -- only mole_map's fixed
// 25-node cap existed. RED before server.ts/limit.ts's boundedPage() wiring; GREEN after.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function connect(root: string) {
  const server = createServer({ root, noStart: true });
  const client = new Client({ name: 'test', version: '0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

const git = (root: string, ...args: string[]) =>
  execFileSync('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=f@example.com', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' });

/** a repo with N files, each with one past-fix hunk in the working tree vs HEAD, so mole_check has N hunks. */
function manyHunksRepo(n: number): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-mcp-page-check-'));
  dirs.push(root);
  git(root, 'init', '-q', '-b', 'main');
  mkdirSync(join(root, 'src'));
  for (let i = 0; i < n; i++) writeFileSync(join(root, `src/f${i}.ts`), `export function f${i}() {\n  return ${i};\n}\n`);
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'base');
  for (let i = 0; i < n; i++) writeFileSync(join(root, `src/f${i}.ts`), `export function f${i}() {\n  return ${i} + 1;\n}\n`);
  return root;
}

function manyDecisionsRepo(n: number): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-mcp-page-dec-'));
  dirs.push(root);
  mkdirSync(join(root, '.mole/decisions'), { recursive: true });
  for (let i = 0; i < n; i++) {
    const id = String(i + 1).padStart(4, '0');
    writeFileSync(join(root, `.mole/decisions/${id}.md`), `---\nid: '${id}'\ntitle: Decision ${id}\nstatus: accepted\nscope:\n  - src/${id}.ts\n---\n\n## Decision\n\nShort rule ${id}.\n`);
  }
  return root;
}

function manyFilesCoverageRepo(n: number): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-mcp-page-cov-'));
  dirs.push(root);
  git(root, 'init', '-q', '-b', 'main');
  mkdirSync(join(root, 'src'));
  for (let i = 0; i < n; i++) writeFileSync(join(root, `src/f${i}.ts`), `export const f${i} = ${i};\n`);
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'base');
  return root;
}

describe('mole_check: hunks are bounded + paginated (limit/offset/has_more/next_offset + maxAnswerChars)', () => {
  it('limit/offset page the hunks array; has_more + next_offset describe the rest', async () => {
    const n = 12;
    const root = manyHunksRepo(n);
    const client = await connect(root);
    const page1 = await client.callTool({ name: 'mole_check', arguments: { worktree: true, limit: 5 } });
    const j1 = JSON.parse((page1.content as Array<{ text: string }>)[0]?.text ?? '{}') as { hunks: unknown[]; hasMore?: boolean; nextOffset?: number; total?: number };
    expect(j1.hunks.length).toBe(5);
    expect(j1.hasMore).toBe(true);
    expect(j1.total).toBe(n);
    expect(j1.nextOffset).toBe(5);

    const page2 = await client.callTool({ name: 'mole_check', arguments: { worktree: true, limit: 5, offset: j1.nextOffset } });
    const j2 = JSON.parse((page2.content as Array<{ text: string }>)[0]?.text ?? '{}') as { hunks: unknown[]; hasMore?: boolean };
    expect(j2.hunks.length).toBe(5);
    expect(j2.hasMore).toBe(true);

    const page3 = await client.callTool({ name: 'mole_check', arguments: { worktree: true, offset: 10 } });
    const j3 = JSON.parse((page3.content as Array<{ text: string }>)[0]?.text ?? '{}') as { hunks: unknown[]; hasMore?: boolean };
    expect(j3.hunks.length).toBe(2);
    expect(j3.hasMore).toBe(false);

    await client.close();
  }, 30_000);

  it('maxAnswerChars drops whole hunks from the end of the page (never mid-item) when the page would be too big', async () => {
    const root = manyHunksRepo(20);
    const client = await connect(root);
    const full = await client.callTool({ name: 'mole_check', arguments: { worktree: true } });
    const jFull = JSON.parse((full.content as Array<{ text: string }>)[0]?.text ?? '{}') as { hunks: unknown[] };
    const naturalSize = JSON.stringify(jFull.hunks).length;

    const capped = await client.callTool({ name: 'mole_check', arguments: { worktree: true, maxAnswerChars: Math.floor(naturalSize / 3) } });
    const jCapped = JSON.parse((capped.content as Array<{ text: string }>)[0]?.text ?? '{}') as { hunks: unknown[]; hasMore?: boolean; truncated?: string };
    expect(jCapped.hunks.length).toBeLessThan(jFull.hunks.length);
    expect(jCapped.hasMore).toBe(true);
    expect(jCapped.truncated).toMatch(/maxAnswerChars/);
    await client.close();
  }, 30_000);
});

describe('mole_decisions: decisions array is bounded + paginated, on top of the T43 aggregate rationale budget', () => {
  it('limit/offset page the decisions array (files-scoped or not)', async () => {
    const n = 9;
    const root = manyDecisionsRepo(n);
    const client = await connect(root);
    const res = await client.callTool({ name: 'mole_decisions', arguments: { limit: 4 } });
    const j = JSON.parse((res.content as Array<{ text: string }>)[0]?.text ?? '{}') as { decisions: unknown[]; hasMore?: boolean; total?: number; nextOffset?: number };
    expect(j.decisions.length).toBe(4);
    expect(j.hasMore).toBe(true);
    expect(j.total).toBe(n);

    const rest = await client.callTool({ name: 'mole_decisions', arguments: { offset: j.nextOffset } });
    const jRest = JSON.parse((rest.content as Array<{ text: string }>)[0]?.text ?? '{}') as { decisions: unknown[]; hasMore?: boolean };
    expect(jRest.decisions.length).toBe(n - 4);
    expect(jRest.hasMore).toBe(false);
    await client.close();
  });
});

describe('mole_coverage: a whole-repo scan is bounded + paginated', () => {
  it('limit/offset page the files array on a whole-repo scan', async () => {
    const n = 7;
    const root = manyFilesCoverageRepo(n);
    const client = await connect(root);
    const res = await client.callTool({ name: 'mole_coverage', arguments: { limit: 3 } });
    const j = JSON.parse((res.content as Array<{ text: string }>)[0]?.text ?? '{}') as { files: unknown[]; hasMore?: boolean; total?: number; nextOffset?: number };
    expect(j.files.length).toBe(3);
    expect(j.hasMore).toBe(true);
    expect(j.total).toBeGreaterThanOrEqual(n); // src files + any coverage bookkeeping files

    const rest = await client.callTool({ name: 'mole_coverage', arguments: { offset: j.nextOffset } });
    const jRest = JSON.parse((rest.content as Array<{ text: string }>)[0]?.text ?? '{}') as { files: unknown[]; hasMore?: boolean };
    expect(jRest.hasMore).toBe(false);
    await client.close();
  }, 30_000);
});
