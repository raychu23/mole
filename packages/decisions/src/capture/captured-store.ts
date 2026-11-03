// T80: persistent storage for captured arguments, one JSON array per decision id under
// `<root>/.mole/arguments/captured/<id>.json` -- same convention as T46's compile-at-capture store
// (`compile/store.ts`): append-only, nothing is ever deleted. Re-capturing a decision MERGES newly found
// rows in by id (updates text/span/provenance on an existing row, NEVER touches its status) and adds any
// new ids; it never removes a row that disappeared from the source text, so an approved argument's
// approval is never silently undone by a later re-run.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CapturedArgument } from './arguments.js';

export const capturedDir = (root: string): string => join(root, '.mole', 'arguments', 'captured');
export const capturedPath = (root: string, decisionId: string): string => join(capturedDir(root), `${decisionId}.json`);

export class CapturedArgumentError extends Error {}

export function listCapturedArguments(root: string, decisionId: string): CapturedArgument[] {
  const p = capturedPath(root, decisionId);
  if (!existsSync(p)) return [];
  return JSON.parse(readFileSync(p, 'utf8')) as CapturedArgument[];
}

function writeCapturedArguments(root: string, decisionId: string, rows: CapturedArgument[]): void {
  mkdirSync(capturedDir(root), { recursive: true });
  writeFileSync(capturedPath(root, decisionId), `${JSON.stringify(rows, null, 2)}\n`);
}

/** Merge freshly-captured rows (always `status: 'draft'` coming in) into the stored set: an id already on
 *  disk keeps its stored status/approvedBy/approvedAt/rejectedReason (an approval or rejection a person
 *  already made is never reverted by re-running capture) but takes the freshly-extracted text/span/
 *  provenance/attacks/supports, so a later edit to the source ADR is reflected without losing the
 *  decision already made about it. Returns the full merged set. */
export function saveCapturedArguments(root: string, decisionId: string, fresh: CapturedArgument[]): CapturedArgument[] {
  const existing = new Map(listCapturedArguments(root, decisionId).map((r) => [r.id, r]));
  const merged = fresh.map((row) => {
    const prior = existing.get(row.id);
    return prior ? { ...row, status: prior.status, approvedBy: prior.approvedBy, approvedAt: prior.approvedAt, rejectedReason: prior.rejectedReason, rejectedAt: prior.rejectedAt } : row;
  });
  // keep any stored row capture no longer finds (source text changed/removed) -- never silently dropped
  for (const [id, row] of existing) if (!merged.some((r) => r.id === id)) merged.push(row);
  writeCapturedArguments(root, decisionId, merged);
  return merged;
}

function setRow(root: string, decisionId: string, argumentId: string, patch: Partial<CapturedArgument>, verb: string): CapturedArgument {
  const rows = listCapturedArguments(root, decisionId);
  const idx = rows.findIndex((r) => r.id === argumentId);
  if (idx < 0) throw new CapturedArgumentError(`mole arguments ${verb}: ${decisionId} has no captured argument ${argumentId}`);
  const next = { ...rows[idx]!, ...patch };
  rows[idx] = next;
  writeCapturedArguments(root, decisionId, rows);
  return next;
}

/** A person approves one captured argument: ONLY this call moves a row from `draft` to `approved`, and
 *  only an approved row is ever turned into a graph node by captured-loader.ts -- see prior-art.md's
 *  design choice #1 for why this is the sole path to effect. Approving twice re-stamps approvedBy/At
 *  (same re-run-after-an-unrelated-edit convenience T46's compileCli documents), never an error. */
export function approveCapturedArgument(root: string, decisionId: string, argumentId: string, approver: string): CapturedArgument {
  return setRow(root, decisionId, argumentId, { status: 'approved', approvedBy: approver, approvedAt: new Date().toISOString(), rejectedReason: undefined, rejectedAt: undefined }, 'approve');
}

/** A person rejects one captured argument: marks it `rejected` with a reason. Never deletes the row
 *  (append-only) and never affects the graph either way -- rejected is simply never approved. */
export function rejectCapturedArgument(root: string, decisionId: string, argumentId: string, reason: string): CapturedArgument {
  return setRow(root, decisionId, argumentId, { status: 'rejected', rejectedReason: reason, rejectedAt: new Date().toISOString() }, 'reject');
}

/** Every decision id with at least one captured-argument file, for `mole arguments list` with no --id. */
export function allCapturedArguments(root: string): Record<string, CapturedArgument[]> {
  const dir = capturedDir(root);
  if (!existsSync(dir)) return {};
  const out: Record<string, CapturedArgument[]> = {};
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    out[f.slice(0, -'.json'.length)] = listCapturedArguments(root, f.slice(0, -'.json'.length));
  }
  return out;
}
