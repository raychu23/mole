'use strict';
// Build per-type (summary/param/returns) labeled examples from mined pairs.
// Label rule (per Panthaplackel et al. 2021): positive = this comment
// *type*'s text differs before vs after the commit that also changed the
// function body; negative = that segment's text is unchanged. 0 model calls.
const fs = require('fs');
const { normSpace } = require('./common.cjs');

const files = process.argv.slice(2);
if (files.length === 0) { console.error('usage: build_dataset.cjs <pairs.jsonl...>'); process.exit(1); }

let seq = 0;
const out = [];

function pushExample(pair, type, before, after, extra) {
  const b = normSpace(before || '');
  const a = normSpace(after || '');
  if (!b && !a) return; // type not applicable to this function at all
  const label = b !== a ? 1 : 0;
  out.push({
    id: `${pair.repo}:${pair.commit.slice(0, 10)}:${pair.file}:${pair.name}:${type}:${seq++}`,
    repo: pair.repo, commit: pair.commit, parent: pair.parent, file: pair.file, name: pair.name,
    type, label,
    comment_before: b, comment_after: a,
    code_before: pair.before.fullText, code_after: pair.after.fullText,
    params_before: pair.before.params, params_after: pair.after.params,
    returnType_before: pair.before.returnTypeText, returnType_after: pair.after.returnTypeText,
    paramTags_before: pair.before.paramTags, paramTags_after: pair.after.paramTags,
    throwNames_before: pair.before.throwNames, throwNames_after: pair.after.throwNames,
    returnShapes_before: pair.before.returnShapes, returnShapes_after: pair.after.returnShapes,
    ...extra,
  });
}

for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean);
  for (const line of lines) {
    const pair = JSON.parse(line);
    // summary
    pushExample(pair, 'summary', pair.before.summarySentence, pair.after.summarySentence, {});
    // returns
    pushExample(pair, 'returns', pair.before.returnsTag, pair.after.returnsTag, {});
    // param (union of names mentioned in @param tags on either side)
    const names = new Set([...Object.keys(pair.before.paramTags || {}), ...Object.keys(pair.after.paramTags || {})]);
    for (const pname of names) {
      pushExample(pair, 'param', (pair.before.paramTags || {})[pname], (pair.after.paramTags || {})[pname], { param_name: pname });
    }
  }
}

for (const ex of out) console.log(JSON.stringify(ex));
console.error(JSON.stringify({ totalExamples: out.length }));
