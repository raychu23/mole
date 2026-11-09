// T118 step B: raise routing recall on REAL ADR corpora where scopeBoost is a provable no-op (0/54 v4.1
// decisions declare a `scope:`/`in:` anchor -- see tasks/T118-router-recall/0 start.md). Real ADR prose still
// often NAMES the files/identifiers it governs in plain text (a "Key files" list, a code span referencing a
// function/type) even when the record format has no structured scope field. This module extracts those
// mentions from the ADR's own text at load time; route.ts fuses a match-rank over them via the same RRF
// mechanic scopeBoost uses (see mentionMatchCount/applyBoosts there).
//
// Prior art (tasks/T118-router-recall/4 log/prior-art.md, step-B addendum): Antoniol et al. 2002 ("Recovering
// Traceability Links between Code and Documentation", IEEE TSE) recovers doc<->code links from shared
// vocabulary/identifiers between docs and source, the direct ancestor of "does the ADR's own text already name
// this file/identifier"; Agentless (NeurIPS 2024) and SWE-agent's ACI (Yang et al. 2024) both localize via
// explicit path/identifier mentions before any embedding step; BLUiR (Saha et al. 2013) and BM25F (Robertson &
// Zaragoza 2009) treat distinct text fields (e.g. a bug report's stack trace vs free prose) with different
// weight -- motivates NOT just re-tokenizing mentioned paths/identifiers into the same BM25 bag (they would be
// drowned out by the rest of the prose) but extracting them as a separate, privileged field/signal instead.
//
// Deliberately pure (no fs/git): callers resolve `repoFiles` once per repo and pass it in, same posture as
// route.ts itself (no git dependency, unit-testable without a repo on disk).

/** Path-shaped tokens: 2+ `/`-joined segments ending in a dotted extension, e.g. `internal/controller/x.go`,
 *  `packages/decisions/src/route/route.ts`. Deliberately requires an extension (not just `a/b`) to avoid
 *  matching prose fragments like "credentials/tokens" that happen to contain a slash. */
const PATH_RE = /\b[\w.-]+(?:\/[\w.-]+)+\.[A-Za-z0-9]+\b/g;

/** Backtick-fenced code spans that look like an identifier (optionally a call, `foo()`), e.g. `knownProviders`,
 *  `buildProviderEntry()`. Markdown's own convention for "this is code, not prose" -- the same signal a human
 *  reviewer uses to recognize a named symbol in an ADR. */
const IDENT_RE = /`([A-Za-z_][\w]*(\(\))?)`/g;

const STOPWORD_IDENTS = new Set(['true', 'false', 'null', 'none', 'type', 'path', 'name', 'value', 'data']);

/** Does `tok` look like an actual code identifier, not just an ordinary English word a writer happened to put
 *  in backticks for emphasis or to mark a field/concept name (e.g. `provider`, `domain`, `merge`, `token`,
 *  `role` -- all real backtick-fenced spans found across MULTIPLE unrelated ADRs in the same real repo during
 *  this task's own dev-recall measurement; counting them as identifier matches actively HURT recall@1 on v4.1
 *  dev, 0.75 -> 0.594, by promoting the wrong decision whenever its text happened to share one of these common
 *  words -- see 0 start.md "found (step B)"). A camelCase/PascalCase transition, an underscore (snake_case /
 *  SCREAMING_SNAKE), or call-parens in the original text are all strong, low-ambiguity signals that the token
 *  names a specific symbol; a single all-lowercase word is not. */
function looksLikeIdentifier(tok: string, hadParens: boolean): boolean {
  if (hadParens) return true; // `foo()` -- a call is unambiguous regardless of casing
  if (tok.includes('_')) return true; // snake_case / SCREAMING_SNAKE_CASE
  if (/[a-z][A-Z]/.test(tok)) return true; // camelCase / PascalCase internal transition
  if (/^[A-Z][a-z]/.test(tok) && tok.length >= 5) return true; // PascalCase-shaped even with no further transition (e.g. `Claw`, `Route` alone is still borderline -- length floor keeps it conservative)
  return false;
}

/** Which of an ADR's own text's path-shaped mentions actually resolve to a real file in the repo (`repoFiles`,
 *  caller-supplied relative paths). A path mention that resolves to nothing is noise (e.g. an external URL
 *  fragment, a YAML example path that was never a real repo file) and is dropped -- never a guess. */
export function extractMentionedPaths(adrText: string, repoFiles: string[] | Set<string>): string[] {
  const repoSet = repoFiles instanceof Set ? repoFiles : new Set(repoFiles);
  const found = new Set<string>();
  for (const m of adrText.matchAll(PATH_RE)) {
    const candidate = m[0].replace(/^\.\//, '');
    if (repoSet.has(candidate)) found.add(candidate);
  }
  return [...found];
}

/** Backtick-coded identifiers the ADR text names, filtered to a minimum length, a small stopword list of
 *  markdown-code-span false positives, AND (see looksLikeIdentifier) a code-shape check -- an ordinary English
 *  word in backticks (`provider`, `domain`, `merge`) is prose emphasis, not a symbol reference, and must not be
 *  treated as one: it would match near-indiscriminately across unrelated decisions that merely share vocabulary. */
export function extractMentionedIdentifiers(adrText: string): string[] {
  const found = new Set<string>();
  for (const m of adrText.matchAll(IDENT_RE)) {
    const hadParens = !!m[2];
    const tok = m[1]!.replace(/\(\)$/, '');
    if (tok.length < 4 || STOPWORD_IDENTS.has(tok.toLowerCase())) continue;
    if (!looksLikeIdentifier(tok, hadParens)) continue;
    found.add(tok);
  }
  return [...found];
}

/** Corpus-level common-mention filter (BM25F/IDF prior art: a term that appears in nearly every document in a
 *  collection carries almost no discriminating power and should be down-weighted or dropped, not treated as a
 *  privileged match for every document it touches). Self-review found this is a REAL bug, not just theory: a
 *  repo's project/product name (e.g. `OpenClaw`, a PascalCase token that otherwise looks exactly like a real
 *  identifier) is named in nearly every one of that repo's ADRs AND appears in nearly every diff comment too --
 *  counting it as a "mention match" actively promoted the WRONG decision on a real v4.1 dev case
 *  (v4-claw-0002-violate: ADR-0001's `OpenClaw` mention matched the diff's own "OpenClaw itself wrote..."
 *  comment and outranked the true decision, ADR-0002). Drops any mentioned path or identifier that appears in
 *  more than `maxDocFraction` of the corpus's own decisions (default 15%, floor of 1 decision so a tiny corpus
 *  still allows a term unique to exactly one decision through). Applied identically to mentionPaths and
 *  mentionIdentifiers -- the same over-broad-term risk applies to either kind of mention. */
export function dropCommonMentions(perDoc: Array<{ id: string; mentions: string[] }>, maxDocFraction = 0.15): Map<string, string[]> {
  const totalDocs = perDoc.length;
  const docFreq = new Map<string, number>();
  for (const { mentions } of perDoc) {
    for (const m of new Set(mentions)) docFreq.set(m, (docFreq.get(m) ?? 0) + 1);
  }
  const maxDf = Math.max(1, Math.floor(totalDocs * maxDocFraction));
  const out = new Map<string, string[]>();
  for (const { id, mentions } of perDoc) {
    out.set(
      id,
      mentions.filter((m) => (docFreq.get(m) ?? 0) <= maxDf),
    );
  }
  return out;
}
