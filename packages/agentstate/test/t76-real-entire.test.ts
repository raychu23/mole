// T76: the T39 Entire importer was only ever proven against a hand-built `fileRanges` fixture (now kept as
// LEGACY in t39-importers.test.ts) that Entire never actually writes. These tests run the real importer
// against REAL checkpoint data fetched from entireio/cli's own public `refs/entire/checkpoints/*` namespace
// (the tool dogfoods itself) -- no `entire` CLI, no install, no live AI agent session. See
// ../../tasks/T76-agent-log-import-real/4 log/real-samples/entire/README.md for the exact `git ls-remote`/
// `git fetch`/`git cat-file` commands used to capture every sample below.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { anchorIntents, entireToRawIntents, parseEntireCheckpointSummary, parseEntireSessionMetadata } from '../src/importers/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const samplesDir = join(here, '..', '..', '..', 'tasks', 'T76-agent-log-import-real', '4 log', 'real-samples', 'entire');
const sample = (name: string) => readFileSync(join(samplesDir, name), 'utf8');

describe('T76: real Entire checkpoint data (not fixture)', () => {
  it('root metadata.json (CheckpointSummary) parses the real snake_case shape, no line ranges anywhere', () => {
    const summary = parseEntireCheckpointSummary(sample('checkpoint-01KX0ENQ9M4C5P85G431G5YR2E.root.metadata.json'));
    expect(summary).toMatchObject({
      checkpointId: '01KX0ENQ9M4C5P85G431G5YR2E',
      branch: 'paul/mirror-get-cluster-routing',
      commitSha: undefined, // real data: commit_sha is import-only, absent on every real non-imported sample
      filesTouched: ['cmd/entire/cli/corecmd.go', 'cmd/entire/cli/repo_mirror.go', 'cmd/entire/cli/repo_mirror_test.go'],
      sessionMetadataPaths: ['/0/metadata.json'],
    });
  });

  it('root metadata.json normalizes a real null files_touched to []', () => {
    const summary = parseEntireCheckpointSummary(sample('checkpoint-01KXGTTNGCEACC83QZEJ5YAF0D.root.metadata.json'));
    expect(summary.filesTouched).toEqual([]);
  });

  it('per-session metadata.json parses the real shape: agent, model, files_touched, no fileRanges field exists', () => {
    const session = parseEntireSessionMetadata(sample('checkpoint-01KX0ENQ9M4C5P85G431G5YR2E.session0.metadata.json'));
    expect(session).toMatchObject({
      checkpointId: '01KX0ENQ9M4C5P85G431G5YR2E',
      sessionId: 'dd0563ee-7267-469e-85b8-f43a5a0f3315',
      agent: 'Claude Code',
      model: 'claude-fable-5',
      filesTouched: ['cmd/entire/cli/corecmd.go', 'cmd/entire/cli/repo_mirror.go', 'cmd/entire/cli/repo_mirror_test.go'],
    });
    expect(session).not.toHaveProperty('fileRanges');
  });

  it('real data: an empty model string ("") normalizes to undefined, not a false empty-string claim', () => {
    const session = parseEntireSessionMetadata(sample('checkpoint-01KX0P0XW5TXCPJY4G65B8N82V.session0.metadata.json'));
    expect(session.model).toBeUndefined();
  });

  it('entireToRawIntents emits one file-level RawIntent per touched file, never a fabricated line range', () => {
    const summary = parseEntireCheckpointSummary(sample('checkpoint-01KX0ENQ9M4C5P85G431G5YR2E.root.metadata.json'));
    const session = parseEntireSessionMetadata(sample('checkpoint-01KX0ENQ9M4C5P85G431G5YR2E.session0.metadata.json'));
    const raw = entireToRawIntents(summary, [session]);
    expect(raw).toHaveLength(3);
    expect(raw.every((r) => r.granularity === 'file')).toBe(true);
    expect(raw.map((r) => r.file).sort()).toEqual(['cmd/entire/cli/corecmd.go', 'cmd/entire/cli/repo_mirror.go', 'cmd/entire/cli/repo_mirror_test.go'].sort());
    expect(raw.every((r) => r.agent === 'Claude Code' && r.model === 'claude-fable-5')).toBe(true);
  });

  it('a session with empty files_touched falls back to the root checkpoint files_touched', () => {
    const summary = parseEntireCheckpointSummary(sample('checkpoint-01KWY36KMC5ZJSTSFN91GNF51T.root.metadata.json'));
    const session = parseEntireSessionMetadata(sample('checkpoint-01KWY36KMC5ZJSTSFN91GNF51T.session0.metadata.json'));
    expect(session.filesTouched).toEqual([]); // real data: session-level empty too on this checkpoint
    const raw = entireToRawIntents(summary, [session]);
    expect(raw).toHaveLength(0); // root is also [] on this checkpoint -- honestly nothing to link, not a crash
  });

  it('anchorIntents reports a file-level RawIntent as an explicit miss, never anchors it to a wrong function', () => {
    const summary = parseEntireCheckpointSummary(sample('checkpoint-01KX0ENQ9M4C5P85G431G5YR2E.root.metadata.json'));
    const session = parseEntireSessionMetadata(sample('checkpoint-01KX0ENQ9M4C5P85G431G5YR2E.session0.metadata.json'));
    const raw = entireToRawIntents(summary, [session]);
    const { intents, misses } = anchorIntents(here, raw); // `here` has no real symbol index; irrelevant -- file-level always misses
    expect(intents).toHaveLength(0);
    expect(misses).toHaveLength(3);
    expect(misses.every((m) => m.reason.includes('file-level claim only'))).toBe(true);
  });
});
