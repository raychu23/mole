// Shared comment/prose-scoped redaction helpers for scripts/export-public.mjs (and its own test,
// scripts/export-public.test.ts, which needs the SAME comment-boundary logic to verify redaction never
// touched code -- see that file's own comment for why a parser-based, not bare-scanner, pass is required).
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

/** The provenance/ledger/etc. rewrites applied to comment text (and to .md/.json prose/data -- see
 * export-public.mjs's own module comment for the full per-extension contract). Never call this on a
 * whole CODE file's text -- only on an already-isolated comment span, or on genuine prose/data. */
export function baseRedact(text) {
  return text
    .replace(/[ \t]*\/\/ \[source: [^\]]*\]/g, '')
    .replace(/[ \t]*# \[source: [^\]]*\]/g, '')
    .replace(/\btasks\/T\d{1,2}-[A-Za-z0-9-]+(?:\/[^\s)"'`]*)?/g, '(internal reference removed)')
    .replace(/\bT\d{1,2}-[A-Za-z0-9][A-Za-z0-9-]*\b/g, '(internal task reference removed)')
    .replace(/(^|[^a-zA-Z])context\/[^\s)"'`]*/g, '$1(internal reference removed)')
    .replace(/\btasks\/[^\s)"'`]*/g, '(internal reference removed)')
    .replace(/\bAGENTS\.md\b/g, "the project's shared instructions file")
    .replace(/\bledger\b/gi, 'tracking log')
    .replace(/\.hermes(?!\w)/g, '.agent-cache');
}

export function redactProse(text, { raymondAllowed = false } = {}) {
  let out = baseRedact(text);
  if (!raymondAllowed) out = out.replace(/\bRaymond(?:'s)?\b/g, 'the team');
  return out;
}

/** Every real comment span in a .ts/.mjs/.cjs file, as `{pos, end}` sorted by position. Uses the real
 * TypeScript PARSER (`ts.createSourceFile`), not the bare lexical scanner alone: `ts.createScanner(...)
 * .scan()` cannot reliably tell a regex literal from a division operator without parser context
 * (`a / b / c` vs `/foo/g`), and guessing wrong desyncs the whole rest of the scan, silently swallowing
 * later comments into a misdetected "regex literal" (caught empirically: a bare-scanner pass over a real
 * file in this repo found 6 comments where the parser-correct count was 37). Visits every leaf token and
 * collects BOTH `ts.getLeadingCommentRanges` at its full-start (an own-line comment before it) AND
 * `ts.getTrailingCommentRanges` at its end (a same-line trailing `// ...` after it -- NOT returned by
 * getLeadingCommentRanges on the next token; empirically verified a same-line trailing comment was
 * silently skipped without this half), deduped by position. */
export function getJsCommentRanges(text, rel) {
  const scriptKind = rel.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const sourceFile = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, scriptKind);
  const seen = new Set();
  const ranges = [];
  function collectAt(pos, getRanges) {
    for (const r of getRanges(text, pos) || []) {
      const key = `${r.pos}-${r.end}`;
      if (!seen.has(key)) {
        seen.add(key);
        ranges.push(r);
      }
    }
  }
  function visit(node) {
    const children = node.getChildren(sourceFile);
    if (children.length === 0) {
      collectAt(node.getFullStart(), ts.getLeadingCommentRanges);
      collectAt(node.getEnd(), ts.getTrailingCommentRanges);
    } else children.forEach(visit);
  }
  visit(sourceFile);
  collectAt(sourceFile.endOfFileToken.getFullStart(), ts.getTrailingCommentRanges);
  return ranges.sort((a, b) => a.pos - b.pos);
}

export function redactJsLikeComments(text, rel, opts) {
  const ranges = getJsCommentRanges(text, rel);
  let result = '';
  let pos = 0;
  for (const r of ranges) {
    result += text.slice(pos, r.pos) + redactProse(text.slice(r.pos, r.end), opts);
    pos = r.end;
  }
  return result + text.slice(pos);
}

/** Removes every comment span entirely (rather than redacting it) -- used by export-public.test.ts to
 * compare "source with comments stripped" against "export with comments stripped": if redaction only
 * ever touched comment text, these two must be byte-identical. */
export function stripJsLikeComments(text, rel) {
  const ranges = getJsCommentRanges(text, rel);
  let result = '';
  let pos = 0;
  for (const r of ranges) {
    result += text.slice(pos, r.pos);
    pos = r.end;
  }
  return result + text.slice(pos);
}

/** Every COMMENT token's (line, col) span in a .py file, via a real CPython `tokenize` pass (spawned via
 * python3 -- a hand-rolled regex tokenizer could not reliably tell a string literal from a comment past
 * escapes/triple-quotes/f-strings). Python comments are always single-line, so each span maps onto
 * exactly one line. Throws loudly (rather than silently skipping) if python3 is unavailable or the file
 * fails to tokenize: a .py file this export ships must be valid Python. */
export function pyCommentSpans(text) {
  const script = [
    'import sys, json, tokenize, io',
    'src = sys.stdin.read()',
    'spans = []',
    'for tok in tokenize.generate_tokens(io.StringIO(src).readline):',
    '    if tok.type == tokenize.COMMENT:',
    '        spans.append([tok.start[0], tok.start[1], tok.end[0], tok.end[1]])',
    'print(json.dumps(spans))',
  ].join('\n');
  const pythonBin = process.env.EXPORT_PYTHON || 'python3';
  const res = spawnSync(pythonBin, ['-c', script], { input: text, encoding: 'utf8' });
  if (res.error || res.status !== 0) {
    throw new Error(`comment-redact.mjs: ${pythonBin} tokenize failed (needed to redact .py comments safely without touching code): ${res.stderr || res.error}`);
  }
  return JSON.parse(res.stdout);
}

export function redactPyComments(text, opts) {
  const spans = pyCommentSpans(text);
  if (spans.length === 0) return text;
  const lines = text.split('\n');
  for (const [startLine, startCol, endLine, endCol] of spans) {
    if (startLine !== endLine) continue; // Python comments never span lines; defensive no-op if they did
    const line = lines[startLine - 1];
    lines[startLine - 1] = line.slice(0, startCol) + redactProse(line.slice(startCol, endCol), opts) + line.slice(endCol);
  }
  return lines.join('\n');
}

/** Removes every comment span entirely -- the .py counterpart of stripJsLikeComments, for the same
 * before/after equality check in export-public.test.ts. */
export function stripPyComments(text) {
  const spans = pyCommentSpans(text);
  if (spans.length === 0) return text;
  const lines = text.split('\n');
  for (const [startLine, startCol, endLine, endCol] of spans) {
    if (startLine !== endLine) continue;
    const line = lines[startLine - 1];
    lines[startLine - 1] = line.slice(0, startCol) + line.slice(endCol);
  }
  return lines.join('\n');
}

/** .md: prose/data, but fenced code blocks are left untouched verbatim (some are literal examples a docs
 * test runs -- see export-public.mjs's own module comment). Splits on ``` fences; odd-indexed parts are
 * the fences. */
export function redactMarkdown(text, opts) {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => (i % 2 === 1 ? part : redactProse(part, opts))).join('');
}
