// Review 2 (HIGH): the Review 1 stress test sent all 400 signals BEFORE any deliverer started, so it never
// actually raced a sender against a deliverer -- it only raced deliverers against each other. The reviewer's real
// finding was in the claim-rename scheme itself (store.ts's old `withInboxClaim`): on ENOENT it could not tell "no
// inbox yet" from "inbox currently claimed by another process" (both look like a missing canonical file), so it
// just created a brand-new EMPTY inbox and kept claiming/racing against it -- and whichever claim was renamed back
// LAST won, silently discarding every item the other racer had added. A kill -9'd claimer also orphaned its claimed
// file forever (no code path ever looks for `*.claim-*` again), so the next writer started from a fresh empty
// inbox too. Fix: proper-lockfile's mkdir-based lock dir (atomic create, same mutual-exclusion idiom, but a
// SEPARATE lock file/dir next to the canonical inbox -- the canonical file itself is never moved away, so there is
// no "which rename-back wins" question at all) wraps every read-modify-write; stale-lock reclaim handles a
// kill -9'd holder; the canonical inbox is always read -> mutated -> written to a temp file -> renamed over the
// canonical path while still holding the lock.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deliverPending, inboxFile, sendSignal } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const distIndex = resolve(here, '../dist/src/index.js');
const distStore = resolve(here, '../dist/src/store.js');

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

/** spawn a short-lived .mjs file and resolve/reject on exit; stdio inherited so a crash is visible in test output. */
function run(scriptFile: string, args: string[]): Promise<void> {
  return new Promise((res, rej) => {
    const child = spawn(process.execPath, [scriptFile, ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('exit', (code) => (code === 0 ? res() : rej(new Error(`${scriptFile} exited ${code}`))));
    child.on('error', rej);
  });
}

function senderScript(): string {
  // under heavy machine load a send can hit the bounded lock wait: it then FAILS LOUDLY (throws 'inbox lock timeout')
  // and that item was never accepted. The contract is about accepted items: record which sends succeeded; any other
  // error still crashes the sender (exit 1) and fails the test. (main-check flake 11-03, load avg ~35)
  return [
    `import { writeFileSync } from 'node:fs';`,
    `import { sendSignal } from ${JSON.stringify(distIndex)};`,
    'const [root, session, prefix, countStr, okFile] = process.argv.slice(2);',
    'const count = Number(countStr);',
    'const ok = []; let timedOut = 0; const errors = [];',
    'for (let i = 0; i < count; i++) {',
    '  try { sendSignal(root, session, `${prefix}-${i}`); ok.push(`${prefix}-${i}`); }',
    "  catch (e) { const m = String(e?.stack ?? e?.message ?? e); if (/lock timeout/i.test(m)) timedOut++; else errors.push(m); }",
    '}',
    "writeFileSync(okFile, JSON.stringify({ ok, timedOut, errors }));",
    '',
  ].join('\n');
}

function delivererScript(): string {
  return [
    `import { writeFileSync } from 'node:fs';`,
    `import { deliverPending } from ${JSON.stringify(distIndex)};`,
    'const [root, session, outFile, budgetStr] = process.argv.slice(2);',
    'const budget = Number(budgetStr);',
    'const delivered = [];',
    'for (let i = 0; i < budget; i++) {',
    '  const d = deliverPending(root, session);',
    '  for (const s of d.signals) delivered.push(s.text);',
    '}',
    "writeFileSync(outFile, delivered.join('\\n') + '\\n');",
    '',
  ].join('\n');
}

describe('Review 2 HIGH: senders and deliverers racing AT THE SAME TIME (not sent-then-raced)', () => {
  it('8 concurrent senders x 8 concurrent deliverers, 20 iterations: every sent item delivered exactly once, none lost, none doubled', async () => {
    const SENDERS = 8;
    const DELIVERERS = 8;
    const ITEMS_PER_SENDER = 15;
    const ITERATIONS = 20;

    const scriptDir = mkdtempSync(join(tmpdir(), 'mole-steer-race-script-'));
    const senderFile = join(scriptDir, 'sender.mjs');
    const delivererFile = join(scriptDir, 'deliverer.mjs');
    writeFileSync(senderFile, senderScript());
    writeFileSync(delivererFile, delivererScript());

    const totalLost: string[] = [];
    const totalDoubled: string[] = [];
    let totalExpected = 0;
    let totalRefused = 0;
    let totalDelivered = 0;

    for (let iter = 0; iter < ITERATIONS; iter++) {
      const session = `sess-race-${iter}`;
      const outDir = mkdtempSync(join(tmpdir(), 'mole-steer-race-out-'));
      const okFiles = Array.from({ length: SENDERS }, (_, w) => join(outDir, `sent-w${w}.json`));
      const senderRuns = Array.from({ length: SENDERS }, (_, w) => run(senderFile, [root, session, `w${w}`, String(ITEMS_PER_SENDER), okFiles[w]!]));
      const outFiles = Array.from({ length: DELIVERERS }, (_, w) => join(outDir, `w${w}.txt`));
      // generous budget: deliverers run concurrently WITH senders, so they must poll past the point senders finish.
      const delivererRuns = outFiles.map((f) => run(delivererFile, [root, session, f, String(ITEMS_PER_SENDER * SENDERS * 3)]));

      // launched together: senders keep adding WHILE deliverers are already polling, the reviewer's exact scenario.
      await Promise.all([...senderRuns, ...delivererRuns]);
      // expected = every send that was ACCEPTED (returned without throwing); a timed-out send was refused loudly
      const expected = new Set<string>();
      for (const f of okFiles) {
        const r = JSON.parse(readFileSync(f, 'utf8')) as { ok: string[]; timedOut: number; errors: string[] };
        r.ok.forEach((t) => expected.add(t));
        totalRefused += r.timedOut;
        // any non-timeout send error is a real failure: surface its message instead of a bare 'exited 1'
        expect(r.errors, `sender errors in ${f}`).toEqual([]);
      }
      totalExpected += expected.size;

      // a final drain: deliverer budgets are generous but bounded, so sweep up anything still queued.
      let drain = deliverPending(root, session);
      const drained: string[] = [];
      while (drain.signals.length > 0) {
        drained.push(...drain.signals.map((s) => s.text));
        drain = deliverPending(root, session);
      }

      const allDelivered: string[] = [...drained];
      for (const f of outFiles) allDelivered.push(...readFileSync(f, 'utf8').split('\n').filter(Boolean));
      totalDelivered += allDelivered.length;

      const counts = new Map<string, number>();
      for (const text of allDelivered) counts.set(text, (counts.get(text) ?? 0) + 1);
      for (const [text, n] of counts) if (n > 1) totalDoubled.push(`${session}:${text}(x${n})`);
      for (const text of expected) if (!counts.has(text)) totalLost.push(`${session}:${text}`);

      rmSync(outDir, { recursive: true, force: true });
    }

    expect(totalDoubled, `double-delivered items across ${ITERATIONS} iterations: ${JSON.stringify(totalDoubled)}`).toEqual([]);
    expect(totalLost, `lost items across ${ITERATIONS} iterations: ${JSON.stringify(totalLost)}`).toEqual([]);
    expect(totalDelivered).toBe(totalExpected);
    // refusals are allowed only as a small minority under load; the bulk of sends must be accepted
    expect(totalRefused).toBeLessThan(totalExpected);

    rmSync(scriptDir, { recursive: true, force: true });
  }, 180_000);
});

describe("Review 2 HIGH: a kill -9'd lock holder is reclaimed after it goes stale; inbox stays intact", () => {
  it('a process that dies mid-critical-section leaves a stale lock dir, not a corrupt/orphaned inbox', async () => {
    const session = 'sess-kill9';
    sendSignal(root, session, 'seed-item');

    const holderScript = [
      `import { withInboxClaim } from ${JSON.stringify(distStore)};`,
      `withInboxClaim(${JSON.stringify(root)}, ${JSON.stringify(session)}, (inbox) => {`,
      `  inbox.signals.push({ id: 'will-not-finish', session: ${JSON.stringify(session)}, time: new Date().toISOString(), text: 'never-committed', delivered: false });`,
      '  // park here holding the lock, parent will SIGKILL us before the write+rename step',
      '  const until = Date.now() + 60_000;',
      '  while (Date.now() < until) { /* spin */ }',
      '}, { staleMs: 300 });',
      '',
    ].join('\n');
    const scriptDir = mkdtempSync(join(tmpdir(), 'mole-steer-kill9-'));
    const scriptFile = join(scriptDir, 'holder.mjs');
    writeFileSync(scriptFile, holderScript);

    const holder = spawn(process.execPath, [scriptFile], { stdio: 'ignore' });
    const lockDir = `${inboxFile(root, session)}.lock`;
    // wait for the holder to actually take the lock before killing it
    const acquireDeadline = Date.now() + 5000;
    while (Date.now() < acquireDeadline && !existsSync(lockDir)) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(existsSync(lockDir)).toBe(true);
    holder.kill('SIGKILL');

    // now reclaim: a normal deliverPending call must eventually succeed once the lock goes stale (the new
    // acquirer's own `stale` option decides this -- deliverPending uses withInboxClaim's default, 5000ms -- not
    // whatever the dead holder originally passed), and the inbox must remain valid JSON with the pre-existing
    // item intact (the killed writer's uncommitted mutation never got written, since it died before the
    // write+rename step). deliverPending never throws (Review 2: a timed-out claim returns an empty delivery, not
    // an exception -- see index.ts), so poll for a NON-EMPTY result instead of catching.
    let delivered: { signals: { text: string }[] } = { signals: [] };
    const start = Date.now();
    for (;;) {
      delivered = deliverPending(root, session);
      if (delivered.signals.length > 0) break;
      if (Date.now() - start > 20_000) throw new Error('lock never reclaimed after stale window');
      await new Promise((r) => setTimeout(r, 200));
    }
    expect(delivered.signals.map((s) => s.text)).toContain('seed-item');
    expect(delivered.signals.map((s) => s.text)).not.toContain('never-committed');

    rmSync(scriptDir, { recursive: true, force: true });
  }, 40_000);
});

describe('Review 2 HIGH: leftover *.claim-* files from the old rename scheme are folded back in, not lost', () => {
  it('a pre-upgrade orphaned claim file is merged into the inbox on the next access', () => {
    const session = 'sess-migrate';
    sendSignal(root, session, 'already-in-inbox');
    const canonical = inboxFile(root, session);
    const orphanPath = `${canonical}.claim-99999-deadbeef`;
    writeFileSync(orphanPath, JSON.stringify({ session, signals: [{ id: 'orphan-1', session, time: new Date().toISOString(), text: 'orphaned-before-upgrade', delivered: false }], updates: [] }));

    const d = deliverPending(root, session);
    const texts = d.signals.map((s) => s.text);
    expect(texts).toContain('already-in-inbox');
    expect(texts).toContain('orphaned-before-upgrade');
    expect(existsSync(orphanPath)).toBe(false);
  });
});

describe('Review 2: lock-acquire failure fits the hook budget and never loses queued items', () => {
  it('a long-held lock makes withInboxClaim give up within ~3s, and deliverPending returns empty (not a throw) so the hook can exit 0', async () => {
    const session = 'sess-budget';
    sendSignal(root, session, 'still-queued');

    const holderScript = [
      `import { withInboxClaim } from ${JSON.stringify(distStore)};`,
      `withInboxClaim(${JSON.stringify(root)}, ${JSON.stringify(session)}, () => {`,
      '  const until = Date.now() + 6000;',
      '  while (Date.now() < until) { /* spin */ }',
      '}, { staleMs: 60_000 });',
      '',
    ].join('\n');
    const scriptDir = mkdtempSync(join(tmpdir(), 'mole-steer-budget-'));
    const scriptFile = join(scriptDir, 'holder.mjs');
    writeFileSync(scriptFile, holderScript);
    const holder = spawn(process.execPath, [scriptFile], { stdio: 'ignore' });

    // wait for the holder to actually take the lock
    const lockDir = `${inboxFile(root, session)}.lock`;
    const waitDeadline = Date.now() + 5000;
    while (Date.now() < waitDeadline && !existsSync(lockDir)) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(existsSync(lockDir)).toBe(true);

    const start = Date.now();
    const result = deliverPending(root, session);
    const elapsed = Date.now() - start;
    expect(result).toEqual({ session, signals: [], updates: [] }); // never lost, never a throw: just "nothing this time"
    expect(elapsed, `withInboxClaim retry budget took ${elapsed}ms, must stay well under the hook's 15s timeout`).toBeLessThan(5000);

    holder.kill('SIGKILL');
    rmSync(scriptDir, { recursive: true, force: true });

    // the item is still queued (never lost) and becomes deliverable once the lock goes stale under a FRESH
    // acquirer's own default stale threshold (5000ms, deliverPending's withInboxClaim call) -- poll rather than
    // assume a fixed delay, since the exact reclaim moment depends on the holder's last mtime refresh before it
    // died, not on when we happened to kill it.
    let d2: { signals: { text: string }[] } = { signals: [] };
    const drainStart = Date.now();
    for (;;) {
      d2 = deliverPending(root, session);
      if (d2.signals.length > 0) break;
      if (Date.now() - drainStart > 15_000) throw new Error('item never became deliverable after the holder died');
      await new Promise((r) => setTimeout(r, 300));
    }
    expect(d2.signals.map((s) => s.text)).toContain('still-queued');
  }, 40_000);
});
