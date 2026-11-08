'use strict';
// Shared helpers for the test1-stale-comments bench. 0 model calls anywhere in this file.
const ts = require('/Users/a1/Desktop/CS Code/Project/Mole/node_modules/typescript');
const { execFileSync } = require('child_process');

function git(repoDir, args) {
  return execFileSync('git', args, { cwd: repoDir, maxBuffer: 1024 * 1024 * 64 }).toString('utf8');
}

function gitShow(repoDir, commit, path) {
  try {
    return execFileSync('git', ['show', `${commit}:${path}`], { cwd: repoDir, maxBuffer: 1024 * 1024 * 16 }).toString('utf8');
  } catch (e) {
    return null;
  }
}

// Tokenize via the real TS scanner, skipTrivia=true => comments AND whitespace
// are both dropped automatically. This is what "code changed after stripping
// whitespace/comments" means operationally in this bench.
function tokenize(text) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, /*skipTrivia*/ true, ts.LanguageVariant.Standard, text);
  const toks = [];
  let tok = scanner.scan();
  while (tok !== ts.SyntaxKind.EndOfFileToken) {
    toks.push(scanner.getTokenText());
    tok = scanner.scan();
  }
  return toks;
}

function normSpace(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

function jsDocCommentText(comment) {
  // comment can be a string or a NodeArray<JSDocComment>
  if (comment == null) return '';
  if (typeof comment === 'string') return comment;
  try {
    return comment.map((c) => (c.text != null ? c.text : '')).join('');
  } catch (e) {
    return '';
  }
}

function firstSentence(summary) {
  const s = normSpace(summary);
  if (!s) return '';
  const m = s.match(/^.*?[.!?](?:\s|$)/);
  return normSpace(m ? m[0] : s);
}

// Extract documented functions/methods from a TS source file.
// Returns array of records keyed by a stable name path.
function extractFunctions(sourceText, fileName) {
  const sf = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
  const out = [];

  function paramsOf(node) {
    return node.parameters.map((p) => ({
      name: p.name && p.name.getText ? p.name.getText(sf) : '',
      typeText: p.type ? p.type.getText(sf) : null,
    }));
  }

  function jsDocOf(node) {
    const docs = node.jsDoc;
    if (!docs || !docs.length) return null;
    return docs[docs.length - 1];
  }

  function recordFor(node, name, funcLikeNode) {
    const jsdoc = jsDocOf(node);
    if (!jsdoc) return null; // only documented functions are in scope
    let summary = jsDocCommentText(jsdoc.comment);
    const tags = jsdoc.tags || [];
    const paramTags = {};
    let returnsTag = null;
    for (const t of tags) {
      const tagName = t.tagName ? t.tagName.text : '';
      if (ts.isJSDocParameterTag(t)) {
        const pname = t.name ? t.name.getText(sf) : '';
        paramTags[pname] = normSpace(jsDocCommentText(t.comment));
      } else if (ts.isJSDocReturnTag(t) || tagName === 'returns' || tagName === 'return') {
        returnsTag = normSpace(jsDocCommentText(t.comment));
      } else if (tagName === 'summary') {
        // custom @summary tag (used by e.g. date-fns) takes priority over the
        // free-form leading comment, which may be empty when @summary is used
        summary = jsDocCommentText(t.comment) || summary;
      }
    }
    const fullText = node.getFullText(sf); // includes leading JSDoc comment as trivia
    const bodyNode = funcLikeNode.body || funcLikeNode;
    let throwNames = [];
    let returnShapes = [];
    function walk(n) {
      if (ts.isThrowStatement(n) && n.expression) {
        let e = n.expression;
        if (ts.isNewExpression(e) && e.expression) throwNames.push(e.expression.getText(sf));
        else throwNames.push(e.getText(sf).slice(0, 40));
      }
      if (ts.isReturnStatement(n)) {
        if (!n.expression) returnShapes.push('void');
        else if (ts.isObjectLiteralExpression(n.expression)) returnShapes.push('object');
        else if (ts.isArrayLiteralExpression(n.expression)) returnShapes.push('array');
        else if (ts.isNewExpression(n.expression)) returnShapes.push('new:' + n.expression.expression.getText(sf));
        else if (n.expression.kind === ts.SyntaxKind.NullKeyword) returnShapes.push('null');
        else if (ts.isCallExpression(n.expression)) returnShapes.push('call:' + n.expression.expression.getText(sf).slice(0, 30));
        else returnShapes.push('expr');
      }
      ts.forEachChild(n, walk);
    }
    try { walk(bodyNode); } catch (e) {}

    return {
      name,
      summary: normSpace(summary),
      summarySentence: firstSentence(summary),
      paramTags,
      returnsTag,
      params: paramsOf(funcLikeNode),
      returnTypeText: funcLikeNode.type ? funcLikeNode.type.getText(sf) : null,
      fullText,
      tokens: tokenize(fullText),
      throwNames: Array.from(new Set(throwNames)).sort(),
      returnShapes: Array.from(new Set(returnShapes)).sort(),
    };
  }

  function visit(node, className) {
    if (ts.isFunctionDeclaration(node) && node.name) {
      const rec = recordFor(node, node.name.text, node);
      if (rec) out.push(rec);
    } else if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) && ts.isIdentifier(decl.name)) {
          const rec = recordFor(node, decl.name.text, decl.initializer);
          if (rec) out.push(rec);
        }
      }
    } else if (ts.isClassDeclaration(node) && node.name) {
      for (const member of node.members) {
        if (ts.isMethodDeclaration(member) && member.name) {
          const mname = member.name.getText(sf);
          const rec = recordFor(member, `${node.name.text}.${mname}`, member);
          if (rec) out.push(rec);
        }
      }
    }
    ts.forEachChild(node, (n) => visit(n, className));
  }
  visit(sf, null);

  // de-dup by name (keep first) -- overloads collapse to one record
  const byName = new Map();
  for (const r of out) if (!byName.has(r.name)) byName.set(r.name, r);
  return byName;
}

module.exports = { git, gitShow, tokenize, normSpace, jsDocCommentText, firstSentence, extractFunctions };
