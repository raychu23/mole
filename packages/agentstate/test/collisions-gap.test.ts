// T21 follow-up red test (mole-builder-3, 2026-10-29): a resumed run is not "live" during its idle gap.
// Found by rerunning M11 after main merged: chat fc6c6dc0 resumed hours later, its [first, last] window then spanned the
// gap and 4 runs that worked only during the gap were flagged (false alarms 4/20). Liveness = activity segments: complete
// steps split where no step happened for more than N minutes; two runs are parallel when some segments come within N.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collisions, type CollisionsResult, type Sources } from '../src/index.js';

const A_TS = 'export function mid(): number {\n  return 2;\n}\n\nexport function other(): number {\n  return 3;\n}\n';
const E_TS = "export function gamma(): string {\n  return 'gamma';\n}\n";
let base: string;
let root: string;
let src: Required<Sources>;
const NOW = Date.now();
const ago = (min: number): string => new Date(NOW - min * 60_000).toISOString();
function claude(id: string, steps: Array<[number, string, string]>): void {
  const lines: string[] = [];
  steps.forEach(([m, file, text], i) => {
    const tid = `toolu_${id}_${i}`;
    lines.push(JSON.stringify({ type: 'assistant', sessionId: id, cwd: root, timestamp: ago(m), message: { role: 'assistant', content: [{ type: 'tool_use', id: tid, name: 'Edit', input: { file_path: join(root, file), old_string: text, new_string: text } }] } }));
    lines.push(JSON.stringify({ type: 'user', sessionId: id, cwd: root, timestamp: ago(m - 0.05), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tid, content: 'ok' }] } }));
  });
  writeFileSync(join(src.claudeDir, 'proj', `${id}.jsonl`), lines.join('\n') + '\n');
}
const MID = 'export function mid(): number {\n  return 2;\n}';
const GAMMA = E_TS.trim();

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'mole-t21-gap-'));
  root = join(base, 'repo');
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src/a.ts'), A_TS);
  writeFileSync(join(root, 'src/e.ts'), E_TS);
  src = { hermesDb: join(base, 'none.db'), claudeDir: join(base, 'claude'), codexDir: join(base, 'codex-none') };
  mkdirSync(join(src.claudeDir, 'proj'), { recursive: true });
  // g-old edits mid 5 h ago, goes idle, resumes 5 min ago on an unrelated file (e.ts)
  claude('g-old', [[300, 'src/a.ts', MID], [299, 'src/a.ts', MID], [5, 'src/e.ts', GAMMA]]);
  // g-gap edits mid 2.5 h ago, while g-old was idle: not parallel
  claude('g-gap', [[150, 'src/a.ts', MID]]);
  // g-near edits mid 5 h ago, while g-old was active: parallel (control)
  claude('g-near', [[297, 'src/a.ts', MID]]);
});
afterAll(() => rmSync(base, { recursive: true, force: true }));

const pairOf = (r: CollisionsResult, x: string, y: string) => r.pairs.find((p) => (p.a.run === x && p.b.run === y) || (p.a.run === y && p.b.run === x));

describe('collisions: idle gaps (T21 follow-up)', () => {
  it('a run that worked only during another run\'s idle gap (> N min without steps) is not parallel to it', () => {
    const r = collisions({ ...src, root, since: 0, graph: { edges: [] } });
    expect(pairOf(r, 'g-old', 'g-gap')).toBeUndefined();
  });
  it('control: a run active in the same stretch as the other run\'s edit still collides', () => {
    const r = collisions({ ...src, root, since: 0, graph: { edges: [] } });
    expect(pairOf(r, 'g-old', 'g-near')).toBeDefined();
  });
});
