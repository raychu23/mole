#!/usr/bin/env bash
# One check round (loop rule R4): runs the contract's checks row
#   npm run check && node packages/agentstate/dist/bench/m6.js && node packages/agentstate/dist/bench/m7.js
# and appends ONE line to 4 log/runs.jsonl. Benches run even when npm run check fails, so the line carries M6 + M7;
# exit stays the && chain's exit. Bench details (M7 quotes chat text) go to .mole/local/bench/, never committed.
set -u
cd "$(git rev-parse --show-toplevel)"
T="${TMPDIR:-/tmp}/t18-check.$$"
D=".mole/local/bench"; mkdir -p "$D"
npm run check >"$T.check" 2>&1; c=$?
grep -E '^\s*(Test Files|Tests)\s' "$T.check" | tail -2
[ $c -ne 0 ] && grep -E 'FAIL|error TS|✗|×' "$T.check" | head -20
node packages/agentstate/dist/bench/m6.js --metrics-out "$T.m6.json" --details "$D/m6-details.json" >"$T.m6" 2>&1; m6=$?
head -25 "$T.m6"
node packages/agentstate/dist/bench/m7.js --metrics-out "$T.m7.json" --details "$D/m7-details.json" >"$T.m7" 2>&1; m7=$?
head -25 "$T.m7"
if [ $c -ne 0 ]; then ex=$c; elif [ $m6 -ne 0 ]; then ex=$m6; else ex=$m7; fi
TIME="$(date +%Y-%m-%dT%H:%M:%S%z)" COMMIT="$(git rev-parse --short HEAD)" EX=$ex C=$c M6="$T.m6.json" M7="$T.m7.json" CHK="$T.check" node -e '
const fs = require("fs");
const rd = (f, k) => { try { return JSON.parse(fs.readFileSync(f, "utf8"))[k]; } catch { return "bench did not produce metrics"; } };
const chk = fs.readFileSync(process.env.CHK, "utf8");
const tests = (chk.match(/^\s*Tests\s+(\d[^\n]*)$/m) || [])[1] || "build failed before tests";
const line = { time: process.env.TIME, commit: process.env.COMMIT,
  cmd: "npm run check && node packages/agentstate/dist/bench/m6.js && node packages/agentstate/dist/bench/m7.js", exit: Number(process.env.EX),
  metrics: { M6: rd(process.env.M6, "M6"), M7: rd(process.env.M7, "M7") }, check: (Number(process.env.C) === 0 ? "pass: " : "fail: ") + tests.trim() };
fs.appendFileSync("tasks/T18-agent-states/4 log/runs.jsonl", JSON.stringify(line) + "\n");
console.log(JSON.stringify(line));
'
exit $ex
