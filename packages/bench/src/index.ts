// T41 M35: head-to-head scoreboard assembly. Reads frozen keys/run logs from earlier INTEGRATED
// tasks (never edits them, R2) plus runs three new reimplemented-from-docs baselines for H3.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ReusedSource {
  path: string;
  sha256: string;
  bytes: number;
}
export interface ReusedKeys {
  written: string;
  note: string;
  sources: Record<string, ReusedSource>;
}

/** sha256 hex of a file's current bytes. */
export function sha256File(root: string, relPath: string): string {
  return createHash('sha256').update(readFileSync(join(root, relPath))).digest('hex');
}

/** Loads keys/reused-keys.json and verifies every frozen source still has the hash recorded at R1-commit time (R2 guard). */
export function loadReusedKeys(root: string): ReusedKeys {
  const p = join(root, 'packages/bench/keys/reused-keys.json');
  const keys = JSON.parse(readFileSync(p, 'utf8')) as ReusedKeys;
  for (const [name, src] of Object.entries(keys.sources)) {
    // runs.jsonl files are append-only logs from other tasks' loops: only verify they still contain
    // the frozen byte range (prefix), since later tasks may legitimately append more lines.
    const isLog = src.path.endsWith('.jsonl');
    const bytes = readFileSync(join(root, src.path));
    if (isLog) {
      if (bytes.length < src.bytes) throw new Error(`R2: ${name} (${src.path}) shrank below its frozen length — a reused log must never be truncated`);
      const prefix = bytes.subarray(0, src.bytes);
      const prefixHash = createHash('sha256').update(prefix).digest('hex');
      if (prefixHash !== src.sha256) throw new Error(`R2: ${name} (${src.path}) frozen prefix hash changed — a reused log's earlier lines must never be edited`);
    } else {
      const hash = createHash('sha256').update(bytes).digest('hex');
      if (hash !== src.sha256) throw new Error(`R2: ${name} (${src.path}) hash changed since the frozen commit — reused keys/reports must never be edited by this task`);
    }
  }
  return keys;
}

export function readJSON<T>(root: string, relPath: string): T {
  return JSON.parse(readFileSync(join(root, relPath), 'utf8')) as T;
}

export function readJSONL<T>(root: string, relPath: string): T[] {
  const text = readFileSync(join(root, relPath), 'utf8');
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as T);
}

export interface ScoreRow {
  claim: string;
  mole: string;
  baseline_best: string;
  baseline_tool: string;
  all_baselines: Record<string, string>;
  metric: string;
  n: string;
  key_path: string;
  how_baseline_ran: string;
  amazon_jd_line: string;
}

export function precisionRecallF1(tp: number, fp: number, fn: number): { precision: number; recall: number; f1: number } {
  const precision = tp + fp === 0 ? (fn === 0 ? 1 : 0) : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1 };
}

export const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
