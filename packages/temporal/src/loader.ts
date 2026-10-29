// Loads a decisions.jsonl (Mole's product-plan decision log: one JSON object per line, fields
// id/date/status/replaced/replaced_by/decided/amended/answered, prose written by hand) into the
// bitemporal fact store as a 'status' fact per decision id, independently of bench/m32-key.json
// (R1: the key's truth and this loader are two separate readings of the same raw source).
//
// Status-before-the-first-named-event is inferred OPEN for any record whose CURRENT status is
// REPLACED/DECIDED (see tasks/T38-bitemporal-decision-graph/2 insights.md "INFERENCE"); event
// timestamps use a time-of-day substring in the record's own text when present, else a fixed
// placeholder (noon for replaced/decided, 15:00 for amended, 10:00 for answered) -- same convention
// documented there.
import { readFileSync } from 'node:fs';
import type { Pool } from 'pg';
import { insertFact } from './index.js';

interface DecisionRow {
  id: string;
  date: string;
  status: string;
  replaced_by?: string;
  replaced?: string;
  decided?: string;
  amended?: string;
  answered?: string;
  answer?: string;
  source?: string;
}

interface Event {
  at: string; // ISO timestamp
  label: string;
}

const DATE_RE = /(\d{4}-\d{2}-\d{2})/;
const TIME_RE = /\b(\d{1,2}:\d{2})\b/;

function findDate(s: string | undefined): string | null {
  if (!s) return null;
  const m = DATE_RE.exec(s);
  return m ? m[1]! : null;
}

function findTime(s: string | undefined): string | null {
  if (!s) return null;
  const m = TIME_RE.exec(s);
  return m ? m[1]! : null;
}

function toIso(date: string, time: string): string {
  const [h, m] = time.split(':').map(Number);
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `${date}T${hh}:${mm}:00`;
}

/** Build the status timeline for one decisions.jsonl row, in time order, deduped by label. */
export function timelineFor(r: DecisionRow): Event[] {
  const createdTime = findTime(r.source) ?? '00:00';
  const willBeReplacedOrDecided = r.status === 'REPLACED' || r.status === 'DECIDED';
  const initialLabel = willBeReplacedOrDecided ? 'OPEN' : r.status;
  const events: Event[] = [{ at: toIso(r.date, createdTime), label: initialLabel }];

  if (r.replaced) {
    const d = findDate(r.replaced) ?? r.date;
    const t = findTime(r.replaced) ?? '12:00';
    events.push({ at: toIso(d, t), label: `REPLACED(${r.replaced_by ?? '?'})` });
  }
  if (r.decided) {
    const d = findDate(r.decided) ?? r.date;
    const t = findTime(r.decided) ?? '12:00';
    events.push({ at: toIso(d, t), label: 'DECIDED' });
  }
  if (r.amended) {
    const d = findDate(r.amended) ?? r.date;
    const t = findTime(r.amended) ?? '15:00';
    const base = events[events.length - 1]!.label;
    events.push({ at: toIso(d, t), label: `${base}+AMENDED` });
  }
  if (r.answered && r.status === 'USER') {
    const d = findDate(r.answered) ?? r.date;
    const t = findTime(r.answered) ?? '10:00';
    const at = toIso(d, t);
    if (at > events[0]!.at) events.push({ at, label: 'USER' });
  }

  events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const dedup: Event[] = [events[0]!];
  for (const e of events.slice(1)) {
    if (e.label !== dedup[dedup.length - 1]!.label) dedup.push(e);
  }
  return dedup;
}

/** Parse a decisions.jsonl file and insert one bitemporal 'status' fact per timeline segment. */
export async function loadDecisionsJsonl(pool: Pool, path: string): Promise<number> {
  const lines = readFileSync(path, 'utf8').split('\n').filter((l) => l.trim().length > 0);
  let count = 0;
  for (const line of lines) {
    const r = JSON.parse(line) as DecisionRow;
    const events = timelineFor(r);
    for (let i = 0; i < events.length; i++) {
      const from = events[i]!.at;
      const to = i + 1 < events.length ? events[i + 1]!.at : null;
      await insertFact(pool, {
        factId: r.id,
        kind: 'decision',
        attr: 'status',
        value: events[i]!.label,
        validFrom: from,
        validTo: to,
        source: path,
      });
      count++;
    }
  }
  return count;
}
