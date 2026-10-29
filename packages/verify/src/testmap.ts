// Test-case map of one test file: every it()/test() with its full title, call line and span, nested in describe blocks.
// Pure TypeScript parsing (no type checker), so it works on any test file the runner accepts.
import ts from 'typescript';

export interface TestCase {
  /** describe titles + test title joined by ' > ' (the runner's full name) */
  name: string;
  title: string;
  /** describe titles + test title, unjoined (a title may itself contain ' > ') */
  titles: string[];
  /** 1-based line of the call (vitest's location filter) */
  line: number;
  start: number;
  end: number;
  /** indexes of enclosing describe blocks, outermost first */
  suites: number[];
  /** the test file skips this test on purpose (own or an enclosing describe's modifier): 'skip' (.skip), 'todo' (.todo),
   *  'if' (.skipIf/.runIf, or a ctx.skip() call in the body: decided at run time) */
  skip?: 'skip' | 'todo' | 'if';
  /** indexes (in `titles`) of titles that are not literals (it(name), it('a' + b)): no name filter can match them */
  wild?: number[];
}

export interface Suite {
  name: string;
  titles: string[];
  start: number;
  end: number;
  skip?: 'skip' | 'todo' | 'if';
  wild?: number[];
}

export interface TestMap {
  tests: TestCase[];
  suites: Suite[];
}

const TEST_FN = new Set(['it', 'test']);
const SUITE_FN = new Set(['describe', 'suite', 'context']);

/** base identifier of `it`, `it.only`, `it.each([...])`, `test.concurrent.skip` ... */
function calleeBase(e: ts.Expression): string | undefined {
  let cur: ts.Expression = e;
  for (;;) {
    if (ts.isIdentifier(cur)) return cur.text;
    if (ts.isPropertyAccessExpression(cur)) cur = cur.expression;
    else if (ts.isCallExpression(cur)) cur = cur.expression; // it.each([...])('title', fn)
    else if (ts.isTaggedTemplateExpression(cur)) cur = cur.tag;
    else return undefined;
  }
}

/** the skip modifier on a test/describe callee chain (`it.skip`, `describe.todo`, `it.skipIf(c)`, `test.concurrent.skip`) */
function modifierOf(e: ts.Expression): TestCase['skip'] {
  let cur: ts.Expression = e;
  let found: TestCase['skip'];
  for (;;) {
    if (ts.isPropertyAccessExpression(cur)) {
      const m = cur.name.text;
      if (m === 'skip') found = 'skip';
      else if (m === 'todo') found = found ?? 'todo';
      else if ((m === 'skipIf' || m === 'runIf') && !found) found = 'if';
      cur = cur.expression;
    } else if (ts.isCallExpression(cur)) cur = cur.expression;
    else if (ts.isTaggedTemplateExpression(cur)) cur = cur.tag;
    else return found;
  }
}

const isLiteralTitle = (arg: ts.Expression | undefined): boolean =>
  !!arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg) || ts.isTemplateExpression(arg));

function titleOf(arg: ts.Expression | undefined, sf: ts.SourceFile): string {
  if (!arg) return '';
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) return arg.text;
  if (ts.isTemplateExpression(arg)) return arg.getText(sf).slice(1, -1);
  return arg.getText(sf);
}

export function testMap(path: string, text: string): TestMap {
  const kind = /\.[cm]?[jt]sx$/.test(path) ? ts.ScriptKind.TSX : /\.[cm]?jsx?$/.test(path) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
  const lineOf = (pos: number): number => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const tests: TestCase[] = [];
  const suites: Suite[] = [];
  const visit = (n: ts.Node, stack: number[]): void => {
    if (ts.isCallExpression(n) && !(ts.isCallExpression(n.parent) && n.parent.expression === n)) {
      const base = calleeBase(n.expression);
      const fnArg = n.arguments.find((a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a));
      if (base && (TEST_FN.has(base) || SUITE_FN.has(base)) && n.arguments.length > 0) {
        const title = titleOf(n.arguments[0], sf);
        // a suite's name already holds its ancestors' titles: the prefix is the innermost suite's name
        const names = stack.length ? [suites[stack[stack.length - 1]!]!.name] : [];
        const parents = stack.length ? suites[stack[stack.length - 1]!]!.titles : [];
        const start = lineOf(n.getStart(sf));
        const end = lineOf(n.getEnd());
        const parent = stack.length ? suites[stack[stack.length - 1]!]! : undefined;
        const own = modifierOf(n.expression);
        // an enclosing describe.skip/todo wins over the test's own runtime condition
        const skip = parent?.skip === 'skip' || parent?.skip === 'todo' ? parent.skip : own ?? parent?.skip;
        const wild = [...(parent?.wild ?? []), ...(isLiteralTitle(n.arguments[0]) ? [] : [parents.length])];
        const flags = { ...(skip ? { skip } : {}), ...(wild.length ? { wild } : {}) };
        if (SUITE_FN.has(base)) {
          suites.push({ name: [...names, title].join(' > '), titles: [...parents, title], start, end, ...flags });
          const idx = suites.length - 1;
          if (fnArg) ts.forEachChild(fnArg, (c) => visit(c, [...stack, idx]));
          return;
        }
        // a ctx.skip() / context.skip() call in the body skips at run time
        const runtimeSkip = !skip && fnArg && fnArg.parameters.length > 0 && /\.skip\s*\(/.test(fnArg.body.getText(sf));
        const tflags = runtimeSkip ? { ...flags, skip: 'if' as const } : flags;
        tests.push({ name: [...names, title].join(' > '), title, titles: [...parents, title], line: start, start, end, suites: [...stack], ...tflags });
        return;
      }
    }
    ts.forEachChild(n, (c) => visit(c, stack));
  };
  visit(sf, []);
  return { tests, suites };
}

/**
 * The tests a line in this file belongs to: the innermost test whose span holds it; else every test of the innermost
 * describe holding it (beforeEach, helpers inside the block); else (module level) every test in the file.
 */
export function testsAtLine(m: TestMap, line: number): TestCase[] {
  const own = m.tests.filter((t) => t.start <= line && line <= t.end);
  if (own.length) return [own.reduce((a, b) => (b.end - b.start < a.end - a.start ? b : a))];
  let best = -1;
  m.suites.forEach((s, i) => {
    if (s.start <= line && line <= s.end && (best < 0 || s.end - s.start < m.suites[best]!.end - m.suites[best]!.start)) best = i;
  });
  if (best >= 0) return m.tests.filter((t) => t.suites.includes(best));
  return m.tests;
}
