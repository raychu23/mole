// T31 M23 code half: failing-first tests (R1). Red against the bench/src stub; the implementation commit
// makes these (and the bench) green without ever editing this file or the frozen key (R2).
import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMatcher, matchQuestion, prep, recordReadBack, loadReadBack, folderReadBackCoverage, type OneOnOneRecord, type Question } from '../src/index.js';

const RECORDS: OneOnOneRecord[] = [
  { id: 'rec-resume', file: 'context/product-plan/4 Resume + interview.md', folder: 'context/product-plan', excerpt: 'the resume is the plan, bullet 1 covers design reviews and the file-tree diagram, version 6' },
  { id: 'rec-handoff', file: 'tasks/HANDOFF.md', folder: 'tasks', excerpt: 'start building Mole in a new chat, the ledger move running git-worktree claim' },
  { id: 'rec-docsdrift', file: 'context/product-plan/systems/docs-drift/0 notes.md', folder: 'context/product-plan/systems/docs-drift', excerpt: 'docs drift and upkeep infra, Mintlify Autopilot, self-updating external docs' },
];

describe('matchQuestion (deterministic, no model)', () => {
  it('finds the record that already answers an obviously on-topic question', () => {
    const m = buildMatcher(RECORDS);
    const q: Question = { id: 'q1', text: 'this is what I currently have planned for resume and I have some big problems', folder: 'context/product-plan', loggedAt: '2026-10-29' };
    const match = matchQuestion(m, q);
    expect(match?.recordId).toBe('rec-resume');
  });

  it('leaves a question with no answering record unmatched, never auto-answered (done-when 4)', () => {
    const m = buildMatcher(RECORDS);
    const q: Question = { id: 'q2', text: 'completely unrelated words about pizza and bicycles', folder: 'context/product-plan', loggedAt: '2026-10-29' };
    const match = matchQuestion(m, q);
    expect(match).toBeUndefined();
  });

  it('does not match a strongly-worded but off-topic question to an unrelated record', () => {
    const m = buildMatcher(RECORDS);
    const q: Question = { id: 'q3', text: 'does this info help at all especially the docs drifting infrastructure to maintain it properly', folder: 'context/product-plan/systems/docs-drift', loggedAt: '2026-10-28' };
    const match = matchQuestion(m, q);
    expect(match?.recordId).toBe('rec-docsdrift');
  });
});

describe('prep groups by FOLDER ONLY, never by person (M23/D31 non-goal)', () => {
  it('has no person/author/user field anywhere on Question or PrepItem', () => {
    const m = buildMatcher(RECORDS);
    const questions: Question[] = [
      { id: 'a', text: 'start building Mole in a new chat set up handoff for another agent', folder: 'tasks', loggedAt: '2026-10-19' },
      { id: 'b', text: 'just tell it to read handoff.md thats it', folder: 'tasks', loggedAt: '2026-10-19' },
    ];
    const groups = prep(m, questions);
    const json = JSON.stringify(groups);
    expect(json).not.toMatch(/"person"|"author"|"user"|"raymond"/i);
    const tasksGroup = groups.find((g) => g.folder === 'tasks');
    expect(tasksGroup?.items.length).toBe(2);
  });

  it('groups two different folders separately, sorted by folder name', () => {
    const m = buildMatcher(RECORDS);
    const questions: Question[] = [
      { id: 'a', text: 'start building Mole set up handoff', folder: 'tasks', loggedAt: '2026-10-19' },
      { id: 'b', text: 'resume bullet 1 problems', folder: 'context/product-plan', loggedAt: '2026-10-29' },
    ];
    const groups = prep(m, questions);
    expect(groups.map((g) => g.folder)).toEqual(['context/product-plan', 'tasks']);
  });
});

describe('read-back store: per folder + question, never per person', () => {
  it('writes an entry keyed by folder and question id, with no person-identifying field', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mole-oneonone-'));
    const path = join(dir, 'readback.json');
    try {
      recordReadBack(path, 'tasks', 'q1', 'confirmed', 'rec-handoff', '2026-10-30T00:00:00.000Z');
      const store = loadReadBack(path);
      expect(Object.keys(store)).toEqual(['tasks']);
      expect(store.tasks?.q1?.verdict).toBe('confirmed');
      const raw = JSON.stringify(store);
      expect(raw).not.toMatch(/"person"|"author"|"raymond"/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("supports rejecting a match, and folderReadBackCoverage counts only that folder's entries", () => {
    const dir = mkdtempSync(join(tmpdir(), 'mole-oneonone-'));
    const path = join(dir, 'readback.json');
    try {
      recordReadBack(path, 'tasks', 'q1', 'confirmed', 'rec-handoff');
      recordReadBack(path, 'tasks', 'q2', 'rejected', undefined);
      const store = loadReadBack(path);
      expect(folderReadBackCoverage(store, 'tasks', ['q1', 'q2', 'q3'])).toBeCloseTo(2 / 3);
      expect(folderReadBackCoverage(store, 'other-folder', ['q1'])).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
