#!/usr/bin/env node
// Stop hook (T15): `mole check` on the session's diff, questions first, shown to you as a systemMessage.
// The session's diff = everything since HEAD at SessionStart (commits the session made + uncommitted edits), via
// `mole check --diff <git diff base> --base <base>`; without a recorded start, the working tree vs HEAD (`mole check --worktree`).
// It informs and never blocks Claude from stopping. MOLE_STOP_CONTINUE=1 also hands the questions to Claude as
// hookSpecificOutput.additionalContext (which makes Claude continue once; skipped when stop_hook_active is true).
// Output: https://code.claude.com/docs/en/hooks#stop-decision-control . Nothing to say = no output, exit 0.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clip, emit, findMole, git, loadSession, moleJson, readInput, repoRoot } from './lib.mjs';

const range = (h) => (h.oldLines > 1 ? `${h.oldStart}-${h.oldStart + h.oldLines - 1}` : `${h.oldStart}`);
const one = (s, n = 240) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

function why(f) {
  const src = f.reasonSources ?? [];
  const c = src.find((s) => s.kind === 'comment') ?? src.find((s) => s.kind === 'note') ?? src.find((s) => s.kind === 'task');
  return c ? `${c.text}${c.path ? ` (${c.path}${c.line ? `:${c.line}` : ''})` : ''}` : f.reason;
}

export function format(r, label) {
  const withFixes = r.hunks.filter((h) => h.pastFixes.length > 0);
  const out = [`Mole check on ${label}: ${r.hunks.length} edited hunk${r.hunks.length === 1 ? '' : 's'}, ${withFixes.length} on lines a past fix wrote.`];
  if (r.questions?.length) {
    out.push(`questions (${r.questions.length}):`);
    r.questions.forEach((q, i) => out.push(`  ${i + 1}. [${q.kind}] ${one(q.text, 600)}`, `     source: ${q.source.sha ? `${q.source.sha.slice(0, 7)} ` : ''}${q.source.file}:${q.source.line}`));
  }
  if (withFixes.length) {
    out.push('past fixes on the edited lines:');
    for (const h of withFixes) {
      out.push(`  ${h.file}:${range(h)}`);
      for (const f of h.pastFixes) {
        out.push(`    ${f.shortSha} ${one(f.subject, 160)}`, `      why: ${one(why(f), 300)}`);
        const tests = (f.tests ?? []).map((t) => `${t.file}${t.names?.length ? ` (${t.names.slice(0, 3).join('; ')})` : ''}`);
        out.push(`      tests: ${tests.length ? tests.join(', ') : 'none found'}`, `      source: ${f.source.sha.slice(0, 7)} ${f.source.file}:${f.source.line}`);
      }
    }
  }
  const others = r.hunks.length - withFixes.length;
  if (others > 0) out.push(`(${others} other hunk${others === 1 ? '' : 's'}: no past fixes on those lines)`);
  return out.join('\n');
}

function main() {
  const input = readInput();
  const root = repoRoot(input.cwd || process.cwd());
  if (!root) return;
  const mole = findMole(root);
  if (!mole) return;
  const head = git(root, ['rev-parse', '--verify', '-q', 'HEAD'])?.trim() ?? '';
  const sess = loadSession(input.session_id);
  const base = sess && sess.root === root && sess.head && sess.head !== head && git(root, ['cat-file', '-e', `${sess.head}^{commit}`]) !== undefined ? sess.head : undefined;
  let r;
  let label;
  if (base) {
    const diff = git(root, ['diff', '--no-color', '--no-ext-diff', base]);
    if (!diff?.trim()) return;
    const dir = mkdtempSync(join(tmpdir(), 'mole-stop-'));
    try {
      const file = join(dir, 'session.diff');
      writeFileSync(file, diff);
      r = moleJson(mole, root, ['check', '--diff', file, '--base', base, '--json']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    label = `this session's diff (since ${base.slice(0, 7)}, commits + uncommitted)`;
  } else {
    r = moleJson(mole, root, ['check', '--worktree', '--json']);
    label = 'the uncommitted change (working tree vs HEAD)';
  }
  if (!r || !Array.isArray(r.hunks)) return;
  const fixes = r.hunks.some((h) => h.pastFixes.length > 0);
  if (!fixes && !(r.questions?.length > 0)) return;
  const text = clip(format(r, label));
  const msg = { systemMessage: text };
  if (process.env.MOLE_STOP_CONTINUE === '1' && input.stop_hook_active !== true && r.questions?.length) {
    msg.hookSpecificOutput = { hookEventName: 'Stop', additionalContext: clip(`Mole asks about the lines you just edited (answer briefly, then stop):\n${r.questions.map((q, i) => `${i + 1}. ${q.text}`).join('\n')}`) };
  }
  emit(msg);
}

try {
  main();
} catch (e) {
  process.stderr.write(`mole stop hook: ${e.message}\n`);
}
process.exitCode = 0; // not process.exit(): stdout to a pipe is asynchronous on macOS and would be cut
