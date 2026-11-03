#!/usr/bin/env node
// PreToolUse hook (T37, matcher "Edit|Write" in hooks.json): when the edit touches lines a decision governs, add that
// decision once as additionalContext next to the tool result. Never blocks (no permissionDecision: "deny"/"ask" is ever
// returned) and adds each decision id at most once per session (tracked in the plugin's session state dir).
// Output: https://code.claude.com/docs/en/hooks#pretooluse . Nothing new to say = no output, exit 0.
import { relative, resolve } from 'node:path';
import { emit, findMole, governingDecisions, decisionsBlock, loadAddedDecisions, readInput, repoRoot, sameFormRoot, saveAddedDecisions, clip } from './lib.mjs';

function main() {
  const input = readInput();
  const root = repoRoot(input.cwd || process.cwd());
  if (!root) return;
  const path = input.tool_input?.file_path ?? input.tool_input?.path;
  if (!path) return;
  const mole = findMole(root);
  if (!mole) return;
  const abs = resolve(input.cwd || root, path);
  // the path Claude Code sends follows the session's own cwd form (e.g. /tmp/... on macOS, where root as returned by
  // git is realpath'd to /private/tmp/...); compare both in the same form or every match looks like it is outside
  // the repo (same issue lib.mjs's sameFormRoot already fixes for T21's collisions matching).
  const formRoot = sameFormRoot(root, input.cwd);
  const rel = relative(formRoot, abs);
  if (rel.startsWith('..')) return; // outside the repo: nothing for Mole's decisions to govern
  // T64: unscoped / repo-wide decisions ranked by meaning against the edited path + the new text (clipped)
  const newText = String(input.tool_input?.new_string ?? input.tool_input?.content ?? '').slice(0, 4000);
  const list = governingDecisions(mole, root, new Set([rel]), { text: `${rel}\n${newText}` });
  if (!list.length) return;
  const already = loadAddedDecisions(input.session_id);
  const fresh = list.filter((d) => !already.has(d.id));
  if (!fresh.length) return; // every governing decision was already surfaced this session: no repeat (done-when 3)
  for (const d of fresh) already.add(d.id);
  saveAddedDecisions(input.session_id, already);
  emit({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: clip(decisionsBlock(fresh, fresh.every((d) => d.matchedTargets?.includes('by meaning')) ? `Mole: decisions that may bear on ${rel} (word matches; check each applies)` : `Mole: ${rel} is governed by`)) } });
  // intentionally no permissionDecision field: Claude Code allows the tool call as normal (never a block)
}

try {
  main();
} catch (e) {
  process.stderr.write(`mole pre-tool-use hook: ${e.message}\n`);
}
process.exitCode = 0; // never fail the session, never block the tool call
