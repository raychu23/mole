'use strict';
const { tokenize, normSpace } = require('./common.cjs');

// A short English stopword / generic-word list so "identifier mentioned in the
// comment" doesn't match plain prose. Deliberately small & fixed (no tuning on
// test data -- only used as-is, same list for dev and test).
// Kept to pure function/grammar words deliberately: domain nouns like "date",
// "value", "options", "type" are legitimate identifiers in a date/state
// library and must NOT be filtered as generic prose (first pass of this
// script did that and crushed OVERLAP recall to ~0 on dev; fixed before any
// test-split run).
const STOP = new Set(('the a an of to and for in with that this is are was were be been it its as '
  + 'if else or not no yes given passed specified new same '
  + 'each all any from into on at by will would can does do with').split(/\s+/));

function extractIdentifierLikeWords(text) {
  const words = (text || '').match(/[A-Za-z_$][A-Za-z0-9_$]*/g) || [];
  return words.filter((w) => w.length >= 3 && !STOP.has(w.toLowerCase()));
}

// --- Method a: flag-every-change (what Mole's current body-diff check does) ---
function methodFlagEveryChange(_ex) {
  return true; // by construction every example already has a code body change
}

// --- Method b: OVERLAP(C, deleted) -- the paper's rule baseline ---
// Flag if >=1 comment token also appears in the set of tokens that were
// *removed* from the function body (a simple LCS-based stand-in for the
// paper's token-level Delete/ReplaceOld diff spans).
function lcsKeepMask(a, b) {
  const n = a.length, m = b.length;
  const dp = new Array(n + 1);
  for (let i = 0; i <= n; i++) dp[i] = new Uint16Array(m + 1);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const keepA = new Array(n).fill(false);
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { keepA[i] = true; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return keepA; // true = token in `a` survives into `b` (part of the LCS)
}

function deletedTokens(codeBefore, codeAfter) {
  let tb = tokenize(codeBefore), ta = tokenize(codeAfter);
  // cap for pathological huge functions so the O(n*m) DP stays cheap
  const CAP = 1200;
  if (tb.length > CAP) tb = tb.slice(0, CAP);
  if (ta.length > CAP) ta = ta.slice(0, CAP);
  const keep = lcsKeepMask(tb, ta);
  const del = new Set();
  for (let k = 0; k < tb.length; k++) if (!keep[k]) del.add(tb[k].toLowerCase());
  return del;
}

function methodOverlap(ex) {
  const del = deletedTokens(ex.code_before, ex.code_after);
  const commentTokens = extractIdentifierLikeWords(ex.comment_before).map((w) => w.toLowerCase());
  return commentTokens.some((t) => del.has(t));
}

// --- Method c: Mole + compiler signals ---
// Designed on the DEV split only; frozen, then run once on test.
function methodCompilerSignals(ex) {
  const pb = (ex.params_before || []).find((p) => p.name === ex.param_name);
  const pa = (ex.params_after || []).find((p) => p.name === ex.param_name);
  const paramRemoved = ex.type === 'param' && !!pb && !pa;
  const paramTypeChanged = ex.type === 'param' && !!pb && !!pa && normSpace(pb.typeText || '') !== normSpace(pa.typeText || '');
  const returnTypeChanged = normSpace(ex.returnType_before || '') !== normSpace(ex.returnType_after || '');
  const returnShapeChanged = JSON.stringify(ex.returnShapes_before) !== JSON.stringify(ex.returnShapes_after);
  const throwChanged = JSON.stringify(ex.throwNames_before) !== JSON.stringify(ex.throwNames_after);
  const codeTokensBefore = new Set(tokenize(ex.code_before));
  const codeTokensAfter = new Set(tokenize(ex.code_after));
  const mentioned = extractIdentifierLikeWords(ex.comment_before);
  const identifierRemoved = mentioned.some((id) => codeTokensBefore.has(id) && !codeTokensAfter.has(id));
  return paramRemoved || paramTypeChanged || returnTypeChanged || returnShapeChanged || throwChanged || identifierRemoved;
}

module.exports = { methodFlagEveryChange, methodOverlap, methodCompilerSignals, extractIdentifierLikeWords, deletedTokens };
