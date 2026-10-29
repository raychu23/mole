// Find a run by id across the local transcripts and read its turn-final answers (the last assistant text before the next
// user message). Read-only, like sources.ts: SQLite readOnly, JSONL read line by line.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { claudeRun, codexRun, forEachLine, hermesRun, type RawRun } from '../sources.js';
import type { Harness, RunSummary, Skipped, Sources } from '../types.js';
import type { Answer } from './types.js';

export interface Located {
  raw: RawRun;
  harness: Harness;
}

const dbs = new Map<string, DatabaseSync>();
function hermesDb(file: string, skipped: Skipped[]): DatabaseSync | undefined {
  const have = dbs.get(file);
  if (have) return have;
  if (!existsSync(file)) {
    skipped.push({ harness: 'hermes', path: file, reason: 'not found' });
    return undefined;
  }
  try {
    const db = new DatabaseSync(file, { readOnly: true });
    db.prepare('SELECT id FROM sessions LIMIT 1').all();
    dbs.set(file, db);
    return db;
  } catch (e) {
    skipped.push({ harness: 'hermes', path: file, reason: `unreadable: ${e instanceof Error ? e.message : String(e)}` });
    return undefined;
  }
}

interface SessionRow {
  id: string;
  cwd: string | null;
  parent_session_id: string | null;
  started_at: number;
  ended_at: number | null;
  title: string | null;
}

function hermesSummary(file: string, id: string, skipped: Skipped[]): RunSummary | undefined {
  const db = hermesDb(file, skipped);
  if (!db) return undefined;
  try {
    let rows = db.prepare('SELECT id, cwd, parent_session_id, started_at, ended_at, title FROM sessions WHERE id = ?').all(id) as unknown as SessionRow[];
    if (rows.length === 0 && id.length >= 6) rows = db.prepare("SELECT id, cwd, parent_session_id, started_at, ended_at, title FROM sessions WHERE id LIKE ? || '%' LIMIT 2").all(id) as unknown as SessionRow[];
    if (rows.length !== 1) return undefined;
    const r = rows[0]!;
    return {
      id: r.id,
      harness: 'hermes',
      cwd: r.cwd,
      start: new Date(r.started_at * 1000).toISOString(),
      end: r.ended_at ? new Date(r.ended_at * 1000).toISOString() : null,
      steps: 0,
      compactions: 0,
      parent: r.parent_session_id,
      title: r.title,
    };
  } catch (e) {
    skipped.push({ harness: 'hermes', path: file, reason: `unreadable: ${e instanceof Error ? e.message : String(e)}` });
    return undefined;
  }
}

/** JSONL files under dir (depth <= 4) whose name matches */
function findFiles(dir: string, match: (name: string) => boolean, depth = 4): string[] {
  const out: string[] = [];
  let ents;
  try {
    ents = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of ents) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (depth > 0) out.push(...findFiles(p, match, depth - 1));
    } else if (e.name.endsWith('.jsonl') && match(e.name)) out.push(p);
  }
  return out;
}

export function locate(id: string, src: Required<Sources>, skipped: Skipped[]): Located | undefined {
  const h = hermesSummary(src.hermesDb, id, skipped);
  if (h) {
    const raw = hermesRun(src.hermesDb, h, skipped);
    if (raw) return { raw, harness: 'hermes' };
  }
  if (existsSync(src.claudeDir)) {
    const exact = findFiles(src.claudeDir, (n) => n === `${id}.jsonl` || n === `agent-${id}.jsonl`);
    const files = exact.length ? exact : id.length >= 6 ? findFiles(src.claudeDir, (n) => n.startsWith(id) || n.startsWith(`agent-${id}`)) : [];
    if (files.length === 1) {
      const raw = claudeRun(files[0]!);
      if (raw) return { raw, harness: 'claude-code' };
    }
  } else skipped.push({ harness: 'claude-code', path: src.claudeDir, reason: 'not found' });
  if (existsSync(src.codexDir)) {
    const files = id.length >= 6 ? findFiles(src.codexDir, (n) => n.includes(id), 5) : [];
    if (files.length === 1) {
      const raw = codexRun(files[0]!);
      if (raw) return { raw, harness: 'codex' };
    }
  }
  return undefined;
}

const COMPACTION = /^\[CONTEXT COMPACTION/;

/** Turn-final answers: the last assistant message with text before each user message (and at the end of the run). */
export function answersOf(loc: Located, src: Required<Sources>, skipped: Skipped[]): Answer[] {
  const run = loc.raw.summary.id;
  const out: Answer[] = [];
  let last: Answer | undefined;
  const flush = (): void => {
    if (last) out.push(last);
    last = undefined;
  };
  if (loc.harness === 'hermes') {
    const db = hermesDb(src.hermesDb, skipped);
    if (!db) return [];
    const rows = db
      .prepare("SELECT id, role, content, timestamp, _compressed_summary AS s FROM messages WHERE session_id = ? AND role IN ('user', 'assistant') ORDER BY id")
      .all(run) as unknown as Array<{ id: number; role: string; content: string | null; timestamp: number; s: number }>;
    for (const r of rows) {
      if (r.s) continue;
      if (r.role === 'user') flush();
      else if (r.content && r.content.trim() && !COMPACTION.test(r.content)) last = { run, harness: 'hermes', row: r.id, time: new Date(r.timestamp * 1000).toISOString(), text: r.content };
    }
    flush();
    return out;
  }
  const file = loc.raw.file;
  forEachLine(file, (line, n) => {
    if (!line.trim()) return;
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }
    const time = typeof o.timestamp === 'string' ? o.timestamp : '';
    if (loc.harness === 'claude-code') {
      const msg = (o.message ?? {}) as { content?: unknown };
      const c = msg.content;
      if (o.type === 'user') {
        const prompt = typeof c === 'string' || (Array.isArray(c) && c.some((b) => (b as { type?: string }).type === 'text'));
        if (prompt) flush(); // a prompt, or an injected message (subagent hand-back, wakeup): either starts a new turn
      } else if (o.type === 'assistant' && Array.isArray(c)) {
        const text = c.filter((b) => (b as { type?: string }).type === 'text').map((b) => String((b as { text?: unknown }).text ?? '')).join('');
        if (text.trim()) last = { run, harness: 'claude-code', row: n, time, text };
      }
      return;
    }
    // codex rollout: response_item messages
    const p = (o.payload ?? {}) as { type?: string; role?: string; content?: unknown };
    if (o.type !== 'response_item' || p.type !== 'message') return;
    const text = Array.isArray(p.content) ? p.content.map((b) => String((b as { text?: unknown }).text ?? '')).join('') : '';
    if (p.role === 'user' && !text.startsWith('<')) flush();
    else if (p.role === 'assistant' && text.trim()) last = { run, harness: 'codex', row: n, time, text };
  });
  flush();
  return out;
}

