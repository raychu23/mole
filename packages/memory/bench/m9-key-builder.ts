// M9 key builder (T19, throwaway; run once for the red commit). Mechanical CANDIDATES only: labels are written by hand
// into bench/m9-key.json after reading each diff (see 'labels' there), never by the re-anchor code under test.
// For each non-merge commit touching .ts/.tsx: symbols (top-level function / const arrow / class / class method) whose
// name disappears from the commit's touched files and symbols whose name appears, same kind, paired when the new symbol
// lives in the same file or in the file git -M says the old file was renamed to; cross-file pairs (rename + move) are added
// when their token sets overlap >= 0.5 (a cheap Jaccard on identifier/punctuation tokens, only to keep the list readable).
// usage: node packages/memory/dist/bench/m9-key-builder.js --repo mole|excalidraw --out FILE [--review FILE]
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const here = dirname(fileURLToPath(import.meta.url));
const REPOS: Record<string, string> = {
  mole: resolve(here, '../../../..'),
  excalidraw: join(homedir(), '.hermes/cache/scratch/impact/excalidraw'),
};

interface Sym {
  path: string;
  tail: string;
  kind: 'function' | 'class' | 'method';
  text: string;
}

const git = (repo: string, args: string[]): string => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
const isSrc = (p: string) => /\.(ts|tsx)$/.test(p) && !p.endsWith('.d.ts');

function syms(path: string, text: string): Sym[] {
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: Sym[] = [];
  const push = (tail: string, node: ts.Node, kind: Sym['kind']) => out.push({ path, tail, kind, text: node.getText(sf) });
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name) push(st.name.text, st, 'function');
    else if (ts.isClassDeclaration(st) && st.name) {
      push(st.name.text, st, 'class');
      for (const m of st.members) {
        if (ts.isMethodDeclaration(m) && (ts.isIdentifier(m.name) || ts.isPrivateIdentifier(m.name))) push(`${st.name.text}.${m.name.text}`, m, 'method');
      }
    } else if (ts.isVariableStatement(st) && st.declarationList.declarations.length === 1) {
      const d = st.declarationList.declarations[0]!;
      if (ts.isIdentifier(d.name) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) push(d.name.text, st, 'function');
    }
  }
  const n = new Map<string, number>();
  for (const s of out) n.set(s.tail, (n.get(s.tail) ?? 0) + 1);
  return out.filter((s) => n.get(s.tail) === 1);
}

const toks = (s: string) => new Set(s.match(/[A-Za-z_$][\w$]*|\d+|[^\s\w]/g) ?? []);
function jaccard(a: string, b: string): number {
  const x = toks(a);
  const y = toks(b);
  let i = 0;
  for (const t of x) if (y.has(t)) i++;
  return i / (x.size + y.size - i || 1);
}

export interface Candidate {
  id: string;
  repo: string;
  commit: string;
  parent: string;
  subject: string;
  old: { path: string; tail: string; kind: string };
  new: { path: string; tail: string; kind: string };
  how: 'same-file' | 'renamed-file' | 'cross-file';
  jaccard: number;
}

function main(): void {
  const arg = (k: string) => {
    const i = process.argv.indexOf(k);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const name = arg('--repo') ?? 'mole';
  const repo = REPOS[name]!;
  const out: Candidate[] = [];
  const review: string[] = [];
  const commits = git(repo, ['rev-list', '--no-merges', '--reverse', 'HEAD']).trim().split('\n');
  for (const c of commits) {
    const parent = git(repo, ['rev-list', '--parents', '-n', '1', c]).trim().split(' ')[1];
    if (!parent) continue;
    const st = git(repo, ['diff-tree', '-r', '-M', '--name-status', parent, c]).trim();
    const oldFiles: string[] = [];
    const newFiles: string[] = [];
    const renamedTo = new Map<string, string>();
    for (const l of st.split('\n')) {
      const [s, a, b] = l.split('\t');
      if (!s || !a) continue;
      if (s.startsWith('R') && b) {
        if (isSrc(a)) oldFiles.push(a);
        if (isSrc(b)) newFiles.push(b);
        renamedTo.set(a, b);
      } else if (s === 'M') {
        if (isSrc(a)) (oldFiles.push(a), newFiles.push(a));
      } else if (s === 'D') {
        if (isSrc(a)) oldFiles.push(a);
      } else if (s === 'A') {
        if (isSrc(a)) newFiles.push(a);
      }
    }
    if (!oldFiles.length || !newFiles.length) continue;
    const before = oldFiles.flatMap((p) => syms(p, git(repo, ['show', `${parent}:${p}`])));
    const after = newFiles.flatMap((p) => syms(p, git(repo, ['show', `${c}:${p}`])));
    const oldNames = new Set(before.map((s) => s.tail));
    const newNames = new Set(after.map((s) => s.tail));
    const removed = before.filter((s) => !newNames.has(s.tail));
    const added = after.filter((s) => !oldNames.has(s.tail));
    const subject = git(repo, ['log', '-1', '--format=%s', c]).trim();
    for (const r of removed)
      for (const a of added) {
        if (r.kind !== a.kind) continue;
        const how = a.path === r.path ? 'same-file' : renamedTo.get(r.path) === a.path ? 'renamed-file' : 'cross-file';
        const j = Math.round(jaccard(r.text, a.text) * 100) / 100;
        if (how === 'cross-file' && j < 0.5) continue;
        const id = `${name}-${c.slice(0, 8)}-${out.length}`;
        out.push({ id, repo: name, commit: c, parent, subject, old: { path: r.path, tail: r.tail, kind: r.kind }, new: { path: a.path, tail: a.tail, kind: a.kind }, how, jaccard: j });
        review.push(`==== ${id} ${how} j=${j} | ${subject}\n--- ${r.path}#${r.tail}\n${r.text}\n+++ ${a.path}#${a.tail}\n${a.text}\n`);
      }
  }
  writeFileSync(arg('--out') ?? `m9-candidates-${name}.json`, JSON.stringify(out, null, 1));
  const rv = arg('--review');
  if (rv) writeFileSync(rv, review.join('\n'));
  console.log(`${name}: ${commits.length} commits, ${out.length} candidate pairs`);
}

main();
