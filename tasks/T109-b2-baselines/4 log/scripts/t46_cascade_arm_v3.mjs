#!/usr/bin/env node
// M2 v3 baseline (d): Mole's OWN T46 cascade -- compile-at-capture + zero-LLM check time. T109-b2-baselines / Q2,
// F1 fix (review deleg_ebac273d task 1: "the grep-over-ADR-prose linter is a strawman for 'why not a linter?'").
//
// Reuses the REAL T46 code (packages/decisions/src/compile/draft.ts's draftChecksFor, the same compiler
// tasks/T46-decision-check-compiler/4 log/bench/compile_adrs.mjs used, via the built dist/, not reimplemented):
//   1. COMPILE (offline, amortized, ONE hermes call per unique ADR -- never per case, never seeing a diff or a
//      label): draftChecksFor(hermesLlmClient(), {decisionText: <the ADR's own text>}) drafts `match:` content-
//      anchor regexes (+ scope/rules/guardTests, reported but not applied here -- see NOT RUN below). This is the
//      SAME prompt/parsing T46's compile_adrs.mjs used on Backstage's own ADRs, now pointed at v3's 31 real
//      held-out ADRs (adr_id="none" distractor cases excluded -- same convention linter_arm_v3.py already uses:
//      a distractor case has no decision governing it to compile for).
//   2. CHECK (zero model calls, deterministic): for each held-out case, apply the compiled `match:` patterns to
//      the diff's ADDED lines with the SAME per-line test Mole's real cascade uses at check time
//      (packages/decisions/src/cascade/cascade.ts's `isCrisp`, backed by pr-check.ts's `c.re.test(line)` over
//      lines <= options.ts's MAX_MATCH_LINE): a content-anchor hit decides 'violates' outright, crisp, no
//      escalation. A decision with NO drafted match pattern is reported as abstain (nothing compiled to check),
//      same semantics as linter_arm_v3.py's abstain path, not a score of 0.
//
// What this does NOT do (NOT RUN, reasons logged, not hidden):
//   - rules: (dependency-cruiser import/call-graph forbids) -- v3's case set is unified diffs from external repos,
//     not a checked-out working tree with a resolvable module graph; prior-art.md #3/#4 already found 0 of v3's 51
//     ADRs encode an import-graph constraint in the first place, so this is expected to add nothing even if it
//     could run. Reported as NOT RUN, not silently skipped.
//   - the LLM escalation tier (cascade.ts's second call for a scope-anchor-only, non-crisp hit): the task asks for
//     "zero-LLM checks at check time" for this arm specifically, so a decision whose drafted match pattern finds
//     no hit is reported predictedViolate=false (compliant), not escalated -- this is a deliberate scope
//     difference from Mole's shipped cascade (which WOULD escalate there), stated here, not hidden.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { draftChecksFor, hermesLlmClient } from '../../../../../../../packages/decisions/dist/src/compile/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const V3 = resolve(here, '..');
const CASES = JSON.parse(readFileSync(join(V3, 'cases_with_labels_v3.json'), 'utf8'));
const HELDOUT = CASES.filter((c) => c.split === 'heldout');

const MAX_MATCH_LINE = 2000; // packages/decisions/src/check/options.ts's own bound, reused identically

function titleOf(adrId, decisionText) {
  const m = /title:\s*'?([^'\n]+)'?/.exec(decisionText) ?? /^#\s*(.+)$/m.exec(decisionText);
  return m ? m[1].trim() : adrId;
}

function addedLines(diff) {
  const out = [];
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++')) continue;
    if (line.startsWith('+')) out.push(line.slice(1));
  }
  return out;
}

async function compileStep() {
  const llm = hermesLlmClient(); // real `hermes -z ... -m claude-sonnet-5 --provider anthropic --safe-mode` CLI call
  const byAdr = new Map();
  for (const c of HELDOUT) {
    if (c.adr_id === 'none' || byAdr.has(c.adr_id)) continue;
    byAdr.set(c.adr_id, c.decision_text);
  }
  const ids = [...byAdr.keys()];
  console.log(`compiling ${ids.length} unique real ADRs (distractor adr_id="none" excluded)...`);
  const compiled = [];
  for (const [i, id] of ids.entries()) {
    const decisionText = byAdr.get(id);
    process.stdout.write(`  [${i + 1}/${ids.length}] ${id} ... `);
    const t0 = Date.now();
    let draft;
    try {
      draft = await draftChecksFor(llm, {
        id,
        title: titleOf(id, decisionText),
        recordFile: 'n/a (external ADR, not a .mole record; v3 bench harness)',
        decisionText,
        existingScope: [],
        existingMatch: [],
      });
    } catch (e) {
      console.log(`FAILED: ${e.message}`);
      compiled.push({ decision: id, error: String(e.message), match: [], rules: [], scope: [], usage: {}, ms: Date.now() - t0 });
      continue;
    }
    const ms = Date.now() - t0;
    console.log(`match=${draft.match.length} rules=${draft.rules.length} scope=${draft.scope.length} cost=$${(draft.usage.costUsd ?? 0).toFixed(4)} (${ms}ms)`);
    compiled.push({ decision: id, title: draft.title ?? titleOf(id, decisionText), match: draft.match, rules: draft.rules, scope: draft.scope, guardTests: draft.guardTests, usage: draft.usage, raw: draft.raw, ms });
  }
  const outPath = join(V3, 'baselines', 'compiled_adrs_v3.json');
  writeFileSync(outPath, JSON.stringify({ compiledAt: new Date().toISOString(), n_decisions: ids.length, compiled }, null, 1));
  console.log(`wrote ${outPath}`);
  return compiled;
}

function checkStep(compiled) {
  const byId = new Map(compiled.map((d) => [d.decision, d]));
  const rows = [];
  for (const c of HELDOUT) {
    if (c.adr_id === 'none') {
      rows.push({ id: c.id, repo: c.repo, adr_id: 'none', label_final: c.label_final, split: 'heldout', abstain: true, reason: 'distractor case, adr_id=none, no decision to compile', predictedViolate: null });
      continue;
    }
    const d = byId.get(c.adr_id);
    const patterns = (d?.match ?? []).filter((m) => {
      try {
        new RegExp(m.pattern);
        return true;
      } catch {
        return false; // invalid regex: not applied, same as contentAnchorsOf's own skip
      }
    });
    if (!patterns.length) {
      rows.push({ id: c.id, repo: c.repo, adr_id: c.adr_id, label_final: c.label_final, split: 'heldout', abstain: true, reason: d?.error ? `compile failed: ${d.error}` : 'compiler drafted no match: pattern for this ADR', predictedViolate: null });
      continue;
    }
    const lines = addedLines(c.diff).filter((l) => l.length <= MAX_MATCH_LINE);
    const hitPatterns = [];
    for (const p of patterns) {
      const re = new RegExp(p.pattern);
      if (lines.some((l) => re.test(l))) hitPatterns.push(p.pattern);
    }
    rows.push({
      id: c.id, repo: c.repo, adr_id: c.adr_id, label_final: c.label_final, split: 'heldout',
      abstain: false, predictedViolate: hitPatterns.length > 0, hit_patterns: hitPatterns,
      n_patterns_drafted: patterns.length,
    });
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
    n_decisions_total: nDecisions,
    n_decisions_abstained: nDecisionsAbstained,
    decision_coverage: nDecisions ? +(1 - nDecisionsAbstained / nDecisions).toFixed(4) : 0,
    n_heldout_cases: HELDOUT.length,
    n_heldout_abstained: nAbstainCases,
    case_coverage: +(1 - nAbstainCases / rows.length).toFixed(4),
    compile_cost_total_usd: +totalCompileCost.toFixed(4),
    compile_cost_mean_per_decision_usd: nDecisions ? +(totalCompileCost / nDecisions).toFixed(4) : 0,
    check_cost_per_case_usd: 0,
    note: 'compile_cost is a ONE-TIME, amortized cost (one hermes call per unique ADR, independent of case count); check_cost is $0/case (zero model calls at check time) -- see score_baselines_v3.py cascade section for how these are reported in the write-up.',
    rows,
  };
  const outPath = join(V3, 'baselines', 'arm_cascade_heldout_v3.json');
  writeFileSync(outPath, JSON.stringify(out, null, 1));
  console.log(`decisions: ${nDecisions}, abstained ${nDecisionsAbstained} (coverage ${out.decision_coverage})`);
  console.log(`heldout cases: ${rows.length}, abstained ${nAbstainCases} (coverage ${out.case_coverage})`);
  console.log(`compile cost: total $${out.compile_cost_total_usd}, mean/decision $${out.compile_cost_mean_per_decision_usd}; check cost: $0/case`);
  console.log(`wrote ${outPath}`);
}

main();
