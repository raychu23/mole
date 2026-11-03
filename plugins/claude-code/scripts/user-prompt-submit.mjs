#!/usr/bin/env node
// UserPromptSubmit hook (T64): before the model reads the task, add the team decisions the prompt is ABOUT -- decisions
// with no file scope (or scope: repo-wide), ranked by meaning (BM25 over each record's title + rationale, zero model
// calls, lib.mjs bm25Rank mirrors T53's route/bm25.ts). Each decision at most once per session (shared with PreToolUse).
// Never blocks (no "decision": "block"); nothing relevant, no repo, or bad input = no output, exit 0.
// Output: https://code.claude.com/docs/en/hooks#userpromptsubmit  hookSpecificOutput.additionalContext
import { clip, decisionsBlock, emit, governingDecisions, loadAddedDecisions, readInput, repoRoot, saveAddedDecisions } from './lib.mjs';

function main() {
  const input = readInput();
  const prompt = typeof input?.prompt === 'string' ? input.prompt : '';
  if (!prompt.trim()) return;
  const root = repoRoot(input.cwd || process.cwd());
  if (!root) return;
  const list = governingDecisions(undefined, root, new Set(), { text: prompt });
  if (!list.length) return;
  const already = loadAddedDecisions(input.session_id);
  const fresh = list.filter((d) => !already.has(d.id));
  if (!fresh.length) return;
  for (const d of fresh) already.add(d.id);
  saveAddedDecisions(input.session_id, already);
  emit({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: clip(decisionsBlock(fresh, 'Mole: team decisions this task is about (ranked by meaning; follow them)')) } });
}

try {
  main();
} catch (e) {
  process.stderr.write(`mole user-prompt-submit hook: ${e.message}\n`);
}
process.exitCode = 0;
