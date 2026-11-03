// T71 red tests: recallSimilar -- Klein RPD "resembles" retrieval over past decisions/incidents (CBR Retrieve
// step only, Aamodt & Plaza 1994). Zero model calls, zero network: reuses route/bm25.ts's Bm25Index and
// route/index-text.ts's indexTextOf (same index-text shape T53 already uses for routing), over loadGraph's own
// decision/incident nodes -- no new case store, no duplicated parsing.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { RECALL_NOTE, RecallError, recallSimilar } from '../src/recall/recall.js';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

function write(root: string, file: string, text: string): void {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), text);
}

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-recall-'));
  dirs.push(root);
  write(root, '.mole/decisions/d1.md', ['---', 'id: D1', 'title: Hand-roll the job queue', 'status: accepted', '---', '', '## Decision', '', 'Hand-roll a job queue in-process rather than add a message broker dependency.'].join('\n'));
  write(root, '.mole/decisions/d2.md', ['---', 'id: D2', 'title: Use managed Postgres', 'status: accepted', '---', '', '## Decision', '', 'Use a managed Postgres instance rather than self-hosting the database.'].join('\n'));
  write(root, '.mole/incidents/inc-1.md', ['---', 'id: inc-1', 'title: Hand-rolled queue lost messages under load', 'decisions: [D1]', '---', '', 'The in-process queue dropped messages at peak load; a broker would not have.'].join('\n'));
  return root;
}

describe('recallSimilar: text query (done-when 4, "mole recall <text>")', () => {
  it('ranks past decisions/incidents by lexical similarity to the given text, nearest first', () => {
    const root = fixture();
    const r = recallSimilar(root, { text: 'we are thinking about hand-rolling a job queue in-process' });
    expect(r.cases.length).toBeGreaterThan(0);
    expect(r.cases[0]!.id).toBe('D1'); // shares "hand-roll"/"job"/"queue"/"in-process" with D1, not D2
    expect(r.cases.map((c) => c.id)).not.toContain('D2'); // no lexical overlap with the postgres decision
  });

  it('a text query with no lexical overlap with any case returns no cases, not a throw', () => {
    const root = fixture();
    const r = recallSimilar(root, { text: 'completely unrelated topic about ocean tides' });
    expect(r.cases).toEqual([]);
  });

  it('limit bounds how many cases come back', () => {
    const root = fixture();
    const r = recallSimilar(root, { text: 'queue broker postgres database decision' }, { limit: 1 });
    expect(r.cases.length).toBeLessThanOrEqual(1);
  });
});

describe('recallSimilar: record query ("mole recall --record <id>")', () => {
  it('uses an existing decision/incident as the query and excludes itself from the results', () => {
    const root = fixture();
    const r = recallSimilar(root, { record: 'inc-1' });
    expect(r.cases.find((c) => c.id === 'inc-1')).toBeUndefined();
    expect(r.cases[0]!.id).toBe('D1'); // inc-1's own text overlaps D1's queue decision, not D2's postgres one
  });

  it('an unknown record id is a RecallError, never a throw of something else', () => {
    const root = fixture();
    expect(() => recallSimilar(root, { record: 'no-such-id' })).toThrow(RecallError);
  });
});

describe('recallSimilar: neither text nor record given', () => {
  it('throws RecallError (usage error), not a crash', () => {
    const root = fixture();
    expect(() => recallSimilar(root, {})).toThrow(RecallError);
  });
});

describe('recallSimilar: RPD contract -- "resembles", never asserts causation (done-when 4)', () => {
  it('the note says to check whether a similar case applies, and never claims the past case caused anything', () => {
    const root = fixture();
    const r = recallSimilar(root, { text: 'hand-roll a job queue' });
    expect(r.note).toBe(RECALL_NOTE);
    expect(r.note.toLowerCase()).toMatch(/similar case/);
    expect(r.note.toLowerCase()).toMatch(/check whether it applies/);
    expect(r.note.toLowerCase()).not.toMatch(/\bcaused?\b/);
    expect(r.note.toLowerCase()).not.toMatch(/because of/);
  });
});

// Review-1 finding #2: an empty repo (no .mole/decisions, no .mole/incidents at all) must return an empty
// case list, never throw -- a brand-new project with zero decisions recorded yet is the normal starting
// state, not an error state.
describe('recallSimilar: empty repo (no decisions/incidents at all)', () => {
  it('returns an empty case list, not a throw, for a text query against an empty repo', () => {
    const root = mkdtempSync(join(tmpdir(), 'mole-recall-empty-'));
    dirs.push(root);
    const r = recallSimilar(root, { text: 'anything at all' });
    expect(r.cases).toEqual([]);
    expect(r.note).toBe(RECALL_NOTE);
  });

  it('returns an empty case list for a text query against a repo with an empty .mole/decisions dir', () => {
    const root = mkdtempSync(join(tmpdir(), 'mole-recall-empty-'));
    dirs.push(root);
    mkdirSync(join(root, '.mole/decisions'), { recursive: true });
    mkdirSync(join(root, '.mole/incidents'), { recursive: true });
    const r = recallSimilar(root, { text: 'anything at all' });
    expect(r.cases).toEqual([]);
  });
});

// Review-1 finding #2: recall must stay fast as the case base grows -- 1000 synthetic decision/incident
// records (the scale a long-lived project's .mole/ could realistically reach) must answer in < 2s, since
// recall runs on every `mole recall`/`mole_recall` call, not as a background job.
describe('recallSimilar: performance at scale (done-when-adjacent, review-1 finding #2)', () => {
  it('answers in under 2s with 1000 synthetic decision records', () => {
    const root = mkdtempSync(join(tmpdir(), 'mole-recall-perf-'));
    dirs.push(root);
    const topics = ['job queue', 'postgres database', 'redis cache', 'load balancer', 'dns zone', 'terraform module', 'kubernetes cluster', 'message broker', 'ssl certificate', 'logging pipeline'];
    for (let i = 0; i < 1000; i++) {
      const topic = topics[i % topics.length]!;
      write(
        root,
        `.mole/decisions/d${i}.md`,
        ['---', `id: D${i}`, `title: Decision ${i} about ${topic}`, 'status: accepted', '---', '', '## Decision', '', `We decided to use a particular approach to ${topic} in record ${i}, with some supporting rationale text to give BM25 something to rank on.`].join('\n'),
      );
    }
    const start = Date.now();
    const r = recallSimilar(root, { text: 'we are evaluating options for a job queue and a message broker' });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(2000);
    expect(r.cases.length).toBeGreaterThan(0);
  });
});
