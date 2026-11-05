// T105 (I2): red test, committed before decisionsForFile.ts exists (tasks/T105-vscode-reasoning-surface/4 log/red.txt).
// Pure matcher: which decisions govern an open file (and which line ranges), from the same `mole decisions --json`
// payload the sidebar panel already fetches (@mole/decisions FlagResult[] via panelData.ts/panelRunners.ts) — no new
// backend logic, just a view-side projection, same split as src/hover.ts and src/seen.ts (no vscode import).
import { describe, expect, it } from 'vitest';
import { decisionsForFile, type DecisionLike } from '../src/decisions-for-file.js';
import type { SymbolSpan } from '../src/seen.js';

function d(over: Partial<DecisionLike>): DecisionLike {
  return { id: '0001', title: 'A decision', status: 'accepted', file: '.mole/decisions/0001-a.md', line: 1, scope: [], rationale: undefined, ...over };
}

describe('decisionsForFile (T105: what governs the open file, and which lines)', () => {
  it('matches a decision scoped to the exact file: governs the whole file (line 1..end)', () => {
    const decisions = [d({ id: '0007', title: 'Stop the daemon after 30 idle minutes', scope: [{ target: 'packages/daemon/src/cli.ts', file: '.mole/decisions/0007.md', line: 5 }] })];
    const hits = decisionsForFile(decisions, 'packages/daemon/src/cli.ts', [], 42);
    expect(hits).toHaveLength(1);
    expect(hits[0].decision.id).toBe('0007');
    expect(hits[0].startLine).toBe(0);
    expect(hits[0].endLine).toBe(42);
    expect(hits[0].matchKind).toBe('file');
  });

  it('matches a decision scoped to a folder prefix (ending in "/")', () => {
    const decisions = [d({ id: '0020', scope: [{ target: 'packages/daemon/', file: 'x', line: 1 }] })];
    const hits = decisionsForFile(decisions, 'packages/daemon/src/server.ts', [], 10);
    expect(hits).toHaveLength(1);
    expect(hits[0].matchKind).toBe('folder');
  });

  it('matches a decision scoped to file#Symbol, restricted to that symbol\'s own line span', () => {
    const decisions = [d({ id: '0008', title: 'Indexing never counts as idle', scope: [{ target: 'packages/daemon/src/server.ts#Daemon.onWorker', file: 'x', line: 1 }] })];
    const spans: SymbolSpan[] = [{ tail: 'Daemon.onWorker', startLine: 20, endLine: 35 }, { tail: 'Daemon.other', startLine: 40, endLine: 50 }];
    const hits = decisionsForFile(decisions, 'packages/daemon/src/server.ts', spans, 100);
    expect(hits).toHaveLength(1);
    expect(hits[0].startLine).toBe(20);
    expect(hits[0].endLine).toBe(35);
    expect(hits[0].matchKind).toBe('symbol');
  });

  it('a symbol-scoped decision whose symbol is not in this file\'s document symbols does not match', () => {
    const decisions = [d({ scope: [{ target: 'packages/daemon/src/server.ts#Daemon.gone', file: 'x', line: 1 }] })];
    const hits = decisionsForFile(decisions, 'packages/daemon/src/server.ts', [{ tail: 'Daemon.other', startLine: 1, endLine: 2 }], 10);
    expect(hits).toHaveLength(0);
  });

  it('an unrelated file or folder scope does not match', () => {
    const decisions = [d({ scope: [{ target: 'packages/server/src/db.ts', file: 'x', line: 1 }] }), d({ scope: [{ target: 'packages/other/', file: 'x', line: 1 }] })];
    expect(decisionsForFile(decisions, 'packages/daemon/src/cli.ts', [], 10)).toHaveLength(0);
  });

  it('a retired/rejected/superseded decision is excluded (it no longer governs anything)', () => {
    const decisions = [d({ status: 'rejected', scope: [{ target: 'a.ts', file: 'x', line: 1 }] })];
    expect(decisionsForFile(decisions, 'a.ts', [], 5)).toHaveLength(0);
  });

  it('one decision with two anchors on the same file is reported once, with the widest-matching range', () => {
    const decisions = [
      d({
        id: '0009',
        scope: [
          { target: 'a.ts#foo', file: 'x', line: 1 },
          { target: 'a.ts', file: 'x', line: 2 },
        ],
      }),
    ];
    const hits = decisionsForFile(decisions, 'a.ts', [{ tail: 'foo', startLine: 3, endLine: 4 }], 10);
    expect(hits).toHaveLength(1);
    expect(hits[0].matchKind).toBe('file'); // file-level anchor wins (whole-file is the superset)
  });

  it('carries the decision\'s id/title/why (rationale) through, for the click-through to the record', () => {
    const decisions = [d({ id: '0011', title: 'Notes anchored to symbols', rationale: 'because X', file: '.mole/decisions/0011.md', line: 1, scope: [{ target: 'a.ts', file: 'x', line: 1 }] })];
    const hits = decisionsForFile(decisions, 'a.ts', [], 5);
    expect(hits[0].decision).toMatchObject({ id: '0011', title: 'Notes anchored to symbols', rationale: 'because X', file: '.mole/decisions/0011.md', line: 1 });
  });
});
