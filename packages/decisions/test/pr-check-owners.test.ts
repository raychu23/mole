// T32 red tests: CODEOWNERS semantics as GitHub documents them (about-code-owners): gitignore-style patterns without `!`,
// `[ ]` or `\#`; the last matching line wins; a line with no owners leaves the path unowned; the file is looked up in
// .github/, the root, then docs/ (first found wins).
// (written with a terminal heredoc: write_file is approval-gated for test files in this unattended run)
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { codeownersAt, parseCodeowners } from '../src/index.js';

const DOC_EXAMPLE = `# GitHub's documented example (trimmed)
*       @global-owner1 @global-owner2
*.js    @js-owner #This is an inline comment.
*.go docs@example.com
/build/logs/ @doctocat
docs/*  docs@example.com
apps/ @octocat
/docs/ @doctocat
/scripts/ @doctocat @octocat
**/logs @octocat
/apps/ @octocat
/apps/github
/apps/github @doctocat
`;

describe('CODEOWNERS patterns', () => {
  const co = parseCodeowners(DOC_EXAMPLE);
  it('a bare * owns everything not matched later', () => {
    expect(co.ownersOf('README.md')).toEqual(['@global-owner1', '@global-owner2']);
    expect(co.ownersOf('src/deep/file.txt')).toEqual(['@global-owner1', '@global-owner2']);
  });
  it('*.js anywhere; inline comment dropped; email owners', () => {
    expect(co.ownersOf('src/x/y.js')).toEqual(['@js-owner']);
    expect(co.ownersOf('cmd/main.go')).toEqual(['docs@example.com']);
  });
  it('/build/logs/ is anchored at the root and covers the folder contents; a later **/logs wins there', () => {
    const c = parseCodeowners('/build/logs/ @doctocat\n');
    expect(c.ownersOf('build/logs/a/b.txt')).toEqual(['@doctocat']);
    expect(c.ownersOf('x/build/logs/b.txt')).toEqual([]);
    expect(co.ownersOf('build/logs/a/b.txt')).toEqual(['@octocat']);
    expect(co.ownersOf('x/build/logs/b.txt')).toEqual(['@octocat']);
  });
  it('docs/* matches direct children of the root docs folder only; nested files are not matched by it', () => {
    const c = parseCodeowners('* @all\ndocs/* docs@example.com\n');
    expect(c.ownersOf('docs/getting-started.md')).toEqual(['docs@example.com']);
    expect(c.ownersOf('docs/build-app/troubleshooting.md')).toEqual(['@all']);
    expect(c.ownersOf('other/docs/a.md')).toEqual(['@all']);
    expect(co.ownersOf('docs/build-app/troubleshooting.md')).toEqual(['@doctocat']); // /docs/ (later) owns the whole folder
  });
  it('apps/ without a leading slash matches an apps folder at any depth', () => {
    expect(co.ownersOf('lib/apps/x.txt')).toEqual(['@octocat']);
  });
  it('last match wins, even when it has fewer owners', () => {
    expect(co.ownersOf('scripts/run.sh')).toEqual(['@doctocat', '@octocat']);
    expect(co.ownersOf('apps/github/a.txt')).toEqual(['@doctocat']);
    expect(co.ownersOf('apps/other/a.txt')).toEqual(['@octocat']);
  });
  it('a pattern with no owners leaves the path unowned', () => {
    const c = parseCodeowners('* @all\n/vendor/\n');
    expect(c.ownersOf('vendor/lib.js')).toEqual([]);
    expect(c.ownersOf('src/lib.js')).toEqual(['@all']);
  });
  it('** in the middle matches zero or more folders', () => {
    const c = parseCodeowners('/terraform/variables/**/graph.tfvars @data\n');
    expect(c.ownersOf('terraform/variables/graph.tfvars')).toEqual(['@data']);
    expect(c.ownersOf('terraform/variables/prod/eu/graph.tfvars')).toEqual(['@data']);
    expect(c.ownersOf('terraform/variables/prod/other.tfvars')).toEqual([]);
  });
});

describe('CODEOWNERS location', () => {
  it('.github/CODEOWNERS wins over the root and docs/ at the given revision', () => {
    const root = mkdtempSync(join(tmpdir(), 'mole-codeowners-'));
    try {
      const git = (...a: string[]) => execFileSync('git', ['-C', root, '-c', 'user.name=T', '-c', 'user.email=t@e.com', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8' }).trim();
      git('init', '-q');
      const w = (rel: string, t: string) => {
        mkdirSync(dirname(join(root, rel)), { recursive: true });
        writeFileSync(join(root, rel), t);
      };
      w('CODEOWNERS', '* @root\n');
      w('docs/CODEOWNERS', '* @docs\n');
      git('add', '-A');
      git('commit', '-q', '-m', 'one');
      const one = git('rev-parse', 'HEAD');
      w('.github/CODEOWNERS', '* @github\n');
      git('add', '-A');
      git('commit', '-q', '-m', 'two');
      expect(codeownersAt(root, one)?.path).toBe('CODEOWNERS');
      expect(codeownersAt(root, 'HEAD')?.path).toBe('.github/CODEOWNERS');
      expect(codeownersAt(root, 'HEAD')?.text).toContain('@github');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
