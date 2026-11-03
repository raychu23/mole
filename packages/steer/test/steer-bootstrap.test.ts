// T84: the inbox bootstrap used writeFileSync(..., { flag: 'wx' }) outside the lock -- create THEN write, so for a
// moment the canonical inbox exists but is empty. A concurrent sender could take the lock in that window and
// JSON.parse('') (store.ts withInboxClaim: 'Unexpected end of JSON input'), crashing sendSignal. Caught by the
// instrumented steer-stress test in T79's ledger check, 11-03 08:33.
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { deliverPending, inboxFile, sendSignal } from '../src/index.js';

const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});
function repo(): string {
  const r = mkdtempSync(join(tmpdir(), 'mole-steer-boot-'));
  roots.push(r);
  return r;
}

describe('T84 inbox bootstrap', () => {
  it('an empty inbox file (the window between create and write, or a crash mid-bootstrap) is read as an empty inbox, not a crash', () => {
    const root = repo();
    const f = inboxFile(root, 's1');
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, '');
    expect(() => sendSignal(root, 's1', 'after empty')).not.toThrow();
    const d = deliverPending(root, 's1');
    expect(d.signals.map((s) => s.text)).toEqual(['after empty']);
  });

  it('first-ever send leaves no temp files beside the inbox', () => {
    const root = repo();
    sendSignal(root, 's2', 'first');
    const dir = dirname(inboxFile(root, 's2'));
    expect(readdirSync(dir).filter((n) => n.includes('.boot-'))).toEqual([]);
    expect(deliverPending(root, 's2').signals.map((s) => s.text)).toEqual(['first']);
  });
});
