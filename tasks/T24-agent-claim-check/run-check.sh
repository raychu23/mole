#!/usr/bin/env bash
# One check round (loop rule R4): runs the contract's checks row
#   npm run check && node packages/agentstate/dist/bench/m16.js
# and appends ONE line to 4 log/runs.jsonl. The bench runs even when npm run check fails, so the line carries M16;
# exit stays the && chain's exit. Bench details (they quote chat text) go to .mole/local/bench/, never committed.
set -u
cd "$(git rev-parse --show-toplevel)"
T="${TMPDIR:-/tmp}/t24-check.$$"
D=".mole/local/bench"; mkdir -p "$D"
npm run check >"$T.check" 2>&1; c=$?
grep -E '^\s*(Test Files|Tests)\s' "$T.check" | tail -2
[ $c -ne 0 ] && grep -E 'FAIL|error TS|✗|×' "$T.check" | head -20
node packages/agentstate/dist/bench/m16.js --metrics-out "$T.m16.json" --details "$D/m16-details.json" >"$T.m16" 2>&1; m=$?
head -25 "$T.m16"
if [ $c -ne 0 ]; then ex=$c; else ex=$m; fi
TIME="$(date +%Y-%m-%dT%H:%M:%S%z)" COMMIT="$(git rev-parse --short HEAD)" EX=$ex C=$c M16="$T.m16.json" CHK="$T.check" node -e '
const fs = require("fs");
const rd = (f, k) => { try { return JSON.parse(fs.readFileSync(f, "utf8"))[k]; } catch { return "bench did not produce metrics"; } };
const chk = fs.readFileSync(process.env.CHK, "utf8");
const tests = (chk.match(/^\s*Tests\s+(\d[^\n]*)$/m) || [])[1] || "build failed before tests";
const line = { time: process.env.TIME, commit: process.env.COMMIT,
  cmd: "npm run check && node packages/agentstate/dist/bench/m16.js", exit: Number(process.env.EX),
  metrics: { M16: rd(process.env.M16, "M16") }, check: (Number(process.env.C) === 0 ? "pass: " : "fail: ") + tests.trim() };
fs.appendFileSync("tasks/T24-agent-claim-check/4 log/runs.jsonl", JSON.stringify(line) + "\n");
console.log(JSON.stringify(line));
'
exit $ex
