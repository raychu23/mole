// checkRulesScip: the SCIP path of `mole rules` (T95). Same RuleSpec[]/Violation shape as the TS path
// (check.ts), but file+symbol sites come from a SCIP index (@mole/scip) instead of dependency-cruiser
// + Mole's own TS AST scan -- so forbid:import and forbid:call work on any language a SCIP indexer
// covers (scip-python, scip-go, scip-java, ...), not just TypeScript.
import { existsSync } from 'node:fs';
import { readScipIndex, scipSites } from '@mole/scip';
import { computeFlags } from '../flags.js';
import { loadGraph } from '../graph.js';
import type { Flag } from '../types.js';
import { anyOf, isModuleName, pathRegex, toRegex } from './parse.js';
import type { RuleSpec, RulesLoad, RulesOptions, RulesResult, Violation } from './types.js';

/** `index.scip` next to root, or opts.scip (repo-relative or absolute). undefined if neither is readable. */
export function findScipIndex(root: string, opts: RulesOptions): string | undefined {
  if (opts.scip) {
    const p = opts.scip.startsWith('/') ? opts.scip : `${root}/${opts.scip}`;
    return existsSync(p) ? p : undefined;
  }
  const p = `${root}/index.scip`;
  return existsSync(p) ? p : undefined;
}

export async function checkRulesScip(root: string, scipPath: string, load: RulesLoad): Promise<RulesResult> {
  const t0 = Date.now();
  const violations: Violation[] = [];

  const flags = new Map<string, Flag>();
  try {
    for (const f of computeFlags(loadGraph(root))) flags.set(f.id, f.flag);
  } catch {
    // flags are context, not the check
  }

  const index = readScipIndex(scipPath);
  const { imports, calls } = scipSites(index, root);

  const seen = new Set<string>();
  const add = (r: RuleSpec, file: string, line: number, target: string) => {
    const k = `${file}:${line}:${r.name}:${target}`;
    if (seen.has(k)) return;
    seen.add(k);
    violations.push({
      file,
      line,
      rule: r.name,
      kind: r.kind,
      target,
      decision: { id: r.decision, title: r.title, status: r.status, flag: flags.get(r.decision), ...(r.why ? { why: r.why } : {}), file: r.file, line: r.line },
    });
  };

  const importRules = load.rules
    .filter((r) => r.kind === 'import')
    .map((r) => ({ r, from: new RegExp(pathRegex(r.from)), to: new RegExp(anyOf(r.to.map(toRegex))), except: r.except.length ? new RegExp(anyOf(r.except.map(pathRegex))) : undefined }));
  for (const site of imports) {
    for (const { r, from, to, except } of importRules) {
      if (!from.test(site.file) || except?.test(site.file)) continue;
      // isModuleName(to-rule entry) decides whether a rule's `to:` is meant to match a module name or a repo
      // path; a path-shaped rule only matches a path-shaped site and vice versa (mirrors the TS path, where
      // a module-name `to:` never matches a repo file and a path `to:` never matches an installed package).
      const toIsModule = r.to.every(isModuleName);
      if (toIsModule !== !site.isPath) continue;
      if (to.test(site.target)) add(r, site.file, site.line, site.target);
    }
  }

  const callRules = load.rules
    .filter((r) => r.kind === 'call')
    .map((r) => ({ r, from: new RegExp(pathRegex(r.from)), except: r.except.length ? new RegExp(anyOf(r.except.map(pathRegex))) : undefined }));
  for (const site of calls) {
    for (const { r, from, except } of callRules) {
      if (!from.test(site.file) || except?.test(site.file)) continue;
      if (r.callee.some((c) => site.callee === c || site.callee.endsWith(`.${c}`))) add(r, site.file, site.line, site.callee);
    }
  }

  return { root, ...load, violations: violations.sort((a, b) => (a.file === b.file ? a.line - b.line || a.rule.localeCompare(b.rule) : a.file < b.file ? -1 : 1)), ms: Date.now() - t0 };
}
