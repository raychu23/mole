// M1 bench: notes placed on symbols before replayed commits (+ synthetic edits) must flag every truth-changed symbol
// (recall 100%), flag <= 5% of unchanged ones, never flag whitespace/comment-only edits, and never drop a note.
// usage: node packages/memory/dist/bench/m1.js [--metrics-out FILE] [--details FILE]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addNote, memory, type MemoryEntry } from '../src/index.js';
import { REPOS, type Key, type KeyItem, type Scenario } from './key-builder.js';

const here = dirname(fileURLToPath(import.meta.url));
const keyPath = resolve(here, '../../bench/m1-key.json');

const git = (repo: string, args: string[]): string =>
  execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });

function put(root: string, rel: string, text: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}

interface Outcome {
  scenario: string;
  item: KeyItem;
  noted: boolean;
  entry?: MemoryEntry;
  flagged: boolean;
  error?: string;
}

const isFlagged = (e: MemoryEntry | undefined): boolean =>
  !e || e.status === 'stale' || e.status === 'orphaned' || e.status === 'invalid' || (e.status === 'moved' && e.changed === true);

function run(s: Scenario, written: string): Outcome[] {
  const repo = REPOS[s.repo];
  const root = mkdtempSync(join(tmpdir(), 'mole-m1-'));
  try {
    for (const f of s.files) if (!f.added) put(root, f.path, git(repo, ['show', `${s.parent}:${f.path}`]));
    const fileOf = new Map<KeyItem, string>();
    const errors = new Map<KeyItem, string>();
    for (const item of s.items) {
      try {
        fileOf.set(item, addNote(root, item.symbol, `m1 note on ${item.symbol}`, { author: 'm1-bench', date: written }).file);
      } catch (e) {
        errors.set(item, e instanceof Error ? e.message : String(e));
      }
    }
    for (const f of s.files) {
      if (s.kind === 'synthetic') {
        if (f.newPath) rmSync(join(root, f.path), { force: true });
        if (f.childText !== undefined) put(root, f.newPath ?? f.path, f.childText);
        continue;
      }
      if (f.deleted || f.newPath) rmSync(join(root, f.path), { force: true });
      if (!f.deleted) put(root, f.newPath ?? f.path, git(repo, ['show', `${s.child}:${f.newPath ?? f.path}`]));
    }
    let entries: MemoryEntry[] = [];
    let listError: string | undefined;
    try {
      entries = memory(root);
    } catch (e) {
      listError = e instanceof Error ? e.message : String(e);
    }
    const byFile = new Map(entries.map((e) => [e.file, e]));
    return s.items.map((item) => {
      const file = fileOf.get(item);
      const entry = file ? byFile.get(file) : undefined;
      return { scenario: s.id, item, noted: file !== undefined, entry, flagged: isFlagged(entry), error: errors.get(item) ?? listError };
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const pct = (a: number, b: number) => (b === 0 ? 0 : Math.round((1000 * a) / b) / 10);

function main(): number {
  const arg = (name: string) => {
    const i = process.argv.indexOf(name);
    return i > 0 ? process.argv[i + 1] : undefined;
  };
  const key = JSON.parse(readFileSync(keyPath, 'utf8')) as Key;
  const outcomes: Outcome[] = [];
  const skipped: string[] = [];
  for (const s of key.scenarios) {
    if (!existsSync(REPOS[s.repo])) {
      skipped.push(s.id);
      continue;
    }
    outcomes.push(...run(s, key.written));
  }
  const changed = outcomes.filter((o) => o.item.truth === 'changed');
  const unchanged = outcomes.filter((o) => o.item.truth === 'unchanged');
  const gone = outcomes.filter((o) => o.item.truth === 'gone');
  const wsc = outcomes.filter((o) => o.item.wsComment);
  const expects = outcomes.filter((o) => o.item.expect);
  const pathed = outcomes.filter((o) => o.item.expectPath);
  const hit = changed.filter((o) => o.flagged).length;
  const ff = unchanged.filter((o) => o.flagged).length;
  const wscFlagged = wsc.filter((o) => o.flagged).length;
  const goneOk = gone.filter((o) => o.entry && (o.entry.status === 'orphaned' || o.entry.status === 'moved')).length;
  const exactOk = expects.filter((o) => o.entry?.status === o.item.expect && (!o.item.expectPath || o.entry?.newPath === o.item.expectPath)).length;
  const movedOk = pathed.filter((o) => o.entry?.status === 'moved' && o.entry.newPath === o.item.expectPath).length;
  const notedFail = outcomes.filter((o) => !o.noted).length;
  const recall = pct(hit, changed.length);
  const falseFlags = pct(ff, unchanged.length);
  const M1 = `recall ${recall}% (${hit}/${changed.length}), false flags ${falseFlags}% (${ff}/${unchanged.length}), ws/comment-only flagged ${wscFlagged}`;
  const extra = `gone listed as orphaned|moved ${goneOk}/${gone.length}, moved to expected path ${movedOk}/${pathed.length}, synthetic exact ${exactOk}/${expects.length}, notes not placed ${notedFail}, scenarios ${key.scenarios.length - skipped.length}/${key.scenarios.length}${skipped.length ? ` (skipped: ${skipped.join(' ')})` : ''}`;
  const atTarget =
    changed.length > 0 && hit === changed.length && falseFlags <= 5 && wscFlagged === 0 && goneOk === gone.length && exactOk === expects.length && movedOk === pathed.length && notedFail === 0;
  const metrics = { M1, M1_detail: extra, at_target: atTarget, key_written: key.written };
  console.log(JSON.stringify(metrics));
  const bad = outcomes.filter(
    (o) =>
      !o.noted ||
      (o.item.truth === 'changed' && !o.flagged) ||
      (o.item.truth === 'unchanged' && o.flagged) ||
      (o.item.expect && o.entry?.status !== o.item.expect),
  );
  for (const o of bad.slice(0, 25))
    console.log(`  miss ${o.scenario} ${o.item.symbol} truth=${o.item.truth}${o.item.expect ? ` expect=${o.item.expect}` : ''} got=${o.entry?.status ?? 'none'}${o.entry?.newPath ? `@${o.entry.newPath}` : ''}${o.error ? ` error=${o.error}` : ''}`);
  if (bad.length > 25) console.log(`  ... ${bad.length - 25} more`);
  const mOut = arg('--metrics-out');
  if (mOut) writeFileSync(mOut, JSON.stringify(metrics) + '\n');
  const dOut = arg('--details');
  if (dOut) writeFileSync(dOut, JSON.stringify(bad.map((o) => ({ scenario: o.scenario, ...o.item, got: o.entry?.status, newPath: o.entry?.newPath, error: o.error })), null, 1));
  return atTarget ? 0 : 1;
}

process.exit(main());
