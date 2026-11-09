#!/usr/bin/env node
// T110 (Q4) v2 T46 cascade arm: Mole's OWN T46 compile-at-capture + zero-LLM check-time baseline, added
// per this review round's arm list (not run in v1). Same pattern as
// tasks/T109-b2-baselines/4 log/scripts/t46_cascade_arm_v3.mjs, pointed at the v2 11-case real-history set.
//
//   1. COMPILE (offline, amortized, ONE hermes call per unique ADR, same real T46 code via the built
//      dist/, not reimplemented): draftChecksFor(hermesLlmClient(), {decisionText: <the ADR's own real
//      text>}). 2 unique ADRs here (adr003, adr004).
//   2. CHECK (zero model calls, deterministic): apply the compiled `match:` patterns to each case's diff
//      ADDED lines, same per-line test cascade.ts's isCrisp/pr-check.ts uses, same MAX_MATCH_LINE bound.
//
// FIX (2026-11-08, v2 review FAIL -- see DEFECT_V2_FILESCOPE.md): the original checkStep() applied every
// compiled `match:` pattern to ALL added lines in a case's diff, ignoring the pattern's own `in:` glob
// scope entirely. Real Mole (packages/decisions/src/check/pr-check.ts:318) scopes a content anchor to
// files its `in:` glob covers BEFORE testing the pattern:
//   if (f.newPath === null || (c.inRe && !c.inRe.test(f.newPath))) continue;
// This fix mirrors that line exactly, file-by-file, reusing Mole's own glob->regex helper
// (packages/decisions/src/check/options.ts's globToRegExp, exported via check/index.js) rather than
// writing a new one. See run/test_file_scope_fix.mjs for a standalone demonstration using a real case
// diff (h2v2-bs-18540-fixed: an `export * from './types'` line added to index.ts no longer matches
// adr004's non-index-scoped pattern, `in: "**/!(index).{ts,tsx}"`).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { draftChecksFor, hermesLlmClient } from '/Users/a1/Desktop/CS Code/Project/Mole-worktrees/T117-glob-negation/packages/decisions/dist/src/compile/index.js';
import { globToRegExp } from '/Users/a1/Desktop/CS Code/Project/Mole-worktrees/T117-glob-negation/packages/decisions/dist/src/check/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const TASK = resolve(here, '..');
const CASES = JSON.parse(readFileSync(resolve(TASK, 'cases_h2_v2.json'), 'utf8'));

const MAX_MATCH_LINE = 2000; // packages/decisions/src/check/options.ts's own bound, reused identically

// Parses a unified diff into per-file added lines, same unit pr-check.ts's `changed` (ParsedFile[]) scopes
// a content anchor against: `newPath` (null for a deletion, i.e. `+++ /dev/null`) and that file's own added
// lines only. Mirrors pr-check.ts:318's scoping, not a new diff parser design.
export function filesWithAddedLines(diff) {
  const files = [];
  let current = null;
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      current = { newPath: null, lines: [] };
      files.push(current);
      continue;
    }
    if (line.startsWith('+++ ')) {
      if (!current) continue;
      const p = line.slice(4).trim();
      current.newPath = p === '/dev/null' ? null : p.replace(/^b\//, '');
      continue;
    }
    if (line.startsWith('+') && current) {
      current.lines.push(line.slice(1));
    }
  }
  return files;
}

async function compileStep() {
  const llm = hermesLlmClient(); // real `hermes -z ... -m claude-sonnet-5 --provider anthropic --safe-mode` call
  const byAdr = new Map();
  for (const c of CASES) {
    if (byAdr.has(c.adr_id)) continue;
    byAdr.set(c.adr_id, c.decision_text);
  }
  const ids = [...byAdr.keys()];
  console.log(`compiling ${ids.length} unique real ADRs...`);
  const compiled = [];
  for (const [i, id] of ids.entries()) {
    const decisionText = byAdr.get(id);
    process.stdout.write(`  [${i + 1}/${ids.length}] ${id} ... `);
    const t0 = Date.now();
    let draft;
    try {
      draft = await draftChecksFor(llm, {
        id, title: id, recordFile: 'n/a (external ADR, not a .mole record; T110 v2 bench harness)',
        decisionText, existingScope: [], existingMatch: [],
      });
    } catch (e) {
      console.log(`FAILED: ${e.message}`);
      compiled.push({ decision: id, error: String(e.message), match: [], rules: [], scope: [], usage: {}, ms: Date.now() - t0 });
      continue;
    }
    const ms = Date.now() - t0;
    console.log(`match=${draft.match.length} rules=${draft.rules.length} scope=${draft.scope.length} cost=$${(draft.usage.costUsd ?? 0).toFixed(4)} (${ms}ms)`);
    compiled.push({ decision: id, title: draft.title ?? id, match: draft.match, rules: draft.rules, scope: draft.scope, guardTests: draft.guardTests, usage: draft.usage, raw: draft.raw, ms });
  }
  const outPath = resolve(here, 'compiled_adrs_v2.json');
  writeFileSync(outPath, JSON.stringify({ compiledAt: new Date().toISOString(), n_decisions: ids.length, compiled }, null, 1));
  console.log(`wrote ${outPath}`);
  return compiled;
}

export function checkStep(compiled) {
  const byId = new Map(compiled.map((d) => [d.decision, d]));
  const rows = [];
  for (const c of CASES) {
    const d = byId.get(c.adr_id);
    const patterns = (d?.match ?? [])
      .filter((m) => {
        try { new RegExp(m.pattern); return true; } catch { return false; }
      })
      .map((m) => ({ pattern: m.pattern, in: m.in, inRe: m.in ? globToRegExp(m.in) : undefined }));
    if (!patterns.length) {
      rows.push({ id: c.id, repo: c.repo, adr_id: c.adr_id, label_final: c.label_final, abstain: true, reason: d?.error ? `compile failed: ${d.error}` : 'compiler drafted no match: pattern for this ADR', predictedViolate: null });
      continue;
    }
    const files = filesWithAddedLines(c.diff);
    const hitPatterns = [];
    for (const p of patterns) {
      const re = new RegExp(p.pattern);
      // pr-check.ts:318 scoping, mirrored exactly: a file with no newPath (deletion) or one the pattern's
      // `in:` glob does not cover is never tested against this pattern.
      const matched = files.some((f) => {
        if (f.newPath === null || (p.inRe && !p.inRe.test(f.newPath))) return false;
        return f.lines.some((l) => l.length <= MAX_MATCH_LINE && re.test(l));
      });
      if (matched) hitPatterns.push(p.pattern);
    }
    rows.push({ id: c.id, repo: c.repo, adr_id: c.adr_id, label_final: c.label_final, abstain: false, predictedViolate: hitPatterns.length > 0, hit_patterns: hitPatterns, n_patterns_drafted: patterns.length });
  }
  return rows;
}

async function main() {
  // REUSE, do not recompile: compiled_adrs_v2.json already has the 2 real compiled ADRs from the original
  // run (frozen patterns, no model call here) -- this re-run is a deterministic checkStep() fix only.
  const compiled = JSON.parse(readFileSync(resolve(here, 'compiled_adrs_v2.json'), 'utf8')).compiled;
  const rows = checkStep(compiled);
  const nDecisions = compiled.length;
  const nDecisionsAbstained = compiled.filter((d) => !(d.match ?? []).length).length;
  const totalCompileCost = compiled.reduce((s, d) => s + (d.usage?.costUsd ?? 0), 0);
  const nAbstainCases = rows.filter((r) => r.abstain).length;
  const out = {
    n_decisions_total: nDecisions, n_decisions_abstained: nDecisionsAbstained,
    decision_coverage: nDecisions ? +(1 - nDecisionsAbstained / nDecisions).toFixed(4) : 0,
    n_cases: CASES.length, n_abstained: nAbstainCases,
    case_coverage: +(1 - nAbstainCases / rows.length).toFixed(4),
    compile_cost_total_usd: +totalCompileCost.toFixed(4),
    compile_cost_mean_per_decision_usd: nDecisions ? +(totalCompileCost / nDecisions).toFixed(4) : 0,
    check_cost_per_case_usd: 0,
    rows,
  };
  const outPath = resolve(here, 'arm_t46_cascade_v2_T117.json');
  writeFileSync(outPath, JSON.stringify(out, null, 1));
  console.log(`decisions: ${nDecisions}, abstained ${nDecisionsAbstained}`);
  console.log(`cases: ${rows.length}, abstained ${nAbstainCases}`);
  console.log(`wrote ${outPath}`);
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) main();
