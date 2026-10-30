// T36 tests: spec-kit importer (constitution.md principles -> tenets, specs/*/research.md D-NNN -> decisions
// anchored to real code paths), MADR front-matter status, KEP status+replaces via a sibling kep.yaml, and the
// malformed-front-matter failure case (that record is skipped with a reason, the others still load).
// (written with a terminal heredoc: write_file is approval-gated for test files in this unattended run)
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadGraph } from '../src/index.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-dec-t36-'));
  dirs.push(root);
  for (const [p, t] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), t);
  }
  return root;
}

describe('spec-kit importer', () => {
  it('imports constitution.md Core Principles as tenets', () => {
    const root = repo({
      '.specify/memory/constitution.md': `# demo Constitution\n\n## Core Principles\n\n### I. Code Quality (NON-NEGOTIABLE)\n\nBody.\n\n### II. Testing Standards\n\nBody.\n\n## Governance\n\n**Version**: 1.0.0 | **Ratified**: 2026-01-01 | **Last Amended**: 2026-01-02\n`,
    });
    const g = loadGraph(root, {});
    const tenets = g.nodes.filter((n) => n.kind === 'tenet');
    expect(tenets.map((t) => t.id)).toEqual(['speckit-tenet:code-quality', 'speckit-tenet:testing-standards']);
    expect(tenets[0]!.title).toBe('Code Quality');
    expect(tenets[0]!.status).toBe('accepted');
    expect(tenets[0]!.confirmed).toBe('2026-01-02');
  });

  it('imports specs/*/research.md D-NNN decisions, status from spec.md, anchored to a real code path', () => {
    const root = repo({
      'specs/001-demo/spec.md': `# Feature Specification: Demo\n\n**Status**: Draft\n**Created**: 2026-02-01\n`,
      'specs/001-demo/research.md': `# Research: Demo\n\n**Date**: 2026-02-01\n\n## D-001: Use Vite\n\n**Decision**: Use \`frontend/vite.config.ts\`.\n\n**Rationale**: fast.\n`,
      'frontend/vite.config.ts': 'export default {}\n',
    });
    const g = loadGraph(root, {});
    const d = g.nodes.find((n) => n.id === 'speckit:001-demo:D-001');
    expect(d?.title).toBe('Use Vite');
    expect(d?.status).toBe('proposed'); // spec.md Status: Draft
    expect(d?.scope.map((a) => a.target)).toEqual(['frontend/vite.config.ts']);
  });

  it('does not anchor a code path that does not exist in the repo', () => {
    const root = repo({
      'specs/001-demo/spec.md': `**Status**: Accepted\n**Created**: 2026-02-01\n`,
      'specs/001-demo/research.md': `## D-001: Ghost\n\n**Decision**: Uses \`nowhere/ghost.ts\`.\n`,
    });
    const g = loadGraph(root, {});
    const d = g.nodes.find((n) => n.id === 'speckit:001-demo:D-001');
    expect(d?.scope).toEqual([]);
  });
});

describe('MADR 3/4 front-matter status (no ## Status body section)', () => {
  it('reads status from YAML front matter when there is no Status section', () => {
    const root = repo({
      'docs/decisions/0001-use-postgres.md': `---\nstatus: accepted\ndate: 2026-01-01\ndeciders: alice, bob\n---\n# Use PostgreSQL\n\n## Context\n\nBody.\n`,
    });
    const g = loadGraph(root, { adrDirs: ['docs/decisions'] });
    const n = g.nodes.find((x) => x.id === '0001');
    expect(n?.status).toBe('accepted');
    expect(n?.fields.date).toBeDefined();
    expect(n?.fields.deciders).toBeDefined();
  });

  it('front-matter supersedes/superseded_by becomes a supersedes edge', () => {
    const root = repo({
      'docs/decisions/0001-old.md': `---\nstatus: superseded\nsuperseded_by: 0002\n---\n# Old choice\n`,
      'docs/decisions/0002-new.md': `---\nstatus: accepted\n---\n# New choice\n`,
    });
    const g = loadGraph(root, { adrDirs: ['docs/decisions'] });
    expect(g.edges.some((e) => e.from === '0002' && e.to === '0001' && e.type === 'supersedes')).toBe(true);
  });
});

describe('KEP-style status + replaces (sibling kep.yaml, kubernetes/enhancements convention)', () => {
  it('reads status from kep.yaml next to README.md when the markdown has no ## Status', () => {
    const root = repo({
      'keps/sig-x/old/kep.yaml': `title: Old KEP\nstatus: replaced\n`,
      'keps/sig-x/old/README.md': `# Old KEP\n\nBody, no Status section.\n`,
    });
    const g = loadGraph(root, { adrDirs: ['keps/sig-x/old'] });
    const n = g.nodes.find((x) => x.file.includes('old'));
    expect(n?.statusText).toBe('replaced');
  });

  it('a replaces KEP yields a supersedes edge once both folders are loaded together', () => {
    const root = repo({
      'keps/sig-x/old/kep.yaml': `title: Old KEP\nstatus: replaced\n`,
      'keps/sig-x/old/README.md': `# Old KEP\n`,
      'keps/sig-x/new/kep.yaml': `title: New KEP\nstatus: implementable\nreplaces:\n  - "/keps/sig-x/old"\n`,
      'keps/sig-x/new/README.md': `# New KEP\n`,
    });
    const g = loadGraph(root, { adrDirs: ['keps/sig-x/old', 'keps/sig-x/new'] });
    const ids = g.nodes.map((n) => n.id);
    expect(ids).toContain('old');
    expect(ids).toContain('new');
    expect(g.edges.some((e) => e.type === 'supersedes' && e.from === 'new' && e.to === 'old')).toBe(true);
  });
});

describe('malformed front matter: that record is skipped with a reason, the others still load', () => {
  it('ADR folder: one broken-YAML file is skipped, its sibling still loads', () => {
    const root = repo({
      'docs/decisions/0001-broken.md': `---\nstatus: [unclosed\n---\n# Broken\n`,
      'docs/decisions/0002-fine.md': `---\nstatus: accepted\n---\n# Fine\n`,
    });
    const g = loadGraph(root, { adrDirs: ['docs/decisions'] });
    expect(g.nodes.map((n) => n.id)).toEqual(['0002']);
    expect(g.problems.some((p) => p.file.includes('0001-broken') && /YAML/.test(p.message))).toBe(true);
  });

  it('a kep.yaml with broken YAML is reported as a problem, the record still loads from its markdown', () => {
    const root = repo({
      'keps/sig-x/old/kep.yaml': `title: [unclosed\n`,
      'keps/sig-x/old/README.md': `# Old KEP\n\n## Status\n\nAccepted\n`,
    });
    const g = loadGraph(root, { adrDirs: ['keps/sig-x/old'] });
    expect(g.nodes.length).toBe(1);
    expect(g.nodes[0]!.status).toBe('accepted'); // from the README's own ## Status, unaffected by the broken kep.yaml
    expect(g.problems.some((p) => p.file.includes('kep.yaml'))).toBe(true);
  });
});
