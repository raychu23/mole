#!/usr/bin/env node
// mole daemon | map | impact | check | status | stop | reindex  — thin CLI over the daemon (offerings F1.9).
// mole note add <file#Symbol> "text" | mole memory [--json]  — L2 notes on code (T11), no daemon needed.
// mole since [--json] | mole seen <file#Symbol>... | mole seen --stdin  — L1 what changed since you last looked (T13), no daemon needed.
import { defaultSources } from './detect.js';
import { resolve } from 'node:path';
import { formatNeighborhood } from '@mole/core';
import type { MemoryEntry, SeenInput } from '@mole/memory';
import { readFileSync } from 'node:fs';
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
      // T19: a renamed symbol keeps its note ('renamed' = only the name changed, fresh; 'renamed + changed' = stale)
      const sym = e.renamedTo
        ? `${e.changed ? 'renamed + changed' : 'renamed'}: ${e.symbol} → ${e.renamedTo}${e.line ? `:${e.line}` : ''}`
        : `${e.symbol}${where}`;
      const ambiguous = e.candidates?.length ? `  (ambiguous rename, not re-anchored: ${e.candidates.join(', ')})` : '';
      return `${status.padEnd(9)} ${sym}  ${text.length > 80 ? `${text.slice(0, 77)}...` : text}  (${e.file})${ambiguous}`;
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
    // writing a note is a look (L1, T13): `mole since` then reports changes after it
    try {
      const { appendSeen } = await import('@mole/memory');
      appendSeen(root, [{ path: n.path, tail: n.symbol.slice(n.symbol.indexOf('#') + 1), how: 'note' }]);
    } catch {
      // the note is written; a seen log that cannot be written must not fail it
    }
    return 0;
  }
  if (cmd === 'memory') {
    const { memory } = await import('@mole/memory');
    const list = memory(root);
    console.log(flags.json ? JSON.stringify(list, null, 2) : formatMemory(list));
    return 0;
  }
  if (cmd === 'since') {
    // L1 (T13): the symbols you looked at whose body changed after your last look
    const { formatSince, since } = await import('@mole/memory');
    const r = since(root);
    console.log(flags.json ? JSON.stringify(r, null, 2) : formatSince(r));
    return 0;
  }
  if (cmd === 'seen') {
    // record looks: `mole seen <file#Symbol>... [--how visible|hover|note]`, or a JSON batch on stdin (the VS Code extension's sink)
    const { appendSeen, splitTarget } = await import('@mole/memory');
    let inputs: SeenInput[];
    if (flags.stdin) {
      const raw = readFileSync(0, 'utf8').trim();
      const parsed: unknown = raw.startsWith('[') ? JSON.parse(raw) : raw.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
      inputs = Array.isArray(parsed) ? (parsed as SeenInput[]) : [];
    } else {
      const how = (str(flags.how) ?? 'visible') as SeenInput['how'];
      if (pos.length === 0 || !['visible', 'hover', 'note'].includes(how)) {
        console.error('usage: mole seen <file#Symbol>... [--how visible|hover|note] [--root DIR] | mole seen --stdin  (JSON [{path, tail, how, time?, text?}])');
        return 2;
      }
      inputs = [];
      for (const t of pos) {
        const s = splitTarget(root, t);
        if (s) inputs.push({ ...s, how });
        else console.error(`mole seen: not a file#Symbol target: ${t}`);
      }
    }
    const ev = appendSeen(root, inputs);
    if (!flags.stdin || flags.verbose) console.log(`recorded ${ev.length} look${ev.length === 1 ? '' : 's'} in .mole/local/seen.jsonl${ev.length < inputs.length ? ` (${inputs.length - ev.length} unknown symbol${inputs.length - ev.length === 1 ? '' : 's'} skipped)` : ''}`);
    return ev.length === 0 && inputs.length > 0 && !flags.stdin ? 1 : 0;
  }
  if (cmd === 'claims') return (await import('@mole/agentstate/dist/src/claims/cli.js')).claimsCli(pos, flags); // claim check (T24): light entry, no daemon
  if (['runs', 'run', 'tried', 'agents', 'collisions'].includes(cmd)) return (await import('@mole/agentstate')).agentCli(cmd, pos, flags, root); // agent states (T18) + collisions (T21), no daemon needed
  if (cmd === 'decisions') return (await import('@mole/decisions')).decisionsCli(pos, flags, root); // decision graph + flags (T29), no daemon needed
  if (cmd === 'flows') return (await import('@mole/flows')).flowsCli(pos, flags, root); // runtime call flows recorded from tests (T28), no daemon needed
  if (cmd === 'rules') return (await import('@mole/decisions')).rulesCli(pos, flags, root);
  const stateDir = str(flags['state-dir']);
  const common = { root, stateDir, ...defaultSources(root, str(flags.tsconfig), str(flags['src-dir'])) };

  if (cmd === 'daemon') {
    // a background process nobody asked for must not outlive its editor: stop after 30 idle minutes (0 = never)
    const idleMinutes = Number(str(flags['idle-minutes']) ?? 30);
    const { Daemon } = await import('./server.js');
    const otel = await import('@mole/telemetry'); // T16: RPC spans when MOLE_OTEL=1, flushed on stop
    await otel.startTelemetry('mole-daemon');
    const d = new Daemon({ ...common, idleMs: Number.isFinite(idleMinutes) && idleMinutes > 0 ? idleMinutes * 60_000 : 0, log: (l) => console.error(`[mole] ${l}`) });
    await d.start();
    for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => void d.stop());
    await d.closed;
    await otel.shutdownTelemetry();
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
      console.error('usage: mole check <sha | --diff FILE [--base SHA] | --worktree> [--json] [--fix-rule RE] [--root DIR] [--notes-root DIR] [--reword]');
      return 2;
    }
    if (flags['run-tests']) return (await import('@mole/verify')).verifyCli(pos, flags, root); // T22: run the tests that matter, no daemon needed
    const change: Change = diffFile !== undefined ? { diffFile: resolve(diffFile), base: str(flags.base) } : sha !== undefined ? { sha } : { worktree: true };
    // T16: with MOLE_OTEL=1 one span per stage under a root mole.check span, flushed before exit; otherwise no-ops, nothing loaded
    const otel = await import('@mole/telemetry');
    await otel.startTelemetry('mole-cli');
    try {
      return await otel.withSpan('mole.check', { 'mole.change.kind': 'sha' in change ? 'sha' : 'diffFile' in change ? 'diff' : 'worktree', 'mole.change.ref': sha ?? diffFile ?? 'working tree' }, async (span) => {
    // L3 (T14): at most 3 questions from templates over those facts (+ notes); T12's output fields stay as they were
    const [{ formatCheck }, { questions, formatQuestions }] = await Promise.all([import('@mole/history'), import('@mole/questions')]);
    const notesRoot = str(flags['notes-root']);
    const q = await otel.withSpan('mole.questions', {}, () => questions(root, change, { fixRule: str(flags['fix-rule']), notesRoot: notesRoot ? resolve(notesRoot) : undefined, reword: flags.reword === true }));
    span({ 'mole.hunks': q.facts.hunks.length, 'mole.past_fixes': q.facts.hunks.reduce((n, h) => n + h.pastFixes.length, 0), 'mole.questions.count': q.questions.length });
    for (const n of q.notices) console.error(`mole: ${n}`);
    const { notes: _notes, guards: _guards, ...r } = q.facts;
    if (flags.json) console.log(JSON.stringify({ ...r, questions: q.questions }, null, 2));
    else console.log(formatCheck(r) + (q.questions.length ? `\n\n${formatQuestions(q.questions)}` : ''));
    return 0;
      });
    } finally {
      await otel.shutdownTelemetry();
    }
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
  console.error('usage: mole <daemon|map|impact|check|status|reindex|stop|note add|memory|since|seen> [target] [--root DIR] [--state-dir DIR] [--tsconfig F] [--src-dir D] [--idle-minutes N] [--json]');
  return cmd === 'help' ? 0 : 2;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(`mole: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  },
);
