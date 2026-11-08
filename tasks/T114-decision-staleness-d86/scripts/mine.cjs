'use strict';
// Mine (before, after) documented-function pairs across consecutive commits.
// 0 model calls. Usage: node mine.cjs <repoDir> <repoLabel> <srcPathPrefixes...> > out.jsonl
const path = require('path');
const { git, gitShow, extractFunctions } = require('./common.cjs');

const [, , repoDir, repoLabel, ...prefixes] = process.argv;
if (!repoDir || !repoLabel || prefixes.length === 0) {
  console.error('usage: mine.cjs <repoDir> <repoLabel> <srcPrefix...>');
  process.exit(1);
}

const EXCLUDE_RE = /(\.test\.ts$|\.spec\.ts$|\.d\.ts$|\/test\/|\/tests\/|\/__tests__\/|\.stories\.ts$|(^|\/)test\.ts$|\.tp\.ts$)/;
const NOISY_MSG_RE = /\b(prettier|format(ting)?|lint(ing)?|codemod|rename all|bulk|chore:\s*release)\b/i;

function inScope(p) {
  if (!p.endsWith('.ts')) return false;
  if (EXCLUDE_RE.test(p)) return false;
  return prefixes.some((pref) => p.startsWith(pref));
}

const commitsRaw = git(repoDir, ['log', '--first-parent', '--format=%H %P']).trim().split('\n').filter(Boolean);
// oldest..newest doesn't matter here; we just need each commit + its first parent
let total = 0, examined = 0, codeChangedPairs = 0, skippedBulkCommits = 0;

for (const line of commitsRaw) {
  const [commit, parent] = line.split(' ');
  if (!parent) continue; // root commit, no parent to diff against
  total++;
  let msg = '';
  try { msg = git(repoDir, ['log', '-1', '--format=%s', commit]); } catch (e) {}
  if (NOISY_MSG_RE.test(msg)) continue;

  let nameStatus;
  try {
    nameStatus = git(repoDir, ['diff', '--name-status', '-M90%', parent, commit]).trim();
  } catch (e) { continue; }
  if (!nameStatus) continue;
  const lines = nameStatus.split('\n');
  const modifiedFiles = [];
  for (const l of lines) {
    const parts = l.split('\t');
    const status = parts[0];
    if (status === 'M' && parts[1] && inScope(parts[1])) modifiedFiles.push(parts[1]);
  }
  if (modifiedFiles.length === 0) continue;
  // heuristic: drop commits that touch a huge number of source files in this prefix set
  // (likely a mass refactor/codemod, not a targeted code-fix-that-breaks-a-comment commit)
  if (modifiedFiles.length > 15) { skippedBulkCommits++; continue; }

  for (const file of modifiedFiles) {
    const beforeText = gitShow(repoDir, parent, file);
    const afterText = gitShow(repoDir, commit, file);
    if (beforeText == null || afterText == null) continue;
    let beforeFns, afterFns;
    try {
      beforeFns = extractFunctions(beforeText, file);
      afterFns = extractFunctions(afterText, file);
    } catch (e) { continue; }

    for (const [name, bf] of beforeFns) {
      const af = afterFns.get(name);
      if (!af) continue; // renamed/removed, skip (can't pair)
      examined++;
      const beforeTokStr = bf.tokens.join('\u0001');
      const afterTokStr = af.tokens.join('\u0001');
      if (beforeTokStr === afterTokStr) continue; // no real code change (incl. whitespace/comment-only)
      codeChangedPairs++;

      console.log(JSON.stringify({
        repo: repoLabel, commit, parent, file, name,
        before: { summary: bf.summary, summarySentence: bf.summarySentence, paramTags: bf.paramTags, returnsTag: bf.returnsTag,
                  params: bf.params, returnTypeText: bf.returnTypeText, fullText: bf.fullText,
                  throwNames: bf.throwNames, returnShapes: bf.returnShapes },
        after:  { summary: af.summary, summarySentence: af.summarySentence, paramTags: af.paramTags, returnsTag: af.returnsTag,
                  params: af.params, returnTypeText: af.returnTypeText, fullText: af.fullText,
                  throwNames: af.throwNames, returnShapes: af.returnShapes },
      }));
    }
  }
}

console.error(JSON.stringify({ repoLabel, commitsTotal: total, skippedBulkCommits, pairsExamined: examined, codeChangedPairs }));
