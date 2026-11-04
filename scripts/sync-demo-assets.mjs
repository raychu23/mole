#!/usr/bin/env node
// T87 review fix (MEDIUM): regenerates scripts/public-README.md's demo block timings and site/index.html's
// `LINES` animation data FROM the real captured transcript, instead of the hand-copy that let them drift
// (899 ms / 43 ms shown, 418 ms / 46 ms actually recorded). Run after re-capturing the transcript:
//   node scripts/sync-demo-assets.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { updateReadmeTimings, updateSiteHtml } from './demo-assets-lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const transcriptPath = join(root, 'tasks/T87-public-release-site/4 log/demo-transcript.txt');
const readmePath = join(root, 'scripts/public-README.md');
const sitePath = join(root, 'site/index.html');

const transcript = readFileSync(transcriptPath, 'utf8');
const readme = readFileSync(readmePath, 'utf8');
const site = readFileSync(sitePath, 'utf8');

const newReadme = updateReadmeTimings(readme, transcript);
const newSite = updateSiteHtml(site, transcript);

writeFileSync(readmePath, newReadme);
writeFileSync(sitePath, newSite);

console.log(`synced demo timings/data from ${transcriptPath}`);
console.log(`  ${readmePath}: ${newReadme === readme ? 'unchanged' : 'updated'}`);
console.log(`  ${sitePath}: ${newSite === site ? 'unchanged' : 'updated'}`);
