// T46 red tests: compile-at-capture drafts a model's output into a versioned, pending store (never touches the
// record until approved); approve merges scope/match/rules into the record's own front matter (dedup, append-only);
// reject only marks the version rejected. A fake LlmClient stands in for the model (product code never calls one
// directly -- see llm.ts).
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { approveDraft, draftChecksFor, getVersion, listVersions, parseDraftResponse, rejectDraft, saveDraft, type LlmClient } from '../src/compile/index.js';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
});

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-compile-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  for (const [f, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, f)), { recursive: true });
    writeFileSync(join(root, f), text);
  }
  return root;
}

const fakeLlm = (text: string, usage = { inputTokens: 100, outputTokens: 50, costUsd: 0.001 }): LlmClient => ({
  complete: async () => ({ text, usage }),
});

const RECORD = `---\nid: D001\ntitle: Avoid default exports\nstatus: accepted\nscope: []\n---\n\n## Decision\n\nWe avoid default exports.\n`;

describe('parseDraftResponse', () => {
  it('extracts a fenced json block with scope/match/rules/guardTests', () => {
    const text = [
      'Here is my draft.',
      '```json',
      '{"scope": ["packages/x/"], "match": [{"pattern": "export default", "why": "the decision text"}], "rules": [{"forbid": "import", "from": "a/", "to": ["b"]}], "guardTests": ["a.test.ts"]}',
      '```',
    ].join('\n');
    const d = parseDraftResponse(text);
    expect(d.scope).toEqual(['packages/x/']);
    expect(d.match).toEqual([{ pattern: 'export default', why: 'the decision text' }]);
    expect(d.rules).toEqual([{ forbid: 'import', from: 'a/', to: ['b'] }]);
    expect(d.guardTests).toEqual(['a.test.ts']);
  });

  it('never throws on unparsable model output; returns an empty draft instead', () => {
    expect(parseDraftResponse('not json at all')).toEqual({ scope: [], match: [], rules: [], guardTests: [] });
    expect(parseDraftResponse('```json\n{not valid json\n```')).toEqual({ scope: [], match: [], rules: [], guardTests: [] });
  });
});

describe('draftChecksFor + saveDraft: versioned, pending, record untouched', () => {
  it('stores a pending version 1 draft and does not touch the decision record', async () => {
    const root = repo({ '.mole/decisions/D001.md': RECORD });
    const llm = fakeLlm('```json\n{"match": [{"pattern": "\\\\bexport\\\\s+default\\\\b", "why": "avoid default exports"}]}\n```');
    const draft = await draftChecksFor(llm, { id: 'D001', title: 'Avoid default exports', recordFile: '.mole/decisions/D001.md', decisionText: 'We avoid default exports.', existingScope: [], existingMatch: [] });
    const saved = saveDraft(root, draft);
    expect(saved.version).toBe(1);
    expect(saved.status).toBe('pending');
    expect(saved.match).toEqual([{ pattern: '\\bexport\\s+default\\b', why: 'avoid default exports' }]);
    expect(saved.usage).toEqual({ inputTokens: 100, outputTokens: 50, costUsd: 0.001 });
    expect(readFileSync(join(root, '.mole/decisions/D001.md'), 'utf8')).toBe(RECORD); // not approved yet: untouched
    expect(listVersions(root, 'D001')).toHaveLength(1);
  });

  it('a second draft() call is version 2, independent of version 1', async () => {
    const root = repo({ '.mole/decisions/D001.md': RECORD });
    const llm = fakeLlm('```json\n{"scope": ["packages/x/"]}\n```');
    const d1 = saveDraft(root, await draftChecksFor(llm, { id: 'D001', title: 'T', recordFile: '.mole/decisions/D001.md', decisionText: 'x', existingScope: [], existingMatch: [] }));
    const d2 = saveDraft(root, await draftChecksFor(llm, { id: 'D001', title: 'T', recordFile: '.mole/decisions/D001.md', decisionText: 'x', existingScope: [], existingMatch: [] }));
    expect(d1.version).toBe(1);
    expect(d2.version).toBe(2);
    expect(listVersions(root, 'D001')).toHaveLength(2);
  });
});

describe('approveDraft: merges into the record, dedup, append-only', () => {
  it('appends a drafted match: pattern into the record front matter and marks the version approved', async () => {
    const root = repo({ '.mole/decisions/D001.md': RECORD });
    const llm = fakeLlm('```json\n{"match": [{"pattern": "\\\\bexport\\\\s+default\\\\b", "why": "avoid default exports"}]}\n```');
    const draft = saveDraft(root, await draftChecksFor(llm, { id: 'D001', title: 'T', recordFile: '.mole/decisions/D001.md', decisionText: 'x', existingScope: [], existingMatch: [] }));
    const { recordPath, draft: approved } = approveDraft(root, 'D001', { approver: 'raymond' });
    expect(approved.status).toBe('approved');
    expect(approved.approvedBy).toBe('raymond');
    const text = readFileSync(recordPath, 'utf8');
    expect(text).toMatch(/match:/);
    expect(text).toMatch(/export/);
    expect(text).toMatch(/default/);
    expect(text).toMatch(/## Decision/); // body preserved
    expect(getVersion(root, 'D001', draft.version)?.status).toBe('approved');
  });

  it('approving twice does not duplicate the merged entry', async () => {
    const root = repo({ '.mole/decisions/D001.md': RECORD });
    const llm = fakeLlm('```json\n{"scope": ["packages/x/"]}\n```');
    saveDraft(root, await draftChecksFor(llm, { id: 'D001', title: 'T', recordFile: '.mole/decisions/D001.md', decisionText: 'x', existingScope: [], existingMatch: [] }));
    approveDraft(root, 'D001', { approver: 'raymond' });
    const { recordPath } = approveDraft(root, 'D001', { approver: 'raymond' });
    const text = readFileSync(recordPath, 'utf8');
    expect(text.match(/packages\/x\//g)).toHaveLength(1);
  });

  it('never drops an existing scope entry already in the record', async () => {
    const existing = `---\nid: D002\ntitle: T\nstatus: accepted\nscope:\n  - packages/old/\n---\n\n## Decision\n`;
    const root = repo({ '.mole/decisions/D002.md': existing });
    const llm = fakeLlm('```json\n{"scope": ["packages/new/"]}\n```');
    saveDraft(root, await draftChecksFor(llm, { id: 'D002', title: 'T', recordFile: '.mole/decisions/D002.md', decisionText: 'x', existingScope: ['packages/old/'], existingMatch: [] }));
    const { recordPath } = approveDraft(root, 'D002', { approver: 'raymond' });
    const text = readFileSync(recordPath, 'utf8');
    expect(text).toMatch(/packages\/old\//);
    expect(text).toMatch(/packages\/new\//);
  });
});

describe('rejectDraft: never touches the record', () => {
  it('marks the version rejected with a reason; the record file is byte-identical', async () => {
    const root = repo({ '.mole/decisions/D001.md': RECORD });
    const llm = fakeLlm('```json\n{"match": [{"pattern": "anything"}]}\n```');
    saveDraft(root, await draftChecksFor(llm, { id: 'D001', title: 'T', recordFile: '.mole/decisions/D001.md', decisionText: 'x', existingScope: [], existingMatch: [] }));
    const rejected = rejectDraft(root, 'D001', { reason: 'pattern too broad, would false-alarm on correct code' });
    expect(rejected.status).toBe('rejected');
    expect(rejected.rejectedReason).toMatch(/too broad/);
    expect(readFileSync(join(root, '.mole/decisions/D001.md'), 'utf8')).toBe(RECORD);
  });
});
