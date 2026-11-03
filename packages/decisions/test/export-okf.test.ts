// T72 red tests: `mole export --format okf` writes an OKF v0.2 bundle (tasks/T72-okf-export/4 log/prior-art.md
// quotes SPEC.md verbatim for every field name used here). Mapping under test: status->lifecycle (§5.4),
// approver->trust `verified` (§5.2) with source->provenance `sources[]` (§5.1), evidence->`sources[]` too (no
// bespoke attestation key invented -- prior-art.md §5), git commit date->freshness `generated.at` (§5.2).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { loadGraph } from '../src/graph.js';
import { buildOkfBundle } from '../src/export/okf.js';
import { exportCli } from '../src/export/cli.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const git = (root: string, ...args: string[]) =>
  execFileSync('git', ['-C', root, '-c', 'user.name=T', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }).trim();

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-okf-export-'));
  roots.push(root);
  mkdirSync(join(root, '.mole', 'decisions'), { recursive: true });
  writeFileSync(
    join(root, '.mole', 'decisions', 'D-accepted.md'),
    "---\nid: 'D-accepted'\ntitle: 'Keep records local'\nstatus: accepted\napprover: ahormati\nsource: context/brief.md\nevidence:\n  - test: 'packages/decisions/test/capture.test.ts#creates an explicit-id proposed record without changing an existing record'\n---\n\n## Decision\n\nKeep decision records local to the repo.\n",
  );
  writeFileSync(
    join(root, '.mole', 'decisions', 'D-proposed.md'),
    "---\nid: 'D-proposed'\ntitle: 'Open proposal'\nstatus: proposed\n---\n\n## Decision\n\nUnder discussion.\n",
  );
  writeFileSync(
    join(root, '.mole', 'decisions', 'D-superseded.md'),
    "---\nid: 'D-superseded'\ntitle: 'Old choice'\nstatus: superseded\nsuperseded_by: [D-accepted]\n---\n\n## Decision\n\nReplaced.\n",
  );
  git(root, 'init', '-q');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'seed decisions');
  return root;
}

describe('buildOkfBundle', () => {
  it('writes one concept per decision/tenet node with a non-empty `type` (OKF SPEC.md §11 conformance rule 2)', () => {
    const root = repo();
    const graph = loadGraph(root);
    const bundle = buildOkfBundle(graph, root);
    const concepts = bundle.files.filter((f) => f.path.endsWith('.md') && f.path !== 'index.md');
    expect(concepts.length).toBe(3);
    for (const f of concepts) expect(f.content).toMatch(/^type: \S.+$/m);
  });

  it('maps Mole status to an OKF §5.4 lifecycle value and keeps the original in the `mole_status` extension key', () => {
    const root = repo();
    const bundle = buildOkfBundle(loadGraph(root), root);
    const accepted = bundle.files.find((f) => f.path.endsWith('D-accepted.md'))!.content;
    const proposed = bundle.files.find((f) => f.path.endsWith('D-proposed.md'))!.content;
    const superseded = bundle.files.find((f) => f.path.endsWith('D-superseded.md'))!.content;
    expect(accepted).toMatch(/^status: stable$/m);
    expect(accepted).toContain('mole_status: accepted');
    expect(proposed).toMatch(/^status: draft$/m);
    expect(superseded).toMatch(/^status: deprecated$/m);
  });

  it('populates `generated.by`/`verified` (trust, §5.2) from `approver` using the OKF actor convention (§7)', () => {
    const root = repo();
    const bundle = buildOkfBundle(loadGraph(root), root);
    const accepted = bundle.files.find((f) => f.path.endsWith('D-accepted.md'))!.content;
    expect(accepted).toContain('human:ahormati');
    expect(accepted).toMatch(/verified: \{ by: human:ahormati/);
    const proposed = bundle.files.find((f) => f.path.endsWith('D-proposed.md'))!.content;
    expect(proposed).not.toContain('verified:');
  });

  it('populates `generated.at` (freshness, §5.2) as an ISO 8601 datetime from the record\'s git history', () => {
    const root = repo();
    const bundle = buildOkfBundle(loadGraph(root), root);
    const accepted = bundle.files.find((f) => f.path.endsWith('D-accepted.md'))!.content;
    expect(accepted).toMatch(/generated: \{ by: human:ahormati, at: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2} \}/);
  });

  it('populates `sources[]` (provenance, §5.1) from `source` and `evidence`', () => {
    const root = repo();
    const bundle = buildOkfBundle(loadGraph(root), root);
    const accepted = bundle.files.find((f) => f.path.endsWith('D-accepted.md'))!.content;
    expect(accepted).toContain('resource: context/brief.md');
    expect(accepted).toContain("packages/decisions/test/capture.test.ts");
  });

  it('writes a bundle-root index.md carrying `okf_version: "0.2"` (§12) that lists every concept (§8)', () => {
    const root = repo();
    const bundle = buildOkfBundle(loadGraph(root), root);
    const index = bundle.files.find((f) => f.path === 'index.md')!.content;
    expect(index).toContain('okf_version: "0.2"');
    expect(index).toContain('D-accepted');
    expect(index).toContain('D-proposed');
    expect(index).toContain('D-superseded');
  });

  it('a concept with no optional families (no approver/source/evidence) still passes conformance rule 2 (just `type`)', () => {
    const root = repo();
    const bundle = buildOkfBundle(loadGraph(root), root);
    const proposed = bundle.files.find((f) => f.path.endsWith('D-proposed.md'))!.content;
    expect(proposed).not.toContain('sources:');
    expect(proposed).toMatch(/^type: \S/m);
  });
});

describe('mole export --format okf', () => {
  it('writes the bundle under --out (default .mole/export/okf) and returns 0', () => {
    const root = repo();
    const out = join(root, 'my-export');
    const code = exportCli([], { format: 'okf', out }, root);
    expect(code).toBe(0);
    expect(readdirSync(out)).toContain('index.md');
  });

  it('rejects an unknown --format', () => {
    const root = repo();
    const code = exportCli([], { format: 'yaml' }, root);
    expect(code).toBe(2);
  });

  it('is reachable from the mole CLI (shared-file rule: toContain, never an exact set)', () => {
    const src = readFileSync(new URL('../../daemon/src/cli.ts', import.meta.url), 'utf8');
    expect(src).toContain("cmd === 'export'");
    expect(src).toContain('exportCli(pos, flags, root)');
  });
});

describe('OKF v0.2 round-trip through the reference validator', () => {
  it('validate_okf.py reports no conformance errors for an exported bundle (external consumer, done-when #3)', () => {
    const root = repo();
    const out = join(root, 'okf-out');
    expect(exportCli([], { format: 'okf', out }, root)).toBe(0);
    const validator = fileURLToPath(new URL('../../../tasks/T72-okf-export/4 log/validate_okf.py', import.meta.url));
    let py: string | null = null;
    try {
      py = execFileSync('python3', ['--version'], { encoding: 'utf8' }).trim();
    } catch {
      py = null;
    }
    if (!py) {
      console.warn('NOT RUN: python3 unavailable -- no interop claim made');
      return;
    }
    const result = execFileSync('python3', [validator, out], { encoding: 'utf8' });
    expect(result).not.toMatch(/ERROR/);
  });
});

describe('T72 review: the bundle carries no machine-local path', () => {
  it('no file in the bundle contains the absolute repo path or the home directory', () => {
    const root = repo();
    const bundle = buildOkfBundle(loadGraph(root), root);
    const home = process.env.HOME ?? '/Users/';
    for (const f of bundle.files) {
      expect(f.content, f.path).not.toContain(root);
      expect(f.content, f.path).not.toContain(home);
    }
  });
});

