#!/usr/bin/env bash
# T12 loop rule R4: run the task's checks once and append ONE line to runs.jsonl.
# usage: bash "tasks/T12-l2-why-and-past-fixes/4 log/run-check.sh"   (from the repo root)
set -u
LOG="tasks/T12-l2-why-and-past-fixes/4 log"
CMD='npm run check && node packages/history/dist/bench/m2.js'
rm -f packages/history/dist/bench/metrics.json
bash -c "$CMD" > "${TMPDIR:-/tmp}/t12-last-run.txt" 2>&1
EXIT=$?
OUT="${TMPDIR:-/tmp}/t12-last-run.txt" node -e '
const fs = require("fs");
const [time, commit, cmd, exit, log] = process.argv.slice(1);
let metrics = { M2: "not run", M5: "not run", B2: "not run" };
try { metrics = JSON.parse(fs.readFileSync("packages/history/dist/bench/metrics.json", "utf8")); } catch {
  const t = fs.readFileSync(process.env.OUT, "utf8");
  const m = t.match(/Tests\s+(.*)/);
  metrics.note = "bench not run: npm run check failed" + (m ? " (" + m[1].trim() + ")" : "");
}
fs.appendFileSync(log + "/runs.jsonl", JSON.stringify({ time, commit, cmd, exit: Number(exit), metrics }) + "\n");
' "$(date +%Y-%m-%dT%H:%M:%S%z)" "$(git rev-parse --short HEAD)" "$CMD" "$EXIT" "$LOG"
tail -n 1 "$LOG/runs.jsonl"
exit $EXIT
