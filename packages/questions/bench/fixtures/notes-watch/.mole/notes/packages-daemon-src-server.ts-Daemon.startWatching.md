---
symbol: "packages/daemon/src/server.ts#Daemon.startWatching"
path: "packages/daemon/src/server.ts"
kind: method
hash: 501c4dcd19c39331
author: "Raymond Chu"
written: "2026-10-28T12:00:00.000Z"
---

The watcher callback must keep resetting lastRequest: a person typing for an hour without asking for a map still uses Mole, so the daemon must not idle out under them.
