// T80: contestable AI-drafted arguments captured from a decision record's own MADR structure (Considered
// Options + Pros and Cons of the Options), each with its exact source span (W3C Web Annotation
// TextQuoteSelector style: file + line/char range + the quoted text itself -- prior-art.md #1) and
// provenance (`Provenance` from types.ts: 'person' | 'compiler' | 'model' -- this module's extraction is
// always 'compiler', deterministic, no model call, per the task's own contract). A captured argument is
// `draft` until a person approves it (store.ts's `approveCapturedArgument`); drafts are never turned into
// a graph node (captured-loader.ts), so they can never reach packages/reasoning's evaluate() (prior-art.md
// design choice #1).
//
// Deliberately NOT a parallel store: this extends T54's `deriveAdrArgumentFramework` (claim/
// considered-option/reason, already built and tested) by adding spans on top of its own output, and adds
// ONE new deterministic parse (Pros and Cons of the Options -- T54 never read that section, prior-art.md
// #3) in the same file, rather than re-deriving the Considered-Options/Decision-Outcome structure a second
// time.
import { deriveAdrArgumentFramework, sameName } from '../argdown/derive-adr.js';
import type { Provenance } from '../types.js';

export type ArgumentRole = 'claim' | 'considered-option' | 'reason' | 'pro' | 'con';
export type ArgumentStatus = 'draft' | 'approved' | 'rejected';

/** W3C Web Annotation Data Model TextQuoteSelector shape (prior-art.md #1), plus the file + 1-based
 *  line / 0-based char range a person needs to re-find the exact quote while hand-checking a span. */
export interface TextQuoteSpan {
  file: string;
  exact: string;
  prefix?: string;
  suffix?: string;
  startLine: number;
  endLine: number;
  startChar: number;
  endChar: number;
}

export interface ArgumentProvenance {
  source: Provenance;
  /** e.g. 'mole-derive-adr' / 'mole-derive-adr-pros-cons' (compiler), or a model name -- never required to
   *  be a person's name; `approvedBy` on the row itself is where the approving PERSON is recorded. */
  detail?: string;
}

export interface CapturedArgument {
  id: string;
  decisionId: string;
  role: ArgumentRole;
  /** verbatim text at the span (same string as span.exact, kept alongside it for display without having
   *  to re-read the span back out of the quote). */
  text: string;
  span: TextQuoteSpan;
  /** ids of OTHER captured arguments (within the same decision) this one attacks -- fed into
   *  packages/reasoning's Framework once approved (captured-loader.ts), never before. */
  attacks: string[];
  /** ids this one supports -- display only, never fed into evaluate() (same T48 rule framework.ts already
   *  applies to hand-authored Argdown `supports` edges: a plain Dung AF has no support relation). */
  supports: string[];
  provenance: ArgumentProvenance;
  status: ArgumentStatus;
  approvedBy?: string;
  approvedAt?: string;
  rejectedReason?: string;
  rejectedAt?: string;
}

const BULLET_LINE = /^(\s*[-*]\s+)(.*)$/;
const PROS_CONS_HEADING = /^##\s+pros and cons of the options\s*$/i;
const NEXT_H2 = /^##\s+/;
const SUBHEADING = /^###\s+(.+?)\s*$/;
const GOOD_BAD = /^(Good|Bad|OK|Neutral)\b[,:]?\s*(.*)$/i;

function spanAt(file: string, rawLines: string[], lineIdx: number, exact: string, startChar: number): TextQuoteSpan {
  const raw = rawLines[lineIdx] ?? '';
  const endChar = startChar + exact.length;
  const prefix = raw.slice(Math.max(0, startChar - 24), startChar);
  const suffix = raw.slice(endChar, endChar + 24);
  return { file, exact, prefix: prefix || undefined, suffix: suffix || undefined, startLine: lineIdx + 1, endLine: lineIdx + 1, startChar, endChar };
}

/** The first bullet line (`- text` / `* text`) whose content, trimmed, is EXACTLY `text` -- never a fuzzy
 *  or normalized match: a span must quote the record verbatim, so a bullet that wraps across lines or was
 *  otherwise cleaned up before reaching this function (derive-adr.ts's continuation-joining) legitimately
 *  has no single-line span here, and callers skip it rather than inventing one (prior-art.md design
 *  choice #2's same rule: never fabricate what cannot be found verbatim). */
function locateBulletLine(rawLines: string[], file: string, text: string): TextQuoteSpan | undefined {
  const want = text.trim();
  for (let i = 0; i < rawLines.length; i++) {
    const m = BULLET_LINE.exec(rawLines[i] ?? '');
    if (!m) continue;
    if (m[2]!.trim() !== want) continue;
    return spanAt(file, rawLines, i, want, m[1]!.length);
  }
  return undefined;
}

/** The first line containing "chosen option:" (case-insensitive) -- the claim's own span. */
function locateChosenLine(rawLines: string[], file: string): TextQuoteSpan | undefined {
  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i] ?? '';
    if (!/chosen option:/i.test(raw)) continue;
    const exact = raw.trim();
    return spanAt(file, rawLines, i, exact, raw.indexOf(exact));
  }
  return undefined;
}

/** `## Pros and Cons of the Options` -> one `### <option>` subsection per considered option -> `- Good,
 *  because ...` / `- Bad, because ...` bullets (MADR's own shape, prior-art.md #3). Each bullet becomes a
 *  'pro' (Good/OK/Neutral) or 'con' (Bad) argument; a con ATTACKS the option its subsection names (ASPIC+
 *  rebutting reading, same attack direction T54 already uses for "reason attacks rejected option" --
 *  prior-art.md design choice #2), a pro SUPPORTS it (display only, T48's existing supports rule). A
 *  subsection whose option has no id in `optionIdByName` (the CHOSEN option: derive-adr.ts deliberately
 *  never turns it into a graph argument) still gets captured arguments, just with an empty attacks/
 *  supports list -- never a fabricated target. */
const FENCE = /^\s*```/;

function extractProsCons(decisionId: string, file: string, rawLines: string[], optionIdByName: Map<string, string>): CapturedArgument[] {
  const startIdx = rawLines.findIndex((l) => PROS_CONS_HEADING.test(l.trim()));
  if (startIdx === -1) return [];
  // real MADR records embed ```markdown example fences showing headings/bullets AS ILLUSTRATION TEXT
  // (e.g. m29-madr's own 0016 ADR, read in full for prior-art.md #3) -- a heading/bullet line found
  // inside a fence is example prose, not document structure, so both the end-of-section search and the
  // bullet scan below must skip fenced spans entirely rather than stopping/matching on their contents.
  let end = rawLines.length;
  let fenced = false;
  for (let i = startIdx + 1; i < rawLines.length; i++) {
    const line = rawLines[i] ?? '';
    if (FENCE.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    if (NEXT_H2.test(line)) {
      end = i;
      break;
    }
  }
  const out: CapturedArgument[] = [];
  let currentOptionId: string | undefined;
  let proN = 0;
  let conN = 0;
  let inFence = false;
  for (let i = startIdx + 1; i < end; i++) {
    const raw = rawLines[i] ?? '';
    if (FENCE.test(raw)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const sub = SUBHEADING.exec(raw.trim());
    if (sub) {
      currentOptionId = optionIdByName.get(sameName(sub[1]!));
      continue;
    }
    const bullet = BULLET_LINE.exec(raw);
    if (!bullet) continue;
    const content = bullet[2]!.trim();
    const kind = GOOD_BAD.exec(content);
    if (!kind) continue;
    const role: ArgumentRole = kind[1]!.toLowerCase() === 'bad' ? 'con' : 'pro';
    const startChar = bullet[1]!.length;
    const n = role === 'pro' ? ++proN : ++conN;
    out.push({
      id: `${decisionId}::${role}:${n}`,
      decisionId,
      role,
      text: content,
      span: spanAt(file, rawLines, i, content, startChar),
      attacks: role === 'con' && currentOptionId ? [currentOptionId] : [],
      supports: role === 'pro' && currentOptionId ? [currentOptionId] : [],
      provenance: { source: 'compiler', detail: 'mole-derive-adr-pros-cons' },
      status: 'draft',
    });
  }
  return out;
}

/** Deterministic extraction (no model, prior-art.md's own gate): one `CapturedArgument` per claim /
 *  considered-option / reason that T54's `deriveAdrArgumentFramework` already derives (span added on top,
 *  by re-finding its exact text as a literal line in `adrText`), plus one per Pros-and-Cons bullet
 *  (`extractProsCons`, new to T80). Every row starts life `status: 'draft'` -- a person must approve it
 *  (store.ts) before it can affect anything packages/reasoning evaluates. */
export function captureAdrArguments(decisionId: string, file: string, adrText: string): CapturedArgument[] {
  const derived = deriveAdrArgumentFramework(decisionId, adrText);
  const rawLines = adrText.split(/\r?\n/);
  const out: CapturedArgument[] = [];
  const optionIdByName = new Map<string, string>();
  for (const a of derived.arguments) {
    if (a.role === 'considered-option') optionIdByName.set(sameName(a.text), a.id);
    const span = a.role === 'claim' ? locateChosenLine(rawLines, file) : locateBulletLine(rawLines, file, a.text);
    if (!span) continue; // never fabricate a span for text we cannot find verbatim (prior-art.md #2)
    out.push({
      id: a.id,
      decisionId,
      role: a.role,
      text: a.text,
      span,
      attacks: derived.framework.attacks.filter(([from]) => from === a.id).map(([, to]) => to),
      supports: [],
      provenance: { source: 'compiler', detail: 'mole-derive-adr' },
      status: 'draft',
    });
  }
  out.push(...extractProsCons(decisionId, file, rawLines, optionIdByName));
  return out;
}
