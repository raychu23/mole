// T93 review FAIL fix #1 acceptance test: scripts/export-public.mjs must redact COMMENTS ONLY in every
// .ts/.mjs/.py file it ships -- never a string literal, identifier, or docstring a test or runtime value
// depends on. Proof: run the real export, then for every .ts/.mjs/.py file it copies, strip ALL comments
// from both the source and the exported copy (using the SAME comment-boundary logic export-public.mjs
// itself uses, scripts/lib/comment-redact.mjs) and assert the two "comments stripped" texts are BYTE
// IDENTICAL. If redaction ever touches code (not just comment text), this diverges and fails loudly here
// -- the exact class of bug the review caught (reanalyze.py's DEFAULT_RUNS_PATH string literal mangled).
//
// The real export runs at MODULE LOAD TIME (not in beforeAll): it.each() needs the file list at test
// COLLECTION time, which happens before any beforeAll hook runs.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { redactJsLikeComments, redactPyComments, stripJsLikeComments, stripPyComments } from './lib/comment-redact.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function mktemp(): string {
  return mkdtempSync(join(tmpdir(), 'mole-export-public-test-'));
}

function listFiles(dir: string, rel = ''): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(dir, rel))) {
    const r = rel ? join(rel, name) : name;
    const st = statSync(join(dir, r));
    if (st.isDirectory()) out.push(...listFiles(dir, r));
    else out.push(r);
  }
  return out;
}

const outDir = mktemp();
// Real export, not a mock -- this is the exact command the task's own acceptance bar names.
execFileSync(process.execPath, [join(root, 'scripts/export-public.mjs'), outDir], { cwd: root, encoding: 'utf8' });
const exportedFiles = listFiles(outDir);
// T87 review 2 (HIGH, pre-existing, unrelated to this T93 fix): export-public.mjs ALSO does a second,
// separate, already-reviewed rewrite -- writeOssStub()/rewriteImportSite() swap 4 literal `@mole/
// agentstate`/`@mole/coverage` import specifiers for a local generated stub module (excluded packages)
// and generate the 4 stub files themselves. That is intentional structural rewriting of CODE (not this
// fix's comment-only redaction), scoped to exactly these known files; it is out of scope for the
// "comments-stripped source === comments-stripped export" check below, which is about the OTHER
// (provenance/ledger/etc.) rewrite this review fixed.
const KNOWN_NON_REDACTION_REWRITES = new Set([
  'packages/mcp/src/_oss-agentstate-stub.ts',
  'packages/mcp/src/_oss-coverage-stub.ts',
  'packages/daemon/src/_oss-agentstate-stub.ts',
  'packages/daemon/src/_oss-coverage-stub.ts',
  'packages/steer/src/_oss-agentstate-stub.ts',
  'packages/mcp/src/server.ts',
  'packages/mcp/src/collisions-tool.ts',
  'packages/daemon/src/cli.ts',
  'packages/steer/src/index.ts',
]);
const jsLikeFiles = exportedFiles.filter(
  (f) => /\.(ts|mjs|cjs)$/.test(f) && !/package(-lock)?\.json$/.test(f) && !KNOWN_NON_REDACTION_REWRITES.has(f),
);
const pyFiles = exportedFiles.filter((f) => f.endsWith('.py'));

afterAll(() => {
  rmSync(outDir, { recursive: true, force: true });
});

describe("export-public.mjs redacts comments only, never code (T93 review FAIL fix #1)", () => {
  it('copied at least the dcbench_eval kit and the main packages (sanity: the export actually ran)', () => {
    expect(exportedFiles.length).toBeGreaterThan(100);
    expect(exportedFiles.some((f) => f.includes('dcbench_eval'))).toBe(true);
    expect(jsLikeFiles.length).toBeGreaterThan(50);
    expect(pyFiles.length).toBeGreaterThan(5);
  });

  it("the export script's own private-string scan reports clean", () => {
    const scratch = mktemp();
    try {
      const result = execFileSync(process.execPath, [join(root, 'scripts/export-public.mjs'), scratch], { cwd: root, encoding: 'utf8' });
      expect(result).toContain('private-string scan: clean');
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it('reanalyze.py ships with NO private default path (the concrete bug the review found)', () => {
    const text = readFileSync(join(outDir, 'evals/inspect/dcbench_eval/reanalyze.py'), 'utf8');
    expect(text).toContain('os.environ["MOLE_AB_RUNS_PATH"]');
    expect(text).not.toContain('(internal reference removed)');
    expect(text).not.toMatch(/context\/product-plan/);
  });

  describe('every .ts/.mjs file: comments-stripped source equals comments-stripped export', () => {
    it.each(jsLikeFiles)('%s', (rel) => {
      const srcText = readFileSync(join(root, rel), 'utf8');
      const exportedText = readFileSync(join(outDir, rel), 'utf8');
      expect(stripJsLikeComments(exportedText, rel)).toBe(stripJsLikeComments(srcText, rel));
    });
  });

  describe('every .py file: comments-stripped source equals comments-stripped export', () => {
    it.each(pyFiles)('%s', (rel) => {
      const srcText = readFileSync(join(root, rel), 'utf8');
      const exportedText = readFileSync(join(outDir, rel), 'utf8');
      expect(stripPyComments(exportedText)).toBe(stripPyComments(srcText));
    });
  });
});

describe('comment-redact.mjs unit behavior: a string literal/docstring that LOOKS like a comment pattern is never touched', () => {
  it('redactJsLikeComments leaves a string literal containing "ledger" and a task slug untouched', () => {
    const src = [
      "const DEFAULT_PATH = 'tasks/T90-ab-experiment-system/4 log/runs.jsonl'; // tasks/T90-ab-experiment-system/4 log/runs.jsonl",
      "const label = 'the outcome ledger'; // ledger",
      '',
    ].join('\n');
    const out = redactJsLikeComments(src, 'x.ts', { raymondAllowed: false });
    // the STRING LITERAL on each line must survive byte-for-byte
    expect(out).toContain("const DEFAULT_PATH = 'tasks/T90-ab-experiment-system/4 log/runs.jsonl';");
    expect(out).toContain("const label = 'the outcome ledger';");
    // but the TRAILING COMMENTS on both lines must be redacted
    expect(out).not.toContain('// tasks/T90-ab-experiment-system/4 log/runs.jsonl');
    expect(out).not.toMatch(/\/\/ ledger\b/);
  });

  it('redactPyComments leaves a docstring containing a task slug untouched but redacts a real # comment', () => {
    const src = [
      '"""Acceptance: tasks/T90-ab-experiment-system/4 log/results.md must match exactly."""',
      '# tasks/T90-ab-experiment-system/4 log/results.md',
      'x = 1',
      '',
    ].join('\n');
    const out = redactPyComments(src, { raymondAllowed: false });
    expect(out).toContain('"""Acceptance: tasks/T90-ab-experiment-system/4 log/results.md must match exactly."""');
    expect(out).not.toContain('# tasks/T90-ab-experiment-system/4 log/results.md');
  });
});
