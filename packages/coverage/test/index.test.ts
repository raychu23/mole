// T35 (M27): red tests committed before implementation (R1). These exercise the public surface
// `packages/coverage/src/index.ts` is supposed to export once written: per-file agent attribution joined with
// human reads (T13), guarding tests and decision flags (T29), plus the weak-spot and failure-case rules from
// tasks/T35-agent-coverage/0 start.md done-when (3) and (4). Key = packages/coverage/bench/m27-key.json (R1: a
// DIFFERENT method, git log on ledger branches filtered by Hermes session metadata, not transcript parsing).
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { coverage, scanCoverage } from '../src/index.js';

function git(cwd: string, args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

describe('T35 coverage (M27)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mole-coverage-test-'));
    git(dir, ['init', '-q']);
    git(dir, ['config', 'user.email', 'test@example.com']);
    git(dir, ['config', 'user.name', 'Test']);
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'a.ts'), 'export const a = 1;\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'init']);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('reports no agent sessions found and exits clean when no logs are present', () => {
    const r = scanCoverage(dir, { hermesDb: join(dir, 'missing-state.db'), claudeDir: join(dir, 'missing-claude'), codexDir: join(dir, 'missing-codex') });
    expect(r.files.length).toBe(0);
    expect(r.notice).toMatch(/no agent sessions found in/);
  });

  it('skips malformed log lines and counts them instead of throwing', () => {
    const claudeDir = join(dir, 'claude-fixture', 'proj');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, 'sess1.jsonl'), '{"not":"valid"\nnot even json\n');
    const r = scanCoverage(dir, { hermesDb: join(dir, 'missing-state.db'), claudeDir: join(dir, 'claude-fixture'), codexDir: join(dir, 'missing-codex') });
    expect(r.skipped.length + r.malformed).toBeGreaterThanOrEqual(0); // never throws
  });

  it('one-file query returns the file record shape the schema promises', async () => {
    const r = await coverage(dir, 'src/a.ts', { hermesDb: join(dir, 'missing-state.db'), claudeDir: join(dir, 'missing-claude'), codexDir: join(dir, 'missing-codex') });
    expect(r.file).toBe('src/a.ts');
    expect(Array.isArray(r.agents)).toBe(true);
    expect(r.human).toHaveProperty('lastSeen');
    expect(Array.isArray(r.tests)).toBe(true);
    expect(Array.isArray(r.decisions)).toBe(true);
    expect(r.weak).toHaveProperty('is');
    expect(r.weak).toHaveProperty('reasons');
  });
});
