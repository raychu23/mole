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
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { draftChecksFor, hermesLlmClient } from '/Users/a1/Desktop/CS Code/Project/Mole/packages/decisions/dist/src/compile/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const TASK = resolve(here, '..');
const CASES = JSON.parse(readFileSync(resolve(TASK, 'cases_h2_v2.json'), 'utf8'));

const MAX_MATCH_LINE = 2000; // packages/decisions/src/check/options.ts's own bound, reused identically

function addedLines(diff) {
  const out = [];
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++')) continue;
    if (line.startsWith('+')) out.push(line.slice(1));
  }
  return out;
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

function checkStep(compiled) {
  const byId = new Map(compiled.map((d) => [d.decision, d]));
  const rows = [];
  for (const c of CASES) {
    const d = byId.get(c.adr_id);
    const patterns = (d?.match ?? []).filter((m) => {
      try { new RegExp(m.pattern); return true; } catch { return false; }
    });
    if (!patterns.length) {
      rows.push({ id: c.id, repo: c.repo, adr_id: c.adr_id, label_final: c.label_final, abstain: true, reason: d?.error ? `compile failed: ${d.error}` : 'compiler drafted no match: pattern for this ADR', predictedViolate: null });
      continue;
    }
    const lines = addedLines(c.diff).filter((l) => l.length <= MAX_MATCH_LINE);
    const hitPatterns = [];
    for (const p of patterns) {
      const re = new RegExp(p.pattern);
      if (lines.some((l) => re.test(l))) hitPatterns.push(p.pattern);
    }
    rows.push({ id: c.id, repo: c.repo, adr_id: c.adr_id, label_final: c.label_final, abstain: false, predictedViolate: hitPatterns.length > 0, hit_patterns: hitPatterns, n_patterns_drafted: patterns.length });
  }
  return rows;
}

async function main() {
  const compiled = await compileStep();
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
  const outPath = resolve(here, 'arm_t46_cascade_v2.json');
  writeFileSync(outPath, JSON.stringify(out, null, 1));
  console.log(`decisions: ${nDecisions}, abstained ${nDecisionsAbstained}`);
  console.log(`cases: ${rows.length}, abstained ${nAbstainCases}`);
  console.log(`wrote ${outPath}`);
}

main();
