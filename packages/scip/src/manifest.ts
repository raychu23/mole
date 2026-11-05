// Content-hash manifest for an `index.scip` (review round-2 HIGH-1): `mole rules`'s old staleness check compared
// every indexed-language source file's MTIME against `index.scip`'s own mtime -- but a fresh `git clone` or CI
// checkout writes every file's mtime to "now" regardless of its committed content, so a committed index.scip
// (always older, by mtime, than the files `git checkout` just wrote) read as stale on every single clone, even
// though the content is byte-for-byte what it was indexed against. Content hashes don't have this problem: a
// `git clone` reproduces file CONTENT exactly, so a hash taken at indexing time and a hash taken after cloning
// agree regardless of when either checkout happened.
//
// `mole scip stamp` (see cli.ts) writes this manifest right after the SCIP indexer runs, next to its index.scip
// (`index.scip.manifest.json`); `mole rules` (packages/decisions/src/rules/scip.ts: scipStaleness) reads it back
// and compares current file hashes against it. No manifest, or a manifest whose own `indexSha256` does not match
// the index.scip it sits next to (re-indexed without re-stamping) -- "stale-unknown": the check cannot prove
// freshness at all, so it fails loud (never a silent 0-violation pass), telling the user to run `mole scip stamp`.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readScipIndex } from './reader.js';

export interface ScipManifest {
  /** sha256 of the index.scip file itself, at stamp time. Lets scipStaleness tell "this manifest was written for
   * a DIFFERENT index.scip" (re-indexed without re-stamping) apart from "this manifest's file list is stale". */
  indexSha256: string;
  /** indexer name + version, from the index's own `Metadata.tool_info` (informational only, not compared). */
  tool: string;
  /** repo-relative path (posix) -> sha256 of its content, at stamp time. */
  files: Record<string, string>;
}

/** `index.scip.manifest.json`, next to `scipPath`. */
export function manifestPath(scipPath: string): string {
  return `${scipPath}.manifest.json`;
}

export function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** The file extensions (with leading dot) a set of repo-relative paths uses, e.g. `{'.py'}` -- used to limit the
 * staleness walk to the language(s) the index actually covers, same as before this fix. */
export function extsOfFiles(files: Iterable<string>): Set<string> {
  const exts = new Set<string>();
  for (const f of files) {
    const m = /\.[^./]+$/.exec(f);
    if (m) exts.add(m[0]);
  }
  return exts;
}

/** Directories skipped by the fallback (non-git) walk: VCS/build/Mole internals plus the common Python
 * virtualenv/bytecode-cache/vendor noise a SCIP indexer does not index either. Only used when `root` is not
 * inside a git repository -- `git ls-files` (the normal path) gets this from `.gitignore` instead. */
const FALLBACK_WALK_EXCLUDE = /(^|\/)(node_modules|dist|build|\.git|\.mole|\.venv|venv|site-packages|__pycache__)\//;

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
      if (!FALLBACK_WALK_EXCLUDE.test(`${rel}/`)) walkByExt(root, rel, exts, out);
    } else {
      const m = /\.[^./]+$/.exec(name);
      if (m && exts.has(m[0]) && !FALLBACK_WALK_EXCLUDE.test(rel)) out.add(rel);
    }
  }
}

/** Repo-relative paths (posix) under `root` matching `exts`. Respects `.gitignore` via `git ls-files --cached
 * --others --exclude-standard` when `root` is inside a git repository (fast even with thousands of ignored
 * files -- e.g. a 5,000-file `.venv/` -- since git consults `.gitignore` itself instead of Mole walking into
 * it); falls back to a plain directory walk skipping the common vendor/VCS/build directories otherwise. */
export function listSourceFiles(root: string, exts: Set<string>): string[] {
  const hasExt = (f: string): boolean => {
    const m = /\.[^./]+$/.exec(f);
    return !!m && exts.has(m[0]);
  };
  try {
    const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 64,
    });
    return out.split('\n').filter(Boolean).filter(hasExt);
  } catch {
    const files = new Set<string>();
    walkByExt(root, '.', exts, files);
    return [...files];
  }
}

/** `mole scip stamp`: hash the index.scip itself plus every current source file of its own indexed language(s)
 * (by extension), and write the manifest next to it. Run this right after the SCIP indexer, before committing
 * `index.scip` (see docs/decisions-and-rules.md). */
export function stampScip(root: string, scipPath: string): ScipManifest {
  const index = readScipIndex(scipPath);
  const exts = extsOfFiles(index.documents.map((d) => d.relativePath));
  const files: Record<string, string> = {};
  for (const f of listSourceFiles(root, exts).sort()) files[f] = sha256File(join(root, f));
  const toolInfo = index.metadata?.toolInfo;
  const manifest: ScipManifest = {
    indexSha256: sha256File(scipPath),
    tool: toolInfo ? `${toolInfo.name} ${toolInfo.version}`.trim() || 'unknown' : 'unknown',
    files,
  };
  writeFileSync(manifestPath(scipPath), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}
