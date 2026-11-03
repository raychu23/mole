// Unite the three formats' RawIntents onto Mole's function anchors (T11 CodeSymbol), and re-check that
// anchor like any note: the symbol's normalized-body hash at import time vs now (T11's `normalizedHash`).
import { symbolsInFile, type CodeSymbol } from '@mole/memory';
import type { AnchorMiss, AnchorResult, IntentStatus, RawIntent, SessionIntent } from './types.js';

function safeSymbolsInFile(root: string, file: string): CodeSymbol[] {
  try {
    return symbolsInFile(root, file);
  } catch {
    return [];
  }
}

function symbolsCached(root: string, file: string, cache: Map<string, CodeSymbol[]>): CodeSymbol[] {
  const hit = cache.get(file);
  if (hit) return hit;
  const found = safeSymbolsInFile(root, file);
  cache.set(file, found);
  return found;
}

/** the innermost symbol whose [startLine,endLine] contains the intent's range midpoint, smallest span wins
 * when nested (a method's intent should anchor to the method, not its enclosing class). */
function bestSymbol(symbols: CodeSymbol[], startLine: number, endLine: number): CodeSymbol | undefined {
  const mid = (startLine + endLine) / 2;
  const containing = symbols.filter((s) => s.startLine <= mid && mid <= s.endLine);
  if (containing.length === 0) return undefined;
  return containing.reduce((best, s) => (s.endLine - s.startLine < best.endLine - best.startLine ? s : best));
}

export function anchorIntents(root: string, raw: RawIntent[]): AnchorResult {
  const intents: SessionIntent[] = [];
  const misses: AnchorMiss[] = [];
  const cache = new Map<string, CodeSymbol[]>();
  for (const r of raw) {
    if (r.granularity === 'file') {
      // T76: a file-level claim (e.g. real Entire `files_touched`) has no real line range to anchor -- report
      // it as an explicit miss rather than silently anchor to whatever symbol sits at the [1,1] sentinel,
      // which would fabricate a precision the source data never provided.
      misses.push({
        source: r.source,
        sessionId: r.sessionId,
        file: r.file,
        startLine: r.startLine,
        endLine: r.endLine,
        reason: 'file-level claim only (source has no per-session line range); cannot anchor to a single function',
      });
      continue;
    }
    const symbols = symbolsCached(root, r.file, cache);
    const sym = bestSymbol(symbols, r.startLine, r.endLine);
    if (!sym) {
      misses.push({
        source: r.source,
        sessionId: r.sessionId,
        file: r.file,
        startLine: r.startLine,
        endLine: r.endLine,
        reason: symbols.length === 0 ? 'file has no indexed symbols (missing or unreadable)' : 'no symbol declaration contains this line range',
      });
      continue;
    }
    intents.push({
      source: r.source,
      sessionId: r.sessionId,
      file: r.file,
      qualifiedName: sym.qualifiedName,
      tail: sym.tail,
      startLine: r.startLine,
      endLine: r.endLine,
      agent: r.agent,
      model: r.model,
      prompt: r.prompt,
      commitSha: r.commitSha,
      hashAtImport: sym.hash,
    });
  }
  return { intents, misses };
}

/** Re-check every anchored intent against the symbol's *current* body hash (root = the tree to check against,
 * e.g. HEAD or a worktree after a later edit). stale = symbol gone, or current hash != hashAtImport. A
 * whitespace/comment-only edit never changes normalizedHash (T11's own invariant), so it never flags stale. */
export function recheckIntents(root: string, intents: SessionIntent[]): IntentStatus[] {
  const cache = new Map<string, CodeSymbol[]>();
  return intents.map((intent) => {
    const symbols = symbolsCached(root, intent.file, cache);
    const sym = symbols.find((s) => s.qualifiedName === intent.qualifiedName);
    if (!sym) return { intent, status: 'stale' as const, currentHash: undefined };
    return { intent, status: sym.hash === intent.hashAtImport ? ('fresh' as const) : ('stale' as const), currentHash: sym.hash };
  });
}
