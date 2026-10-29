// T15 done-when 2: the panel lists `mole since` (T13) in a "Since you last looked" section, outside the map's layout code.
import { describe, expect, it } from 'vitest';
import type { SinceResult } from '@mole/memory';
import { renderSince } from '../webview/since.js';

const NOW = Date.parse('2026-10-28T12:00:00Z');
const seen = (symbol: string, path: string) => ({ time: '2026-10-28T09:00:00Z', symbol, path, hash: 'h', how: 'visible' as const, commit: 'bdeff14' });
const r: SinceResult = {
  seenLog: '.mole/local/seen.jsonl',
  nothingSeen: false,
  seenCount: 3,
  files: [
    {
      path: 'packages/daemon/src/server.ts',
      symbols: [
        {
          symbol: 'packages/daemon/src/server.ts#Daemon.startWatching',
          path: 'packages/daemon/src/server.ts',
          status: 'changed',
          line: 208,
          seen: seen('packages/daemon/src/server.ts#Daemon.startWatching', 'packages/daemon/src/server.ts'),
          changes: [{ commit: 'uncommitted', author: 'you', date: '2026-10-28T11:00:00Z', subject: 'working tree' }],
        },
        {
          symbol: 'packages/daemon/src/server.ts#Daemon.<old>',
          path: 'packages/daemon/src/server.ts',
          status: 'deleted',
          seen: seen('packages/daemon/src/server.ts#Daemon.<old>', 'packages/daemon/src/server.ts'),
          changes: [{ commit: '9e19c51865114310db5e40c6114123e1b32a6995', author: 'Raymond Chu', agent: 'Claude', date: '2026-10-28T10:00:00Z', subject: 'T9 review fixes: idle clock counts editing' }],
        },
      ],
    },
  ],
};

describe('renderSince (done-when 2)', () => {
  const html = renderSince(r, NOW);

  it('has the section title and one clickable row per changed symbol, with path + line to open', () => {
    expect(html).toContain('Since you last looked');
    expect(html).toContain('Daemon.startWatching');
    expect((html.match(/class="since-item/g) ?? []).length).toBe(2);
    expect(html).toContain('data-path="packages/daemon/src/server.ts"');
    expect(html).toContain('data-line="208"');
  });

  it('says what changed it: commit subject + author (+ agent), uncommitted edits, deletions', () => {
    expect(html).toContain('T9 review fixes: idle clock counts editing');
    expect(html).toContain('9e19c51');
    expect(html).toContain('Raymond Chu');
    expect(html).toContain('Claude');
    expect(html).toMatch(/uncommitted/);
    expect(html).toMatch(/deleted/);
  });

  it('escapes symbol and subject text', () => {
    expect(html).not.toContain('<old>');
    expect(html).toContain('&lt;old&gt;');
  });

  it('empty states: nothing recorded yet / nothing changed; no data (CLI failed) renders nothing', () => {
    expect(renderSince({ ...r, nothingSeen: true, seenCount: 0, files: [] }, NOW)).toMatch(/nothing (recorded|seen)/i);
    expect(renderSince({ ...r, files: [] }, NOW)).toMatch(/nothing changed/i);
    expect(renderSince(undefined, NOW)).toBe('');
  });
});
