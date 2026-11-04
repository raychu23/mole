// Builds the PUBLIC copy of Mole from an allowlist, with fresh history, and refuses to continue if a private string slipped in.
//   node scripts/export-public.mjs <output dir>
// The private repo (AGENTS.md, tasks/, study/, context/, agent-cost benchmark harness) is never published; only what is listed here.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] ?? '');
if (!process.argv[2]) throw new Error('usage: node scripts/export-public.mjs <output dir>');

const include = ['apps', 'packages', 'plugins', '.claude-plugin', 'LICENSE', 'package.json', 'package-lock.json', 'tsconfig.base.json', 'tsconfig.json', 'vitest.config.ts'];
// private tooling that references the author's machine, chats or unpublished studies
const exclude = [/(^|\/)node_modules(\/|$)/, /(^|\/)dist(\/|$)/, /(^|\/)\.stage(\/|$)/, /\.vsix$/, /\.tsbuildinfo$/, /^packages\/daemon\/bench\/m15(\/|$)/, /^packages\/daemon\/test\/study-score\.test\.ts$/, /^packages\/indexer\/bench(\/|$)/, /^packages\/indexer\/test\/fixture-repo\.test\.ts$/,  /^\.DS_Store$/, /\.DS_Store$/,
  // T86: the plugin's own benchmark key material and its test fixtures embed internal ledger task-directory names
  // (e.g. "T74-steering-dials") as literal strings, the same private-history shape the forbidden scan below is
  // meant to catch -- ship the plugin's runtime files (plugin.json, .mcp.json, hooks/, scripts/, README.md) only.
  /^plugins\/claude-code\/bench(\/|$)/, /^plugins\/claude-code\/test(\/|$)/];
const forbidden = [/\/Users\/[a-z0-9_-]+/i, /\.hermes/i, /raymond/i, /CS Code/, /docs-over-chat/i, /ledger/i, /\bT\d{1,2}-[a-z0-9-]+/, /AGENTS\.md/, /BEGIN [A-Z ]*PRIVATE KEY/, /(ghp|gho|ghs|pat|sk)[-_][A-Za-z0-9]{20,}/];
// exceptions that are intended: the copyright holder's name in LICENSE, the source link in package manifests, and
// the plugin/marketplace author field (the point of a public plugin listing is crediting a real person, same as LICENSE)
const allowed = { 'LICENSE': [/raymond/i], 'plugins/claude-code/.claude-plugin/plugin.json': [/raymond/i], '.claude-plugin/marketplace.json': [/raymond/i] };

rmSync(out, { recursive: true, force: true });
const copied = [];
function walk(rel) {
  const src = join(root, rel);
  if (exclude.some((re) => re.test(rel))) return;
  const st = statSync(src);
  if (st.isDirectory()) return readdirSync(src).forEach((n) => walk(join(rel, n)));
  mkdirSync(dirname(join(out, rel)), { recursive: true });
  if (/\.(?:ts|mjs|cjs|json|md)$/.test(rel) && !/package(-lock)?\.json$/.test(rel)) {
    // provenance comments that point into the private task ledger: `// [source: tasks/Tn-...; added: ...]`
    writeFileSync(join(out, rel), readFileSync(src, 'utf8').replace(/[ \t]*\/\/ \[source: [^\]]*\]/g, ''));
  } else cpSync(src, join(out, rel));
  copied.push(rel);
}
for (const p of include) if (existsSync(join(root, p))) walk(p);
cpSync(join(root, 'scripts/public-README.md'), join(out, 'README.md'));
cpSync(join(root, 'scripts/public-gitignore'), join(out, '.gitignore'));
copied.push('README.md', '.gitignore');

const hits = [];
for (const rel of copied) {
  if (/\.(png|ico|jpg|vsix)$/i.test(rel)) continue;
  const text = readFileSync(join(out, rel), 'utf8');
  for (const re of forbidden) if (re.test(text) && !(allowed[rel] ?? []).some((a) => a.source === re.source)) hits.push(`${rel}: ${re}`);
}
console.log(`copied ${copied.length} files to ${out}`);
if (hits.length) {
  console.error('PRIVATE-STRING SCAN FAILED:\n' + hits.join('\n'));
  process.exit(1);
}
console.log('private-string scan: clean');
