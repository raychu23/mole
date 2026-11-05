import { readFileSync } from 'node:fs';
import { statementStarts } from '/Users/a1/Desktop/CS Code/Project/Mole-worktrees/T95-scip-multilang//packages/scip/dist/reader.js';
const data = JSON.parse(readFileSync(process.argv[2], 'utf8'));
let files = 0, lines = 0, bad = 0, badImport = 0; const ex = [];
for (const d of data) {
  files++; const got = statementStarts(d.lines);
  for (let i = 0; i < d.lines.length; i++) {
    lines++;
    // only lines that start a statement in truth, or lines whose truth owner starts with an import, matter
    if (got[i] !== d.owner[i]) { bad++; const imp = /^\s*from\s+\./.test(d.lines[d.owner[i]] ?? '') || /^\s*from\s+\./.test(d.lines[got[i]] ?? ''); if (imp) badImport++; if (ex.length < 8) ex.push({ f: d.f.split('site-packages/')[1], line: i + 1, truth: d.owner[i] + 1, got: got[i] + 1, text: d.lines[i].slice(0, 80) }); }
  }
}
console.log(JSON.stringify({ files, lines, mismatchedLines: bad, mismatchesTouchingRelativeImport: badImport, examples: ex }, null, 1));
