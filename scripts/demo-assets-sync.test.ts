// T87 review fix (MEDIUM): asserts scripts/public-README.md's and site/index.html's demo-transcript-derived
// content equal what scripts/demo-assets-lib.mjs derives from the real captured transcript
// (tasks/T87-public-release-site/4 log/demo-transcript.txt), so a future hand-edit of either file (the
// original bug: 899 ms / 43 ms shown, 418 ms / 46 ms actually recorded) fails this test instead of silently
// drifting. Run `node scripts/sync-demo-assets.mjs` to resync after a fresh `mole demo` capture.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { deriveSiteLines, extractTimingsMs, renderSiteLinesBlock, updateReadmeTimings, updateSiteHtml } from './demo-assets-lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const transcript = readFileSync(join(root, 'tasks/T87-public-release-site/4 log/demo-transcript.txt'), 'utf8');
const readme = readFileSync(join(root, 'scripts/public-README.md'), 'utf8');
const site = readFileSync(join(root, 'site/index.html'), 'utf8');

describe('demo transcript sync (T87 review fix: stop hand-copying timings)', () => {
  it('the transcript has exactly 2 "(N ms)" timings to derive from', () => {
    const [ms1, ms2] = extractTimingsMs(transcript);
    expect(Number.isFinite(ms1)).toBe(true);
    expect(Number.isFinite(ms2)).toBe(true);
  });

  it('public-README.md demo block timings equal the transcript (re-run sync-demo-assets.mjs if not)', () => {
    expect(updateReadmeTimings(readme, transcript)).toBe(readme);
  });

  it('site/index.html LINES timings equal the transcript (re-run sync-demo-assets.mjs if not)', () => {
    expect(updateSiteHtml(site, transcript)).toBe(site);
  });

  it('site/index.html LINES block equals the transcript-derived content exactly', () => {
    const expectedBlock = renderSiteLinesBlock(deriveSiteLines(transcript));
    expect(site).toContain(expectedBlock);
  });

  it('the two README timings are the transcript\'s own numbers, not each other\'s or stale ones', () => {
    const [ms1, ms2] = extractTimingsMs(transcript);
    const [readmeMs1, readmeMs2] = extractTimingsMs(readme);
    expect([readmeMs1, readmeMs2]).toEqual([ms1, ms2]);
  });
});
