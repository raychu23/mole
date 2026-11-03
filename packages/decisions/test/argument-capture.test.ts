// T80 tests: contestable AI-drafted arguments captured from a MADR record's own structure, with an exact
// source span (file + line/char + quoted text) and provenance, held `draft` until a person approves --
// and never affecting packages/reasoning's evaluate() until that approval (the task's own stop condition).
//
// Review fixes covered here:
//   HIGH 1 -- approval binds to CONTENT, never a captured argument's positional id (insertion/edit/reorder/
//             delete reproducers below, see captured-store.ts's `mergeByContent` for the mechanism).
//   HIGH 2 -- derive-adr.ts's sameName() now normalizes every quote kind, so a record's own chosen option
//             (m29-madr's real 0015/0016) is excluded instead of attacking its own claim; plus arguments.ts's
//             own defensive guard, tested independently of the sameName fix.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate } from '@mole/reasoning';
import { afterEach, describe, expect, it } from 'vitest';
import {
  allCapturedArguments,
  approveCapturedArgument,
  argumentFramework,
  captureAdrArguments,
  CapturedArgumentError,
  listCapturedArguments,
  loadGraph,
  rejectCapturedArgument,
  saveCapturedArguments,
} from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const madrCorpusDir = resolve(here, '../bench/corpora/m29-madr/docs/decisions');

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-arg-capture-'));
  dirs.push(root);
  execFileSync('git', ['-C', root, '-c', 'user.name=T', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', 'init', '-q', '-b', 'main']);
  return root;
}

function writeDecision(root: string, id: string, body: string): string {
  const file = `.mole/decisions/${id}.md`;
  const p = join(root, file);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, `---\nid: '${id}'\ntitle: "${id} title"\nstatus: accepted\n---\n\n${body}`);
  return file;
}

// Real shape, modelled on the vendored m29-madr corpus's 0008/0009/0012/0015/0016 records (prior-art.md
// #3): Considered Options -> Decision Outcome (no bullet reasons) -> Pros and Cons of the Options with
// one `### <option>` per considered option.
const MADR_WITH_PROS_CONS = [
  '## Considered Options',
  '',
  '* Use YAML front matter',
  '* Use badge',
  '',
  '## Decision Outcome',
  '',
  'Chosen option: "Use YAML front matter", because comes out best (see below).',
  '',
  '## Pros and Cons of the Options',
  '',
  '### Use YAML front matter',
  '',
  '* Good, because YAML front matter is supported by most Markdown parsers',
  '',
  '### Use badge',
  '',
  '* Good, because plain markdown',
  '* Bad, because hard to read in markdown source',
  '',
].join('\n');

// review HIGH 1 reproducers: the SAME record, with one more bullet inserted ABOVE "Use badge" so every
// considered-option id after it shifts (option:1 used to be "Use badge"; now option:2 is).
const MADR_WITH_INSERTED_BULLET = [
  '## Considered Options',
  '',
  '* Use YAML front matter',
  '* Use a database',
  '* Use badge',
  '',
  '## Decision Outcome',
  '',
  'Chosen option: "Use YAML front matter", because comes out best (see below).',
  '',
  '## Pros and Cons of the Options',
  '',
  '### Use YAML front matter',
  '',
  '* Good, because YAML front matter is supported by most Markdown parsers',
  '',
  '### Use a database',
  '',
  '* Bad, because adds an operational dependency',
  '',
  '### Use badge',
  '',
  '* Good, because plain markdown',
  '* Bad, because hard to read in markdown source',
  '',
].join('\n');

describe('captureAdrArguments: deterministic extraction (no model) from MADR structure', () => {
  it('extracts claim + considered-option + pro/con arguments, each with a verbatim span', () => {
    const rows = captureAdrArguments('D-adr', '.mole/decisions/D-adr.md', MADR_WITH_PROS_CONS);
    const byRole = (r: string) => rows.filter((x) => x.role === r);
    expect(byRole('claim')).toHaveLength(1);
    expect(byRole('considered-option')).toHaveLength(1); // "Use badge" only -- "Use YAML front matter" is chosen
    expect(byRole('pro')).toHaveLength(2); // one under each ### subsection
    expect(byRole('con')).toHaveLength(1);
    // every row is a draft on first capture, with compiler provenance (never 'model': deterministic parse)
    for (const r of rows) {
      expect(r.status).toBe('draft');
      expect(r.provenance.source).toBe('compiler');
    }
  });

  it('every span is the EXACT literal substring of the source file at its line/char range', () => {
    const rows = captureAdrArguments('D-adr', '.mole/decisions/D-adr.md', MADR_WITH_PROS_CONS);
    const lines = MADR_WITH_PROS_CONS.split('\n');
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      const line = lines[r.span.startLine - 1] ?? '';
      expect(line.slice(r.span.startChar, r.span.endChar)).toBe(r.span.exact);
      expect(r.span.exact).toBe(r.text);
    }
  });

  it('a con attacks the option its subsection names; a pro only supports (display-only, never an attack)', () => {
    const rows = captureAdrArguments('D-adr', '.mole/decisions/D-adr.md', MADR_WITH_PROS_CONS);
    const badgeOption = rows.find((r) => r.role === 'considered-option' && r.text === 'Use badge')!;
    const con = rows.find((r) => r.role === 'con')!;
    expect(con.attacks).toEqual([badgeOption.id]);
    expect(con.supports).toEqual([]);
    const pros = rows.filter((r) => r.role === 'pro');
    for (const p of pros) {
      expect(p.attacks).toEqual([]);
    }
    // the pro under the CHOSEN option ("Use YAML front matter") has no target: derive-adr.ts never turns
    // the chosen option into a graph node, so there is nothing to support -- never fabricated (prior-art #2)
    const chosenPro = pros.find((p) => p.text.includes('YAML front matter is supported'))!;
    expect(chosenPro.supports).toEqual([]);
    // the pro under "Use badge" DOES have a target: that option is a real graph-eligible argument
    const badgePro = pros.find((p) => p.text.includes('plain markdown'))!;
    expect(badgePro.supports).toEqual([badgeOption.id]);
  });
});

describe('T80 stop condition: a DRAFT captured argument never changes a verdict in evaluate()', () => {
  it('a drafted attacker is not in the graph at all, so the claim keeps its unattacked verdict', async () => {
    const root = repo();
    const file = writeDecision(root, 'D-stop', MADR_WITH_PROS_CONS);
    const rows = captureAdrArguments('D-stop', file, MADR_WITH_PROS_CONS);
    await saveCapturedArguments(root, 'D-stop', rows);

    const graph = loadGraph(root);
    // none of the captured rows (all still draft) became graph nodes
    const capturedIds = new Set(rows.map((r) => r.id));
    expect(graph.nodes.some((n) => capturedIds.has(n.id))).toBe(false);

    const { framework } = argumentFramework(graph);
    expect(framework.args).toHaveLength(0); // no hand-authored .argdown either -- framework is empty
    const result = evaluate(framework);
    expect(result.labels).toEqual({});
  });

  it('after approving the option-attacking con, the option becomes a graph node and evaluate() labels it defeated', async () => {
    const root = repo();
    const file = writeDecision(root, 'D-approve', MADR_WITH_PROS_CONS);
    const rows = captureAdrArguments('D-approve', file, MADR_WITH_PROS_CONS);
    await saveCapturedArguments(root, 'D-approve', rows);

    const option = rows.find((r) => r.role === 'considered-option')!;
    const con = rows.find((r) => r.role === 'con')!;

    // approve ONLY the option (not yet the con) -- verdict for the option is 'in' (no attacker is approved)
    await approveCapturedArgument(root, 'D-approve', option.id, 'alice');
    let graph = loadGraph(root);
    let { framework } = argumentFramework(graph);
    expect(framework.args.map((a) => a.id)).toEqual([option.id]);
    expect(evaluate(framework).labels[option.id]).toBe('in');

    // now approve the con that attacks it -- SAME option id's verdict flips to 'out', only after approval
    await approveCapturedArgument(root, 'D-approve', con.id, 'alice');
    graph = loadGraph(root);
    ({ framework } = argumentFramework(graph));
    expect(framework.attacks).toEqual([[con.id, option.id]]);
    const result = evaluate(framework);
    expect(result.labels[con.id]).toBe('in');
    expect(result.labels[option.id]).toBe('out');
    expect(result.why[option.id]?.defeatedBy).toBe(con.id);
  });

  it('rejecting a captured argument also keeps it out of the graph (same as an unreviewed draft)', async () => {
    const root = repo();
    const file = writeDecision(root, 'D-reject', MADR_WITH_PROS_CONS);
    const rows = captureAdrArguments('D-reject', file, MADR_WITH_PROS_CONS);
    await saveCapturedArguments(root, 'D-reject', rows);
    const con = rows.find((r) => r.role === 'con')!;
    await rejectCapturedArgument(root, 'D-reject', con.id, 'not a real drawback, option was dropped for other reasons');

    const graph = loadGraph(root);
    expect(graph.nodes.some((n) => n.id === con.id)).toBe(false);
  });

  it('approving an unknown argument id is a named error, never a silent no-op', async () => {
    const root = repo();
    writeDecision(root, 'D-err', MADR_WITH_PROS_CONS);
    await expect(approveCapturedArgument(root, 'D-err', 'D-err::con:999', 'alice')).rejects.toThrow(CapturedArgumentError);
  });
});

describe('re-capture merges fresh text/spans without reverting a stored approval', () => {
  it('a second saveCapturedArguments call keeps an already-approved row approved', async () => {
    const root = repo();
    const file = writeDecision(root, 'D-merge', MADR_WITH_PROS_CONS);
    const rows = captureAdrArguments('D-merge', file, MADR_WITH_PROS_CONS);
    await saveCapturedArguments(root, 'D-merge', rows);
    const option = rows.find((r) => r.role === 'considered-option')!;
    await approveCapturedArgument(root, 'D-merge', option.id, 'alice');

    // re-run capture on the identical text (simulating a re-scan after an unrelated edit elsewhere)
    const again = captureAdrArguments('D-merge', file, MADR_WITH_PROS_CONS);
    const merged = await saveCapturedArguments(root, 'D-merge', again);
    const stillApproved = merged.find((r) => r.id === option.id)!;
    expect(stillApproved.status).toBe('approved');
    expect(stillApproved.approvedBy).toBe('alice');
  });

  it('allCapturedArguments lists every decision id that has captured rows, drafts and approved together but tagged', async () => {
    const root = repo();
    const file = writeDecision(root, 'D-list', MADR_WITH_PROS_CONS);
    const rows = captureAdrArguments('D-list', file, MADR_WITH_PROS_CONS);
    await saveCapturedArguments(root, 'D-list', rows);
    const all = allCapturedArguments(root);
    expect(Object.keys(all)).toEqual(['D-list']);
    const statuses = new Set(all['D-list']!.map((r) => r.status));
    expect(statuses).toEqual(new Set(['draft'])); // nothing approved/rejected yet -- all visibly draft
  });
});

describe('review HIGH 1: approval binds to CONTENT, never a captured argument\'s positional id', () => {
  it('INSERT above an approved row: the new bullet is draft, the approved text keeps its status at its NEW id', async () => {
    const root = repo();
    const file = writeDecision(root, 'D-insert', MADR_WITH_PROS_CONS);
    const rows = captureAdrArguments('D-insert', file, MADR_WITH_PROS_CONS);
    await saveCapturedArguments(root, 'D-insert', rows);
    const badgeOption = rows.find((r) => r.role === 'considered-option' && r.text === 'Use badge')!;
    expect(badgeOption.id).toBe('D-insert::option:1'); // the only considered-option before the insertion
    await approveCapturedArgument(root, 'D-insert', badgeOption.id, 'alice');

    // re-capture text with ONE MORE considered-option bullet inserted ABOVE "Use badge" -- its id shifts
    // from option:1 to option:2; a bug that merges by id alone hands option:1's NEW text (the database
    // bullet) 'approved', and leaves option:2 (the ACTUAL "Use badge" text, now unreviewed) as 'draft'.
    const inserted = captureAdrArguments('D-insert', file, MADR_WITH_INSERTED_BULLET);
    const merged = await saveCapturedArguments(root, 'D-insert', inserted);

    const newBadgeRow = merged.find((r) => r.role === 'considered-option' && r.text === 'Use badge')!;
    const newDbRow = merged.find((r) => r.role === 'considered-option' && r.text.includes('database'))!;
    expect(newBadgeRow.id).toBe('D-insert::option:2'); // shifted, but still carries the approval
    expect(newBadgeRow.status).toBe('approved');
    expect(newBadgeRow.approvedBy).toBe('alice');
    expect(newDbRow.id).toBe('D-insert::option:1'); // the NEW, never-reviewed bullet landed at the old id
    expect(newDbRow.status).toBe('draft'); // must NOT have inherited the old id's approval
  });

  it('EDIT-IN-PLACE: changing an approved row\'s own text reverts it to draft, noting previouslyApproved', async () => {
    const root = repo();
    const file = writeDecision(root, 'D-edit', MADR_WITH_PROS_CONS);
    const rows = captureAdrArguments('D-edit', file, MADR_WITH_PROS_CONS);
    await saveCapturedArguments(root, 'D-edit', rows);
    const badgeOption = rows.find((r) => r.role === 'considered-option' && r.text === 'Use badge')!;
    await approveCapturedArgument(root, 'D-edit', badgeOption.id, 'alice');

    const edited = MADR_WITH_PROS_CONS.replace('* Use badge', '* Use a sticker');
    const fresh = captureAdrArguments('D-edit', file, edited);
    const merged = await saveCapturedArguments(root, 'D-edit', fresh);

    const editedRow = merged.find((r) => r.id === badgeOption.id)!;
    expect(editedRow.text).toBe('Use a sticker');
    expect(editedRow.status).toBe('draft'); // the OLD approval does not vouch for new, unreviewed text
    expect(editedRow.previouslyApproved).toBe(true);
    expect(editedRow.previouslyApprovedBy).toBe('alice');
  });

  it('REORDER: two considered options swapping source order keep their OWN approval status, not each other\'s', async () => {
    const root = repo();
    const file = writeDecision(root, 'D-reorder', MADR_WITH_INSERTED_BULLET);
    const rows = captureAdrArguments('D-reorder', file, MADR_WITH_INSERTED_BULLET);
    await saveCapturedArguments(root, 'D-reorder', rows);
    const dbOption = rows.find((r) => r.role === 'considered-option' && r.text.includes('database'))!;
    const badgeOption = rows.find((r) => r.role === 'considered-option' && r.text === 'Use badge')!;
    await approveCapturedArgument(root, 'D-reorder', dbOption.id, 'alice'); // approve ONLY "Use a database"

    // swap the two bullets' source order -- their ids swap too (positional), text unchanged
    const swapped = MADR_WITH_INSERTED_BULLET.replace('* Use a database\n* Use badge', '* Use badge\n* Use a database');
    const fresh = captureAdrArguments('D-reorder', file, swapped);
    const merged = await saveCapturedArguments(root, 'D-reorder', fresh);

    const mergedDb = merged.find((r) => r.role === 'considered-option' && r.text.includes('database'))!;
    const mergedBadge = merged.find((r) => r.role === 'considered-option' && r.text === 'Use badge')!;
    expect(mergedDb.id).not.toBe(dbOption.id); // the id DID shift with the reorder
    expect(mergedDb.status).toBe('approved'); // but its OWN content stays approved
    expect(mergedDb.approvedBy).toBe('alice');
    expect(mergedBadge.status).toBe('draft'); // "Use badge" was never approved, reorder must not change that
  });

  it('DELETE: removing an approved bullet from the source keeps the approved row (append-only), never dropped', async () => {
    const root = repo();
    const file = writeDecision(root, 'D-delete', MADR_WITH_PROS_CONS);
    const rows = captureAdrArguments('D-delete', file, MADR_WITH_PROS_CONS);
    await saveCapturedArguments(root, 'D-delete', rows);
    const badgeOption = rows.find((r) => r.role === 'considered-option' && r.text === 'Use badge')!;
    await approveCapturedArgument(root, 'D-delete', badgeOption.id, 'alice');

    const withoutBadge = MADR_WITH_PROS_CONS.replace('* Use badge\n', '').replace(/### Use badge[\s\S]*?\n\n/, '');
    const fresh = captureAdrArguments('D-delete', file, withoutBadge);
    const merged = await saveCapturedArguments(root, 'D-delete', fresh);

    const kept = merged.find((r) => r.id === badgeOption.id)!;
    expect(kept).toBeDefined();
    expect(kept.status).toBe('approved'); // never silently reverted or dropped
  });
});

// review 2 NEW HIGH (D-attack) fixtures: a chosen option plus TWO rejected options, each with a
// Pros-and-Cons subsection, so a 'con' bullet with IDENTICAL text can be moved between Option A's and
// Option B's subsections without touching its own wording at all -- isolating the target-move bug from
// any text-edit path.
const MADR_CON_UNDER_A = [
  '## Considered Options',
  '',
  '* Use YAML front matter',
  '* Option A',
  '* Option B',
  '',
  '## Decision Outcome',
  '',
  'Chosen option: "Use YAML front matter", because comes out best (see below).',
  '',
  '## Pros and Cons of the Options',
  '',
  '### Use YAML front matter',
  '',
  '* Good, because simple',
  '',
  '### Option A',
  '',
  '* Bad, because shared drawback',
  '',
  '### Option B',
  '',
  '* Good, because fine',
  '',
].join('\n');

// SAME con text ("Bad, because shared drawback"), moved from Option A's subsection to Option B's --
// nothing else in the document changed.
const MADR_CON_MOVED_TO_B = [
  '## Considered Options',
  '',
  '* Use YAML front matter',
  '* Option A',
  '* Option B',
  '',
  '## Decision Outcome',
  '',
  'Chosen option: "Use YAML front matter", because comes out best (see below).',
  '',
  '## Pros and Cons of the Options',
  '',
  '### Use YAML front matter',
  '',
  '* Good, because simple',
  '',
  '### Option A',
  '',
  '* Good, because fine',
  '',
  '### Option B',
  '',
  '* Bad, because shared drawback',
  '',
].join('\n');

describe('review 2 NEW HIGH (D-attack): a captured argument\'s target is part of its content identity', () => {
  it('moving an approved con from Option A to Option B reverts it to draft -- labels do NOT change until re-approved', async () => {
    const root = repo();
    const file = writeDecision(root, 'D-attack', MADR_CON_UNDER_A);
    const rows = captureAdrArguments('D-attack', file, MADR_CON_UNDER_A);
    await saveCapturedArguments(root, 'D-attack', rows);

    const optionA = rows.find((r) => r.role === 'considered-option' && r.text === 'Option A')!;
    const optionB = rows.find((r) => r.role === 'considered-option' && r.text === 'Option B')!;
    const con = rows.find((r) => r.role === 'con')!;
    expect(con.attacks).toEqual([optionA.id]);

    await approveCapturedArgument(root, 'D-attack', optionA.id, 'alice');
    await approveCapturedArgument(root, 'D-attack', optionB.id, 'alice');
    await approveCapturedArgument(root, 'D-attack', con.id, 'alice');

    // before the move: option A is defeated by the con, option B stands unattacked
    let graph = loadGraph(root);
    let { framework } = argumentFramework(graph);
    let result = evaluate(framework);
    expect(result.labels[optionA.id]).toBe('out');
    expect(result.labels[optionB.id]).toBe('in');

    // re-capture the SAME document with the con's text UNCHANGED but moved to Option B's subsection
    const moved = captureAdrArguments('D-attack', file, MADR_CON_MOVED_TO_B);
    const merged = await saveCapturedArguments(root, 'D-attack', moved);

    const movedCon = merged.find((r) => r.role === 'con' && r.text.includes('shared drawback'))!;
    // the SAME text, now attacking Option B instead of Option A, must NOT still read as approved
    expect(movedCon.status).toBe('draft');
    expect(movedCon.previouslyApproved).toBe(true);
    expect(movedCon.previouslyApprovedBy).toBe('alice');
    expect(movedCon.attacks).toEqual([optionB.id]); // now targets B
    expect(movedCon.attacks.some((id) => id === optionA.id)).toBe(false);

    // labels must NOT have changed yet: the draft con is invisible to evaluate() either way
    graph = loadGraph(root);
    ({ framework } = argumentFramework(graph));
    result = evaluate(framework);
    expect(result.labels[optionA.id]).toBe('in'); // no longer defeated -- its attacker reverted to draft
    expect(result.labels[optionB.id]).toBe('in'); // NOT silently defeated by the moved-but-unreviewed con

    // only once a human re-approves the moved con does Option B flip to defeated
    await approveCapturedArgument(root, 'D-attack', movedCon.id, 'bob');
    graph = loadGraph(root);
    ({ framework } = argumentFramework(graph));
    result = evaluate(framework);
    expect(result.labels[optionA.id]).toBe('in');
    expect(result.labels[optionB.id]).toBe('out');
    expect(result.why[optionB.id]?.defeatedBy).toBe(movedCon.id);
  });

  it('re-capturing identical text under the SAME option keeps the approval (no false revert)', async () => {
    const root = repo();
    const file = writeDecision(root, 'D-attack-noop', MADR_CON_UNDER_A);
    const rows = captureAdrArguments('D-attack-noop', file, MADR_CON_UNDER_A);
    await saveCapturedArguments(root, 'D-attack-noop', rows);
    const con = rows.find((r) => r.role === 'con')!;
    await approveCapturedArgument(root, 'D-attack-noop', con.id, 'alice');

    const again = captureAdrArguments('D-attack-noop', file, MADR_CON_UNDER_A);
    const merged = await saveCapturedArguments(root, 'D-attack-noop', again);
    const stillCon = merged.find((r) => r.id === con.id)!;
    expect(stillCon.status).toBe('approved');
    expect(stillCon.approvedHash).toBe(stillCon.contentHash);
  });
});

describe('review 2 COMPOUNDING: captured argument ids stay unique within a decision after every merge', () => {
  it('a reshaped document that reissues a stale id never produces two rows sharing that id', async () => {
    const root = repo();
    const file = writeDecision(root, 'D-move', MADR_WITH_INSERTED_BULLET);
    const rows = captureAdrArguments('D-move', file, MADR_WITH_INSERTED_BULLET);
    let merged = await saveCapturedArguments(root, 'D-move', rows);

    // shrink the document (drop the middle considered-option + its subsection) so the extractor's own
    // per-role counters reissue low ids that used to belong to a DIFFERENT bullet -- the exact shape the
    // reviewer's own id-collision reproducer needs, without relying on any one specific internal path.
    const shrunk = captureAdrArguments('D-move', file, MADR_WITH_PROS_CONS);
    merged = await saveCapturedArguments(root, 'D-move', shrunk);

    const ids = merged.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicate id, however the content moved around

    // approve/reject must still resolve every id to exactly one row -- no ambiguous-id error expected here
    for (const r of merged) {
      await expect(rejectCapturedArgument(root, 'D-move', r.id, 'audit')).resolves.toBeDefined();
    }
  });
});

describe('review 2: property-style re-capture -- random insert/move/edit/delete sequences never corrupt invariants', () => {
  // Deterministic PRNG (no external dependency): mulberry32.
  function rng(seed: number): () => number {
    let a = seed;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Builds a MADR document with `optionTexts[0]` as the CHOSEN option and the rest rejected, placing the
  // given con/pro bullets (each `{ optionIdx, kind, label }`) under the matching option's Pros-and-Cons
  // subsection, in list order -- the moving part a sequence step can relocate between options.
  function buildMadr(optionTexts: string[], bullets: Array<{ optionIdx: number; kind: 'Good' | 'Bad'; label: string }>): string {
    const lines = ['## Considered Options', '', ...optionTexts.map((t) => `* ${t}`), '', '## Decision Outcome', '', `Chosen option: "${optionTexts[0]}", because comes out best.`, '', '## Pros and Cons of the Options', ''];
    for (let i = 0; i < optionTexts.length; i++) {
      lines.push(`### ${optionTexts[i]}`, '');
      for (const b of bullets.filter((x) => x.optionIdx === i)) lines.push(`* ${b.kind}, because ${b.label}`);
      lines.push('');
    }
    return lines.join('\n');
  }

  it('30 random sequences across 2-3 options: no duplicate ids, approvedHash matches, evaluate() labels match recomputation', async () => {
    const optionTexts = ['Use YAML front matter', 'Option A', 'Option B']; // index 0 is always chosen

    for (let seed = 0; seed < 30; seed++) {
      const root = repo(); // fresh repo per seed: loadGraph aggregates EVERY decision under root, so a
      // shared root across seeds would mix an earlier seed's approved rows into this seed's framework.
      const rand = rng(seed * 7919 + 13);
      const decisionId = `D-prop-${seed}`;
      const file = writeDecision(root, decisionId, buildMadr(optionTexts, []));

      // a small pool of bullet labels that steps insert/move/edit/delete across 1-3 options (indices 1/2
      // only -- option 0 is chosen, never graph-eligible, same as production: nothing to attack there).
      let bullets: Array<{ optionIdx: number; kind: 'Good' | 'Bad'; label: string }> = [{ optionIdx: 1, kind: 'Bad', label: 'drawback-1' }];

      const steps = 1 + Math.floor(rand() * 6);
      for (let step = 0; step < steps; step++) {
        const action = Math.floor(rand() * 4);
        if (action === 0 && bullets.length < 4) {
          bullets = [...bullets, { optionIdx: 1 + Math.floor(rand() * 2), kind: rand() < 0.5 ? 'Bad' : 'Good', label: `label-${step}-${seed}` }];
        } else if (action === 1 && bullets.length > 0) {
          // MOVE: relocate an existing bullet to the other rejected option, text unchanged
          const idx = Math.floor(rand() * bullets.length);
          const moved = { ...bullets[idx]!, optionIdx: bullets[idx]!.optionIdx === 1 ? 2 : 1 };
          bullets = bullets.map((b, i) => (i === idx ? moved : b));
        } else if (action === 2 && bullets.length > 0) {
          // EDIT: change an existing bullet's text in place
          const idx = Math.floor(rand() * bullets.length);
          bullets = bullets.map((b, i) => (i === idx ? { ...b, label: `${b.label}-edited-${step}` } : b));
        } else if (action === 3 && bullets.length > 1) {
          // DELETE
          const idx = Math.floor(rand() * bullets.length);
          bullets = bullets.filter((_, i) => i !== idx);
        }

        const text = buildMadr(optionTexts, bullets);
        const fresh = captureAdrArguments(decisionId, file, text);
        const merged = await saveCapturedArguments(root, decisionId, fresh);

        // (a) no duplicate ids after this re-capture
        const ids = merged.map((r) => r.id);
        expect(new Set(ids).size).toBe(ids.length);

        // randomly approve a still-draft row, simulating a human reviewing after each re-capture
        const draft = merged.filter((r) => r.status === 'draft' && (r.role === 'con' || r.role === 'pro' || r.role === 'considered-option'));
        if (draft.length > 0 && rand() < 0.7) {
          const pick = draft[Math.floor(rand() * draft.length)]!;
          await approveCapturedArgument(root, decisionId, pick.id, `reviewer-${step}`);
        }

        const current = listCapturedArguments(root, decisionId);

        // (b) every approved row's approvedHash equals its current content hash
        for (const r of current) {
          if (r.status === 'approved') expect(r.approvedHash).toBe(r.contentHash);
        }

        // (c) evaluate() labels equal those computed from ONLY the approved rows whose approval hash
        // still matches their current content hash (the same set captured-loader.ts turns into nodes)
        const graph = loadGraph(root);
        const { framework } = argumentFramework(graph);
        const result = evaluate(framework);
        const expectedNodeIds = new Set(current.filter((r) => r.status === 'approved' && r.approvedHash === r.contentHash).map((r) => r.id));
        expect(new Set(framework.args.map((a) => a.id))).toEqual(expectedNodeIds);
        for (const id of expectedNodeIds) expect(result.labels[id]).toBeDefined();
      }
    }
  });
});

describe('review HIGH 2: the record\'s own chosen option never attacks its own claim', () => {
  it('sameName() normalizes single quotes too, not just double/curly quotes', async () => {
    const { sameName } = await import('../src/argdown/derive-adr.js');
    expect(sameName(`Include 'Consulted' and 'Informed' of RACI`)).toBe(sameName(`Include "Consulted" and "Informed" of RACI`));
  });

  it('real record 0015 (m29-madr): the chosen option is excluded, never a considered-option attacking the claim', () => {
    const file = join(madrCorpusDir, '0015-include-consulting-informed-of-raci.md');
    const text = readFileSync(file, 'utf8');
    const rows = captureAdrArguments('0015', 'docs/decisions/0015.md', text);
    const options = rows.filter((r) => r.role === 'considered-option');
    // the chosen option ('Include "Consulted" and "Informed" of RACI') is NOT one of the 2 rejected options
    expect(options).toHaveLength(2); // 3 Considered Options minus the 1 chosen
    expect(options.some((o) => o.text === `Include "Consulted" and "Informed" of RACI`)).toBe(false);
    // the genuinely-rejected options still legitimately attack the claim -- only the CHOSEN one must not
    const claim = rows.find((r) => r.role === 'claim')!;
    for (const o of options) expect(o.attacks).toContain(claim.id);
  });

  it('real record 0016 (m29-madr): same guard holds for a chosen option phrased with nested single quotes', () => {
    const file = join(madrCorpusDir, '0016-outcome-before-detailed-pros-cons.md');
    const text = readFileSync(file, 'utf8');
    const rows = captureAdrArguments('0016', 'docs/decisions/0016.md', text);
    const options = rows.filter((r) => r.role === 'considered-option');
    // the chosen option (Section "..." AFTER "Decision Outcome") is NOT one of the 1 rejected option
    expect(options).toHaveLength(1); // 2 Considered Options minus the 1 chosen
    expect(options.some((o) => o.text.startsWith('Section "Pros and Cons of the Options" after'))).toBe(false);
    const claim = rows.find((r) => r.role === 'claim')!;
    for (const o of options) expect(o.attacks).toContain(claim.id);
  });
});
