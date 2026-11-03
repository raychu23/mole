// T84: the inbox bootstrap used writeFileSync(..., { flag: 'wx' }) outside the lock -- create THEN write, so for a
// moment the canonical inbox exists but is empty. A concurrent sender could take the lock in that window and
// JSON.parse('') (store.ts withInboxClaim: 'Unexpected end of JSON input'), crashing sendSignal. Caught by the
// instrumented steer-stress test in T79's ledger check, 11-03 08:33.
import { mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
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

  it('review LOW: a stale .boot-* temp left by a crash between link and unlink is swept', () => {
    const root = repo();
    const f = inboxFile(root, 's3');
    mkdirSync(dirname(f), { recursive: true });
    const boot = `${f}.boot-99999-1`;
    writeFileSync(boot, '{"session":"s3","signals":[],"updates":[]}');
    const old = new Date(Date.now() - 10 * 60_000);
    utimesSync(boot, old, old);
    sendSignal(root, 's3', 'x');
    expect(readdirSync(dirname(f)).filter((n) => n.includes('.boot-'))).toEqual([]);
  });

  it('review LOW: a corrupt non-empty inbox is moved aside (kept for a person) and the send still succeeds', () => {
    const root = repo();
    const f = inboxFile(root, 's4');
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, '{"session":"s4","signals":[{"te');
    expect(() => sendSignal(root, 's4', 'after corrupt')).not.toThrow();
    expect(readdirSync(dirname(f)).filter((n) => n.includes('.corrupt-')).length).toBe(1);
    expect(deliverPending(root, 's4').signals.map((s) => s.text)).toEqual(['after corrupt']);
  });
});
