// M9 HELD-OUT key builder (T19, key ruling 1 §conditions 2). Mechanical CANDIDATES only, same pairing rules as
// bench/m9-key-builder.ts (same file, git -M renamed file, cross-file when token Jaccard >= 0.5), over the hermes-agent
// ui-tui TS/TSX history, NEWEST commits first (read-only: git log/show/diff-tree only). Labels are written by hand into
// bench/m9-heldout-key.json after reading each diff; no similarity score of the re-anchor measure and no re-anchor code is
// used here. The review file shows both declarations plus the commit's -/+ lines that mention the old / new name, so the
// labeller can see whether callers switched and whether the body/role continued.
// usage: node packages/memory/dist/bench/m9-heldout-builder.js --head SHA --max N --out FILE --review FILE
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';

// a bare scratch repo whose objects/info/alternates points at ~/.hermes/hermes-agent (a blob:none partial clone): lazily
// fetched blobs land in the scratch repo, so the hermes-agent checkout and its object store are never written
const REPO = process.env.MOLE_M9_HERMES ?? join(homedir(), '.hermes/cache/scratch/t19-hermes-git');
const PREFIX = 'ui-tui/';

interface Sym {
  path: string;
  tail: string;
  kind: 'function' | 'class' | 'method';
  text: string;
}

const git = (args: string[]): string => execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
const isSrc = (p: string) => p.startsWith(PREFIX) && /\.(ts|tsx)$/.test(p) && !p.endsWith('.d.ts');

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
const lastSeg = (t: string) => t.slice(t.lastIndexOf('.') + 1);
const wordRe = (w: string) => new RegExp(`(?<![\\w$])${w.replace(/[$]/g, '\\$')}(?![\\w$])`);

function main(): void {
  const arg = (k: string) => {
    const i = process.argv.indexOf(k);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const head = arg('--head') ?? 'HEAD';
  const max = Number(arg('--max') ?? '300');
  const skip = Number(arg('--skip') ?? '0');
  const out: Array<Record<string, unknown>> = [];
  const review: string[] = [];
  // newest first, only commits that touch ui-tui TS/TSX
  const commits = git(['rev-list', '--no-merges', `--max-count=${max}`, `--skip=${skip}`, head, '--', `${PREFIX}*.ts`, `${PREFIX}*.tsx`]).trim().split('\n');
  let k = skip;
  for (const c of commits) {
    k++;
    if (k % 20 === 0) console.error(`  ${k}/${commits.length} commits, ${out.length} pairs`);
    const parent = git(['rev-list', '--parents', '-n', '1', c]).trim().split(' ')[1];
    if (!parent) continue;
    const st = git(['diff-tree', '-r', '-M', '--name-status', parent, c, '--', PREFIX]).trim();
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
    const before = oldFiles.flatMap((p) => syms(p, git(['show', `${parent}:${p}`])));
    const after = newFiles.flatMap((p) => syms(p, git(['show', `${c}:${p}`])));
    const oldNames = new Set(before.map((s) => s.tail));
    const newNames = new Set(after.map((s) => s.tail));
    const removed = before.filter((s) => !newNames.has(s.tail));
    const added = after.filter((s) => !oldNames.has(s.tail));
    if (!removed.length || !added.length) continue;
    const subject = git(['log', '-1', '--format=%s', c]).trim();
    let diffLines: string[] | undefined;
    for (const r of removed)
      for (const a of added) {
        if (r.kind !== a.kind) continue;
        const how = a.path === r.path ? 'same-file' : renamedTo.get(r.path) === a.path ? 'renamed-file' : 'cross-file';
        const j = Math.round(jaccard(r.text, a.text) * 100) / 100;
        if (how === 'cross-file' && j < 0.5) continue;
        const id = `hermes-${c.slice(0, 8)}-${out.length + Number(arg('--id-base') ?? '0')}`;
        out.push({ id, repo: 'hermes', commit: c, parent, subject, order: k, old: { path: r.path, tail: r.tail, kind: r.kind }, new: { path: a.path, tail: a.tail, kind: a.kind }, how, jaccard: j });
        diffLines ??= git(['diff', '-U0', '-M', parent, c, '--', PREFIX]).split('\n');
        const on = wordRe(lastSeg(r.tail));
        const nn = wordRe(lastSeg(a.tail));
        const refs = diffLines.filter((l) => (l.startsWith('-') && !l.startsWith('---') && on.test(l)) || (l.startsWith('+') && !l.startsWith('+++') && (nn.test(l) || on.test(l)))).slice(0, 14);
        review.push(`==== ${id} #${k} ${how} | ${subject}\n--- ${r.path}#${r.tail}\n${r.text}\n+++ ${a.path}#${a.tail}\n${a.text}\n... diff lines naming ${lastSeg(r.tail)} / ${lastSeg(a.tail)}:\n${refs.map((l) => '    ' + l.slice(0, 200)).join('\n')}\n`);
      }
  }
  writeFileSync(arg('--out') ?? 'm9-heldout-candidates.json', JSON.stringify(out, null, 1));
  const rv = arg('--review');
  if (rv) writeFileSync(rv, review.join('\n'));
  console.log(`hermes ui-tui: ${commits.length} commits walked (newest first from ${head.slice(0, 10)}), ${out.length} candidate pairs`);
}

main();
