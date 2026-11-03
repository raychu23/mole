// T80 review MEDIUM 3: captured-store.ts's read-modify-write (merge-and-save / approve / reject) had no
// locking -- N concurrent processes on the SAME decision's captured-arguments file each read the whole
// array, patched their own row in memory, and wrote the whole array back; a second writer's read (taken
// before the first writer's write landed) clobbered the first writer's change on save. Fixed with the same
// proper-lockfile pattern as priorities.ts's setPriorities. Concurrency tests spawn REAL child processes
// (one Node process can't race itself) via vite-node, same convention as priorities.test.ts.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { captureAdrArguments, listCapturedArguments, saveCapturedArguments } from '../src/index.js';

const VITE_NODE = fileURLToPath(new URL('../../../node_modules/.bin/vite-node', import.meta.url));
const LOCK_WORKER = fileURLToPath(new URL('./captured-arguments-lock-worker.ts', import.meta.url));

function runApprove(root: string, decisionId: string, argumentId: string, approver: string): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(VITE_NODE, [LOCK_WORKER, root, decisionId, argumentId, approver], { stdio: ['ignore', 'ignore', 'pipe'], env: process.env });
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('close', (code) => resolve({ code, stderr }));
  });
}

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function repo(): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-arg-lock-'));
  dirs.push(root);
  return root;
}

// 12 synthetic draft rows, directly via the real extraction path (12 "Bad, because ..." bullets under one
// subsection -- the chosen option's own subsection, so none of them attack anything; status is all that's
// being raced here).
function manyBullets(n: number): string {
  const bullets = Array.from({ length: n }, (_, i) => `* Bad, because reason ${i}`).join('\n');
  return ['## Considered Options', '', '* Only option', '', '## Decision Outcome', '', 'Chosen option: "Only option", because it is the only one.', '', '## Pros and Cons of the Options', '', '### Only option', '', bullets, ''].join('\n');
}

describe('T80 review MEDIUM 3: concurrent CLI approves on the same decision never lose an update', () => {
  it('12 concurrent approves x 10 rounds: every row ends approved by its LAST round\'s approver, none lost', async () => {
    const root = repo();
    const N = 12;
    const text = manyBullets(N);
    const rows = captureAdrArguments('D-lock', '.mole/decisions/D-lock.md', text);
    const cons = rows.filter((r) => r.role === 'con');
    expect(cons).toHaveLength(N); // sanity: the fixture really has 12 rows to race over
    await saveCapturedArguments(root, 'D-lock', rows);

    for (let round = 0; round < 10; round++) {
      const results = await Promise.all(cons.map((c) => runApprove(root, 'D-lock', c.id, `approver-r${round}`)));
      for (const r of results) expect(r.code, r.stderr).toBe(0);
    }

    const final = listCapturedArguments(root, 'D-lock');
    expect(final).toHaveLength(N + 1); // all 12 con rows + the one claim row -- none lost, none duplicated
    for (const c of cons) {
      const row = final.find((r) => r.id === c.id)!;
      expect(row.status).toBe('approved');
      expect(row.approvedBy).toBe('approver-r9'); // the LAST round's write survived -- nothing clobbered it
    }
    // pre-existing: 12 procs x 10 rounds is CPU-heavy; under load (full-suite run, shared CI/dev-machine
    // contention) the default 60s timeout flaked even though nothing was wrong (re-verified standalone,
    // repeatedly green). A generous explicit timeout, not a smaller workload, is the fix: shrinking either
    // knob would weaken the very stress test MEDIUM 3 exists to prove.
  }, 240_000);
});
