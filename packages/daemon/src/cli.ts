#!/usr/bin/env node
// mole daemon | map | impact | check | status | stop | reindex  — thin CLI over the daemon (offerings F1.9).
// mole note add <file#Symbol> "text" | mole memory [--json]  — L2 notes on code (T11), no daemon needed.
import { defaultSources } from './detect.js';
import { resolve } from 'node:path';
import { formatNeighborhood } from '@mole/core';
import type { MemoryEntry } from '@mole/memory';
import type { Change } from '@mole/history';
import { ensureDaemon, MoleClient } from './client.js';
// heavy modules (TypeScript compiler, SQLite, git history) load only in the subcommand that needs them:
// every CLI call loading all of them made a 3-call CLI test exceed 5 s on a loaded machine

function parse(argv: string[]): { cmd: string; pos: string[]; flags: Record<string, string | true> } {
  const [cmd = 'help', ...rest] = argv;
  const pos: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i] as string;
    if (a.startsWith('--')) {
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[a.slice(2)] = next;
        i++;
      } else flags[a.slice(2)] = true;
    } else pos.push(a);
  }
  return { cmd, pos, flags };
}

const str = (v: string | true | undefined): string | undefined => (typeof v === 'string' ? v : undefined);

function formatMemory(list: MemoryEntry[]): string {
  if (list.length === 0) return 'mole: no notes (.mole/notes is empty)';
  return list
    .map((e) => {
      if (e.status === 'invalid') return `invalid   ${e.problem ?? e.file}`;
      const status = e.status === 'moved' && e.changed ? 'moved*' : e.status;
      const where = e.newPath ? ` -> ${e.newPath}${e.line ? `:${e.line}` : ''}` : e.line ? `:${e.line}` : '';
      const text = e.text.split('\n')[0] ?? '';
      return `${status.padEnd(9)} ${e.symbol}${where}  ${text.length > 80 ? `${text.slice(0, 77)}...` : text}  (${e.file})`;
    })
    .join('\n') + (list.some((e) => e.status === 'moved' && e.changed) ? '\n(moved* = moved and its body changed since the note)' : '');
}

async function main(): Promise<number> {
  const { cmd, pos, flags } = parse(process.argv.slice(2));
  const root = resolve(str(flags.root) ?? process.cwd());
  if (cmd === 'note') {
    const [sub, target, ...words] = pos;
    if (sub !== 'add' || !target || words.length === 0) {
      console.error('usage: mole note add <file#Symbol> "text" [--root DIR] [--author NAME]');
      return 2;
    }
    const { addNote } = await import('@mole/memory');
    const n = addNote(root, target, words.join(' '), { author: str(flags.author) });
    console.log(`wrote ${n.file} on ${n.symbol} (hash ${n.hash})`);
    return 0;
  }
  if (cmd === 'memory') {
    const { memory } = await import('@mole/memory');
    const list = memory(root);
    console.log(flags.json ? JSON.stringify(list, null, 2) : formatMemory(list));
    return 0;
  }
  if (cmd === 'since' || cmd === 'seen') {
    throw new Error(`${cmd}: not implemented`);
  }
  const stateDir = str(flags['state-dir']);
  const common = { root, stateDir, ...defaultSources(root, str(flags.tsconfig), str(flags['src-dir'])) };

  if (cmd === 'daemon') {
    // a background process nobody asked for must not outlive its editor: stop after 30 idle minutes (0 = never)
    const idleMinutes = Number(str(flags['idle-minutes']) ?? 30);
    const { Daemon } = await import('./server.js');
    const d = new Daemon({ ...common, idleMs: Number.isFinite(idleMinutes) && idleMinutes > 0 ? idleMinutes * 60_000 : 0, log: (l) => console.error(`[mole] ${l}`) });
    await d.start();
    for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => void d.stop());
    await d.closed;
    return 0;
  }
  if (cmd === 'map' || cmd === 'impact') {
    const target = pos[0];
    if (!target) {
      console.error(`usage: mole ${cmd} <path | path#Symbol | symbol> [--root DIR]`);
      return 2;
    }
    const client = flags['no-start'] ? new MoleClient({ root, stateDir }) : await ensureDaemon(common);
    let n = await client.map(target, cmd === 'impact');
    for (let i = 0; i < 100 && n.state === 'indexing'; i++) {
      await new Promise((r) => setTimeout(r, 200));
      n = await client.map(target, cmd === 'impact');
    }
    console.log(flags.json ? JSON.stringify(n, null, 2) : formatNeighborhood(n));
    return n.state === 'ok' ? 0 : 1;
  }
  if (cmd === 'check') {
    // L2 (T12): past fixes that last wrote the lines a change edits, with their reason, guarding tests and source
    const sha = pos[0];
    const diffFile = str(flags.diff);
    const modes = [sha !== undefined, diffFile !== undefined, flags.worktree === true].filter(Boolean).length;
    if (modes !== 1) {
      console.error('usage: mole check <sha | --diff FILE [--base SHA] | --worktree> [--json] [--fix-rule RE] [--root DIR]');
      return 2;
    }
    const change: Change = diffFile !== undefined ? { diffFile: resolve(diffFile), base: str(flags.base) } : sha !== undefined ? { sha } : { worktree: true };
    const { check, formatCheck } = await import('@mole/history');
    const r = await check(root, change, { fixRule: str(flags['fix-rule']) });
    console.log(flags.json ? JSON.stringify(r, null, 2) : formatCheck(r));
    return 0;
  }
  const client = new MoleClient({ root, stateDir });
  if (cmd === 'status') {
    try {
      console.log(JSON.stringify(await client.status(), null, 2));
      return 0;
    } catch {
      console.log('mole: daemon not running');
      return 1;
    }
  }
  if (cmd === 'stop' || cmd === 'reindex') {
    try {
      await client.call(cmd === 'stop' ? 'shutdown' : 'reindex');
      return 0;
    } catch {
      console.log('mole: daemon not running');
      return 1;
    }
  }
  console.error('usage: mole <daemon|map|impact|check|status|reindex|stop|note add|memory> [target] [--root DIR] [--state-dir DIR] [--tsconfig F] [--src-dir D] [--idle-minutes N] [--json]');
  return cmd === 'help' ? 0 : 2;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(`mole: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  },
);
