// T105 (I2: product centre D90, reasoning surfaced in the IDE): which decisions govern the open file, and
// which line ranges, from the same `mole decisions --json` payload the sidebar panel already fetches
// (@mole/decisions FlagResult[], run via panelRunners.ts's decisions()). No new backend logic: this is a
// pure view-side projection over data Mole already computes, same split as src/hover.ts and src/seen.ts
// (no vscode import, so it is unit-testable without the editor).
import type { SymbolSpan } from './seen.js';

/** One `scope:` anchor on a decision record (@mole/decisions Anchor): target is 'path', 'path#Symbol' or 'folder/'. */
export interface DecisionAnchor {
  target: string;
  file: string;
  line: number;
}

/** The subset of @mole/decisions's FlagResult (GraphNode) this view needs. */
export interface DecisionLike {
  id: string;
  title: string;
  status: string;
  file: string; // the decision record itself (repo-relative)
  line: number; // 1-based line of the record's title/front matter (mole.openDecisionRecord lands here)
  scope: DecisionAnchor[];
  rationale?: string;
  why?: string;
}

export type MatchKind = 'file' | 'folder' | 'symbol';

export interface DecisionHit {
  decision: DecisionLike;
  /** 0-based, inclusive (vscode.Range line numbers) */
  startLine: number;
  endLine: number;
  matchKind: MatchKind;
}

/** Statuses that no longer govern anything (same normalized vocabulary as @mole/decisions computeFlags). */
const INERT_STATUS = new Set(['rejected', 'superseded', 'deprecated', 'retired']);

/** `${file}#${symbol}` exactly, repo-relative POSIX paths on both sides. */
function symbolTarget(file: string, target: string): string | undefined {
  const i = target.indexOf('#');
  if (i < 0) return undefined;
  const [tFile, tSymbol] = [target.slice(0, i), target.slice(i + 1)];
  return tFile === file ? tSymbol : undefined;
}

/** Widest-match-first ranking, so one decision anchored at both file and symbol level reports the file-level (superset) range. */
const RANK: Record<MatchKind, number> = { file: 0, folder: 1, symbol: 2 };

/** Which decisions govern `file` (repo-relative, POSIX), and at which 0-based inclusive line range each applies.
 *  `symbols` are the file's document-symbol spans (apps/vscode/src/seen.ts documentSymbolTails); `lastLine` is
 *  the file's last line index, for the whole-file ranges a file/folder-scoped decision gets. */
export function decisionsForFile(decisions: DecisionLike[], file: string, symbols: SymbolSpan[], lastLine: number): DecisionHit[] {
  const out: DecisionHit[] = [];
  for (const d of decisions) {
    if (INERT_STATUS.has(d.status)) continue;
    let best: { startLine: number; endLine: number; matchKind: MatchKind } | undefined;
    for (const a of d.scope) {
      let hit: { startLine: number; endLine: number; matchKind: MatchKind } | undefined;
      if (a.target === file) {
        hit = { startLine: 0, endLine: lastLine, matchKind: 'file' };
      } else if (a.target.endsWith('/') && file.startsWith(a.target)) {
        hit = { startLine: 0, endLine: lastLine, matchKind: 'folder' };
      } else {
        const sym = symbolTarget(file, a.target);
        if (sym !== undefined) {
          const span = symbols.find((s) => s.tail === sym);
          if (span) hit = { startLine: span.startLine, endLine: span.endLine, matchKind: 'symbol' };
        }
      }
      if (hit && (!best || RANK[hit.matchKind] < RANK[best.matchKind])) best = hit;
    }
    if (best) out.push({ decision: d, ...best });
  }
  return out;
}
