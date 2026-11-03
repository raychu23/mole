// File-based per-session steering inbox: .mole/local/steer/<session>.json. Private to this machine (like
// packages/memory/src/seen.ts's .mole/local/seen.jsonl) -- the folder gets a `.gitignore` with `*` so it is never
// committed even in a repo that never listed .mole/local. Read-modify-write is best effort (no lock file): the CLI
// is invoked once per `mole steer` call and the hooks call `deliver` at most a few times a second, so a lost race
// would at worst re-show a signal one extra turn, never corrupt the file (writeFileSync is atomic per call).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
