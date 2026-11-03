// T76: the T39 importers were only ever proven against hand-built fixtures matching usegitai.com's docs. These
// tests run the real importer against REAL output captured from the real git-ai v1.7.5 binary (mock_ai/human/
// known_human test presets -- no live AI agent session, no fixture). See
// ../../tasks/T76-agent-log-import-real/4 log/real-samples/gitai/README.md for exactly how each note was produced,
// and why the real wire shape (undocumented `sessions`/`humans` keys, composite `base::sub` session ids) differs
// from the docs T39's gitai.ts was built against.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { anchorIntents, gitAiToRawIntents, parseGitAiNote } from '../src/importers/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const samplesDir = join(here, '..', '..', '..', 'tasks', 'T76-agent-log-import-real', '4 log', 'real-samples', 'gitai');
const sample = (name: string) => readFileSync(join(samplesDir, name), 'utf8');

describe('T76: real git-ai v1.7.5 output (not fixture)', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'mole-t76-gitai-'));
    writeFileSync(join(root, 'math.js'), sample('file-math.js.at-d2563226.txt'));
    writeFileSync(join(root, 'math2.js'), sample('file-math2.js.at-9cda3e26.txt'));
    writeFileSync(join(root, 'fileA.js'), sample('file-fileA.js.at-d59dfa0c.txt'));
    writeFileSync(join(root, 'fileB.js'), sample('file-fileB.js.at-d59dfa0c.txt'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('note-1: single AI session anchors to the function it touched, tagged mock_ai', () => {
    const raw = gitAiToRawIntents(parseGitAiNote(sample('note-1-single-ai-session.txt')));
    expect(raw).toHaveLength(1);
    expect(raw[0]).toMatchObject({ file: 'math.js', startLine: 5, endLine: 8, agent: 'mock_ai' });
    const { intents, misses } = anchorIntents(root, raw);
    expect(misses).toHaveLength(0);
    expect(intents[0]?.tail).toBe('multiply');
  });

  it('note-2: one AI session split into two ranges, both anchor, both tagged mock_ai', () => {
    const raw = gitAiToRawIntents(parseGitAiNote(sample('note-2-two-ranges-same-session.txt')));
    expect(raw).toHaveLength(2);
    expect(raw.every((r) => r.agent === 'mock_ai')).toBe(true);
    const { intents, misses } = anchorIntents(root, raw);
    expect(misses).toHaveLength(0);
    expect(intents.map((i) => i.tail).sort()).toEqual(['add', 'divide']);
  });

  it('note-3: known_human rows are never imported as agent intents (0 wrong links)', () => {
    const raw = gitAiToRawIntents(parseGitAiNote(sample('note-3-multi-file-mixed-human-ai.txt')));
    // Only fileA.js's mock_ai rows are agent intents; fileB.js's known_human rows must not appear at all.
    expect(raw).toHaveLength(2);
    expect(raw.every((r) => r.file === 'fileA.js')).toBe(true);
    expect(raw.every((r) => r.agent === 'mock_ai')).toBe(true);
    const { intents, misses } = anchorIntents(root, raw);
    expect(misses).toHaveLength(0);
    expect(intents.map((i) => i.tail).sort()).toEqual(['a', 'a2']);
  });

  it('show-notes-pretty.txt (git log --show-notes=ai form) parses the same three commits with no human leakage', () => {
    const text = sample('show-notes-pretty.txt');
    const chunks = text.split(/^commit /m).slice(1);
    let totalRaw = 0;
    for (const chunk of chunks) {
      const notesIdx = chunk.indexOf('Notes (ai):');
      if (notesIdx < 0) continue;
      const noteText = chunk.slice(notesIdx);
      const raw = gitAiToRawIntents(parseGitAiNote(noteText));
      totalRaw += raw.length;
      expect(raw.every((r) => r.file !== 'fileB.js')).toBe(true); // fileB.js rows are all known_human in this fixture set
    }
    expect(totalRaw).toBe(5); // 1 (math.js) + 2 (math2.js) + 2 (fileA.js); the 2 known_human fileB.js rows are excluded
  });
});
