// @mole/questions: L3 questions (T14). For a change, at most 3 questions aimed at your understanding, built from
// deterministic templates over facts other packages found: past fixes + guarding tests (@mole/history, T12),
// your notes (@mole/memory, T11) and, later, your seen history (T13, a typed hook only). A model may only reword
// a question's text behind a flag; it never decides which questions exist, their order or their sources.
import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { check, parseDiff, type Block, type Change, type CheckOptions, type CheckResult, type FileDiff, type PastFix } from '@mole/history';
// @mole/memory loads the TypeScript compiler: imported only when there are notes to place (keeps `mole check` fast)

export type QuestionKind = 'past-fix' | 'note' | 'guard-test' | 'seen';

export interface Question {
  /** 1-based position after ranking (past fix > note > guard-test > seen; a guard-test edit always keeps a slot) */
  rank: number;
  kind: QuestionKind;
  text: string;
  /** the fact the question is about */
  cites: { sha?: string; note?: string; testFile?: string };
  /** clickable source: file:line (in commit `sha` when given, else at the base / the note file) */
  source: { file: string; line: number; sha?: string };
}

/** A note (T11) on a symbol the change edits. file is relative to the notes root ('.mole/notes/x.md'). */
export interface NoteFact {
  file: string;
  symbol: string;
  path: string;
  /** base-side line range of the symbol */
  startLine: number;
  endLine: number;
  /** fresh = the symbol's body at the base still has the note's hash */
  status: 'fresh' | 'stale';
  text: string;
  author: string;
  written: string;
  /** line of the note body in the note file */
  line: number;
}

/** A guarding test of a past fix that the change edits or deletes (read from the test diff). */
export interface GuardFact {
  testFile: string;
  /** describe/it titles the change edits or deletes that the fix named as its tests */
  names: string[];
  action: 'edits' | 'deletes';
  /** base-side first edited line */
  line: number;
  fix: { sha: string; shortSha: string; subject: string; date: string };
  /** blame = the fix last wrote the edited test lines; named = the fix added/edited (or sat in) a test with that title */
  via: 'blame' | 'named';
}

/** T13 hook (not built yet): something you looked at before, on a file/line this change touches. */
export interface SeenFact {
  file: string;
  line: number;
  when: string;
  what: string;
  sha?: string;
}

export interface QuestionsOptions extends CheckOptions {
  /** read .mole/notes from this directory instead of the repo root (e.g. for a read-only clone) */
  notesRoot?: string;
  /** T13 input (future): your seen history; ignored when absent */
  seen?: SeenFact[];
  /** reword the template text with a model; with no model configured this is a no-op plus a notice */
  reword?: boolean;
  /** the model hook used when reword is on; never consulted for which questions exist */
  model?: (text: string) => Promise<string>;
}

export interface QuestionsResult {
  questions: Question[];
  facts: CheckResult & { notes: NoteFact[]; guards: GuardFact[] };
  modelCalls: number;
  notices: string[];
}

export const MAX_QUESTIONS = 3;
export const NO_MODEL_NOTICE = 'reword: no model configured; questions are shown as written (deterministic templates)';

const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
// same test-file and title patterns as @mole/history (T12), so "guarding test" means the same thing in both
const TEST_FILE = /(^|\/)(test|tests|__tests__|spec|specs)\/|\.(test|spec)\.[cm]?[jt]sx?$|_test\.(go|py)$|(^|\/)test_[^/]*\.py$/;
const TITLE = /\b(?:describe|it|test|suite|context)(?:\.\w+)*\(\s*(['"`])((?:\\.|(?!\1).)+?)\1/g;
/** at most this many fix commits per test file are read for their guarding-test names */
const MAX_FIXES_PER_TEST_FILE = 50;

function git(root: string, args: string[]): Promise<string> {
  return new Promise((res, rej) => {
    execFile(
      'git',
      ['-C', root, '--no-optional-locks', '-c', 'core.quotePath=false', ...args],
      { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } },
      (err, stdout, stderr) => (err ? rej(new Error(`git ${args.slice(0, 2).join(' ')}: ${(stderr || err.message).trim().split('\n')[0]}`)) : res(stdout)),
    );
  });
}

const clip = (s: string, n: number): string => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const range = (start: number, n: number): string => (n <= 1 ? `${start}` : `${start}-${start + n - 1}`);
const titlesIn = (s: string): string[] => [...s.matchAll(TITLE)].map((m) => m[2]!);
const indentOf = (s: string): number => /^\s*/.exec(s)![0].replace(/\t/g, '  ').length;
const uniq = <T>(xs: T[]): T[] => [...new Set(xs)];

/** the change's diff text, the same way @mole/history resolved it */
async function changeDiff(root: string, r: CheckResult): Promise<string> {
  if (r.change.kind === 'sha') return git(root, ['diff', '-U0', '--no-color', '--no-ext-diff', r.change.base, r.change.ref]);
  if (r.change.kind === 'diff') return readFileSync(r.change.ref, 'utf8');
  return git(root, ['diff', '-U0', '--no-color', '--no-ext-diff', 'HEAD']);
}

class BaseFiles {
  private cache = new Map<string, Promise<string[] | undefined>>();
  constructor(
    readonly root: string,
    readonly base: string,
  ) {}
  lines(path: string): Promise<string[] | undefined> {
    let p = this.cache.get(path);
    if (!p) {
      p = this.base === EMPTY_TREE ? Promise.resolve(undefined) : git(this.root, ['show', `${this.base}:${path}`]).then((t) => t.split('\n'), () => undefined);
      this.cache.set(path, p);
    }
    return p;
  }
}

// ---------- notes (T11) ----------

async function noteFacts(notesRoot: string, files: FileDiff[], base: BaseFiles): Promise<Array<NoteFact & { order: number; hunk: { file: string; start: number; n: number } }>> {
  const dir = join(notesRoot, '.mole', 'notes');
  if (!existsSync(dir)) return [];
  let names: string[] = [];
  try {
    names = readdirSync(dir).filter((n) => n.endsWith('.md')).sort();
  } catch {
    return [];
  }
  if (!names.length || !files.some((f) => f.oldPath)) return [];
  const { parseNote, symbolsOfText } = await import('@mole/memory');
  const out: Array<NoteFact & { order: number; hunk: { file: string; start: number; n: number } }> = [];
  for (const n of names) {
    const file = `.mole/notes/${n}`;
    let content: string;
    try {
      content = readFileSync(join(dir, n), 'utf8');
    } catch {
      continue;
    }
    const { note } = parseNote(content, file);
    if (!note) continue; // invalid notes are `mole memory`'s business, not a question
    const fi = files.findIndex((f) => f.oldPath === note.path);
    if (fi < 0) continue;
    const lines = await base.lines(note.path);
    if (!lines) continue;
    const tail = note.symbol.slice(note.symbol.indexOf('#') + 1);
    const sym = symbolsOfText(note.path, lines.join('\n')).find((s) => s.tail === tail);
    if (!sym) continue; // moved / orphaned at the base: not asked (INFERENCE, see 2 insights.md)
    const f = files[fi]!;
    const bi = f.blocks.findIndex((b) =>
      b.oldLines > 0 ? b.oldStart <= sym.endLine && b.oldStart + b.oldLines - 1 >= sym.startLine : b.oldStart >= sym.startLine && b.oldStart < sym.endLine,
    );
    if (bi < 0) continue;
    const b = f.blocks[bi]!;
    const cl = content.split('\n');
    const close = cl.findIndex((l, i) => i > 0 && l.trim() === '---');
    let line = close + 2;
    while (line <= cl.length && !cl[line - 1]!.trim()) line++;
    out.push({
      file,
      symbol: note.symbol,
      path: note.path,
      startLine: sym.startLine,
      endLine: sym.endLine,
      status: sym.hash === note.hash ? 'fresh' : 'stale',
      text: note.text,
      author: note.author,
      written: note.written,
      line: Math.min(Math.max(line, 1), cl.length),
      order: fi * 100000 + bi,
      hunk: { file: f.newPath ?? f.oldPath ?? note.path, start: b.oldLines ? b.oldStart : b.newStart, n: b.oldLines || b.newLines },
    });
  }
  return out.sort((a, b) => a.order - b.order || a.file.localeCompare(b.file));
}

// ---------- guarding tests (read from the test diff) ----------

interface FixNames {
  sha: string;
  subject: string;
  date: string;
  names: Set<string>;
}

/** fix-rule commits that touched a test file before the base, each with the test titles it added or sat in (T12's names) */
async function fixesOfTestFile(root: string, base: string, file: string, rule: RegExp, shallow: boolean): Promise<FixNames[]> {
  const raw = await git(root, ['log', `-n${MAX_FIXES_PER_TEST_FILE * 4}`, '--format=%H%x1f%P%x1f%aI%x1f%s', base, '--', file]).catch(() => '');
  const fixes = raw
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split('\x1f') as [string, string, string, string])
    .filter(([, parents, , subject]) => rule.test(subject) && !(shallow && !parents.trim())) // shallow boundary "wrote" everything
    .slice(0, MAX_FIXES_PER_TEST_FILE);
  const out: FixNames[] = [];
  for (const [sha, parents, date, subject] of fixes) {
    const parent = parents.split(' ')[0] || EMPTY_TREE;
    const d = await git(root, ['diff', '-U0', '--no-color', '--no-ext-diff', parent, sha, '--', file]).catch(() => '');
    const names = new Set<string>();
    for (const f of parseDiff(d)) for (const b of f.blocks) for (const t of [...titlesIn(b.context), ...b.added.flatMap((a) => titlesIn(a.text))]) names.add(t);
    out.push({ sha, subject, date, names });
  }
  return out;
}

/** describe/it titles that enclose base line `at` (by indentation, walking up) */
function enclosingTitles(lines: string[], at: number): string[] {
  const out: string[] = [];
  const start = lines[at - 1];
  let indent = start !== undefined && start.trim() ? indentOf(start) : Number.POSITIVE_INFINITY;
  for (let i = at - 2; i >= 0 && indent > 0; i--) {
    const l = lines[i]!;
    if (!l.trim()) continue;
    const ind = indentOf(l);
    if (ind >= indent) continue;
    const t = titlesIn(l);
    if (t.length) out.push(t[0]!);
    indent = ind;
  }
  return out;
}

async function guardFacts(root: string, r: CheckResult, files: FileDiff[], base: BaseFiles, rule: RegExp, shallow: boolean): Promise<GuardFact[]> {
  const out: GuardFact[] = [];
  for (const f of files) {
    const file = f.oldPath;
    if (!file || !TEST_FILE.test(file)) continue;
    const edits = f.blocks.filter((b) => b.oldLines > 0); // pure additions never edit a guarding test
    if (!edits.length) continue;
    const lines = (await base.lines(file)) ?? [];
    const deleted = !f.newPath;
    // (a) blame: a fix last wrote the edited test lines (T12 already found it on this hunk)
    const blamed = new Map<string, { fix: PastFix; n: number; line: number; names: string[] }>();
    for (const b of edits) {
      const h = r.hunks.find((x) => x.file === (f.newPath ?? f.oldPath) && x.oldStart === b.oldStart && x.oldLines === b.oldLines);
      for (const pf of h?.pastFixes ?? []) {
        const e = blamed.get(pf.sha) ?? { fix: pf, n: 0, line: b.oldStart, names: [] };
        e.n += pf.lines.length;
        e.names.push(...b.removed.flatMap((x) => titlesIn(x.text)), ...enclosingTitles(lines, b.oldStart));
        blamed.set(pf.sha, e);
      }
    }
    const best = [...blamed.values()].sort((a, b) => b.n - a.n || b.fix.date.localeCompare(a.fix.date))[0];
    const action = (b: Block[]): 'edits' | 'deletes' => (deleted || b.every((x) => x.newLines === 0) ? 'deletes' : 'edits');
    if (best) {
      out.push({
        testFile: file,
        names: uniq(best.names),
        action: action(edits),
        line: best.line,
        fix: { sha: best.fix.sha, shortSha: best.fix.shortSha, subject: best.fix.subject, date: best.fix.date },
        via: 'blame',
      });
      continue;
    }
    // (b) named: a title the change deletes or edits inside is one a fix added or sat in
    const fixes = await fixesOfTestFile(root, r.change.base, file, rule, shallow);
    if (!fixes.length) continue;
    let found: GuardFact | undefined;
    for (const b of edits) {
      const titles = uniq([...b.removed.flatMap((x) => titlesIn(x.text)), ...enclosingTitles(lines, b.oldStart), ...titlesIn(b.context)]);
      for (const fx of fixes) {
        const names = titles.filter((t) => fx.names.has(t));
        if (!names.length) continue;
        found = { testFile: file, names, action: action([b]), line: b.oldStart, fix: { sha: fx.sha, shortSha: fx.sha.slice(0, 7), subject: fx.subject, date: fx.date }, via: 'named' };
        break; // newest matching fix first (git log order)
      }
      if (found) break;
    }
    if (found) out.push(found);
  }
  return out;
}

// ---------- templates ----------

function why(f: PastFix): string | undefined {
  const comment = f.reasonSources.find((s) => s.kind === 'comment');
  if (comment) return comment.text;
  const task = f.reasonSources.find((s) => s.kind === 'task');
  if (task) return task.text;
  const body = f.reason.startsWith(`${f.subject} — `) ? f.reason.slice(f.subject.length + 3).split(' | ')[0] : undefined;
  return body && body.length >= 12 ? body : undefined;
}

function pastFixText(f: PastFix, where: string): string {
  const w = why(f);
  const real = f.tests.filter((x) => !/\.snap$/.test(x.file)); // a snapshot is not a test you can name
  const t = real.find((x) => x.via === 'fix' && x.names?.length) ?? real.find((x) => x.via === 'fix') ?? f.tests.find((x) => x.via === 'fix') ?? real[0];
  const test = t
    ? t.via === 'symbol'
      ? ` A test that references this code: ${t.file}.`
      : ` Its guarding test: ${t.file}${t.names?.length ? ` » "${t.names[0]}"` : ''}.`
    : ' No test was added with that fix.';
  return (
    `You edit ${where}, lines ${f.shortSha} "${clip(f.subject, 90)}" wrote as a fix${w ? ` (why: ${clip(w, 140)})` : ''}. ` +
    `Does your change keep that fix working?${test} (source: ${f.shortSha} ${f.source.file}:${f.source.line})`
  );
}

function noteText(n: NoteFact & { hunk: { file: string; start: number; n: number } }): string {
  return (
    `Your note on ${n.symbol}${n.status === 'stale' ? ' (written before the code last changed)' : ''} says: "${clip(n.text, 200)}". ` +
    `This change edits ${n.hunk.file}:${range(n.hunk.start, n.hunk.n)} inside it; does the note still hold, or should it change with the code? (source: ${n.file}:${n.line})`
  );
}

function guardText(g: GuardFact, base: string): string {
  const what = g.names.length ? `${g.testFile} » "${g.names[0]}"` : g.testFile;
  return (
    `This change ${g.action} ${what}, a test guarding ${g.fix.shortSha} "${clip(g.fix.subject, 90)}". ` +
    `If that fix breaks again, what will catch it? (source: ${g.testFile}:${g.line} at ${base.slice(0, 10)}; fix ${g.fix.shortSha})`
  );
}

function seenText(s: SeenFact): string {
  return `You looked at ${s.file}:${s.line} ${s.when} (${clip(s.what, 120)}); this change edits it. Is what you understood then still true? (source: ${s.file}:${s.line})`;
}

// ---------- main ----------

type Draft = Omit<Question, 'rank'>;

export async function questions(repoRoot: string, change: Change, opts: QuestionsOptions = {}): Promise<QuestionsResult> {
  const root = (await git(resolve(repoRoot), ['rev-parse', '--show-toplevel'])).trim();
  const r = await check(root, change, opts.fixRule !== undefined ? { fixRule: opts.fixRule } : {});
  const rule = new RegExp(r.fixRule, 'i');
  const shallow = (await git(root, ['rev-parse', '--is-shallow-repository']).catch(() => 'false')).trim() === 'true';
  const files = parseDiff(await changeDiff(root, r)).filter((f) => f.blocks.length > 0);
  const base = new BaseFiles(root, r.change.base);
  const notes = await noteFacts(resolve(opts.notesRoot ?? root), files, base);
  const guards = await guardFacts(root, r, files, base, rule, shallow);

  // past fixes on code (non-test) hunks: one question per sha, most lines first
  const bySha = new Map<string, { fix: PastFix; n: number; hunk: { file: string; oldStart: number; oldLines: number }; best: number }>();
  for (const h of r.hunks) {
    if (TEST_FILE.test(h.file)) continue; // a fix on test lines is asked as a guard-test question
    for (const f of h.pastFixes) {
      const e = bySha.get(f.sha);
      if (!e) bySha.set(f.sha, { fix: f, n: f.lines.length, hunk: h, best: f.lines.length });
      else {
        e.n += f.lines.length;
        if (f.lines.length > e.best) Object.assign(e, { fix: f, hunk: h, best: f.lines.length });
      }
    }
  }
  const pastFix: Draft[] = [...bySha.values()]
    .sort((a, b) => b.n - a.n || b.fix.date.localeCompare(a.fix.date))
    .map(({ fix, hunk }) => ({
      kind: 'past-fix',
      text: pastFixText(fix, `${hunk.file}:${range(hunk.oldStart, hunk.oldLines)}`),
      cites: { sha: fix.sha },
      source: { file: fix.source.file, line: fix.source.line, sha: fix.sha },
    }));
  const noteQs: Draft[] = notes.map((n) => ({ kind: 'note', text: noteText(n), cites: { note: n.file }, source: { file: n.file, line: n.line } }));
  const guardQs: Draft[] = guards.map((g) => ({
    kind: 'guard-test',
    text: guardText(g, r.change.base),
    cites: { testFile: g.testFile, sha: g.fix.sha },
    source: { file: g.testFile, line: g.line, sha: r.change.base },
  }));
  const seenQs: Draft[] = (opts.seen ?? [])
    .filter((s) => files.some((f) => f.oldPath === s.file && f.blocks.some((b) => b.oldLines > 0 && s.line >= b.oldStart && s.line < b.oldStart + b.oldLines)))
    .map((s) => ({ kind: 'seen', text: seenText(s), cites: s.sha ? { sha: s.sha } : {}, source: { file: s.file, line: s.line, ...(s.sha ? { sha: s.sha } : {}) } }));

  const all = [...pastFix, ...noteQs, ...guardQs, ...seenQs];
  const picked = all.slice(0, MAX_QUESTIONS);
  // an edited or deleted guarding test is always asked: it takes the last slot when the cap is full without it
  if (guardQs.length && !picked.some((q) => q.kind === 'guard-test')) picked[MAX_QUESTIONS - 1] = guardQs[0]!;

  const notices: string[] = [];
  let modelCalls = 0;
  if (opts.reword && picked.length) {
    if (!opts.model) notices.push(NO_MODEL_NOTICE);
    else {
      for (const q of picked) {
        modelCalls++;
        let reply = '';
        try {
          reply = (await opts.model(q.text)).trim();
        } catch {
          reply = '';
        }
        // a reworded question must keep its clickable source and the sha it cites, or the template text stays
        const keeps = reply.includes(`${q.source.file}:${q.source.line}`) && (!q.cites.sha || reply.includes(q.cites.sha.slice(0, 7)));
        if (reply && keeps) q.text = reply;
      }
    }
  }

  return {
    questions: picked.map((q, i) => ({ rank: i + 1, ...q })),
    facts: { ...r, notes: notes.map(({ order: _o, hunk: _h, ...n }) => n), guards },
    modelCalls,
    notices,
  };
}

export function formatQuestions(qs: Question[]): string {
  if (!qs.length) return '';
  const out = [`questions (${qs.length}):`];
  for (const q of qs) {
    out.push(`  ${q.rank}. [${q.kind}] ${q.text}`);
    out.push(`     source: ${q.source.sha ? `${q.source.sha.slice(0, 10)} ` : ''}${q.source.file}:${q.source.line}`);
  }
  return out.join('\n');
}
