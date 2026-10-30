// T40 connection requirement: the 'Review / meeting notes' section exists in the real VS Code view (not just a
// standalone @mole/reviews package with a bench). This test only checks the wiring (section id present, caption
// present, the runner is wired into buildPanelModel) -- the behavior itself is covered by packages/reviews' own
// tests against its frozen M34 key.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SECTION_IDS } from '../src/panelData.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('T40 connection: a Review / meeting notes section in the real Mole VS Code view', () => {
  it('registers reviewNotes as one of the panel sections', () => {
    expect(SECTION_IDS as readonly string[]).toContain('reviewNotes');
  });

  it('wires @mole/reviews into the real (CLI-backed) Runners implementation', () => {
    const src = readFileSync(join(here, '..', 'src', 'panelRunners.ts'), 'utf8');
    expect(src).toContain("from '@mole/reviews'");
    expect(src).toContain('async reviewNotes()');
  });

  it('renders the delta diagram SVG inline in the same webview panel', () => {
    const src = readFileSync(join(here, '..', 'webview', 'panel.ts'), 'utf8');
    expect(src).toContain("'reviewNotes'");
    expect(src).toContain('diagramSvg');
  });
});
