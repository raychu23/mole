#!/usr/bin/env bash
# One check round (loop rule R4): runs the contract's checks row
#   npm run check && node packages/verify/dist/bench/m14.js
# and appends ONE line to 4 log/runs.jsonl. The bench runs even when npm run check fails, so the line carries M14;
# exit stays the && chain's exit. Bench details go to .mole/local/bench/m14-details.json (gitignored).
set -u
cd "$(git rev-parse --show-toplevel)"
T="${TMPDIR:-/tmp}/t22-check.$$"
D=".mole/local/bench"; mkdir -p "$D"
npm run check >"$T.check" 2>&1; c=$?
grep -E '^\s*(Test Files|Tests)\s' "$T.check" | tail -2
[ $c -ne 0 ] && grep -E 'FAIL|error TS|✗|×' "$T.check" | head -20
node packages/verify/dist/bench/m14.js --metrics-out "$T.m14.json" --details "$D/m14-details.json" >"$T.m14" 2>&1; m=$?
tail -20 "$T.m14"
if [ $c -ne 0 ]; then ex=$c; else ex=$m; fi
TIME="$(date +%Y-%m-%dT%H:%M:%S%z)" COMMIT="$(git rev-parse --short HEAD)" EX=$ex C=$c M14="$T.m14.json" CHK="$T.check" DET="$D/m14-details.json" node -e '
const fs = require("fs");
const rd = (f, k) => { try { return JSON.parse(fs.readFileSync(f, "utf8"))[k]; } catch { return "bench did not produce metrics"; } };
const chk = fs.readFileSync(process.env.CHK, "utf8");
// review-1 P2-2: the per-repo mean share beside the bench string (informational; the bench alone decides met)
let split = "";
try {
  const rows = JSON.parse(fs.readFileSync(process.env.DET, "utf8")).details;
  const mean = (r) => { const xs = rows.filter((x) => x.repo === r).map((x) => x.ratio); return xs.length ? `${(100 * xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1)}%` : "n/a"; };
  split = ` · per repo mean share: mole ${mean("mole")}, excalidraw ${mean("excalidraw")}`;
} catch {}
const tests = (chk.match(/^\s*Tests\s+(\d[^\n]*)$/m) || [])[1] || "build failed before tests";
const line = { time: process.env.TIME, commit: process.env.COMMIT,
  cmd: "npm run check && node packages/verify/dist/bench/m14.js", exit: Number(process.env.EX),
  metrics: { M14: rd(process.env.M14, "M14") + split }, check: (Number(process.env.C) === 0 ? "pass: " : "fail: ") + tests.trim() };
fs.appendFileSync("tasks/T22-hand-back-test-selection/4 log/runs.jsonl", JSON.stringify(line) + "\n");
console.log(JSON.stringify(line));
'
exit $ex
