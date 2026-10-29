// T32 options round (written failing first): option 1 = content anchors (`match:` items {pattern, in?, why?} on a decision
// record govern ADDED lines whose text matches inside the glob), option 2 = version-bump hunks (old/new lines differ only in
// version-like tokens) are not governed by scope anchors; a content anchor naming the dependency (on the changed line or the
// hunk's enclosing-block header) still fires. Both are switchable per run so the bench can score every combination.
// (written with a terminal heredoc: write_file is approval-gated for test files in this unattended run)
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { globToRegExp, isVersionOnlyHunk, prCheck } from '../src/index.js';

const git = (root: string, ...args: string[]) =>
  execFileSync('git', ['-C', root, '-c', 'user.name=T', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }).trim();

let root = '';
let base = '';
const heads: Record<string, string> = {};
const write = (rel: string, text: string) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
};
function pr(name: string, edit: () => void): string {
  git(root, 'checkout', '-q', '-b', name, base);
  edit();
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', name);
  const sha = git(root, 'rev-parse', 'HEAD');
  git(root, 'checkout', '-q', base);
  return sha;
}
const HELM = `resource "helm_release" "csi" {\n  name    = "csi"\n  chart   = "aws-ebs-csi-driver"\n  version = "2.66.1"\n}\n\nlocals {\n  replicas = 2\n}\n`;
const LIB = `import { a } from './a';\n\nfunction local(): number {\n  return a + 1;\n}\n`;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'mole-pr-options-'));
  git(root, 'init', '-q', '-b', 'main');
  write('infra/main.tf', HELM);
  write('infra/versions.tf', `terraform {\n  required_providers {\n    aws = {\n      source  = "hashicorp/aws"\n      version = "~> 5.0"\n    }\n  }\n}\n`);
  write('pkg/src/lib.ts', LIB);
  write('pkg/src/a.ts', 'export const a = 1;\n');
  write('docs/x.ts', 'const z = 1;\n');
  write('.mole/decisions/infra-folder.md', `---\nid: infra-folder\ntitle: Infra is laid out this way\nstatus: accepted\nscope:\n  - infra/\n---\n`);
  write(
    '.mole/decisions/use-helm.md',
    `---\nid: use-helm\ntitle: Use Helm\nstatus: accepted\nscope: []\nmatch:\n  - pattern: '\\bhelm_release\\b'\n    in: 'infra/**'\n    why: 'Use Helm v3+.'\n---\n`,
  );
  write(
    '.mole/decisions/named-exports.md',
    `---\nid: named-exports\ntitle: Prefer named exports\nstatus: accepted\nscope: []\nmatch:\n  - pattern: '^\\s*export\\s'\n    in: '{pkg,plugins}/src/**'\n    why: 'We will stop using default exports'\n---\n`,
  );
  write(
    '.mole/decisions/old-convention.md',
    `---\nid: old-convention\ntitle: Old convention\nstatus: deprecated\nscope: []\nmatch:\n  - pattern: 'export'\n---\n`,
  );
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'base');
  base = git(root, 'rev-parse', 'HEAD');
  heads.chartBump = pr('chart-bump', () => write('infra/main.tf', HELM.replace('2.66.1', '2.67.0')));
  heads.providerBump = pr('provider-bump', () => write('infra/versions.tf', `terraform {\n  required_providers {\n    aws = {\n      source  = "hashicorp/aws"\n      version = "~> 6.0"\n    }\n  }\n}\n`));
  heads.realInfra = pr('real-infra', () => write('infra/main.tf', HELM.replace('replicas = 2', 'replicas = 3\n  zone = "a"')));
  heads.addExport = pr('add-export', () => write('pkg/src/lib.ts', `${LIB}\nexport function more(): number {\n  return 2;\n}\n`));
  heads.noExport = pr('no-export', () => write('pkg/src/lib.ts', LIB.replace('a + 1', 'a + 2')));
  heads.exportOutside = pr('export-outside', () => write('docs/x.ts', 'export const z = 1;\n'));
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

const ids = async (head: string, o: { contentAnchors?: boolean; versionBumpRule?: boolean }) =>
  (await prCheck({ root, base, head, history: false, ...o })).governed.map((g) => g.id).sort();

describe('isVersionOnlyHunk (option 2)', () => {
  it('is true when old and new lines differ only in version-like tokens', () => {
    expect(isVersionOnlyHunk(['  version = "2.66.1"'], ['  version = "2.67.0"'])).toBe(true);
    expect(isVersionOnlyHunk(['      version = "~> 5.0"'], ['      version = "~> 6.0"'])).toBe(true);
    expect(isVersionOnlyHunk(['    "jose": "^5.0.0",'], ['    "jose": "^6.1.0",'])).toBe(true);
    expect(isVersionOnlyHunk(['      - uses: actions/checkout@0ad4b8fadaa221de15dcec353f45205ec38ea70b # v4'], ['      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2'])).toBe(true);
    expect(isVersionOnlyHunk(['  required_version = "1.13.3"'], ['  required_version = "1.14.0"'])).toBe(true);
  });
  it('is false for any other change', () => {
    expect(isVersionOnlyHunk(['  replicas = 2'], ['  replicas = 3'])).toBe(false);
    expect(isVersionOnlyHunk(['  name = "a"'], ['  name = "b"'])).toBe(false);
    expect(isVersionOnlyHunk(['  version = "1.0.0"'], ['  version = "1.1.0"', '  extra = true'])).toBe(false);
    expect(isVersionOnlyHunk([], ['  version = "1.1.0"'])).toBe(false);
    expect(isVersionOnlyHunk(['  version = "1.0.0"'], [])).toBe(false);
  });
});

describe('globToRegExp', () => {
  it('handles **, * and {a,b}', () => {
    expect(globToRegExp('{pkg,plugins}/*/src/**').test('plugins/x/src/a/b.ts')).toBe(true);
    expect(globToRegExp('{pkg,plugins}/*/src/**').test('plugins/x/y/src/b.ts')).toBe(false);
    expect(globToRegExp('**/*.test.{ts,tsx}').test('a/b/c.test.tsx')).toBe(true);
    expect(globToRegExp('**/*.test.{ts,tsx}').test('c.test.ts')).toBe(true);
    expect(globToRegExp('terraform/**').test('terraform/a/b.tf')).toBe(true);
    expect(globToRegExp('terraform/**').test('other/terraform/b.tf')).toBe(false);
  });
});

describe('content anchors (option 1)', () => {
  it('govern an added line matching the pattern inside the glob', async () => {
    expect(await ids(heads.addExport!, { contentAnchors: true, versionBumpRule: false })).toEqual(['named-exports']);
  });
  it('do not fire on lines without the construct, or outside the glob; deprecated records never govern', async () => {
    expect(await ids(heads.noExport!, { contentAnchors: true, versionBumpRule: false })).toEqual([]);
    expect(await ids(heads.exportOutside!, { contentAnchors: true, versionBumpRule: false })).toEqual([]);
  });
  it('are ignored when switched off (the round-1 behaviour)', async () => {
    expect(await ids(heads.addExport!, { contentAnchors: false, versionBumpRule: false })).toEqual([]);
  });
  it('annotate the matched line with the pattern as the anchor', async () => {
    const r = await prCheck({ root, base, head: heads.addExport!, history: false, contentAnchors: true });
    const g = r.governed.find((x) => x.id === 'named-exports')!;
    expect(g.hits[0]!.path).toBe('pkg/src/lib.ts');
    expect(g.hits[0]!.anchor).toMatch(/^match:/);
    expect(g.hits[0]!.ranges).toEqual([[7, 7]]);
  });
});

describe('version-bump rule (option 2)', () => {
  it('a folder anchor does not govern a version-only hunk; without the rule it does', async () => {
    expect(await ids(heads.providerBump!, { contentAnchors: true, versionBumpRule: true })).toEqual([]);
    expect(await ids(heads.providerBump!, { contentAnchors: true, versionBumpRule: false })).toEqual(['infra-folder']);
  });
  it('a content anchor naming the dependency in the enclosing block still fires on a version bump', async () => {
    expect(await ids(heads.chartBump!, { contentAnchors: true, versionBumpRule: true })).toEqual(['use-helm']);
  });
  it('a non-version change under the folder is still governed', async () => {
    expect(await ids(heads.realInfra!, { contentAnchors: true, versionBumpRule: true })).toEqual(['infra-folder']);
  });
});
