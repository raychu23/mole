# Mole prototype

Clickable prototype of Mole in each setting it lives in, on a real TypeScript repo. Built from the product plan (`context/product-plan/systems/plan.json`, `offerings.json`). Not the product: no daemon, no SQLite, no VS Code extension yet.

## Run

```sh
cd prototype
npm run index      # TS Compiler API over ~/.hermes/hermes-agent/ui-tui → data/ui-tui.js (~5 s)
open app/index.html
```

Any TS repo works: `node indexer/index.mjs --root <repo> --src src --name <name>`, then point `app/index.html` at `data/<name>.js`.
TypeScript comes from `MOLE_TS` or the nearest `typescript` package (nothing is installed by this folder).

## Settings shown (top tabs)

| tab | stage | host | shows |
|---|---|---|---|
| How it's used | all | n/a | the settings table + 3 customer walkthroughs (junior, agent user, lead), each step jumps into the right view |
| Editor sidebar | 1 | VS Code / Cursor / Windsurf | map follows the open file · roadmap boxes over real code · drift · dig map → file → symbol → path · impact · curated Mermaid import · edit once → README block, AGENTS.md, model update · explain with consent · full view |
| Agent in terminal | 2 | Claude Code CLI | SessionStart context · `mole_map` vs reading files · drift note after an edit · guard deny → `mole_propose` · Bash edit caught by snapshot · Stop report |
| Agent panel | 2 | VS Code panel · Hermes pane · Claude desktop MCP App · localhost | one renderer in 4 frames: lanes, files touched on the map, coverage vs scope, drift this session, approve/reject |
| Pull request | 3 | GitHub CI | architecture diff vs accepted roadmap, new/resolved drift with file:line, `mole check`, CODEOWNERS |
| Settings | all | `.mole/config.yaml` | persona presets + every setting changes the other tabs live |

## Real vs simulated

- REAL: files, symbols, imports, calls with file:line@commit (`indexer/index.mjs`, TS type checker, calls through re-exports land on the declaration); neighbourhood, drift rule, impact, path, bootstrap, Mermaid anchor matching, `mole_map` / SessionStart text (`core/mole-core.js`, shared by browser + CLI); render timing.
- SAMPLE: roadmap boxes + rules R1-R5 (the 4 drift items they flag are real code), curated Mermaid diagram, the agent session (3 agents, 19 events; paths + grep hits real, edits not applied), the PR.
- MOCK: host chrome, LLM explanation text (no model is called).
- Not shown: state-machine layer (F3.8, maybe), runtime traces (F3.3), shared CI graph (S3.1 beyond a check row).

## Files

- `indexer/index.mjs`: current layer (plan S1.1 seed)
- `core/mole-core.js`: queries shared by app + CLI
- `sample/sample.js`: simulated inputs
- `app/`: the clickable prototype (no build step)
- `cli/mole.mjs`: `map | impact | drift | path | session-start | bootstrap | mermaid`
- `test/check.mjs`: core checked against the real source (20 checks) · `test/smoke.mjs`: drives every tab in headless Chrome (23 checks)
