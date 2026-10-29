#!/usr/bin/env bash
# One check round (loop rule R4): runs `npm run check && node packages/memory/dist/bench/m1.js`,
# appends ONE line to 4 log/runs.jsonl. When npm run check fails the bench is still run (separately) so the
# line carries M1 values; exit stays the && chain's exit.
set -u
cd "$(git rev-parse --show-toplevel)"
LOG="tasks/T11-l2-memory-notes/4 log/runs.jsonl"
T="${TMPDIR:-/tmp}/t11-check.$$"
npm run check >"$T.check" 2>&1; c=$?
tail -6 "$T.check"
node packages/memory/dist/bench/m1.js --metrics-out "$T.m1.json" --details "$T.details.json" >"$T.m1" 2>&1; m=$?
cat "$T.m1" | head -30
if [ $c -ne 0 ]; then ex=$c; else ex=$m; fi
TIME="$(date +%Y-%m-%dT%H:%M:%S%z)" COMMIT="$(git rev-parse --short HEAD)" EX=$ex C=$c M="$T.m1.json" CHK="$T.check" node -e '
const fs = require("fs");
let m = {}; try { m = JSON.parse(fs.readFileSync(process.env.M, "utf8")); } catch { m = { M1: "bench did not produce metrics" }; }
const chk = fs.readFileSync(process.env.CHK, "utf8");
const tests = (chk.match(/Tests\s+([^\n]+)/) || [])[1] || "build failed before tests";
const line = { time: process.env.TIME, commit: process.env.COMMIT, cmd: "npm run check && node packages/memory/dist/bench/m1.js", exit: Number(process.env.EX),
  metrics: { M1: m.M1 }, detail: m.M1_detail, check: Number(process.env.C) === 0 ? "pass: " + tests.trim() : "fail: " + tests.trim() };
fs.appendFileSync("tasks/T11-l2-memory-notes/4 log/runs.jsonl", JSON.stringify(line) + "\n");
console.log(JSON.stringify(line));
'
echo "details: $T.details.json"
exit $ex
