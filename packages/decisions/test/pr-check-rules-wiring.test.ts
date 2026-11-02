// T49 red tests: `rules/check.ts` (dependency-cruiser import rules + TS-AST call rules) wired into `prCheck`'s
// governed/unanchored sets, so `cascadeCheck`'s zero-LLM tier picks up an import:/call: rule violation for free
// (verifier.md finding #1 -- "wire, don't rebuild"). A decision whose ONLY rule items are `rules:` (no scope, no
// content anchor, no export-convention title) must still show up in `governed` when the PR introduces a violation
// on an added line; a violation on a line the PR did NOT touch must never govern (review 1 P1-1 analog: a
// pre-existing violation elsewhere in the repo is not something THIS diff introduced).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prCheck } from '../src/index.js';

const git = (root: string, ...args: string[]) =>
  execFileSync('git', ['-C', root, '-c', 'user.name=T', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }).trim();

let root = '';
let base = '';
const heads: Record<string, string> = {};

function write(rel: string, text: string) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}
function pr(name: string, edit: () => void): string {
  git(root, 'checkout', '-q', '-b', name, base);
  edit();
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', name);
  const sha = git(root, 'rev-parse', 'HEAD');
  git(root, 'checkout', '-q', base);
  return sha;
}

const RULE_RECORD = [
  '---',
  "id: 'D-rule'",
  'title: UI never imports the database layer',
  'status: accepted',
  'rules:',
  '  - forbid: import',
  '    from: src/ui/',
  '    to: src/db/',
  '    why: the UI goes through the API so the db can move',
  '---',
  '',
  '## Decision',
  '',
  'src/ui never imports src/db directly.',
  '',
].join('\n');

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'mole-pr-check-rules-'));
  git(root, 'init', '-q', '-b', 'main');
  write('.mole/decisions/D-rule.md', RULE_RECORD);
  write('src/db/query.ts', 'export const q = 1;\n');
  write('src/ui/view.ts', '// nothing imported yet\nexport const v = 1;\n');
  write('src/ui/other.ts', 'export const o = 1;\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'base');
  base = git(root, 'rev-parse', 'HEAD');
  heads.violating = pr('add-forbidden-import', () => write('src/ui/view.ts', "import { q } from '../db/query.js';\n// nothing imported yet\nexport const v = q;\n"));
  heads.unrelated = pr('unrelated-edit', () => write('src/ui/other.ts', 'export const o = 2;\n'));
  // T49 review FAIL: a PR must not silence its own rule by deleting the record or stripping its rules: key
  const forbidden = "import { q } from '../db/query.js';\n// nothing imported yet\nexport const v = q;\n";
  heads.deletesRecord = pr('delete-record-and-violate', () => { rmSync(join(root, '.mole/decisions/D-rule.md')); write('src/ui/view.ts', forbidden); });
  heads.stripsRules = pr('strip-rules-and-violate', () => {
    write('.mole/decisions/D-rule.md', RULE_RECORD.replace(/rules:[\s\S]*?why: [^\n]*\n/, ''));
    write('src/ui/view.ts', forbidden);
  });
});
afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

describe('prCheck wires rules/check.ts (import:/call: rule items) into governed', () => {
  it('a decision with ONLY a rules: item (no scope, no content anchor) governs the line that violates it', async () => {
    const r = await prCheck({ root, base, head: heads.violating! });
    const g = r.governed.find((x) => x.id === 'D-rule');
    expect(g).toBeDefined();
    expect(g!.hits.some((h) => h.anchor.startsWith('rule:') && h.path === 'src/ui/view.ts')).toBe(true);
  });

  it('a PR that deletes the rule record in the same diff is still checked against the merge-base record', async () => {
    const r = await prCheck({ root, base, head: heads.deletesRecord! });
    expect(r.governed.find((x) => x.id === 'D-rule')?.hits.some((h) => h.anchor.startsWith('rule:'))).toBe(true);
  });

  it('a PR that strips the rules: key in the same diff is still checked against the merge-base record', async () => {
    const r = await prCheck({ root, base, head: heads.stripsRules! });
    expect(r.governed.find((x) => x.id === 'D-rule')?.hits.some((h) => h.anchor.startsWith('rule:'))).toBe(true);
  });

  it('an edit that never touches the import line (unrelated file) reports silent for D-rule', async () => {
    const r = await prCheck({ root, base, head: heads.unrelated! });
    expect(r.governed.find((x) => x.id === 'D-rule')).toBeUndefined();
  });
});
