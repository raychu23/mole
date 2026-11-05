// checkRulesScip: the SCIP path of `mole rules` (T95). Same RuleSpec[]/Violation shape as the TS path
// (check.ts), but file+symbol sites come from a SCIP index (@mole/scip) instead of dependency-cruiser
// + Mole's own TS AST scan -- so forbid:import and forbid:call work on any language a SCIP indexer
// covers (scip-python, scip-go, scip-java, ...), not just TypeScript.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extsOfFiles, listSourceFiles, manifestPath, readScipIndex, scipSites, sha256File, type Index, type ScipManifest } from '@mole/scip';
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

/** Does `index.scip` at `scipPath` still describe the repo at `root`? Review round-2 HIGH-1: this used to compare
 * mtimes (every indexed-language source file vs. the index file's own mtime), which false-positives on every
 * fresh `git clone`/CI checkout -- checkout writes every file's mtime to "now" regardless of its committed
 * content, so a committed index.scip (always mtime-older than files `git checkout` just wrote) read as stale on
 * every single clone even with byte-identical content. Content hashes don't have that problem: `mole scip stamp`
 * (packages/scip/src/manifest.ts) writes a manifest of each source file's sha256 right after indexing; this
 * compares the CURRENT file hashes against that manifest instead of any mtime. No manifest, or a manifest whose
 * own `indexSha256` doesn't match this `index.scip` (re-indexed without re-stamping) -- "stale-unknown": the
 * check cannot prove freshness at all, so it fails the same way a real staleness finding does (never a silent
 * 0-violation pass), telling the caller to run `mole scip stamp`. */
export function scipStaleness(root: string, scipPath: string, index: Index): { stale: boolean; reasons: string[] } {
  const indexedFiles = new Set(index.documents.map((d) => d.relativePath));
  const exts = extsOfFiles(indexedFiles);
  if (exts.size === 0) return { stale: false, reasons: [] };

  const mPath = manifestPath(scipPath);
  if (!existsSync(mPath)) {
    return { stale: true, reasons: [`no manifest at ${mPath}: run \`mole scip stamp\` after indexing (stale-unknown -- freshness cannot be checked without one)`] };
  }
  let manifest: ScipManifest;
  try {
    manifest = JSON.parse(readFileSync(mPath, 'utf8')) as ScipManifest;
  } catch {
    return { stale: true, reasons: [`${mPath} is not valid JSON: run \`mole scip stamp\` again (stale-unknown)`] };
  }
  if (manifest.indexSha256 !== sha256File(scipPath)) {
    return { stale: true, reasons: [`${mPath} does not match ${scipPath} (index re-generated since it was stamped): run \`mole scip stamp\` again (stale-unknown)`] };
  }

  const onDisk = listSourceFiles(root, exts);
  const onDiskSet = new Set(onDisk);
  const reasons: string[] = [];
  for (const f of onDisk) {
    const want = manifest.files[f];
    let got: string | undefined;
    try {
      got = sha256File(join(root, f));
    } catch {
      got = undefined; // `git ls-files --cached` can list a file still staged but deleted from the working tree
    }
    if (got === undefined) {
      if (want !== undefined) reasons.push(`${f}: missing on disk (removed since \`mole scip stamp\`)`);
      continue;
    }
    if (want === undefined) {
      reasons.push(`${f}: not in the manifest (file added since \`mole scip stamp\`)`);
      continue;
    }
    if (got !== want) reasons.push(`${f}: content changed since \`mole scip stamp\``);
  }
  for (const f of Object.keys(manifest.files)) {
    if (!onDiskSet.has(f)) reasons.push(`${f}: missing on disk (removed since \`mole scip stamp\`)`);
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
        `index.scip is stale: ${reasons.length} file(s) differ from its \`mole scip stamp\` manifest, or no manifest exists -- ` +
          `run \`mole scip stamp\` (after re-running the SCIP indexer if sources changed):\n${shown}${more}\n` +
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
