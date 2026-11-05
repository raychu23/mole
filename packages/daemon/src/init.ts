// `mole init` (T96, ux-research #3 + #5; MADR 4 + adrkit compat added T100/D71): the first-run path a new
// user finds from `mole --help` / the README quickstart. Scaffolds `.mole/decisions/` with a real MADR 4
// record — id/title/status/date/decision-makers (graph.ts frontMatter() + loadMoleDecisions(), T100) — plus
// adrkit's `affects` field (github.com/mbeacom/adrkit) and Mole's own `rules:` extension, so any MADR-aware
// tool (log4brains, adr-tools, adrkit) reads the scaffolded file too (D71, context/product-plan/
// 7 Build vs take.md §2: "MADR + adrkit's typed `affects` ... instant compatibility with every ADR tool").
// One example decision with one example crisp rule, so `mole rules` and `mole demo` have something to show
// immediately. Idempotent: never overwrites a file that already exists (same promise as `git init` /
// `npm init` — re-running is always safe). `--dry-run` prints the plan and writes nothing. `--json` for
// scripting.
//
// Optionally (the `--agents-snippet` family) appends ONE precedence sentence — the exact sentence already
// published in scripts/public-README.md's "AGENTS.md / CLAUDE.md precedence" section — to the repo's AGENTS.md
// and/or CLAUDE.md, wrapped in HTML-comment markers so a later `mole init` finds it and never duplicates it;
// creates AGENTS.md (not CLAUDE.md) if neither file exists, since AGENTS.md is the cross-tool convention
// (agents.md spec, https://agents.md). Evidence cited for why one sentence can matter: arXiv 2610.30571 (a
// 320-run study of Claude Code and Codex CLI) measured a single precedence sentence raising the share of
// choices that followed the existing *code* over a stale instruction file from 4.2% to 91.4%. That study
// tested code-vs-instruction-file precedence, not decision-vs-instruction-file precedence — same mechanism
// (a written precedence rule in the file agents already treat as instructions), unmeasured for Mole decisions.
//
// Prior art (fetched 2026-11-04, consulted for the init UX): `adr-tools adr init [DIR]` — one command, creates
// the ADR directory and writes ADR 0001 ("Record architecture decisions") as the first record, every later
// command idempotent against an existing directory (https://github.com/npryce/adr-tools, README "Initialization").
// `log4brains init` — interactive first run (inquirer prompts for project name, ADR dir), writes `.log4brains.yml`
// + a starter decisions folder, safe to re-run (https://github.com/thomvaill/log4brains, "Getting started").
// MADR template repo — ships `docs/decisions/adr-template.md` plus one filled example ADR so a new user has a
// worked example to copy, not a blank form (https://github.com/adr/madr, `template/`). `agents.md` spec — a
// single plain-markdown `AGENTS.md` at the repo root is the convention tools (Claude Code, Codex, Cursor,
// Gemini CLI) already read for instructions (https://agents.md). `git init` / `npm init` — both refuse to
// clobber existing state (`git init` on an existing repo is a safe no-op reinit; `npm init` / `npm init -y`
// never overwrites an existing package.json) — `mole init`'s idempotence follows the same norm.
import { createInterface } from 'node:readline/promises';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const EXAMPLE_DECISION_ID = 'D001-example-decision';
export const EXAMPLE_DECISION_REL = `.mole/decisions/${EXAMPLE_DECISION_ID}.md`;

export const EXAMPLE_DECISION_TEXT = `---
id: ${EXAMPLE_DECISION_ID}
title: Example decision -- replace me with your team's first real one
status: accepted
date: ${new Date().toISOString().slice(0, 10)}
decision-makers: [your-name]
affects:
  - type: path
    pattern: src/ui/**
rules:
  - forbid: import
    from: src/ui/
    to: src/db/
    why: UI code must go through a service layer, not the database directly (example only, edit or delete)
---

## Context and Problem Statement

This is an example \`.mole/decisions\` record: plain YAML front matter + a markdown body, in the MADR 4 format
(\`status\`/\`date\`/\`decision-makers\`/\`consulted\`/\`informed\`, https://github.com/adr/madr) plus adrkit's
\`affects\` field (github.com/mbeacom/adrkit) naming what the decision governs -- any MADR-aware tool
(log4brains, adr-tools, adrkit itself) can read this file; \`mole decisions\`, \`mole rules\` and \`mole check\`
read the exact same fields, plus Mole's own \`rules:\` extension above.

<!-- This is an optional element (MADR 4 "Decision Drivers"). Feel free to remove. -->
## Decision Drivers

* UI code should not be able to reach the database directly, bypassing the service layer

## Considered Options

* Enforce the boundary by convention/code review only (no automated check)
* Enforce it with a Mole \`rules:\` block (chosen -- see front matter above)

## Decision Outcome

Chosen option: enforce the boundary with the \`rules:\` block above, because \`mole rules\` then fails on any
import matching the \`from:\`/\`to:\` paths given there, so the convention never silently rots, and (in Claude
Code) the Stop hook runs the identical check at the end of every agent session. Replace this whole record with
your team's first real decision (\`mole decision new --id D002 --title "..." --body "..."\`), or just edit/
delete this file -- it is not read by anything else and nothing breaks if you remove it.

<!-- This is an optional element (MADR 4 "Consequences"). Feel free to remove. -->
### Consequences

* Good, because \`mole rules\` (and the Claude Code Stop hook) now catches the forbidden import automatically
* Bad, because a legitimate exception needs its own decision/rule change, not a one-off bypass

Full \`rules:\` syntax: \`docs/decisions-and-rules.md\`. A 30-second worked example with a deliberately broken
rule: \`mole demo\`.
`;

export const AGENTS_MARKER_START = '<!-- mole:agents-precedence:start -->';
export const AGENTS_MARKER_END = '<!-- mole:agents-precedence:end -->';
export const PRECEDENCE_SENTENCE =
  'When a `.mole/decisions/*.md` rule and this file\'s guidance disagree, the Mole decision wins; treat a ' +
  'Mole Stop-hook violation (`decision: "block"`) the same as a failing test -- fix the code before finishing.';

function agentsSnippet(): string {
  return `${AGENTS_MARKER_START}\n${PRECEDENCE_SENTENCE}\n${AGENTS_MARKER_END}\n`;
}

/** Whitespace/line-ending-insensitive: CRLF normalized to LF, runs of whitespace collapsed, so a sentence
 *  re-wrapped or saved with different line endings still matches. */
function normalizeWs(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
}

const NORMALIZED_SENTENCE = normalizeWs(PRECEDENCE_SENTENCE);

/** True if the marker OR the precedence sentence's own text is already present (review FAIL #1: an
 *  AGENTS.md/CLAUDE.md that already states the sentence, typed by hand without the HTML-comment markers,
 *  must not get a second copy -- detect the text itself, not only the marker we add. */
function hasMarker(text: string): boolean {
  if (text.includes(AGENTS_MARKER_START)) return true;
  return normalizeWs(text).includes(NORMALIZED_SENTENCE);
}

/** The file's own line ending (CRLF if it uses CRLF anywhere, else LF), so an appended block never mixes
 *  endings with the rest of the file. */
function detectEol(text: string): '\r\n' | '\n' {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

function toEol(text: string, eol: '\r\n' | '\n'): string {
  return eol === '\r\n' ? text.replace(/\n/g, '\r\n') : text;
}

/** Append (never duplicate) the precedence snippet; create the file with just the snippet if it is new. */
function withSnippet(existingText: string | undefined): string {
  if (existingText === undefined) return `${agentsSnippet()}`;
  if (hasMarker(existingText)) return existingText; // already there (marker or bare sentence text): no-op
  const eol = detectEol(existingText);
  const sep = existingText.endsWith('\n') ? eol : eol + eol;
  return `${existingText}${sep}${toEol(agentsSnippet(), eol)}`;
}

export type InitPlanItem = { path: string; action: 'create' | 'skip-exists' | 'append-snippet' | 'skip-has-snippet'; reason?: string };
export type InitResult = { ok: boolean; dryRun: boolean; items: InitPlanItem[]; agentsSnippet: boolean; messages: string[] };

async function promptYesNo(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${question} (y/N) `)).trim().toLowerCase();
    return answer === 'y' || answer === 'yes';
  } catch {
    // Ctrl-D/EOF on the prompt: readline/promises' question() rejects instead of resolving with ''.
    // Treat it as the printed default (No) rather than letting the rejection abort the whole `mole init`
    // (review FAIL #2) -- the decision scaffold must still get written.
    return false;
  } finally {
    rl.close();
  }
}

/** Resolves whether to append the AGENTS.md/CLAUDE.md precedence snippet, per the flag/TTY rules (T96):
 *  `--agents-snippet` forces on, `--no-agents-snippet` forces off (either skips the prompt); otherwise, in an
 *  interactive TTY, ask (default No); `--yes` answers every prompt with its default, so a scripted
 *  `mole init --yes` never touches AGENTS.md/CLAUDE.md unless `--agents-snippet` is also given. Non-interactive
 *  with no flag at all (e.g. CI) also defaults to off -- `mole init` never edits another file unasked. */
async function resolveAgentsSnippet(flags: Record<string, string | true>, isTTY: boolean): Promise<boolean> {
  if (flags['no-agents-snippet'] === true || flags['agents-snippet'] === 'false') return false; // explicit off always wins
  if (flags['agents-snippet'] === true || flags['agents-snippet'] === 'true') return true;
  if (flags.yes) return false; // --yes accepts the (No) default without a prompt
  if (isTTY && process.stdin.isTTY) return promptYesNo('Add a one-sentence Mole-decision precedence note to AGENTS.md/CLAUDE.md?');
  return false;
}

export async function planInit(root: string, agentsSnippetOn: boolean): Promise<InitPlanItem[]> {
  const items: InitPlanItem[] = [];
  const decisionPath = join(root, EXAMPLE_DECISION_REL);
  items.push(existsSync(decisionPath) ? { path: EXAMPLE_DECISION_REL, action: 'skip-exists', reason: 'already exists' } : { path: EXAMPLE_DECISION_REL, action: 'create' });
  if (agentsSnippetOn) {
    const agentsPath = join(root, 'AGENTS.md');
    const claudePath = join(root, 'CLAUDE.md');
    const agentsExists = existsSync(agentsPath);
    const claudeExists = existsSync(claudePath);
    if (!agentsExists && !claudeExists) {
      items.push({ path: 'AGENTS.md', action: 'create' }); // neither exists: create AGENTS.md (agents.md convention)
    } else {
      for (const [rel, abs, exists] of [
        ['AGENTS.md', agentsPath, agentsExists],
        ['CLAUDE.md', claudePath, claudeExists],
      ] as const) {
        if (!exists) continue;
        const text = readFileSync(abs, 'utf8');
        items.push(hasMarker(text) ? { path: rel, action: 'skip-has-snippet', reason: 'precedence sentence already present' } : { path: rel, action: 'append-snippet' });
      }
    }
  }
  return items;
}

function applyItem(root: string, item: InitPlanItem): void {
  const abs = join(root, item.path);
  if (item.path === EXAMPLE_DECISION_REL && item.action === 'create') {
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, EXAMPLE_DECISION_TEXT, { flag: 'wx' }); // 'wx': fail loudly instead of racing past an idempotence check
    return;
  }
  if (item.path === 'AGENTS.md' && item.action === 'create') {
    writeFileSync(abs, withSnippet(undefined), { flag: 'wx' });
    return;
  }
  if (item.action === 'append-snippet') {
    const existing = readFileSync(abs, 'utf8');
    writeFileSync(abs, withSnippet(existing));
    return;
  }
}

export async function runInit(root: string, flags: Record<string, string | true>): Promise<InitResult> {
  const dryRun = flags['dry-run'] === true;
  const agentsSnippetOn = await resolveAgentsSnippet(flags, process.stdout.isTTY === true);
  const items = await planInit(root, agentsSnippetOn);
  if (!dryRun) {
    for (const item of items) {
      if (item.action === 'create' || item.action === 'append-snippet') applyItem(root, item);
    }
  }
  const messages: string[] = [];
  for (const item of items) {
    const verb = dryRun
      ? { create: 'would create', 'skip-exists': 'exists, skipping', 'append-snippet': 'would append the precedence sentence to', 'skip-has-snippet': 'already has the precedence sentence, skipping' }[item.action]
      : { create: 'created', 'skip-exists': 'exists, skipped', 'append-snippet': 'appended the precedence sentence to', 'skip-has-snippet': 'already has the precedence sentence, skipped' }[item.action];
    messages.push(`${verb} ${item.path}`);
  }
  return { ok: true, dryRun, items, agentsSnippet: agentsSnippetOn, messages };
}

export async function initCli(_pos: string[], flags: Record<string, string | true>, root: string): Promise<number> {
  const result = await runInit(root, flags);
  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }
  console.log(result.dryRun ? 'mole init --dry-run (nothing written):' : 'mole init:');
  for (const m of result.messages) console.log(`  ${m}`);
  const createdDecision = result.items.some((i) => i.path === EXAMPLE_DECISION_REL && i.action === 'create');
  if (!result.dryRun && createdDecision) {
    console.log('\nNext: run `mole rules` to see the example decision checked, or `mole demo` for a 30-second');
    console.log('walkthrough with a deliberately broken rule. Edit or delete the example decision whenever you');
    console.log('are ready to write your own (`mole decision new --id D002 --title "..." --body "..."`).');
  }
  return 0;
}
