#!/usr/bin/env node
// Recorded-demo fallback: a real terminal-recording tool (asciinema, vhs) could not be installed on this
// machine without sudo (`brew install vhs` fails: "/usr/local/share/man/man8" is not writable by this user
// and brew refuses to proceed without `sudo chown` — see tasks/T87-public-release-site adjacent task's brief
// for the no-sudo rule). This script is the documented fallback: it renders a static SVG "terminal frame"
// directly FROM the same real, unedited transcript `scripts/demo-assets-lib.mjs` already derives the
// site/README demo text from (tasks/T87-public-release-site/4 log/demo-transcript.txt), so the SVG can never
// drift from that source of truth the way a hand-made screenshot could. Not an animation -- a single frame,
// honest about being scripted, not a screen capture.
//   node scripts/render-demo-svg.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveSiteLines } from './demo-assets-lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const transcriptPath = join(root, 'tasks/T87-public-release-site/4 log/demo-transcript.txt');
const outPath = join(root, 'site/demo-terminal.svg');

const transcript = readFileSync(transcriptPath, 'utf8');
const lines = deriveSiteLines(transcript);

const charW = 8.2;
const lineH = 18;
const padX = 20;
const padTop = 46;
const maxLineLen = Math.max(...lines.map((l) => l.length), 110);
const width = Math.ceil(padX * 2 + maxLineLen * charW);
const height = padTop + lines.length * lineH + 24;

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function classify(line) {
  if (/^\d\./.test(line)) return '#6ee7b7';
  if (/Caught:|violation\b/.test(line)) return '#f87171';
  if (/^\s*$/.test(line)) return '#e6e9ec';
  return '#9aa5b1';
}

const rows = lines
  .map((l, i) => `<text x="${padX}" y="${padTop + i * lineH}" fill="${classify(l)}">${esc(l)}</text>`)
  .join('\n  ');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="13">
  <rect width="${width}" height="${height}" rx="10" fill="#060708" stroke="#22282f"/>
  <rect width="${width}" height="32" rx="10" fill="#0e1116"/>
  <rect y="22" width="${width}" height="10" fill="#0e1116"/>
  <circle cx="22" cy="16" r="5" fill="#f87171"/>
  <circle cx="40" cy="16" r="5" fill="#fbbf24"/>
  <circle cx="58" cy="16" r="5" fill="#34d399"/>
  <text x="76" y="20" fill="#9aa5b1" font-size="12">npx -y mole-code demo (static frame, scripted from the real transcript -- no video tool installable without sudo here)</text>
  ${rows}
</svg>
`;

writeFileSync(outPath, svg);
console.log(`wrote ${outPath} (${lines.length} lines from ${transcriptPath})`);
