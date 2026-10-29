// Readers for the 3 local transcript formats -> RawRun (tool calls with their results, compaction points).
// Every source is opened read-only (SQLite readOnly, JSONL via read-only fds). A source that can't be read is a Skipped
// entry, never an exception.
import { closeSync, existsSync, openSync, readSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { RunSummary, Skipped, Sources } from './types.js';

export interface RawCall {
  callId: string;
  name: string;
  args: Record<string, unknown>;
  argsText: string;
  time: number; // ms
  order: number; // hermes: first messages.id; jsonl: line number
  row: number;
  resultRow?: number;
  resultText?: string;
  resultTime?: number;
  resultError?: boolean; // the harness marked the result an error (Claude is_error)
  extra?: Record<string, unknown>; // harness-specific result detail (Claude toolUseResult)
}

export interface RawCompaction {
  time: number;
  order: number;
  row: number;
}

export interface RawRun {
  summary: RunSummary;
  file: string;
  calls: RawCall[];
  compactions: RawCompaction[];
  /** later messages that may carry background-process completion notices: [order, text] */
  notices: Array<[number, string]>;
}

export function defaultSources(env: NodeJS.ProcessEnv = process.env): Required<Sources> {
  const home = homedir();
  return {
    hermesDb: env.MOLE_HERMES_DB ?? join(home, '.hermes/state.db'),
    claudeDir: env.MOLE_CLAUDE_DIR ?? join(home, '.claude/projects'),
    codexDir: env.MOLE_CODEX_DIR ?? join(home, '.codex/sessions'),
  };
}

const iso = (ms: number): string => new Date(ms).toISOString();
const parseJson = (s: string): unknown => {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
};
const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

// ---------------------------------------------------------------- JSONL, read synchronously in chunks (Codex files reach 1 GB)
export function forEachLine(file: string, cb: (line: string, n: number) => void | boolean): void {
  const fd = openSync(file, 'r');
  try {
    const buf = Buffer.allocUnsafe(1 << 20);
    let parts: Buffer[] = [];
    let n = 0;
    let pos = 0;
    for (;;) {
      const got = readSync(fd, buf, 0, buf.length, pos);
      if (got <= 0) break;
      pos += got;
      let start = 0;
      for (let i = buf.indexOf(10, 0); i !== -1 && i < got; i = buf.indexOf(10, i + 1)) {
        parts.push(buf.subarray(start, i));
        n++;
        const line = parts.length === 1 ? parts[0]!.toString('utf8') : Buffer.concat(parts).toString('utf8');
        parts = [];
        start = i + 1;
        if (cb(line, n) === false) return;
      }
      if (start < got) parts.push(Buffer.from(buf.subarray(start, got)));
    }
    if (parts.length) cb(Buffer.concat(parts).toString('utf8'), n + 1);
  } finally {
    closeSync(fd);
  }
}

// ---------------------------------------------------------------- Hermes (~/.hermes/state.db)
const dbs = new Map<string, DatabaseSync>();
function openHermes(file: string, skipped: Skipped[]): DatabaseSync | undefined {
  const have = dbs.get(file);
  if (have) return have;
  if (!existsSync(file)) {
    skipped.push({ harness: 'hermes', path: file, reason: 'not found' });
    return undefined;
  }
  try {
    const db = new DatabaseSync(file, { readOnly: true });
    db.prepare('SELECT id FROM sessions LIMIT 1').all();
    db.prepare('SELECT id FROM messages LIMIT 1').all();
    dbs.set(file, db);
    return db;
  } catch (e) {
    skipped.push({ harness: 'hermes', path: file, reason: `unreadable: ${e instanceof Error ? e.message : String(e)}` });
    return undefined;
  }
}

interface HermesSessionRow {
  id: string;
  source: string;
  cwd: string | null;
  parent_session_id: string | null;
  started_at: number;
  ended_at: number | null;
  title: string | null;
}

export function hermesSummaries(file: string, skipped: Skipped[]): RunSummary[] {
  const db = openHermes(file, skipped);
  if (!db) return [];
  try {
    const counts = new Map<string, { steps: number; compactions: number; last: number }>();
    for (const r of db
      .prepare(
        `SELECT session_id AS s, COUNT(DISTINCT CASE WHEN role = 'tool' THEN tool_call_id END) AS steps,
                SUM(_compressed_summary) AS compactions, MAX(timestamp) AS last FROM messages GROUP BY session_id`,
      )
      .iterate() as Iterable<{ s: string; steps: number; compactions: number | null; last: number | null }>)
      counts.set(r.s, { steps: r.steps, compactions: r.compactions ?? 0, last: r.last ?? 0 });
    const rows = db.prepare('SELECT id, source, cwd, parent_session_id, started_at, ended_at, title FROM sessions').all() as unknown as HermesSessionRow[];
    return rows.map((r) => {
      const c = counts.get(r.id);
      const end = r.ended_at ?? (c?.last || null);
      return {
        id: r.id,
        harness: 'hermes' as const,
        cwd: r.cwd ?? null,
        start: iso(r.started_at * 1000),
        end: end ? iso(end * 1000) : null,
        steps: c?.steps ?? 0,
        compactions: c?.compactions ?? 0,
        parent: r.parent_session_id ?? null,
        title: r.title ?? null,
      };
    });
  } catch (e) {
    skipped.push({ harness: 'hermes', path: file, reason: `unreadable: ${e instanceof Error ? e.message : String(e)}` });
    return [];
  }
}

interface MsgRow {
  id: number;
  session_id: string;
  role: string;
  content: string | null;
  tool_call_id: string | null;
  tool_calls: string | null;
  timestamp: number;
  _compressed_summary: number;
}

function hermesRunFromRows(file: string, summary: RunSummary, rows: MsgRow[]): RawRun {
  const calls = new Map<string, RawCall>();
  const compactions: RawCompaction[] = [];
  const notices: Array<[number, string]> = [];
  const results = new Map<string, MsgRow>();
  for (const m of rows) {
    if (m._compressed_summary) {
      compactions.push({ time: m.timestamp * 1000, order: m.id, row: m.id });
      continue;
    }
    if (m.tool_calls) {
      const list = parseJson(m.tool_calls);
      if (Array.isArray(list))
        for (const c of list as Array<{ id?: string; call_id?: string; function?: { name?: string; arguments?: string } }>) {
          const id = c.id ?? c.call_id;
          if (!id || calls.has(id)) continue; // a compaction re-inserts the kept tail: same call ids, first one wins
          const argsText = c.function?.arguments ?? '';
          calls.set(id, { callId: id, name: c.function?.name ?? '', args: asObj(parseJson(argsText)), argsText, time: m.timestamp * 1000, order: m.id, row: m.id });
        }
    }
    if (m.role === 'tool' && m.tool_call_id) {
      const prev = results.get(m.tool_call_id);
      // keep the first real result; a later copy may be a '[Duplicate tool output …]' placeholder or the reverse
      if (!prev || (prev.content ?? '').startsWith('[Duplicate tool output')) results.set(m.tool_call_id, m);
    } else if (m.content && /proc_[0-9a-f]{6,}/.test(m.content)) notices.push([m.id, m.content]);
  }
  for (const c of calls.values()) {
    const r = results.get(c.callId);
    if (r) {
      c.resultRow = r.id;
      c.resultText = r.content ?? '';
      c.resultTime = r.timestamp * 1000;
    }
  }
  compactions.sort((a, b) => a.order - b.order);
  return { summary: { ...summary, steps: calls.size, compactions: compactions.length }, file, calls: [...calls.values()].sort((a, b) => a.order - b.order), compactions, notices };
}

const MSG_COLS = 'id, session_id, role, content, tool_call_id, tool_calls, timestamp, _compressed_summary';

export function hermesRun(file: string, summary: RunSummary, skipped: Skipped[]): RawRun | undefined {
  const db = openHermes(file, skipped);
  if (!db) return undefined;
  const rows = db.prepare(`SELECT ${MSG_COLS} FROM messages WHERE session_id = ? ORDER BY id`).all(summary.id) as unknown as MsgRow[];
  return hermesRunFromRows(file, summary, rows);
}

/** Many sessions at once (one scan): attribution and `mole agents` read every in-scope run. */
export function hermesRuns(file: string, summaries: RunSummary[], skipped: Skipped[]): RawRun[] {
  const db = openHermes(file, skipped);
  if (!db || summaries.length === 0) return [];
  const want = new Map(summaries.map((s) => [s.id, s]));
  const rows = new Map<string, MsgRow[]>();
  for (const r of db.prepare(`SELECT ${MSG_COLS} FROM messages ORDER BY id`).iterate() as Iterable<MsgRow>) {
    if (!want.has(r.session_id)) continue;
    const l = rows.get(r.session_id);
    if (l) l.push(r);
    else rows.set(r.session_id, [r]);
  }
  return [...want.values()].map((s) => hermesRunFromRows(file, s, rows.get(s.id) ?? []));
}

// ---------------------------------------------------------------- Claude Code (~/.claude/projects/<cwd>/<session>.jsonl, subagents/agent-*.jsonl)
const claudeCache = new Map<string, { mtime: number; run: RawRun }>();

function contentText(c: unknown): string {
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((b) => (typeof b === 'string' ? b : typeof (b as { text?: unknown }).text === 'string' ? (b as { text: string }).text : JSON.stringify(b))).join('\n');
  return c === undefined ? '' : JSON.stringify(c);
}

export function claudeRun(file: string): RawRun | undefined {
  const st = statSync(file);
  const hit = claudeCache.get(file);
  if (hit && hit.mtime === st.mtimeMs) return hit.run;
  const isSub = basename(dirname(file)) === 'subagents';
  const calls = new Map<string, RawCall>();
  const compactions: RawCompaction[] = [];
  let id: string | null = null;
  let cwd: string | null = null;
  let first = Infinity;
  let last = 0;
  let title: string | null = null;
  forEachLine(file, (line, n) => {
    if (!line.trim()) return;
    const o = asObj(parseJson(line));
    const t = typeof o.timestamp === 'string' ? Date.parse(o.timestamp) : NaN;
    if (!Number.isNaN(t)) {
      first = Math.min(first, t);
      last = Math.max(last, t);
    }
    if (!id && typeof o.sessionId === 'string') id = o.sessionId;
    if (!cwd && typeof o.cwd === 'string') cwd = o.cwd;
    if (o.type === 'custom-title' && typeof o.customTitle === 'string') title = o.customTitle;
    else if (o.type === 'ai-title' && !title && typeof o.aiTitle === 'string') title = o.aiTitle;
    if (o.type === 'system' && o.subtype === 'compact_boundary') {
      compactions.push({ time: t, order: n, row: n });
      return;
    }
    const msg = asObj(o.message);
    if (!Array.isArray(msg.content)) return;
    for (const b of msg.content as Array<Record<string, unknown>>) {
      if (o.type === 'assistant' && b.type === 'tool_use' && typeof b.id === 'string' && !calls.has(b.id)) {
        const input = asObj(b.input);
        calls.set(b.id, { callId: b.id, name: String(b.name ?? ''), args: input, argsText: JSON.stringify(input), time: t, order: n, row: n });
      } else if (o.type === 'user' && b.type === 'tool_result' && typeof b.tool_use_id === 'string') {
        const c = calls.get(b.tool_use_id);
        if (c && c.resultRow === undefined) {
          c.resultRow = n;
          c.resultText = contentText(b.content);
          c.resultTime = t;
          c.resultError = b.is_error === true;
          c.extra = asObj(o.toolUseResult);
        }
      }
    }
  });
  const agentId = isSub ? basename(file, '.jsonl') : null;
  const parent = isSub ? basename(dirname(dirname(file))) : null;
  const runId = agentId ?? id ?? basename(file, '.jsonl');
  const run: RawRun = {
    summary: {
      id: runId,
      harness: 'claude-code',
      cwd,
      start: iso(Number.isFinite(first) ? first : st.mtimeMs),
      end: last ? iso(last) : null,
      steps: calls.size,
      compactions: compactions.length,
      parent,
      title,
    },
    file,
    calls: [...calls.values()].sort((a, b) => a.order - b.order),
    compactions,
    notices: [],
  };
  claudeCache.set(file, { mtime: st.mtimeMs, run });
  return run;
}

// ---------------------------------------------------------------- Codex (~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl)
const codexCache = new Map<string, { mtime: number; run: RawRun }>();

/** session_meta only (first line): cheap scope check before reading a file that can be 1 GB */
export function codexMeta(file: string): { id: string; cwd: string | null; start: number } | undefined {
  let meta: { id: string; cwd: string | null; start: number } | undefined;
  forEachLine(file, (line) => {
    const o = asObj(parseJson(line));
    if (o.type === 'session_meta') {
      const p = asObj(o.payload);
      meta = { id: String(p.id ?? p.session_id ?? basename(file, '.jsonl')), cwd: typeof p.cwd === 'string' ? p.cwd : null, start: Date.parse(String(p.timestamp ?? o.timestamp)) };
    }
    return false;
  });
  return meta;
}

export function codexRun(file: string): RawRun | undefined {
  const st = statSync(file);
  const hit = codexCache.get(file);
  if (hit && hit.mtime === st.mtimeMs) return hit.run;
  const meta = codexMeta(file);
  const calls = new Map<string, RawCall>();
  const compactions: RawCompaction[] = [];
  let last = 0;
  forEachLine(file, (line, n) => {
    // skip the big context lines without parsing them
    const head = line.slice(0, 160);
    const isCall = head.includes('"response_item"') && /"(function_call|custom_tool_call|local_shell_call|function_call_output|custom_tool_call_output)"/.test(line.slice(0, 400));
    const isCompact = head.includes('"type":"compacted"') || head.includes('"type": "compacted"') || (head.includes('"event_msg"') && /"type":\s*"compaction"/.test(line.slice(0, 300)));
    const tm = /"timestamp":\s*"([^"]+)"/.exec(head);
    const t = tm ? Date.parse(tm[1]!) : NaN;
    if (!Number.isNaN(t)) last = Math.max(last, t);
    if (isCompact) {
      if (!compactions.some((c) => Math.abs(c.time - t) < 5000)) compactions.push({ time: t, order: n, row: n });
      return;
    }
    if (!isCall) return;
    const p = asObj(asObj(parseJson(line)).payload);
    const cid = String(p.call_id ?? p.id ?? `line${n}`);
    if (p.type === 'function_call' || p.type === 'custom_tool_call' || p.type === 'local_shell_call') {
      if (calls.has(cid)) return;
      const argsText = typeof p.arguments === 'string' ? p.arguments : typeof p.input === 'string' ? p.input : JSON.stringify(p.action ?? {});
      const parsed = parseJson(argsText);
      const args = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : { input: argsText };
      calls.set(cid, { callId: cid, name: String(p.name ?? p.type), args, argsText, time: t, order: n, row: n });
    } else {
      const c = calls.get(cid);
      if (c && c.resultRow === undefined) {
        c.resultRow = n;
        c.resultText = typeof p.output === 'string' ? p.output : contentText(p.output);
        c.resultTime = t;
      }
    }
  });
  const run: RawRun = {
    summary: {
      id: meta?.id ?? basename(file, '.jsonl'),
      harness: 'codex',
      cwd: meta?.cwd ?? null,
      start: iso(meta && Number.isFinite(meta.start) ? meta.start : st.mtimeMs),
      end: last ? iso(last) : null,
      steps: calls.size,
      compactions: compactions.length,
      parent: null,
      title: null,
    },
    file,
    calls: [...calls.values()].sort((a, b) => a.order - b.order),
    compactions,
    notices: [],
  };
  codexCache.set(file, { mtime: st.mtimeMs, run });
  return run;
}
