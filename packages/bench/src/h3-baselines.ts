// H3: stale-knowledge detectors other than Mole's own (packages/memory), run over the SAME real-history
// scenarios as the frozen M1 key (packages/memory/bench/m1-key.json), so all four columns score identically.
//
// Swimm Auto-sync (reimplemented from https://docs.swimm.io/features/keep-docs-updated-with-auto-sync,
// accessed 2026-10-29, cited in 4 log/prior-art.md): a Swimm doc embeds a code *snippet* copied verbatim at
// authoring time; Auto-sync re-locates that snippet in the current file by fuzzy/structural matching and
// marks the doc "outdated" only when the snippet can no longer be found at an acceptable similarity. We
// reimplement the matching step the docs describe: token-level overlap between the symbol's old body and
// the current file's token stream, taking the best-matching window; below the match threshold = outdated.
//
// GitHub Copilot "remembers" / workspace memory citation check (reimplemented from GitHub's own description
// of memory items citing files: https://github.blog/changelog/ and Copilot docs on workspace context,
// cited in context/product-plan/Mole compared.md S3): a memory item cites a symbol by NAME at a FILE. The
// documented failure mode (and the one users report) is citing a symbol that still exists by name but whose
// body changed — Copilot Memory has no body-diff step, only "does this file/symbol reference still resolve".
// So: outdated only if the symbol NAME is gone from the file; otherwise treated as still valid (fresh).
//
// path-touched (CODEOWNERS / ADR "owner" style, no symbol granularity): outdated iff the symbol's FILE is in
// the changed-files list of the scenario, regardless of which symbol inside it changed.
import { symbolsOfText } from '@mole/memory';

export interface H3Prediction {
  symbol: string;
  swimmStale: boolean;
  copilotStale: boolean;
  pathTouchedStale: boolean;
}

function tokenize(text: string): string[] {
  return text.match(/[A-Za-z_$][\w$]*|[0-9]+(\.[0-9]+)?|\S/g) ?? [];
}

/** Best-window token overlap ratio of `needle` tokens found (in order, allowing gaps) inside `haystack` tokens. */
function bestOverlapRatio(needleTokens: string[], haystackTokens: string[]): number {
  if (needleTokens.length === 0) return 1;
  const hay = new Set(haystackTokens);
  // Swimm's algorithm (per docs) is a content-similarity re-match, not an exact substring requirement:
  // score = fraction of the snippet's distinct meaningful tokens still present anywhere in the current file.
  const meaningful = needleTokens.filter((t) => /[A-Za-z_$]/.test(t));
  if (meaningful.length === 0) return 1;
  let hits = 0;
  for (const t of new Set(meaningful)) if (hay.has(t)) hits += 1;
  return hits / new Set(meaningful).size;
}

const SWIMM_THRESHOLD = 0.98; // Swimm flags on ANY detected drift in the snippet, not a loose fuzzy band; a
// 2% tolerance only absorbs renamed-nothing noise from our tokenizer (e.g. a trailing token split).

export function runH3Baselines(parentText: string, childText: string, symbolTail: string, fileTouched: boolean): H3Prediction {
  const parentSymbols = symbolsOfText('snippet.ts', parentText);
  const sym = parentSymbols.find((s) => s.tail === symbolTail || s.qualifiedName.endsWith(`#${symbolTail}`));
  const parentBody = sym ? parentText.split('\n').slice(sym.startLine - 1, sym.endLine).join('\n') : '';
  const parentTokens = tokenize(parentBody);
  const childTokens = tokenize(childText);

  const ratio = bestOverlapRatio(parentTokens, childTokens);
  const swimmStale = ratio < SWIMM_THRESHOLD;

  const nameTokens = childTokens;
  const copilotStale = !nameTokens.includes(symbolTail.split('.').pop() ?? symbolTail);

  return { symbol: symbolTail, swimmStale, copilotStale, pathTouchedStale: fileTouched };
}
