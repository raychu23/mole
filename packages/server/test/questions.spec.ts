// Review round 1 P0 #2: question routing end-to-end (task done-when #3, "records first, else
// the CODEOWNERS owner"). Unlike bench/fixtures.ts (frozen, every fixture repo gets the same
// `*` CODEOWNERS pattern), these tests build their own small repos so all three outcomes
// (record, codeowners, neither) are independently exercised.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPool, runMigrations, closePool, type Pool } from '../src/db.js';
import { rebuildIndexFromGit } from '../src/rebuild.js';
import { routeQuestion } from '../src/questions.js';

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

/** A repo with one decision (owner `dec-owner`) governing src/owned.ts, a CODEOWNERS file
 * giving `@file-owner` to src/*, and a third file with neither a decision nor a CODEOWNERS
 * match (it lives outside src/, so the `src/*` pattern does not cover it). */
function buildRoutingRepo(): { dir: string; head: string } {
  const dir = mkdtempSync(path.join(tmpdir(), 'mole-questions-'));
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 'test@mole.test']);
  git(dir, ['config', 'user.name', 'Mole Test']);
  mkdirSync(path.join(dir, '.mole', 'decisions'), { recursive: true });
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  writeFileSync(path.join(dir, 'CODEOWNERS'), 'src/* @file-owner\n');
  writeFileSync(
    path.join(dir, '.mole', 'decisions', 'd0.md'),
    '---\nid: d0\nkind: decision\nstatus: accepted\ntitle: Decision for owned file\nscope: [src/owned.ts]\nowner: dec-owner\n---\nWhy: test fixture.\n'
  );
  writeFileSync(path.join(dir, 'src', 'owned.ts'), 'export const owned = 1;\n');
  writeFileSync(path.join(dir, 'src', 'codeowners-only.ts'), 'export const other = 1;\n');
  writeFileSync(path.join(dir, 'other.ts'), 'export const neither = 1;\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'init']);
  const head = git(dir, ['rev-parse', 'HEAD']);
  return { dir, head };
}

describe('routeQuestion ("records first, else CODEOWNERS owner", done-when #3)', () => {
  let pool: Pool;
  let dir: string;
  const orgId = 'org-questions';

  beforeAll(async () => {
    const dbUrl = process.env.M25_DATABASE_URL;
    if (!dbUrl) return;
    pool = createPool(dbUrl);
    await runMigrations(pool);
    await pool.query("insert into orgs(id, name) values ($1,'Q') on conflict (id) do nothing", [orgId]);
    const repo = buildRoutingRepo();
    dir = repo.dir;
    await rebuildIndexFromGit(pool, orgId, dir, repo.head, undefined);
  });

  afterAll(async () => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    if (pool) await closePool(pool);
  });

  it.runIf(!!process.env.M25_DATABASE_URL)('routes to the governing decision record when one exists', async () => {
    const route = await routeQuestion(pool, orgId, dir, 'src/owned.ts');
    expect(route).toEqual({ owner: 'dec-owner', via: 'record' });
  });

  it.runIf(!!process.env.M25_DATABASE_URL)('falls back to the CODEOWNERS owner when there is no record', async () => {
    const route = await routeQuestion(pool, orgId, dir, 'src/codeowners-only.ts');
    expect(route).toEqual({ owner: '@file-owner', via: 'codeowners' });
  });

  it.runIf(!!process.env.M25_DATABASE_URL)('is silent (unassigned/none) when neither a record nor a CODEOWNERS owner exists', async () => {
    const route = await routeQuestion(pool, orgId, dir, 'other.ts');
    expect(route).toEqual({ owner: 'unassigned', via: 'none' });
  });
});
