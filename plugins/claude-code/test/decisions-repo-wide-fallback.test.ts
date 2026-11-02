// T50 (core-audit agent-surfaces.md rank 5, Cursor rules "description-matched" tier): governingDecisions() only
// ever matched a decision's literal scope file/folder path -- a decision with NO file scope at all (a repo-wide
// convention) never surfaced via SessionStart or PreToolUse. RED before lib.mjs's `repoWide` parsing + fallback
// branch in governingDecisions(); GREEN after. Also covers REPO_WIDE_CAP: the fallback tier is capped on its
// own so many repo-wide decisions can't crowd out file-scoped matches.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { governingDecisions, decisionsBlock, readDecisionRecords, REPO_WIDE_CAP } from '../scripts/lib.mjs';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function writeDecision(root: string, id: string, scope: string[], title = `Decision ${id}`) {
  const scopeLines = scope.map((s) => `  - ${s}`).join('\n');
  writeFileSync(
    join(root, `.mole/decisions/${id}.md`),
    `---\nid: '${id}'\ntitle: ${title}\nstatus: accepted\napprover: raymond\nscope:\n${scopeLines}\n---\n\n## Decision\n\nRule text for ${id}.\n`,
  );
}

describe('governingDecisions: repo-wide scope fallback (no file scope still surfaces)', () => {
  it('a decision scoped only to the literal item "repo-wide" governs a file its scope never names', () => {
    const root = mkdtempSync(join(tmpdir(), 'mole-repo-wide-'));
    dirs.push(root);
    mkdirSync(join(root, '.mole/decisions'), { recursive: true });
    writeDecision(root, '0001', ['src/only-this-file.ts'], 'File-scoped decision'); // normal case: should NOT appear for an unrelated file
    writeDecision(root, '0002', ['repo-wide'], 'Repo-wide convention');

    const records = readDecisionRecords(root);
    const rw = records.find((d) => d.id === '0002');
    expect(rw?.repoWide).toBe(true);
    expect(rw?.files.size ?? 0).toBe(0); // 'repo-wide' is not a file path

    const list = governingDecisions(undefined, root, new Set(['src/totally/unrelated.ts']));
    expect(list.map((d) => d.id)).toEqual(['0002']); // only the repo-wide one, not the file-scoped 0001
    const text = decisionsBlock(list);
    expect(text).toContain('0002');
    expect(text).not.toContain('0001');
  });

  it('REPO_WIDE_CAP bounds how many repo-wide decisions surface at once, independent of file-scoped matches', () => {
    const root = mkdtempSync(join(tmpdir(), 'mole-repo-wide-cap-'));
    dirs.push(root);
    mkdirSync(join(root, '.mole/decisions'), { recursive: true });
    const n = REPO_WIDE_CAP + 3;
    for (let i = 0; i < n; i++) writeDecision(root, String(i + 1).padStart(4, '0'), ['repo-wide']);
    writeDecision(root, '9999', ['src/scoped.ts'], 'File-scoped decision'); // must still get through regardless of the cap

    const list = governingDecisions(undefined, root, new Set(['src/scoped.ts']));
    const repoWideIds = list.filter((d) => d.id !== '9999');
    expect(repoWideIds.length).toBe(REPO_WIDE_CAP); // capped, never all n
    expect(list.some((d) => d.id === '9999')).toBe(true); // file-scoped match is never displaced by the cap
  });

  it('a decision scoped both to a real file AND repo-wide is matched once (no duplicate), with its real anchor shown', () => {
    const root = mkdtempSync(join(tmpdir(), 'mole-repo-wide-dup-'));
    dirs.push(root);
    mkdirSync(join(root, '.mole/decisions'), { recursive: true });
    writeDecision(root, '0003', ['src/a.ts', 'repo-wide']);
    const list = governingDecisions(undefined, root, new Set(['src/a.ts']));
    expect(list.length).toBe(1);
    expect(list[0].matchedTargets).toEqual(['src/a.ts']); // the real anchor, not the repo-wide fallback marker
  });
});
