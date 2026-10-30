// R1 key-builder (independent of transcript parsing): ground truth for M27a = which files each 10-29 overnight
// builder session (mole-builder-3..6) changed. Method: git log on each builder's owned ledger branches, filtered to
// that builder's own Hermes session window (sessions.started_at/ended_at -- table metadata, not message/tool-call
// content), then git diff-tree --name-only per commit. Dated and frozen before any coverage implementation exists.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const git = (args) => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trim();

// static historical record from context/agents/registry.json + tasks/HANDOFF.md "Overnight (2026-10-29 05:05)" /
// "Added 10:05" sections, as they stood at ledger-task-claim time (2026-10-29) -- not derived from the coverage code.
const BUILDERS = {
  'mole-builder-3': { session: 'local-989260337115d4a07963b788e0cce7906796051d2adf58d9ea5d6883d20d6f49', branches: ['ledger/t21-parallel-agent-collisions', 'ledger/t19-rename-proof-anchors'] },
  'mole-builder-4': { session: 'local-55524a2e3241097908d31897bd787b44cd0d03e6587b5bbeba29f48c786ff10b', branches: ['ledger/t29-decision-graph-core', 'ledger/t27-decisions-as-rules', 'ledger/t30-annotated-file-tree', 'ledger/t32-team-pr-check'] },
  'mole-builder-5': { session: 'local-fdb14cadc65dc716f1655936fef94f151db4f655b1b1a82ae7a2a2b73c0efd38', branches: ['ledger/t22-hand-back-test-selection', 'ledger/t24-agent-claim-check', 'ledger/t28-runtime-flows-from-tests', 'ledger/t25-hand-back-verify-gate'] },
  'mole-builder-6': { session: 'local-4c672b64a01d124a35a2b75e5bf48cff65b30f773f64bd0eb5e63cee5ce0fda0', branches: ['ledger/t19-rename-proof-anchors', 'ledger/t30-annotated-file-tree', 'ledger/t32-team-pr-check'] },
};

const db = new DatabaseSync(`${process.env.HOME}/.hermes/state.db`, { readOnly: true });
function window(sessionId) {
  const row = db.prepare('SELECT started_at, ended_at FROM sessions WHERE id = ?').get(sessionId);
  if (!row) throw new Error(`session not found: ${sessionId}`);
  const start = row.started_at * 1000;
  const end = (row.ended_at ?? row.started_at + 6 * 3600) * 1000; // no ended_at yet: 6h run budget (registry.json)
  return { start, end };
}

const key = { built: new Date().toISOString(), method: 'git log on ledger branches, filtered by Hermes session metadata (started_at/ended_at), independent of transcript/message parsing', builders: {} };
for (const [owner, { session, branches }] of Object.entries(BUILDERS)) {
  const { start, end } = window(session);
  const files = new Set();
  const commits = [];
  for (const branch of branches) {
    // --first-parent per R2 ruling (4 log/key-ruling-1.md, APPROVED): these are serial integration
    // branches whose merge commits otherwise pull in OTHER concurrently-running builders' commits
    // that later landed on the same branch (confirmed: one shared commit sat on 11 ledger branches).
    // --first-parent keeps only this branch's own commit line, not merged-in history from elsewhere.
    const log = git(['log', branch, '--first-parent', '--no-merges', '--format=%H %ct']);
    for (const line of log.split('\n').filter(Boolean)) {
      const [sha, ctStr] = line.split(' ');
      const t = Number(ctStr) * 1000;
      if (t < start || t > end) continue;
      const changed = git(['diff-tree', '--no-commit-id', '-r', '--name-only', '--root', sha]).split('\n').filter(Boolean);
      for (const f of changed) files.add(f);
      commits.push(sha);
    }
  }
  key.builders[owner] = { session, window: { start: new Date(start).toISOString(), end: new Date(end).toISOString() }, branches, commits: [...new Set(commits)].sort(), files: [...files].sort() };
}
const out = process.argv[2] ?? 'packages/coverage/bench/m27-key.json';
writeFileSync(out, JSON.stringify(key, null, 1));
console.log(`wrote ${out}: ${Object.values(key.builders).reduce((n, b) => n + b.files.length, 0)} (owner,file) pairs across ${Object.keys(key.builders).length} builders`);
