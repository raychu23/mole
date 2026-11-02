// T48 red tests: a subset Argdown parser whose statement/argument relation counts match the real
// @argdown/core parser's own output (oracle JSON, generated once from the real parser -- see
// fixtures/argdown/*.oracle.json and how-generated.md in the same folder) on 2 fixtures taken from
// the Argdown repo's own test suite / a minimal variant of it (full PCS showcase debates are this
// task's own non-goal -- see 0 start.md).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseArgdown } from '../src/argdown/parser.js';

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

  it('ignores a non-dialectical token (><) and plain prose: no relation emitted', () => {
    const parsed = parseArgdown('[X]: text\n  >< [Y]: other text\nSome unrelated prose that is not a title or relation.\n');
    expect(parsed.relations).toHaveLength(0);
  });

  it('dedupes a relation repeated via a bare reference block, same as @argdown/core', () => {
    const parsed = parseArgdown('[A]: a\n  + [B]: b\n  -> <C>: c\n\n[A]\n  + [B]\n  -> <C>\n');
    expect(parsed.relations).toHaveLength(2);
  });
});
