#!/usr/bin/env bash
# One check round (loop rule R4): runs the contract's checks row
#   npm run check && node packages/flows/dist/bench/m20.js
# and appends ONE line to 4 log/runs.jsonl. The bench runs even when npm run check fails, so the line carries M20;
# exit stays the && chain's exit. Bench details go to .mole/local/bench/m20-details.json (gitignored).
set -u
cd "$(git rev-parse --show-toplevel)"
T="${TMPDIR:-/tmp}/t28-check.$$"
D=".mole/local/bench"; mkdir -p "$D"
npm run check >"$T.check" 2>&1; c=$?
grep -E '^\s*(Test Files|Tests)\s' "$T.check" | tail -2
[ $c -ne 0 ] && grep -E 'FAIL|error TS|✗|×' "$T.check" | head -20
node packages/flows/dist/bench/m20.js --metrics-out "$T.m20.json" --details "$D/m20-details.json" >"$T.m20" 2>&1; m=$?
tail -30 "$T.m20"
if [ $c -ne 0 ]; then ex=$c; else ex=$m; fi
TIME="$(date +%Y-%m-%dT%H:%M:%S%z)" COMMIT="$(git rev-parse --short HEAD)" EX=$ex C=$c M20="$T.m20.json" CHK="$T.check" node -e '
const fs = require("fs");
const rd = (f, k) => { try { return JSON.parse(fs.readFileSync(f, "utf8"))[k]; } catch { return "bench did not produce metrics"; } };
const chk = fs.readFileSync(process.env.CHK, "utf8");
const tests = (chk.match(/^\s*Tests\s+(\d[^\n]*)$/m) || [])[1] || "build failed before tests";
const line = { time: process.env.TIME, commit: process.env.COMMIT,
  cmd: "npm run check && node packages/flows/dist/bench/m20.js", exit: Number(process.env.EX),
  metrics: { M20: rd(process.env.M20, "M20") }, check: (Number(process.env.C) === 0 ? "pass: " : "fail: ") + tests.trim() };
fs.appendFileSync("tasks/T28-runtime-flows-from-tests/4 log/runs.jsonl", JSON.stringify(line) + "\n");
console.log(JSON.stringify(line));
'
exit $ex
