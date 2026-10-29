---
id: '0014'
title: Agent states are read-only over the harness transcripts
status: accepted
door: two-way
traces_to: [tenet-4]
scope:
  - packages/agentstate/src/sources.ts
  - packages/agentstate/src/langgraph.ts#runGraph
evidence:
  - test: packages/agentstate/test/agentstate.test.ts#opens sources read-only (a 0444 db works and is not modified)
approver: raymond
source: T18 commit 9902b50 (@mole/agentstate Hermes/Claude Code/Codex readers)
rules:
  - forbid: call
    callee: [writeFileSync, appendFileSync, writeFile, appendFile, rmSync, unlinkSync, renameSync, truncateSync, createWriteStream, mkdirSync]
    from: packages/agentstate/src/
    except: [packages/agentstate/src/langgraph.ts]
    why: harness transcripts are opened read-only; the one write path is the explicit LangGraph export (langgraph.ts), into a file the user names
---

## Decision

Hermes, Claude Code and Codex transcripts are opened read-only (SQLite readOnly, read-only file descriptors).
Mole never writes into them; anything it derives goes to `.mole/local/`.
