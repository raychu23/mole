# Mole

Visual, intuitive codebase understanding that digs to the depths: open a file and Mole maps the visuals that matter for it, keeps them in step with the code and lets people and agents change them in one place.

Status: vision and direction only. No application slice is implemented yet.

## Core problems

1. **Code outpaces understanding.** Agents write more code than people can read. Beginners and reviewers lose the picture of how the system fits together.
2. **Visuals live away from the work.** Diagrams sit in READMEs, separate tools or old chat sessions. You have to go and find them instead of seeing them when you open a file.
3. **Intended design, current state and existing diagrams are never side by side.** Generated diagrams get regenerated and forgotten. Hand-made diagrams drift. No one view shows the roadmap next to what the code is now.
4. **Changing understanding is one-way.** Editing a diagram updates nothing else: not other diagrams, not docs, not what agents know.
5. **Agents rediscover the codebase every session.** That is slow and expensive, and nobody can see which parts each agent covered and which parts no agent touched.

## Two ways of looking at a codebase

| View | How it works | Pros | Cons |
|---|---|---|---|
| Agent-centric (ideal) | Divide the codebase across agents so no part is left behind; each agent carries its code + diagrams | Every part has an owner; diagrams travel with agent work; coverage is explicit | Needs up-front division; boundaries drift as code changes; not how most teams work today |
| Codebase-centric (reality) | The codebase spawns agents so no code is left behind; diagrams are generated, aligned with chat sessions and viewable in the chat harness | Matches how work happens now; works with any agent harness; diagrams come from what exists | Coverage gaps stay invisible; diagrams pile up per session; chats and diagrams need explicit linking |

Mole sits in both: as the visualizer inside agent tasks, and in the codebase itself.

(The pros and cons are a first draft for review.)

## Vision

**Stage 1: the codebase sidebar**
- As you enter each file, the sidebar maps its relevant visuals, changing as you move.
- Three layers in one view: the established diagram roadmap, the current generated diagram state, and the non-generated parts drawn from existing diagrams.
- Edit a graph directly in the sidebar and the change propagates everywhere.
- Efficient, quick, cheap and easy for agents to use.
- Proactive features and hooks in the sidebar, all serving the core: visual-based digging to the depths of a codebase.
- Mole also serves as the visualizer inside agent tasks.

**Stage 2 (maybe): agents through Claude plugins**
- Plugins do the agent-based work.
- Agent coverage map: the domains and files each agent covers, and the files no agent covered.

**Later: core infrastructure**
- Graph infrastructure (in the spirit of graphify) for concrete gains in agent integration, speed, cost and visual understanding for junior developers.

**Other tools:** take their useful features and implementations; overlap is fine. Integrate where it helps, but the core product comes first.

**Still open:** what "propagate" updates, first language and repository, storage, renderer, cost per file entry.

## Core (T113, D77 "cut to a core")

Mole's bloat is in the plan, not the code (`context/product-plan/13 Cut it down.md`), but the surfaces a
newcomer sees were still 21 MCP tools and 40+ CLI subcommands. The core is small: the **engine** (TypeScript
Compiler API index, `packages/core`/`packages/indexer`, `packages/scip` for other languages), **decisions +
rules** (`packages/decisions`: `.mole/decisions`, flags, dependency-cruiser rule enforcement), the **verifier**
(`packages/questions`: past fixes + guarding tests + up to 3 questions for a change -- `mole check` / `mole_check`),
and three surfaces: the **VS Code extension** (`apps/vscode`), the **Claude Code plugin** (`plugins/claude-code`),
and the **PR check** (`docs/pr-check.md`, `packages/decisions/src/check/pr-check.ts`, wired into `packages/server`).

The MCP server (`packages/mcp`) now exposes only 5 core tools by default -- `mole_map`, `mole_decisions`,
`mole_check`, `mole_claims`, `mole_tried` -- instead of all 21; the rest (reasoning/priorities/incident/
proposals/recall, hotspots, coupling, outcomes, one-on-one, compile/cascade, collisions, agent-intent,
coverage, interrogate, as-of) are unchanged, still tested, and one env var away (`MOLE_MCP_ALL_TOOLS=1`; see
`docs/mcp.md`). The CLI (`mole --help`) marks the same split in its command groups. Nothing was deleted: every
package and command here still builds and is still covered by its own tests -- "experimental" means not part
of the 5-job core yet, not unsupported.

## Installing the CLI + MCP server

`packages/cli-dist` builds one public npm package (`mole-code`, not published yet — T85) bundling the
`mole` CLI and the `mole-mcp` MCP stdio server so someone outside this repo can use them without a
checkout: see `packages/cli-dist/README.md` for install, usage and the isolated-install test.

## Working in this repository

New chat startup: open this repository folder, then follow `AGENTS.md` → `context/0 start.md` + `context/1 takeaways.md` → selected task. Detailed history is on demand. Tested: a writable chat updated both condensed files after a synthetic correction, and a separate fresh chat recovered the change and reason without the answer in its prompt. The latest reader skipped the full global preference inbox and long logs. This is agent-managed turn-end maintenance, not an independent background service or a cross-host guarantee. Evidence: `context/systems/decision-sync-test.json`; earlier checks: `context/systems/startup-test.json`.

This is the actual Mole repository, linked to `https://github.com/raychu23/mole.git`.

Start with [Mole context](</Users/a1/Desktop/CS Code/Project/Mole/context/0 start.md>) or its [readable page](</Users/a1/Desktop/CS Code/Project/Mole/context/doc.html>). The [source coverage index](</Users/a1/Desktop/CS Code/Project/Mole/context/4 log/0 coverage.md>) connects this conversation, older Mole/product-research chats and shared research. The context folder now lives directly in Mole; the former `../Context/mole` path links here for compatibility. The [first scenario task](</Users/a1/Desktop/CS Code/Project/Mole/current data/tasks/first scenario/0 start.md>) remains open. Shared development practices, tools, skills and evals are in [SDLC](</Users/a1/Desktop/CS Code/Project/sdlc/0-start.md>).

- `context`: canonical private project packet, history and source index; ignored by this repository's Git.
- `current data`: project brief/task/source-index routes into `context/`.
- `training data`: historical source route. Reference material, not trained model weights.
- `generated data`: project run evidence; no application/eval results yet.
- `AGENTS.md`: task scope and startup instructions. `CLAUDE.md` points to the same contract.

These local context routes are ignored by Mole Git and depend on this workspace. Old context revisions remain in the parent CS Code Git history, but the moved private directory is not currently versioned; a private versioning route is still needed. A remote clone does not receive the private chat archive or sibling SDLC folder. Before another machine/host works here, explicitly supply a reviewed, portable current packet. Automatic cross-host synchronization is not implemented.
