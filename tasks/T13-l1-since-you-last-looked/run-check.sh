#!/usr/bin/env bash
# One check round (loop rule R4): runs `npm run check && node packages/memory/dist/bench/m3.js`,
# appends ONE line to 4 log/runs.jsonl. When npm run check fails the bench is still run (separately) so the
# line carries M3 values; exit stays the && chain's exit.
set -u
cd "$(git rev-parse --show-toplevel)"
LOG="tasks/T13-l1-since-you-last-looked/4 log/runs.jsonl"
T="${TMPDIR:-/tmp}/t13-check.$$"
npm run check >"$T.check" 2>&1; c=$?
tail -6 "$T.check"
node packages/memory/dist/bench/m3.js --metrics-out "$T.m3.json" --details "$T.details.json" >"$T.m3" 2>&1; m=$?
cat "$T.m3" | head -30
if [ $c -ne 0 ]; then ex=$c; else ex=$m; fi
TIME="$(date +%Y-%m-%dT%H:%M:%S%z)" COMMIT="$(git rev-parse --short HEAD)" EX=$ex C=$c M="$T.m3.json" CHK="$T.check" node -e '
const fs = require("fs");
let m = {}; try { m = JSON.parse(fs.readFileSync(process.env.M, "utf8")); } catch { m = { M3: "bench did not produce metrics" }; }
const chk = fs.readFileSync(process.env.CHK, "utf8");
const tests = (chk.match(/^\s*Tests\s+(\d[^\n]*)$/m) || [])[1] || "build failed before tests";
const line = { time: process.env.TIME, commit: process.env.COMMIT, cmd: "npm run check && node packages/memory/dist/bench/m3.js", exit: Number(process.env.EX),
  metrics: { M3: m.M3 }, detail: m.M3_detail, check: Number(process.env.C) === 0 ? "pass: " + tests.trim() : "fail: " + tests.trim() };
fs.appendFileSync("tasks/T13-l1-since-you-last-looked/4 log/runs.jsonl", JSON.stringify(line) + "\n");
console.log(JSON.stringify(line));
'
echo "details: $T.details.json"
exit $ex
