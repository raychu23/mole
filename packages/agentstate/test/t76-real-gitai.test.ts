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

describe('T76 review fix: git_ai_standard_v3.0.0.md §1.2.3.1 id-prefix exclusion (gitai.ts MED finding)', () => {
  // git_ai_standard_v3.0.0.md §1.2.3.1: "Human keys: MUST correspond to an entry in `metadata.humans`" and h_
  // keys are never composite (only s_ keys use `::`). Both properties are exercised here with synthetic notes
  // (no real-sample equivalent exists for the base::sub-is-a-humans-key case, since a spec-compliant h_ key
  // never carries one -- this guards a malformed/future note, not a shape git-ai v1.7.5 itself ever emits).
  const note = (sessionLine: string, meta: Record<string, unknown>) => ['f.js', `  ${sessionLine}`, '---', JSON.stringify(meta)].join('\n');

  it('excludes a row whose composite base::sub id has its BASE (not the full composite) as a meta.humans key', () => {
    const parsed = parseGitAiNote(note('h_deadbeef1234::t_feedface5678 1-5', { humans: { h_deadbeef1234: { author: 'dev@example.com' } } }));
    expect(gitAiToRawIntents(parsed)).toHaveLength(0);
  });

  it('excludes an h_-prefixed row even when meta.humans is entirely absent (prefix alone identifies it as human, per the spec)', () => {
    const parsed = parseGitAiNote(note('h_deadbeef1234 1-5', {}));
    expect(gitAiToRawIntents(parsed)).toHaveLength(0);
  });

  it('excludes an h_-prefixed composite row with no meta.humans map at all (both guards compose)', () => {
    const parsed = parseGitAiNote(note('h_deadbeef1234::t_feedface5678 1-5', {}));
    expect(gitAiToRawIntents(parsed)).toHaveLength(0);
  });

  it('fuzz: a known_human exclusion never leaks regardless of trace-id suffix or whether meta.humans lists the base, the full id, both, or neither', () => {
    const baseHuman = 'h_a1b2c3d4e5f6a1';
    const traceSuffixes = ['t_0000000000001', 't_ffffffffffff1', 't_feedfacecafe1', 't_1234567890abc'];
    const humanMapVariants: Array<Record<string, unknown> | undefined> = [
      undefined,
      {},
      { [baseHuman]: { author: 'a@x.com' } },
      { [`${baseHuman}::${traceSuffixes[0]}`]: { author: 'a@x.com' } },
      { [baseHuman]: { author: 'a@x.com' }, [`${baseHuman}::${traceSuffixes[1]}`]: { author: 'a@x.com' } },
    ];
    for (const trace of traceSuffixes) {
      for (const humans of humanMapVariants) {
        const parsed = parseGitAiNote(note(`${baseHuman}::${trace} 1-5`, humans ? { humans } : {}));
        expect(gitAiToRawIntents(parsed)).toHaveLength(0);
      }
    }
  });

  it('still imports a legitimate s_-prefixed AI row (the exclusion does not over-match non-human prefixes)', () => {
    const parsed = parseGitAiNote(note('s_a1b2c3d4e5f6a1::t_feedfacecafe1 1-5', { sessions: { s_a1b2c3d4e5f6a1: { agent_id: { tool: 'cursor', model: 'gpt-5' } } } }));
    const raw = gitAiToRawIntents(parsed);
    expect(raw).toHaveLength(1);
    expect(raw[0]).toMatchObject({ file: 'f.js', startLine: 1, endLine: 5, agent: 'cursor', model: 'gpt-5' });
  });
});
