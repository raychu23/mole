---
id: 2026-10-27-map-stopped-while-typing
date: 2026-10-27
fix: 9e19c51
test: packages/daemon/test/daemon.test.ts#idle shutdown (T9)
decisions: ['0009', '0008']
---

## What broke

During the T9 review the map went blank after 30 minutes of typing in one file: the idle clock only counted requests,
not file changes, and a long first index could also be cut off.

## Five whys

1. The daemon stopped. 2. Its idle clock said 30 minutes without use. 3. Only RPC requests reset the clock.
4. Editing and indexing were not counted as use. 5. 0007 was written for "nobody is here", and nobody wrote down what "here" means.

## Fix

9e19c51: the watcher resets the clock on every file change (0009) and a running worker job pauses it (0008).
