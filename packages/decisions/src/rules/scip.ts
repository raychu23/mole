// checkRulesScip: the SCIP path of `mole rules` (T95). Same RuleSpec[]/Violation shape as the TS path
// (check.ts), but file+symbol sites come from a SCIP index (@mole/scip) instead of dependency-cruiser
// + Mole's own TS AST scan -- so forbid:import and forbid:call work on any language a SCIP indexer
// covers (scip-python, scip-go, scip-java, ...), not just TypeScript.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readScipIndex, scipSites, type Index } from '@mole/scip';
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

/** Thrown by checkRulesScip when the index looks stale and `opts.allowStaleScip` was not set. A distinct error
 * type (not a RulesResult with violations) because a stale index is "we don't actually know", not "clean" or
 * "N violations" -- silently reporting 0 violations here would be exactly the bug this guards (review HIGH-1). */
export class StaleScipIndexError extends Error {
  constructor(
    message: string,
    public readonly reasons: string[],
  ) {
    super(message);
    this.name = 'StaleScipIndexError';
  }
}

/** Directories never walked when looking for source files the index should cover: VCS/build/Mole internals plus
 * the common Python virtualenv/bytecode-cache noise (SCIP indexers don't index a project's own venv either). */
const STALE_WALK_EXCLUDE = /(^|\/)(node_modules|dist|\.git|\.mole|\.venv|venv|__pycache__)\//;

function walkByExt(root: string, dir: string, exts: Set<string>, out: Set<string>): void {
  let names: string[];
  let isDir: (name: string) => boolean;
  try {
    const abs = join(root, dir);
    names = readdirSync(abs);
    isDir = (name: string) => statSync(join(abs, name)).isDirectory();
  } catch {
    return;
  }
  for (const name of names) {
    const rel = dir === '.' ? name : `${dir}/${name}`;
    if (isDir(name)) {
      if (!STALE_WALK_EXCLUDE.test(`${rel}/`)) walkByExt(root, rel, exts, out);
    } else {
      const m = /\.[^./]+$/.exec(name);
      if (m && exts.has(m[0]) && !STALE_WALK_EXCLUDE.test(rel)) out.add(rel);
    }
  }
}

/** Does `index.scip` at `scipPath` still describe the repo at `root`? Mirrors what SCIP-consuming tools check
 * (e.g. Sourcegraph compares the indexed commit; scip.proto's Metadata carries project_root + tool_info and each
 * Document carries relative_path and may carry text/hash) -- but scip-python 0.6.8 does not populate Document.text
 * or any content hash (verified: packages/scip/test/fixtures/counterfixture/HOW-PRODUCED.md), so the only signal
 * actually available here is mtime: every source file of the index's own language(s), on disk right now, compared
 * against the index file's own mtime. A file the index never saw (added since indexing) or newer than the index
 * (edited since indexing) means the index can no longer be trusted to have seen today's imports/calls. */
export function scipStaleness(root: string, scipPath: string, index: Index): { stale: boolean; reasons: string[] } {
  const indexMtime = statSync(scipPath).mtimeMs;
  const indexedFiles = new Set(index.documents.map((d) => d.relativePath));
  const exts = new Set<string>();
  for (const f of indexedFiles) {
    const m = /\.[^./]+$/.exec(f);
    if (m) exts.add(m[0]);
  }
  if (exts.size === 0) return { stale: false, reasons: [] };
  const onDisk = new Set<string>();
  walkByExt(root, '.', exts, onDisk);
  const reasons: string[] = [];
  for (const f of onDisk) {
    if (!indexedFiles.has(f)) {
      reasons.push(`${f}: not in index.scip (file added since indexing)`);
      continue;
    }
    let mtime: number;
    try {
      mtime = statSync(join(root, f)).mtimeMs;
    } catch {
      continue;
    }
    if (mtime > indexMtime) reasons.push(`${f}: modified after index.scip`);
  }
  return { stale: reasons.length > 0, reasons: reasons.sort() };
}

export async function checkRulesScip(root: string, scipPath: string, load: RulesLoad, opts: RulesOptions = {}): Promise<RulesResult> {
  const t0 = Date.now();
  const violations: Violation[] = [];

  const flags = new Map<string, Flag>();
  try {
    for (const f of computeFlags(loadGraph(root))) flags.set(f.id, f.flag);
  } catch {
    // flags are context, not the check
  }

  const index = readScipIndex(scipPath);
  if (!opts.allowStaleScip) {
    const { stale, reasons } = scipStaleness(root, scipPath, index);
    if (stale) {
      const shown = reasons.slice(0, 20).map((r) => `  ${r}`).join('\n');
      const more = reasons.length > 20 ? `\n  ...and ${reasons.length - 20} more` : '';
      throw new StaleScipIndexError(
        `index.scip is stale: re-run scip-python index (or the matching SCIP indexer) -- ` +
          `${reasons.length} file(s) missing from the index or modified after it:\n${shown}${more}\n` +
          `(pass --allow-stale-scip to check against this index anyway)`,
        reasons,
      );
    }
  }
  const { imports, calls } = scipSites(index, root);

  const seen = new Set<string>();
  const add = (r: RuleSpec, file: string, line: number, target: string, typeOnly?: boolean) => {
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
      ...(typeOnly ? { typeOnly: true } : {}),
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
      // T95 follow-up: unlike the TS path (which drops type-only imports unless the rule sets `types: true`),
      // a TYPE_CHECKING-only import still counts here by default -- it still describes a real intended
      // dependency the decision forbids, just an erased one; it is only *labelled* so a reviewer can tell.
      if (to.test(site.target)) add(r, site.file, site.line, site.target, site.typeOnly);
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
