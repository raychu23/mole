// M1 key builder (run ONCE for the red commit; output frozen in bench/m1-key.json).
// Truth is independent of @mole/memory's normalized-hash code: symbol ranges come from the TS parser here,
// change truth from `git diff -w --ignore-blank-lines -U0` lines inside the range, compared line-wise with
// comment-only lines dropped and all whitespace removed.
// usage: node packages/memory/dist/bench/key-builder.js [--out packages/memory/bench/m1-key.json]
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export interface KeyItem {
  symbol: string; // qualifiedName at the parent version: '<path>#<tail>'
  truth: 'changed' | 'unchanged' | 'gone';
  wsComment?: boolean; // the symbol's lines were touched only by whitespace/comment edits (must stay fresh)
  expect?: 'fresh' | 'stale' | 'moved' | 'orphaned'; // synthetic scenarios: exact expected status
  expectPath?: string; // where the symbol lives in the child version, when it moved
}
export interface KeyFile {
  path: string; // parent path
  newPath?: string; // child path when renamed/moved
  deleted?: boolean;
  added?: boolean; // exists only in the child (no notes placed)
  childText?: string; // synthetic scenarios: the child content, inline
}
export interface Scenario {
  id: string;
  repo: 'mole' | 'excalidraw';
  kind: 'commit' | 'synthetic';
  parent: string; // full sha the notes are written at
  child?: string; // full sha of the replayed commit (kind 'commit')
  subject?: string;
  files: KeyFile[];
  items: KeyItem[];
}
export interface Key {
  written: string;
  method: string;
  repos: Record<string, string>;
  scenarios: Scenario[];
}

const here = dirname(fileURLToPath(import.meta.url));
export const REPOS: Record<'mole' | 'excalidraw', string> = {
  mole: resolve(here, '../../../..'),
  excalidraw: join(homedir(), '.hermes/cache/scratch/impact/excalidraw'),
};

const git = (repo: string, args: string[]): string =>
  execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
const show = (repo: string, sha: string, path: string): string => git(repo, ['show', `${sha}:${path}`]);

interface Sym {
  tail: string;
  start: number; // 1-based
  end: number; // 1-based inclusive
  kind: 'function' | 'class' | 'method';
}

/** Top-level functions, const arrow/function-expression functions, classes, class methods + constructors. Duplicated tails are dropped. */
export function keySymbols(path: string, text: string): Sym[] {
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: Sym[] = [];
  const line = (pos: number) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const push = (tail: string, node: ts.Node, kind: Sym['kind']) => out.push({ tail, kind, start: line(node.getStart(sf)), end: line(node.getEnd()) });
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name) push(st.name.text, st, 'function');
    else if (ts.isClassDeclaration(st) && st.name) {
      const cls = st.name.text;
      push(cls, st, 'class');
      for (const m of st.members) {
        if (ts.isConstructorDeclaration(m)) push(`${cls}.constructor`, m, 'method');
        else if (ts.isMethodDeclaration(m) && (ts.isIdentifier(m.name) || ts.isPrivateIdentifier(m.name))) push(`${cls}.${m.name.text}`, m, 'method');
      }
    } else if (ts.isVariableStatement(st) && st.declarationList.declarations.length === 1) {
      const d = st.declarationList.declarations[0]!;
      if (ts.isIdentifier(d.name) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) push(d.name.text, st, 'function');
    }
  }
  const count = new Map<string, number>();
  for (const s of out) count.set(s.tail, (count.get(s.tail) ?? 0) + 1);
  return out.filter((s) => count.get(s.tail) === 1);
}

/** Line content with comments and all whitespace dropped (line-based, deliberately simpler than a tokenizer). */
export function codeOf(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('/*')) {
    const close = s.indexOf('*/');
    if (close < 0) return '';
    s = s.slice(close + 2).trim();
  }
  if (s === '' || s.startsWith('//') || s.startsWith('*')) return '';
  s = s.replace(/\/\*.*?\*\//g, '');
  const tc = s.search(/\s\/\/[^'"`]*$/);
  if (tc >= 0) s = s.slice(0, tc);
  if (s.endsWith('*/') && !s.includes('/*')) return ''; // tail of a block comment
  return s.replace(/\s+/g, '');
}

interface Hunks {
  removed: Array<{ line: number; text: string }>; // parent line numbers
  added: Array<{ line: number; text: string }>; // child line numbers
}
function parseDiff(out: string): Hunks {
  const h: Hunks = { removed: [], added: [] };
  let a = 0;
  let c = 0;
  let inHunk = false;
  for (const l of out.split('\n')) {
    const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l);
    if (m) {
      a = Number(m[1]);
      c = Number(m[2]);
      inHunk = true;
      continue;
    }
    if (!inHunk || l.startsWith('\\')) continue;
    if (l.startsWith('diff --git')) {
      inHunk = false;
      continue;
    }
    if (l.startsWith('-')) h.removed.push({ line: a++, text: l.slice(1) });
    else if (l.startsWith('+')) h.added.push({ line: c++, text: l.slice(1) });
  }
  return h;
}

function judge(parentSym: Sym, childSym: Sym, strict: Hunks, loose: Hunks): Pick<KeyItem, 'truth' | 'wsComment'> {
  const inP = (x: { line: number }) => x.line >= parentSym.start && x.line <= parentSym.end;
  const inC = (x: { line: number }) => x.line >= childSym.start && x.line <= childSym.end;
  const before = strict.removed.filter(inP).map((x) => codeOf(x.text)).join('');
  const after = strict.added.filter(inC).map((x) => codeOf(x.text)).join('');
  if (before !== after) return { truth: 'changed' };
  const touched = loose.removed.some(inP) || loose.added.some(inC);
  return touched ? { truth: 'unchanged', wsComment: true } : { truth: 'unchanged' };
}

const isSrc = (p: string) => /\.(ts|tsx)$/.test(p) && !p.endsWith('.d.ts') && !/(^|\/)(test|tests|__tests__|bench)\//.test(p) && !/\.(test|spec)\.tsx?$/.test(p);

function commitScenario(repoName: 'mole' | 'excalidraw', sha: string): Scenario | undefined {
  const repo = REPOS[repoName];
  const parent = git(repo, ['rev-parse', `${sha}^`]).trim();
  const full = git(repo, ['rev-parse', sha]).trim();
  const subject = git(repo, ['log', '-1', '--format=%s', sha]).trim();
  const files: KeyFile[] = [];
  for (const row of git(repo, ['diff', '--name-status', '-M', parent, full]).trim().split('\n')) {
    const [st = '', p1 = '', p2] = row.split('\t');
    if (!isSrc(p1) && !(p2 && isSrc(p2))) continue;
    if (st.startsWith('R')) files.push({ path: p1, newPath: p2 });
    else if (st === 'D') files.push({ path: p1, deleted: true });
    else if (st === 'A') files.push({ path: p1, added: true });
    else if (st === 'M') files.push({ path: p1 });
  }
  const items: KeyItem[] = [];
  for (const f of files) {
    if (f.added) continue;
    const parentSyms = keySymbols(f.path, show(repo, parent, f.path));
    if (f.deleted) {
      for (const s of parentSyms) items.push({ symbol: `${f.path}#${s.tail}`, truth: 'gone' });
      continue;
    }
    const childPath = f.newPath ?? f.path;
    const childSyms = keySymbols(childPath, show(repo, full, childPath));
    const paths = f.newPath ? [f.path, f.newPath] : [f.path];
    const strict = parseDiff(git(repo, ['diff', '-w', '--ignore-blank-lines', '-U0', '--no-color', '-M', parent, full, '--', ...paths]));
    const loose = parseDiff(git(repo, ['diff', '-U0', '--no-color', '-M', parent, full, '--', ...paths]));
    for (const s of parentSyms) {
      const c = childSyms.find((x) => x.tail === s.tail);
      const item: KeyItem = { symbol: `${f.path}#${s.tail}`, truth: 'gone' };
      if (c) Object.assign(item, judge(s, c, strict, loose));
      if (f.newPath && item.truth === 'unchanged') item.expectPath = f.newPath;
      items.push(item);
    }
  }
  if (items.length === 0) return undefined;
  return { id: `${repoName}-${full.slice(0, 7)}`, repo: repoName, kind: 'commit', parent, child: full, subject, files, items };
}

// ---- synthetic edits: whitespace-only, comment-only, body change, string-whitespace change, file move, deletion ----

function pickMethod(syms: Sym[], lines: string[], skip: Set<string>): Sym | undefined {
  return syms.find((s) => {
    if (s.kind !== 'method' || skip.has(s.tail) || s.end - s.start < 3) return false;
    const body = lines.slice(s.start - 1, s.end);
    return (body[0] ?? '').trimEnd().endsWith('{') && !body.some((l) => l.includes('`'));
  });
}

function synthetic(repoName: 'mole' | 'excalidraw', sha: string, path: string, movePath: string, deleteTail?: string): Scenario[] {
  const repo = REPOS[repoName];
  const parent = git(repo, ['rev-parse', sha]).trim();
  const text = show(repo, parent, path);
  const lines = text.split('\n');
  const syms = keySymbols(path, text);
  const out: Scenario[] = [];
  const used = new Set<string>();
  const containing = (s: Sym) => syms.filter((o) => o !== s && o.start <= s.start && o.end >= s.end).map((o) => o.tail);
  const scenario = (id: string, childText: string | undefined, labels: (s: Sym) => KeyItem, file?: Partial<KeyFile>) =>
    out.push({
      id: `${repoName}-synthetic-${path.split('/').pop()!.replace(/\.tsx?$/, '')}-${id}`,
      repo: repoName,
      kind: 'synthetic',
      parent,
      files: [{ path, ...(childText !== undefined ? { childText } : {}), ...file }],
      items: syms.map(labels),
    });
  const q = (s: Sym) => `${path}#${s.tail}`;

  const ws = pickMethod(syms, lines, used);
  if (ws) {
    used.add(ws.tail);
    const l2 = lines.map((l, i) => (i >= ws.start - 1 && i <= ws.end - 1 && l.trim() !== '' ? `  ${l}  ` : l));
    l2.splice(ws.start, 0, '', '   ');
    scenario(`ws-${ws.tail}`, l2.join('\n'), (s) => ({ symbol: q(s), truth: 'unchanged', expect: 'fresh', ...(s === ws || containing(ws).includes(s.tail) ? { wsComment: true } : {}) }));
  }
  const cm = pickMethod(syms, lines, used);
  if (cm) {
    used.add(cm.tail);
    const l2 = [...lines];
    l2[cm.start - 1] = `${l2[cm.start - 1]} /* synthetic: comment-only edit */`;
    l2.splice(cm.start, 0, '    // synthetic: a line comment', '    /* synthetic:', '       block comment */');
    scenario(`comment-${cm.tail}`, l2.join('\n'), (s) => ({ symbol: q(s), truth: 'unchanged', expect: 'fresh', ...(s === cm || containing(cm).includes(s.tail) ? { wsComment: true } : {}) }));
  }
  const bc = pickMethod(syms, lines, used);
  if (bc) {
    used.add(bc.tail);
    const l2 = [...lines];
    l2.splice(bc.start, 0, '    void 0;');
    const hit = new Set([bc.tail, ...containing(bc)]);
    scenario(`body-${bc.tail}`, l2.join('\n'), (s) => (hit.has(s.tail) ? { symbol: q(s), truth: 'changed', expect: 'stale' } : { symbol: q(s), truth: 'unchanged', expect: 'fresh' }));
  }
  // whitespace inside a string literal: a real change (only lines holding exactly one single-quoted string)
  const loneString = (l: string) => /'[^'\n]* [^'\n]*'/.test(l) && !l.includes('`') && !l.includes('"') && (l.match(/'/g) ?? []).length === 2 && !l.trim().startsWith('//');
  const strSym = syms.find((s) => s.kind === 'method' && !used.has(s.tail) && lines.slice(s.start - 1, s.end).some(loneString));
  if (strSym) {
    used.add(strSym.tail);
    const l2 = [...lines];
    const i = l2.findIndex((l, k) => k >= strSym.start - 1 && k <= strSym.end - 1 && loneString(l));
    l2[i] = l2[i]!.replace(/'([^'\n]*?) ([^'\n]*)'/, "'$1  $2'");
    const hit = new Set([strSym.tail, ...containing(strSym)]);
    scenario(`string-ws-${strSym.tail}`, l2.join('\n'), (s) => (hit.has(s.tail) ? { symbol: q(s), truth: 'changed', expect: 'stale' } : { symbol: q(s), truth: 'unchanged', expect: 'fresh' }));
  }
  // file move/rename, content unchanged
  scenario('move', undefined, (s) => ({ symbol: q(s), truth: 'unchanged', expect: 'moved', expectPath: movePath }), { newPath: movePath, childText: text });
  // deletion of one top-level function (or method) -> orphaned, the rest fresh
  const del = syms.find((s) => (deleteTail ? s.tail === deleteTail : s.kind === 'function'));
  if (del) {
    const l2 = [...lines];
    l2.splice(del.start - 1, del.end - del.start + 1);
    const gone = new Set([del.tail, ...syms.filter((o) => o.start >= del.start && o.end <= del.end).map((o) => o.tail)]);
    const parentsOf = new Set(containing(del));
    scenario(`delete-${del.tail}`, l2.join('\n'), (s) =>
      gone.has(s.tail)
        ? { symbol: q(s), truth: 'gone', expect: 'orphaned' }
        : parentsOf.has(s.tail)
          ? { symbol: q(s), truth: 'changed', expect: 'stale' }
          : { symbol: q(s), truth: 'unchanged', expect: 'fresh' },
    );
  }
  return out;
}

function main(): void {
  const outArg = process.argv.indexOf('--out');
  const outPath = outArg > 0 ? resolve(process.argv[outArg + 1]!) : resolve(here, '../../bench/m1-key.json');
  const written = process.env.KEY_WRITTEN ?? new Date().toISOString();
  const scenarios: Scenario[] = [];

  // Mole: every non-merge commit up to the task base that touches non-test packages/apps .ts source.
  const moleBase = process.env.MOLE_BASE ?? 'bdeff14';
  const moleShas = git(REPOS.mole, ['log', '--no-merges', '--format=%H', moleBase, '--', 'packages', 'apps'])
    .trim()
    .split('\n')
    .filter((sha) => git(REPOS.mole, ['rev-list', '--parents', '-n1', sha]).trim().split(' ').length === 2);
  for (const sha of moleShas.slice(0, 30)) {
    const s = commitScenario('mole', sha);
    if (s) scenarios.push(s);
  }
  // excalidraw (read-only shallow clone): the 15 most recent non-merge commits touching 1-6 non-test source files under packages/.
  if (existsSync(join(REPOS.excalidraw, '.git'))) {
    let taken = 0;
    for (const sha of git(REPOS.excalidraw, ['log', '--no-merges', '--format=%H', '-n', '200', 'HEAD', '--', 'packages']).trim().split('\n')) {
      if (taken >= 15) break;
      try {
        git(REPOS.excalidraw, ['cat-file', '-e', `${sha}^`]);
      } catch {
        continue;
      }
      const names = git(REPOS.excalidraw, ['diff', '--name-only', `${sha}^`, sha]).trim().split('\n').filter(isSrc);
      if (names.length < 1 || names.length > 6) continue;
      const s = commitScenario('excalidraw', sha);
      if (s) {
        scenarios.push(s);
        taken++;
      }
    }
  }
  scenarios.push(...synthetic('mole', moleBase, 'packages/daemon/src/server.ts', 'packages/daemon/src/runtime/daemon-server.ts', 'readLock'));
  scenarios.push(...synthetic('mole', moleBase, 'packages/indexer/src/ts-engine.ts', 'packages/engine/ts/engine.ts'));
  if (existsSync(join(REPOS.excalidraw, '.git'))) {
    const exHead = git(REPOS.excalidraw, ['rev-parse', 'HEAD']).trim();
    scenarios.push(...synthetic('excalidraw', exHead, 'packages/excalidraw/scene/Renderer.ts', 'packages/excalidraw/renderer/SceneRenderer.ts'));
  }

  const key: Key = {
    written,
    method:
      'truth per symbol of the parent version: changed iff `git diff -w --ignore-blank-lines -U0` lines inside the symbol (parent range for removed, child range for added) differ after dropping comment-only lines, trailing comments and all whitespace; gone iff the tail is absent from the child file; wsComment iff a plain diff touched it but truth is unchanged. Ranges from the TS parser (getStart..end). Synthetic scenarios are labelled by construction.',
    repos: { mole: 'this repository (git dir of the worktree/main checkout)', excalidraw: '~/.hermes/cache/scratch/impact/excalidraw (read-only shallow clone)' },
    scenarios,
  };
  writeFileSync(outPath, JSON.stringify(key, null, 1) + '\n');
  const items = scenarios.flatMap((s) => s.items);
  const by = (t: string) => items.filter((i) => i.truth === t).length;
  console.log(
    `wrote ${outPath}: ${scenarios.length} scenarios (${scenarios.filter((s) => s.repo === 'mole' && s.kind === 'commit').length} mole commits, ${scenarios.filter((s) => s.repo === 'excalidraw' && s.kind === 'commit').length} excalidraw commits, ${scenarios.filter((s) => s.kind === 'synthetic').length} synthetic); items ${items.length}: changed ${by('changed')}, unchanged ${by('unchanged')} (wsComment ${items.filter((i) => i.wsComment).length}), gone ${by('gone')}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
