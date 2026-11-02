// T48 red tests: a subset Argdown parser whose statement/argument relation counts match the real
// @argdown/core parser's own output (oracle JSON, generated once from the real parser -- see
// fixtures/argdown/*.oracle.json and how-generated.md in the same folder) on 2 fixtures taken from
// the Argdown repo's own test suite / a minimal variant of it (full PCS showcase debates are this
// task's own non-goal -- see 0 start.md).
import * as argdownCore from '@argdown/core';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseArgdown } from '../src/argdown/parser.js';

const { ArgdownApplication, ParserPlugin, DataPlugin, ModelPlugin } = argdownCore;

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, '..', 'fixtures', 'argdown');

interface OracleRelation {
  from: string;
  to: string;
  relationType: 'support' | 'attack' | 'undercut';
}
interface Oracle {
  statements: string[];
  arguments: string[];
  relations: OracleRelation[];
}

const TYPE_MAP: Record<OracleRelation['relationType'], 'supports' | 'attacks' | 'undercuts'> = {
  support: 'supports',
  attack: 'attacks',
  undercut: 'undercuts',
};

function loadOracle(name: string): Oracle {
  return JSON.parse(readFileSync(join(fixturesDir, `${name}.oracle.json`), 'utf8')) as Oracle;
}
function loadSource(name: string): string {
  return readFileSync(join(fixturesDir, `${name}.argdown`), 'utf8');
}

describe('parseArgdown vs @argdown/core (real parser oracle)', () => {
  it('support-attack.argdown: matches @argdown/core relation counts, directions and types', () => {
    const oracle = loadOracle('support-attack');
    const parsed = parseArgdown(loadSource('support-attack'));

    expect(parsed.relations).toHaveLength(oracle.relations.length);
    const got = parsed.relations.map((r) => ({ from: r.from, to: r.to, type: r.type })).sort((a, b) => a.from.localeCompare(b.from));
    const want = oracle.relations.map((r) => ({ from: r.from, to: r.to, type: TYPE_MAP[r.relationType] })).sort((a, b) => a.from.localeCompare(b.from));
    expect(got).toEqual(want);

    // node census: @argdown/core's statements/arguments dictionaries vs this parser's items
    const statementTitles = parsed.items.filter((i) => i.kind === 'statement').map((i) => i.title).sort();
    const argumentTitles = parsed.items.filter((i) => i.kind === 'argument').map((i) => i.title).sort();
    expect(statementTitles).toEqual([...oracle.statements].sort());
    expect(argumentTitles).toEqual([...oracle.arguments].sort());
  });

  it('undercut.argdown: matches @argdown/core (Exception --undercuts--> Base)', () => {
    const oracle = loadOracle('undercut');
    const parsed = parseArgdown(loadSource('undercut'));

    expect(parsed.relations).toHaveLength(1);
    expect(oracle.relations).toHaveLength(1);
    expect(parsed.relations[0]!.type).toBe('undercuts');
    expect(oracle.relations[0]!.relationType).toBe('undercut');
    expect(parsed.relations[0]!.from).toBe(oracle.relations[0]!.from);
    expect(parsed.relations[0]!.to).toBe(oracle.relations[0]!.to);

    const argumentTitles = parsed.items.filter((i) => i.kind === 'argument').map((i) => i.title).sort();
    expect(argumentTitles).toEqual([...oracle.arguments].sort());
  });

  it('ignores a non-dialectical token (><) and plain prose: no relation emitted, but reports the ><', () => {
    const parsed = parseArgdown('[X]: text\n  >< [Y]: other text\nSome unrelated prose that is not a title or relation.\n');
    expect(parsed.relations).toHaveLength(0);
    expect(parsed.problems).toHaveLength(1);
    expect(parsed.problems[0]).toMatchObject({ line: 2 });
    expect(parsed.problems[0]!.message).toMatch(/><.*unsupported|unsupported.*><|contradiction/i);
  });

  it('dedupes a relation repeated via a bare reference block, same as @argdown/core', () => {
    const parsed = parseArgdown('[A]: a\n  + [B]: b\n  -> <C>: c\n\n[A]\n  + [B]\n  -> <C>\n');
    expect(parsed.relations).toHaveLength(2);
  });
});

// T48 P1 fix: a blank line inside an indented relation block, unrecognized relation tokens (incl.
// `><`), and PCS/inference lines must all be reported in `problems`, not silently accepted -- and
// a blank-broken relation block must not have its relation attached across the break. Each case is
// cross-checked against the real @argdown/core parser (devDependency) directly, same plugin set as
// oracle_diff.mjs used for the original review probes.
describe('parseArgdown reports problems instead of silently accepting invalid/unsupported syntax (T48 P1)', () => {
  function realArgdownRejects(source: string): boolean {
    const app = new ArgdownApplication();
    app.addPlugin(new ParserPlugin(), 'parse-input');
    app.addPlugin(new DataPlugin(), 'build-model');
    app.addPlugin(new ModelPlugin(), 'build-model');
    try {
      const result = app.run({ process: ['parse-input', 'build-model'], input: source, logLevel: 'error' }) as unknown as Record<string, unknown>;
      const parserErrors = result['parserErrors'];
      return Boolean(result['hasFatalError'] || result['hasSyntaxErrors'] || !('relations' in result) || (Array.isArray(parserErrors) && parserErrors.length > 0));
    } catch {
      return true;
    }
  }

  it('a blank line inside an indented relation block: real @argdown/core rejects it too, and this parser must not attach the relation across the blank', () => {
    const source = '[A]: a\n\n  + [B]: b\n';
    expect(realArgdownRejects(source)).toBe(true); // confirms this is genuinely invalid Argdown, not just this parser's opinion

    const parsed = parseArgdown(source);
    expect(parsed.relations).toHaveLength(0); // not attached across the blank
    expect(parsed.problems.length).toBeGreaterThan(0);
    expect(parsed.problems[0]).toMatchObject({ line: 3 });
    expect(parsed.problems[0]!.message).toMatch(/blank line/i);
  });

  it('unindented relation lines under a title: real @argdown/core errors, this parser reports them instead of dropping silently', () => {
    const source = '[A]: a\n+ [B]: b\n- [C]: c\n';
    expect(realArgdownRejects(source)).toBe(true);
    const parsed = parseArgdown(source);
    expect(parsed.relations).toHaveLength(0);
    expect(parsed.problems.map((p) => p.line)).toEqual([2, 3]);
    expect(parsed.problems[0]!.message).toMatch(/indented/);
  });

  it('two relations separated by a blank line (both orphaned): neither relation is attached, both reported', () => {
    const source = '[A]: a\n  + [B]: b\n\n  - [C]: c\n';
    expect(realArgdownRejects(source)).toBe(true);

    const parsed = parseArgdown(source);
    // [B] still attaches (before the blank); [C] after the blank must not
    expect(parsed.relations).toHaveLength(1);
    expect(parsed.relations[0]).toMatchObject({ from: 'B', to: 'A', type: 'supports' });
    const blankProblems = parsed.problems.filter((p) => /blank line/i.test(p.message));
    expect(blankProblems).toHaveLength(1);
    expect(blankProblems[0]).toMatchObject({ line: 4 });
  });

  it('a blank line with nothing relation-shaped after it is not reported (matches @argdown/core: fine on its own)', () => {
    const parsed = parseArgdown('[A]: a\n\n[B]: b\n');
    expect(parsed.problems).toHaveLength(0);
  });

  it('a relation token on the very first line is reported (real @argdown/core reports a parser error too)', () => {
    const source = '+ [B]: a lone relation token with no enclosing item\n';
    expect(realArgdownRejects(source)).toBe(true);
    const parsed = parseArgdown(source);
    expect(parsed.relations).toHaveLength(0);
    expect(parsed.problems).toHaveLength(1);
  });

  it('the `><` contradiction token is reported as intentionally unsupported, matching real @argdown/core emitting a "contradictory" relation this EdgeType has no slot for', () => {
    const source = '[A]: a\n  >< [B]: contradicts a\n';
    const app = new ArgdownApplication();
    app.addPlugin(new ParserPlugin(), 'parse-input');
    app.addPlugin(new DataPlugin(), 'build-model');
    app.addPlugin(new ModelPlugin(), 'build-model');
    const real = app.run({ process: ['parse-input', 'build-model'], input: source, logLevel: 'error' });
    expect((real.relations ?? []).map((r: { relationType: string }) => r.relationType)).toContain('contradictory');

    const parsed = parseArgdown(source);
    expect(parsed.relations).toHaveLength(0);
    expect(parsed.problems).toHaveLength(1);
    expect(parsed.problems[0]).toMatchObject({ line: 2 });
    expect(parsed.problems[0]!.message).toMatch(/unsupported/i);
  });

  it('PCS premise/conclusion lines are ignored but reported exactly once', () => {
    const source = '<Arg1>\n\n(1) Premise one\n(2) Premise two\n----\nConclusion\n\n[A]: a\n  + [B]: b\n';
    const parsed = parseArgdown(source);
    // the top-level relation graph outside the PCS block still parses normally
    expect(parsed.relations).toHaveLength(1);
    expect(parsed.relations[0]).toMatchObject({ from: 'B', to: 'A', type: 'supports' });
    const pcsProblems = parsed.problems.filter((p) => /premise-conclusion|PCS/i.test(p.message));
    expect(pcsProblems).toHaveLength(1);
    expect(pcsProblems[0]).toMatchObject({ line: 3 }); // first unsupported line, "(1) Premise one"
  });

  it('an inference-rule separator line (----) alone is reported as unsupported PCS syntax, not treated as a relation token', () => {
    const parsed = parseArgdown('<Arg1>\n----\nConclusion\n');
    expect(parsed.relations).toHaveLength(0);
    expect(parsed.problems.filter((p) => /premise-conclusion|PCS/i.test(p.message))).toHaveLength(1);
  });
});
