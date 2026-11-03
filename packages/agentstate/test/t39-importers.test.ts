// T39 tests: the three import formats parse per their documented wire shapes (sources: 4 log/prior-art.md),
// and anchorIntents/recheckIntents behave like T11's note staleness (whitespace/comment-only edits never flag).
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { agentTraceToRawIntents, anchorIntents, entireLegacyFixtureToRawIntents, gitAiToRawIntents, parseAgentTrace, parseEntireCheckpointLegacyFixture, parseGitAiNote, recheckIntents } from '../src/importers/index.js';

describe('T39 importers: parse per the documented format', () => {
  it('LEGACY/HAND-BUILT fixture: entire checkpoint metadata.json -> sessions with file ranges (T76 2026-11-03: Entire never writes this shape; see src/importers/entire.ts and 4 log/real-samples/entire/)', () => {
    const meta = parseEntireCheckpointLegacyFixture(
      JSON.stringify({
        checkpointId: 'c1',
        commitSha: 'abc123',
        filesTouched: ['src/a.ts'],
        sessions: [{ sessionId: 's1', agentType: 'claude-code', model: 'claude-sonnet-5', prompt: 'do x', fileRanges: [{ file: 'src/a.ts', startLine: 1, endLine: 3 }] }],
      }),
    );
    const raw = entireLegacyFixtureToRawIntents(meta);
    expect(raw).toHaveLength(1);
    expect(raw[0]).toMatchObject({ source: 'entire', sessionId: 's1', file: 'src/a.ts', startLine: 1, endLine: 3, commitSha: 'abc123' });
  });

  it('LEGACY/HAND-BUILT fixture: rejects an entire checkpoint missing sessions[]', () => {
    expect(() => parseEntireCheckpointLegacyFixture(JSON.stringify({ checkpointId: 'c1' }))).toThrow();
  });

  it('git-ai Authorship Log (table + --- + JSON, usegitai.com "Git Note Format")', () => {
    const note = ['src/auth.ts   session_1 1-8,10-21   session_2 9,22-30', 'src/db.ts   session_1 12-19', '---', JSON.stringify({ schema_version: 'authorship/3.0.0', base_commit_sha: 'deadbeef', prompts: { session_1: { agent: 'claude-code', model: 'claude-sonnet-5' }, session_2: { agent: 'codex', model: 'gpt-5' } } })].join('\n');
    const parsed = parseGitAiNote(note);
    const raw = gitAiToRawIntents(parsed);
    expect(raw.filter((r) => r.file === 'src/auth.ts' && r.sessionId === 'session_1')).toHaveLength(2); // 1-8 and 10-21
    const authSession2 = raw.find((r) => r.file === 'src/auth.ts' && r.sessionId === 'session_2');
    expect(authSession2).toMatchObject({ startLine: 9, endLine: 9, model: 'gpt-5' });
    const dbRow = raw.find((r) => r.file === 'src/db.ts');
    expect(dbRow).toMatchObject({ startLine: 12, endLine: 19, agent: 'claude-code' });
  });

  it('git-ai: `git log --show-notes=ai` pretty-printed shape also parses', () => {
    const shown = ['Notes (ai):', '    src/commands/checkpoint.rs       6e4d6f2 51-52,54,58-110,901-931,934-947', '    src/git/test_utils/mod.rs       4,410-425'].join('\n');
    const parsed = parseGitAiNote(shown + '\n---\n{}');
    expect(parsed.files.length).toBeGreaterThan(0);
  });

  it('agent-trace v0.1.0 appendix A minimal valid record', () => {
    const rec = parseAgentTrace(
      JSON.stringify({
        version: '0.1.0',
        id: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: '2026-01-25T10:00:00Z',
        files: [{ path: 'src/app.ts', conversations: [{ contributor: { type: 'ai' }, ranges: [{ start_line: 1, end_line: 50 }] }] }],
      }),
    );
    const raw = agentTraceToRawIntents(rec);
    expect(raw).toEqual([expect.objectContaining({ source: 'agent-trace', file: 'src/app.ts', startLine: 1, endLine: 50 })]);
  });

  it('agent-trace: human-contributed ranges carry no agent intent', () => {
    const rec = parseAgentTrace(JSON.stringify({ version: '0.1.0', id: 'x', timestamp: 't', files: [{ path: 'a.ts', conversations: [{ contributor: { type: 'human' }, ranges: [{ start_line: 1, end_line: 2 }] }] }] }));
    expect(agentTraceToRawIntents(rec)).toHaveLength(0);
  });
});

describe('T39: anchor onto functions + re-check like a note (T11 invariant)', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'mole-t39-unit-'));
    writeFileSync(join(root, 'sample.ts'), 'export function fnA(x: number): number {\n  return x + 1;\n}\n\nexport function fnB(x: number): number {\n  return x + 2;\n}\n');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('anchors a raw intent to the containing function, not a neighbour', () => {
    const { intents, misses } = anchorIntents(root, [{ source: 'entire', sessionId: 's1', file: 'sample.ts', startLine: 1, endLine: 3 }]);
    expect(misses).toHaveLength(0);
    expect(intents[0]?.tail).toBe('fnA');
  });

  it('reports a miss (not a guess) when no symbol contains the range', () => {
    const { intents, misses } = anchorIntents(root, [{ source: 'entire', sessionId: 's1', file: 'sample.ts', startLine: 4, endLine: 4 }]);
    expect(intents).toHaveLength(0);
    expect(misses).toHaveLength(1);
  });

  it('flags stale after the anchored function body changes', () => {
    const { intents } = anchorIntents(root, [{ source: 'entire', sessionId: 's1', file: 'sample.ts', startLine: 1, endLine: 3 }]);
    writeFileSync(join(root, 'sample.ts'), 'export function fnA(x: number): number {\n  return x + 999;\n}\n\nexport function fnB(x: number): number {\n  return x + 2;\n}\n');
    const statuses = recheckIntents(root, intents);
    expect(statuses[0]?.status).toBe('stale');
  });

  it('never flags a whitespace/comment-only edit stale', () => {
    const { intents } = anchorIntents(root, [{ source: 'entire', sessionId: 's1', file: 'sample.ts', startLine: 1, endLine: 3 }]);
    writeFileSync(join(root, 'sample.ts'), '// a comment\nexport function fnA(x: number): number {\n\n  return x + 1;\n}\n\nexport function fnB(x: number): number {\n  return x + 2;\n}\n');
    const statuses = recheckIntents(root, intents);
    expect(statuses[0]?.status).toBe('fresh');
  });

  it('flags stale when the anchored function is deleted entirely', () => {
    const { intents } = anchorIntents(root, [{ source: 'entire', sessionId: 's1', file: 'sample.ts', startLine: 1, endLine: 3 }]);
    writeFileSync(join(root, 'sample.ts'), 'export function fnB(x: number): number {\n  return x + 2;\n}\n');
    const statuses = recheckIntents(root, intents);
    expect(statuses[0]?.status).toBe('stale');
    expect(statuses[0]?.currentHash).toBeUndefined();
  });
});
