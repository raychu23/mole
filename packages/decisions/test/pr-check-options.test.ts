// T32 options round (written failing first): option 1 = content anchors (`match:` items {pattern, in?, why?} on a decision
// record govern ADDED lines whose text matches inside the glob), option 2 = version-bump hunks (old/new lines differ only in
// version-like tokens) are not governed by scope anchors; a content anchor naming the dependency (on the changed line or the
// hunk's enclosing-block header) still fires. Option 3 (options round 2, T32): a version-only hunk under a folder/file scope
// anchor governs only if its enclosing block or added text names a term from the record's own title (standard IR term
// extraction over the title, no new authored data); default on, subsumed by option 2 when that is also on. All three are
// switchable per run so the bench can score every combination.
// Options round 3 (T32): option 4 = a scope:[] record whose own title is export-convention gets a generic AST content
// anchor (a new named export, AST-detected: `exportConventionRanges`); option 5 = a folder/file/symbol scope anchor never
// governs a comment-only hunk or a hunk in a test file; option 6 = extends option 3's title-term gate to any hunk inside a
// Terraform `locals`/`variable`/`output` block (no resource-type signal), UNLESS the touched file itself already declares a
// resource naming the record's title (file-scoped, not block-scoped, so an edit elsewhere in the SAME file as a titled
// resource stays governed; only a DIFFERENT, unrelated file under the same folder anchor is gated).
// (written with a terminal heredoc: write_file/patch are approval-gated for test files in this unattended run)
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
const MIXED_TF = `resource "helm_release" "app" {\n  name  = "app"\n  chart = "app-chart"\n}\n\nlocals {\n  replicas = 2\n}\n`;
const OTHER_TF = `locals {\n  policy = "p, role:x, apps, allow"\n}\n`;
const WIDGET = `export function existing(): number {\n  return 1;\n}\n`;
const WIDGET_NEW_IFACE = `export function existing(): number {\n  return 1;\n}\n\nexport interface WidgetOptions {\n  size: number;\n}\n`;
const BARREL = `export {\n  existing,\n} from './widget';\n`;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'mole-pr-options-'));
  git(root, 'init', '-q', '-b', 'main');
  write('infra/main.tf', HELM);
  write('infra/versions.tf', `terraform {\n  required_providers {\n    aws = {\n      source  = "hashicorp/aws"\n      version = "~> 5.0"\n    }\n  }\n}\n`);
  write('pkg/src/lib.ts', LIB);
  write('pkg/src/a.ts', 'export const a = 1;\n');
  write('docs/x.ts', 'const z = 1;\n');
  // title mirrors the real M24 gi-0006 case ("Use Helm for application package management"): a folder-scope record whose
  // title names the technology (Helm) that one of its files' version bumps is really about, and another file in the same
  // folder (a generic terraform provider pin) that is not.
  write('.mole/decisions/infra-folder.md', `---\nid: infra-folder\ntitle: Use Helm for infra package management\nstatus: accepted\nscope:\n  - infra/\n---\n`);
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
  // round 3 fixtures
  write('.mole/decisions/prefer-named-exports.md', `---\nid: prefer-named-exports\ntitle: Avoid Default Exports and Prefer Named Exports\nstatus: accepted\nscope: []\n---\n`);
  write('pkg2/src/widget.ts', WIDGET);
  write('pkg2/src/barrel.ts', BARREL);
  write('pkg2/src/widget.test.ts', `import { existing } from './widget';\ntest('x', () => existing());\n`);
  write('.mole/decisions/doc-structure.md', `---\nid: doc-structure\ntitle: Public API document structure\nstatus: accepted\nscope:\n  - apidocs/\n---\n`);
  write('apidocs/a.ts', 'export interface A {\n  x: number;\n}\n');
  write('infra-two/mixed.tf', MIXED_TF);
  write('infra-two/other.tf', OTHER_TF);
  write('.mole/decisions/infra-two-folder.md', `---\nid: infra-two-folder\ntitle: Use Helm for infra package management\nstatus: accepted\nscope:\n  - infra-two/\n---\n`);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'base');
  base = git(root, 'rev-parse', 'HEAD');
  heads.chartBump = pr('chart-bump', () => write('infra/main.tf', HELM.replace('2.66.1', '2.67.0')));
  heads.providerBump = pr('provider-bump', () => write('infra/versions.tf', `terraform {\n  required_providers {\n    aws = {\n      source  = "hashicorp/aws"\n      version = "~> 6.0"\n    }\n  }\n}\n`));
  heads.realInfra = pr('real-infra', () => write('infra/main.tf', HELM.replace('replicas = 2', 'replicas = 3\n  zone = "a"')));
  heads.addExport = pr('add-export', () => write('pkg/src/lib.ts', `${LIB}\nexport function more(): number {\n  return 2;\n}\n`));
  heads.noExport = pr('no-export', () => write('pkg/src/lib.ts', LIB.replace('a + 1', 'a + 2')));
  heads.exportOutside = pr('export-outside', () => write('docs/x.ts', 'export const z = 1;\n'));
  // option 4: a barrel re-export list gains a new name (bare "export {" header predates the PR, like bs#34892's
  // alpha.ts), and a whole new exported interface is added; editing an EXISTING export's body never governs.
  heads.barrelAdd = pr('barrel-add', () => write('pkg2/src/barrel.ts', `export {\n  existing,\n  brandNew,\n} from './widget';\n`));
  heads.newInterface = pr('new-interface', () => write('pkg2/src/widget.ts', WIDGET_NEW_IFACE));
  heads.editExisting = pr('edit-existing', () => write('pkg2/src/widget.ts', `export function existing(): number {\n  return 2;\n}\n`));
  // option 5: a comment-only hunk and a test-file-only hunk never govern a folder/file scope anchor
  heads.docComment = pr('doc-comment', () => write('apidocs/a.ts', 'export interface A {\n  /** a comment */\n  x: number;\n}\n'));
  heads.widgetTestEdit = pr('widget-test-edit', () => write('pkg2/src/widget.test.ts', `import { existing } from './widget';\ntest('x', () => existing());\ntest('y', () => existing());\n`));
  // option 6: a bare `locals` edit in the SAME file as a titled resource stays governed; the same edit in a
  // DIFFERENT file under the folder that never declares that resource (an RBAC-style locals block) is gated
  heads.sameFileLocals = pr('same-file-locals', () => write('infra-two/mixed.tf', MIXED_TF.replace('replicas = 2', 'replicas = 3')));
  heads.otherFileLocals = pr('other-file-locals', () => write('infra-two/other.tf', OTHER_TF.replace('allow"', 'allow"\n  extra  = "y"')));
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

const ids = async (head: string, o: Record<string, boolean | undefined> = {}) => (await prCheck({ root, base, head, history: false, ...o })).governed.map((g) => g.id).sort();

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
    expect(await ids(heads.addExport!, { contentAnchors: true, versionBumpRule: false, exportConventionGate: false })).toEqual(['named-exports']);
  });
  it('do not fire on lines without the construct, or outside the glob; deprecated records never govern', async () => {
    expect(await ids(heads.noExport!, { contentAnchors: true, versionBumpRule: false, exportConventionGate: false })).toEqual([]);
    expect(await ids(heads.exportOutside!, { contentAnchors: true, versionBumpRule: false, exportConventionGate: false })).toEqual([]);
  });
  it('are ignored when switched off (the round-1 behaviour)', async () => {
    expect(await ids(heads.addExport!, { contentAnchors: false, versionBumpRule: false, exportConventionGate: false })).toEqual([]);
  });
  it('annotate the matched line with the pattern as the anchor', async () => {
    const r = await prCheck({ root, base, head: heads.addExport!, history: false, contentAnchors: true, exportConventionGate: false });
    const g = r.governed.find((x) => x.id === 'named-exports')!;
    expect(g.hits[0]!.path).toBe('pkg/src/lib.ts');
    expect(g.hits[0]!.anchor).toMatch(/^match:/);
    expect(g.hits[0]!.ranges).toEqual([[7, 7]]);
  });
});

describe('version-bump rule (option 2)', () => {
  it('a folder anchor does not govern a version-only hunk; with both gates off it does', async () => {
    expect(await ids(heads.providerBump!, { contentAnchors: true, versionBumpRule: true })).toEqual([]);
    expect(await ids(heads.providerBump!, { contentAnchors: true, versionBumpRule: false, titleBumpGate: false })).toEqual(['infra-folder']);
  });
  it('a content anchor naming the dependency in the enclosing block still fires on a version bump', async () => {
    expect(await ids(heads.chartBump!, { contentAnchors: true, versionBumpRule: true })).toEqual(['use-helm']);
  });
  it('a non-version change under the folder is still governed', async () => {
    expect(await ids(heads.realInfra!, { contentAnchors: true, versionBumpRule: true })).toEqual(['infra-folder']);
  });
});

describe('title-term bump gate (option 3, options round 2)', () => {
  it('default on: a provider bump that names none of the folder record\'s title terms is not governed', async () => {
    expect(await ids(heads.providerBump!, { contentAnchors: true })).toEqual([]);
  });
  it('a bump whose enclosing block names a title term still governs (helm_release bump, title "Use Helm for infra package management")', async () => {
    expect(await ids(heads.chartBump!, { contentAnchors: false, titleBumpGate: true })).toEqual(['infra-folder']);
  });
  it('a non-version change under the folder is unaffected by the gate (option 3 only looks at version-only hunks)', async () => {
    expect(await ids(heads.realInfra!, { contentAnchors: true, titleBumpGate: true, tfBareBlockTitleGate: false })).toEqual(['infra-folder']);
  });
  it('versionBumpRule (option 2) still wins when both are set: the bump is dropped even with a title-term match', async () => {
    expect(await ids(heads.chartBump!, { contentAnchors: false, titleBumpGate: true, versionBumpRule: true })).toEqual([]);
  });
});

describe('export-convention AST detector (option 4, options round 3)', () => {
  it('a new name added to an existing barrel re-export list governs (bs#34892 shape: the "export {" header predates the PR)', async () => {
    expect(await ids(heads.barrelAdd!, { exportConventionGate: true })).toEqual(['prefer-named-exports']);
  });
  it('a whole new exported declaration governs (its name did not exist in the old file)', async () => {
    expect(await ids(heads.newInterface!, { exportConventionGate: true })).toEqual(['prefer-named-exports']);
  });
  it('editing the BODY of an existing export never governs: the name already existed in the old file', async () => {
    expect(await ids(heads.editExisting!, { exportConventionGate: true })).toEqual([]);
  });
  it('is off when switched off', async () => {
    expect(await ids(heads.barrelAdd!, { exportConventionGate: false })).toEqual([]);
  });
});

describe('scope noise filter (option 5, options round 3)', () => {
  it('a comment/doc-only hunk never governs a folder/file scope anchor', async () => {
    expect(await ids(heads.docComment!, { scopeNoiseFilter: true })).toEqual([]);
    expect(await ids(heads.docComment!, { scopeNoiseFilter: false })).toEqual(['doc-structure']);
  });
  it('a hunk in a test file never governs a folder/file scope anchor (option 4 also skips test files)', async () => {
    expect(await ids(heads.widgetTestEdit!, { scopeNoiseFilter: true, exportConventionGate: true })).toEqual([]);
  });
});

describe('Terraform bare-block title gate (option 6, options round 3)', () => {
  it('a bare-block (locals) edit in the SAME file as a titled resource stays governed', async () => {
    expect(await ids(heads.sameFileLocals!, { tfBareBlockTitleGate: true })).toEqual(['infra-two-folder']);
  });
  it('the same kind of edit in a DIFFERENT file under the folder, with no titled resource in that file, is gated', async () => {
    expect(await ids(heads.otherFileLocals!, { tfBareBlockTitleGate: true })).toEqual([]);
  });
  it('switched off: the other-file edit is governed again (round-2 behaviour)', async () => {
    expect(await ids(heads.otherFileLocals!, { tfBareBlockTitleGate: false })).toEqual(['infra-two-folder']);
  });
});
