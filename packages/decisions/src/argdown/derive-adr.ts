// T54: derive a plain Dung argument framework from an ADR's OWN MADR/Nygard sections, for the (real,
// bench-corpus-wide) case where no hand-authored `.mole/arguments/*.argdown` file exists for a decision --
// T48's `argumentFramework()` has nothing to load there, so wiring packages/reasoning (T42) into the check
// path for THAT corpus needs a second, rule-derived source of Framework args/attacks. Evaluated with the
// SAME grounded evaluator T48 already wires through (`@mole/reasoning`'s `evaluate()`), never a second
// semantics -- see tasks/T54-engine-in-check/4 log/prior-art.md for the design choice and what was rejected.
//
// Two-level shape, borrowed directly from MADR's own headings (prior-art.md #4; IBIS Position/Argument;
// ASPIC+ rebutting attack): a `## Considered Options` entry other than the chosen one is a counter-Position
// that ATTACKS the claim; a stated reason in `## Decision Outcome`'s "Chosen option: X, because <bullets>"
// ATTACKS each non-chosen considered option back, defending the claim. `## Consequences` is deliberately NOT
// fed into the evaluated attack graph (prior-art.md's rejected option (b): almost every real ADR documents
// SOME trade-off, so attacking the claim with it would defeat the claim on nearly every record -- a trivial,
// non-discriminative use of grounded semantics) -- it is carried through for display only.
import type { Framework } from '@mole/reasoning';
import { sectionsOf } from '../rationale.js';

export type AdrArgumentRole = 'claim' | 'considered-option' | 'reason';

export interface AdrArgument {
  id: string;
  role: AdrArgumentRole;
  text: string;
}

export interface AdrArgumentFramework {
  framework: Framework;
  claimId: string;
  arguments: AdrArgument[];
  /** `## Context`/`## Rationale`/`## Decision Drivers` text (rationale.ts's `sectionsOf` context bucket),
   *  descriptive only -- never an id in `framework.args`. Always carried through (never dropped): the raw
   *  ADR text a caller had before T54 included this prose, and losing it to only show Decision+Consequences
   *  is exactly the regression the M2 v2 dev run caught (see `2 insights.md`). */
  context?: string;
  /** `## Consequences` text, descriptive only -- never an id in `framework.args`, never attacked/attacking. */
  consequences?: string;
}

const CONSIDERED_OPTIONS_HEADING = /^#{2,3}\s+considered options\s*$/i;
const DECISION_OUTCOME_HEADING = /^#{2,3}\s+decision outcome\s*$/i;
const CHOSEN_OPTION_LINE = /chosen option:\s*"?([^",\n]+)"?/i;
const BULLET = /^\s*[-*]\s+(.*)$/;
const HEADING = /^#{2,3}\s+/;

/** The lines strictly between one `##`/`###` heading and the next (or EOF), trimmed. */
function headingSlice(text: string, headingRe: RegExp): string | undefined {
  const lines = text.split(/\r?\n/);
  const startIdx = lines.findIndex((l) => headingRe.test(l.trim()));
  if (startIdx === -1) return undefined;
  let end = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (HEADING.test(lines[i] ?? '')) {
      end = i;
      break;
    }
  }
  const body = lines.slice(startIdx + 1, end).join('\n').trim();
  return body || undefined;
}

function bulletsOf(block: string): string[] {
  return block
    .split(/\r?\n/)
    .map((l) => BULLET.exec(l)?.[1])
    .filter((x): x is string => !!x && x.trim().length > 0)
    .map((x) => x.trim());
}

/** The option "name" from a MADR bullet (`- **Name** -- why`, `- [Name](url) -- why`, or plain `- Name`):
 *  strip markdown emphasis/links, then take the lead phrase up to the first ` - `/` -- `/` – `/`:` separator. */
function optionNameOf(bullet: string): string {
  const cleaned = bullet.replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  const m = /^(.*?)(\s+[-\u2013\u2014:]+\s+|$)/.exec(cleaned);
  return (m?.[1] ?? cleaned).trim();
}

/** Build the Dung framework + display arguments for one decision's ADR text. `decisionId` namespaces the
 *  derived argument ids so two decisions' frameworks never collide when a caller merges several. */
export function deriveAdrArgumentFramework(decisionId: string, adrText: string): AdrArgumentFramework {
  const sections = sectionsOf(adrText);
  const claimId = `${decisionId}::claim`;
  const claimText = (sections.decision ?? adrText).trim() || adrText.trim();
  const args: AdrArgument[] = [{ id: claimId, role: 'claim', text: claimText }];
  const attacks: [string, string][] = [];

  const consideredBlock = headingSlice(adrText, CONSIDERED_OPTIONS_HEADING);
  const outcomeBlock = headingSlice(adrText, DECISION_OUTCOME_HEADING) ?? sections.decision;
  const chosenMatch = outcomeBlock ? CHOSEN_OPTION_LINE.exec(outcomeBlock) : null;
  const chosenName = chosenMatch?.[1]?.trim().toLowerCase();

  const optionIds: string[] = [];
  if (consideredBlock) {
    let n = 0;
    for (const bullet of bulletsOf(consideredBlock)) {
      const name = optionNameOf(bullet).toLowerCase();
      if (chosenName && name === chosenName) continue; // the chosen option is not its own counter-argument (exact match only -- two options can legitimately share a prefix, e.g. "MADR 2.1.2" vs "MADR 2.1.2 with Log4brains patch")
      n += 1;
      const optId = `${decisionId}::option:${n}`;
      args.push({ id: optId, role: 'considered-option', text: bullet });
      attacks.push([optId, claimId]);
      optionIds.push(optId);
    }
  }

  if (outcomeBlock) {
    // reasons live after the "Chosen option: X, because" line when present, else the whole outcome block
    const reasonSource = chosenMatch ? outcomeBlock.slice(chosenMatch.index + chosenMatch[0].length) : outcomeBlock;
    let n = 0;
    for (const bullet of bulletsOf(reasonSource)) {
      n += 1;
      const reasonId = `${decisionId}::reason:${n}`;
      args.push({ id: reasonId, role: 'reason', text: bullet });
      for (const optId of optionIds) attacks.push([reasonId, optId]);
    }
  }

  return {
    framework: { args: args.map((a) => ({ id: a.id })), attacks },
    claimId,
    arguments: args,
    context: sections.context,
    consequences: sections.consequences,
  };
}
