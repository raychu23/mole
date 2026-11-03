// Review 1 (HIGH 3): exactly-once delivery under real concurrency, proving `withInboxClaim`'s atomic
// rename-based claim (packages/agentstate/src/steer/store.ts) closes the read-modify-write race the original
// deliverPending had. 8 concurrent deliverer PROCESSES (not threads sharing one Node heap -- real OS-level
// concurrency on the same inbox file, same as PreToolUse/UserPromptSubmit firing from separate hook invocations) x
// 50 claimed items each = 400 signals queued once, then raced for: every item must be delivered to exactly one
// winner, none lost, none doubled.
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sendSignal } from '../src/steer/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const distIndex = resolve(here, '../dist/src/steer/index.js');

let root: string;
const git = (args: string[]): string => execFileSync('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=f@example.com', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }).trim();

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'mole-steer-stress-'));
  git(['init', '-q', '-b', 'main']);
  writeFileSync(join(root, 'a.ts'), 'export const a = 1;\n');
  git(['add', '.']);
  git(['commit', '-q', '-m', 'init']);
}, 60_000);
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** Each worker claims up to `budget` items in a tight loop (deliverPending), one at a time, recording every
 * delivered signal's text to its own line-delimited output file (top-level await: the write is guaranteed to
 * finish before the process exits) -- so two workers never share mutable state and a post-hoc merge across files
 * is the only way to double count. */
function workerScript(): string {
  return `
import { writeFileSync } from 'node:fs';
import { deliverPending } from ${JSON.stringify(distIndex)};
const [root, session, outFile, budgetStr] = process.argv.slice(2);
const budget = Number(budgetStr);
const delivered = [];
for (let i = 0; i < budget; i++) {
  const d = deliverPending(root, session);
  for (const s of d.signals) delivered.push(s.text);
  if (d.signals.length === 0 && i > 2 && delivered.length > 0) break; // nothing left worth spinning for
}
writeFileSync(outFile, delivered.join('\\n') + '\\n');
`;
}

describe('Review 1 HIGH 3: deliverPending is exactly-once under 8x concurrent deliverers x 50 items', () => {
  it('400 queued signals, raced by 8 processes launched truly concurrently: none lost, none doubled', async () => {
    const session = 'sess-stress-1';
    const WORKERS = 8;
    const ITEMS_PER_WORKER = 50;
    const TOTAL = WORKERS * ITEMS_PER_WORKER;
    const expected = new Set<string>();
    for (let i = 0; i < TOTAL; i++) {
      const text = `item-${i}`;
      expected.add(text);
      sendSignal(root, session, text);
    }

    const outDir = mkdtempSync(join(tmpdir(), 'mole-steer-stress-out-'));
    const scriptDir = mkdtempSync(join(tmpdir(), 'mole-steer-stress-script-'));
    const scriptFile = join(scriptDir, 'worker.mjs');
    writeFileSync(scriptFile, workerScript());

    const run = (outFile: string): Promise<void> =>
      new Promise((resolvePromise, reject) => {
        const child = spawn(process.execPath, [scriptFile, root, session, outFile, String(ITEMS_PER_WORKER * 2)], { stdio: ['ignore', 'inherit', 'inherit'] });
        child.on('exit', (code) => (code === 0 ? resolvePromise() : reject(new Error(`worker exited ${code}`))));
        child.on('error', reject);
      });

    const outFiles = Array.from({ length: WORKERS }, (_, w) => join(outDir, `w${w}.txt`));
    // Promise.all + spawn (not spawnSync): all 8 child processes start before any of them finishes, so they
    // genuinely race on the SAME inbox file at the OS level -- this is what actually exercises the claim/rename.
    await Promise.all(outFiles.map((f) => run(f)));

    const allDelivered: string[] = [];
    for (const f of outFiles) allDelivered.push(...readFileSync(f, 'utf8').split('\n').filter(Boolean));

    const counts = new Map<string, number>();
    for (const text of allDelivered) counts.set(text, (counts.get(text) ?? 0) + 1);
    const doubled = [...counts.entries()].filter(([, n]) => n > 1);
    const missing = [...expected].filter((text) => !counts.has(text));

    expect(doubled, `double-delivered items: ${JSON.stringify(doubled)}`).toEqual([]);
    expect(missing, `lost items: ${JSON.stringify(missing)}`).toEqual([]);
    expect(allDelivered.length).toBe(TOTAL);

    rmSync(outDir, { recursive: true, force: true });
    rmSync(scriptDir, { recursive: true, force: true });
  }, 60_000);
});
