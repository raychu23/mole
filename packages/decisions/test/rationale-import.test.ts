// T43 red test (done-when 1, 4): an ADR imported from a plain Nygard/adr-tools folder (the T36 ADR-import
// path, graph.ts loadAdrDir) reaches `decisions()` -- the same function the MCP tool mole_decisions and
// `mole decisions --json` both call -- with its full Decision/Rationale/Consequences text intact, not just
// id/title/status/scope (packages/decisions/bench/m24v2/backstage/.mole/decisions/bs-adr001.md shows the old,
// thin overlay shape this must move past for any ADR dir that carries real prose).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { decisions } from '../src/index.js';
import { RATIONALE_BUDGET } from '../src/rationale.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function repoWithAdr(adrBody: string): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-t43-'));
  dirs.push(root);
  mkdirSync(join(root, 'docs/adr'), { recursive: true });
  writeFileSync(join(root, 'docs/adr/0001-use-sqlite.md'), adrBody);
  return root;
}

describe('decisions(): a plain ADR carries its full rationale through, bounded', () => {
  it('a 1,500-char rationale under "## Decision" reaches the result intact, named by section', () => {
    const rationale = 'We chose SQLite because it needs no server process and the index must work offline. '.repeat(16); // > 1,500 chars
    const root = repoWithAdr(`# Use SQLite for the index\n\n## Status\n\nAccepted\n\n## Decision\n\n${rationale}\n`);
    const r = decisions(root, { adrDirs: ['docs/adr'] });
    const d = r.decisions.find((x) => x.id === '0001');
    expect(d).toBeDefined();
    expect(d!.rationale).toBeDefined();
    expect(d!.rationale).toContain('needs no server process');
    expect(d!.rationale!.length).toBeGreaterThan(1000); // the real prose, not a 240-char summary
  });

  it('three named sections (Decision, Context, Consequences) all come through when present', () => {
    const root = repoWithAdr(
      `# Use SQLite for the index\n\n## Status\n\nAccepted\n\n## Context\n\nThe index must work with no running service.\n\n## Decision\n\nUse SQLite.\n\n## Consequences\n\nQueries stay index-friendly.\n`,
    );
    const r = decisions(root, { adrDirs: ['docs/adr'] });
    const d = r.decisions.find((x) => x.id === '0001')!;
    expect(d.rationale).toMatch(/Decision:/);
    expect(d.rationale).toMatch(/Context\/Rationale:/);
    expect(d.rationale).toMatch(/Consequences:/);
  });

  it('is bounded by the documented RATIONALE_BUDGET per record, never unbounded', () => {
    const huge = 'x '.repeat(10_000); // ~20,000 chars
    const root = repoWithAdr(`# Big ADR\n\n## Decision\n\n${huge}\n`);
    const r = decisions(root, { adrDirs: ['docs/adr'] });
    const d = r.decisions.find((x) => x.id === '0001')!;
    expect(d.rationale!.length).toBeLessThanOrEqual(RATIONALE_BUDGET + 60);
  });

  it('a Mole-native .mole/decisions record also carries its full body as rationale (not only the file:line + title)', () => {
    const root = mkdtempSync(join(tmpdir(), 'mole-t43-native-'));
    dirs.push(root);
    mkdirSync(join(root, '.mole/decisions'), { recursive: true });
    writeFileSync(
      join(root, '.mole/decisions/0001-x.md'),
      `---\nid: '0001'\ntitle: Serve from one process\nstatus: accepted\nscope:\n  - app.ts\n---\n\n## Decision\n\nOne process serves every request, because splitting it loses the warm cache and the team has no SRE to run a cluster safely.\n\n## Consequences\n\nAny future split must keep a single in-memory cache owner.\n`,
    );
    const r = decisions(root, {});
    const d = r.decisions.find((x) => x.id === '0001')!;
    expect(d.rationale).toContain('loses the warm cache');
    expect(d.rationale).toMatch(/Consequences:/);
  });
});
