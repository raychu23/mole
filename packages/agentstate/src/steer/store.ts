// File-based per-session steering inbox: .mole/local/steer/<session>.json. Private to this machine (like
// packages/memory/src/seen.ts's .mole/local/seen.jsonl) -- the folder gets a `.gitignore` with `*` so it is never
// committed even in a repo that never listed .mole/local.
//
// Review 1 (HIGH 3): the original read-modify-write here had no lock. A stress test with 8 concurrent deliverers x
// 50 iterations produced double deliveries (two racers each read the same "undelivered" item and each wrote it back
// marked delivered, so both callers reported delivering it). `withInboxClaim` below closes that window with an
// atomic rename-based claim, modeled on two well-known file-locking idioms:
//   - Maildir delivery (https://en.wikipedia.org/wiki/Maildir ; qmail's maildir(5),
//     https://manpages.debian.org/stretch/qmail/maildir.5.en.html): a message is written privately under tmp/ and
//     only becomes visible by an atomic rename() into new/ -- POSIX rename() within one filesystem is atomic, so
//     every reader sees either the whole old state or the whole new state, never a partial write, and no reader
//     needs to coordinate with the writer via a separate lock.
//   - git's lockfile API (https://git-scm.com/docs/api-lockfile/2.0.5 ; the same mechanism behind the familiar
//     `.git/index.lock`): "we try to create the lock file with O_EXCL so that we can notice and fail when somebody
//     else is already trying to update the index file", then rename the lock file onto the real one to commit.
// Here the inbox file ITSELF is both the content and the mutual-exclusion token: a racer that successfully
// `renameSync`s the canonical inbox to a unique "claimed" name is provably the only process holding it (the losing
// racer's renameSync throws ENOENT, since the source is already gone); it reads, mutates, and renames back to
// release. Bootstrapping an inbox that does not exist yet uses the O_EXCL idiom directly (open with 'wx') for the
// same mutual-exclusion reason.
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { SteerInbox } from './types.js';

const LOCAL_DIR = '.mole/local/steer';
const sanitize = (s: string): string => String(s || 'unknown').replace(/[^\w.-]/g, '_');

export function inboxFile(root: string, session: string): string {
  return join(root, LOCAL_DIR, `${sanitize(session)}.json`);
}

function ensureDir(root: string): void {
  const dir = join(root, LOCAL_DIR);
  mkdirSync(dir, { recursive: true });
  const gi = join(root, '.mole', 'local', '.gitignore');
  if (!existsSync(gi)) {
    try {
      writeFileSync(gi, '# Mole: personal, never committed\n*\n');
    } catch {
      // best effort: the inbox itself still works without it
    }
  }
}

export function readInbox(root: string, session: string): SteerInbox {
  const f = inboxFile(root, session);
  try {
    if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8')) as SteerInbox;
  } catch {
    // a corrupt file starts fresh rather than wedging every future `mole steer` call
  }
  return { session, signals: [], updates: [] };
}

export function writeInbox(root: string, inbox: SteerInbox): void {
  ensureDir(root);
  writeFileSync(inboxFile(root, inbox.session), JSON.stringify(inbox));
}

/** A blocking sleep with no external dependency (Node has no sync setTimeout): a 1-cell SharedArrayBuffer +
 * Atomics.wait is the standard synchronous-sleep idiom for Node's main thread. */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Atomic claim-modify-release on the per-session inbox file (see this file's header for the Maildir/git-lockfile
 * prior art). `mutate` receives the current inbox, mutates it in place, and returns whatever the caller wants back;
 * the mutated inbox is written back and the claim is released (renamed back to the canonical path) before this
 * returns -- including on a thrown error, so a failing mutate() never leaves the inbox stuck under a claimed name.
 * Concurrent `sendSignal`/`requestUpdate`/`deliverPending` calls on the SAME session therefore serialize instead of
 * racing: only one process can ever be inside `mutate` for a given session at a time.
 */
export function withInboxClaim<T>(root: string, session: string, mutate: (inbox: SteerInbox) => T, opts: { retries?: number; delayMs?: number } = {}): T {
  const retries = opts.retries ?? 300;
  const delayMs = opts.delayMs ?? 10;
  ensureDir(root);
  const canonical = inboxFile(root, session);
  const claimed = `${canonical}.claim-${process.pid}-${randomUUID()}`;
  for (let attempt = 0; ; attempt++) {
    try {
      renameSync(canonical, claimed); // atomic: only one racer's rename can succeed per existing canonical file
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        // nothing to claim yet (first ever write for this session): create it with O_EXCL, same mutual-exclusion
        // idiom as git's index.lock, then loop back to claim the file we (or a racer) just created.
        try {
          const fd = openSync(canonical, 'wx');
          try {
            writeFileSync(fd, JSON.stringify({ session, signals: [], updates: [] } satisfies SteerInbox));
          } finally {
            closeSync(fd);
          }
        } catch (e2) {
          if ((e2 as NodeJS.ErrnoException).code !== 'EEXIST') throw e2;
          // a racer created/claimed it between our ENOENT and our 'wx' attempt: just retry the claim loop
        }
        if (attempt >= retries) throw new Error(`mole steer: inbox lock timeout for session ${session}`);
        sleepSync(delayMs);
        continue;
      }
      if (attempt >= retries) throw new Error(`mole steer: inbox lock timeout for session ${session}`);
      sleepSync(delayMs);
      continue;
    }
    // we now exclusively own `claimed` (it cannot exist under any other name): read, mutate, write, release.
    try {
      const inbox = JSON.parse(readFileSync(claimed, 'utf8')) as SteerInbox;
      const result = mutate(inbox);
      writeFileSync(claimed, JSON.stringify(inbox));
      return result;
    } finally {
      renameSync(claimed, canonical); // release: atomic, and always succeeds (same filesystem, we alone hold `claimed`)
    }
  }
}
