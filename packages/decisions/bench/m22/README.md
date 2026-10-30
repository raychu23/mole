# M22 bench (T30): does the annotated file tree help someone answer "why" questions about an unfamiliar folder?

- `overlay/.mole/`: Mole records for 9 backstage ADRs (adr003-adr014), scope written from each ADR's text by hand (T30 builder,
  2026-10-29, before the tree code). Backstage ADRs carry no scope; a team adopting Mole would write these.
  Two intent cards (plugins, plugins/notifications) take their purpose from ADR011 only: no end state, risk or owner is invented.
- `../m22-key.json`: 5 why-questions about plugins/notifications + expected ADR + key phrases, and the decoration expectations.
- `prompt-task.md`: the task text both arms share. `node packages/decisions/dist/bench/m22.js --emit-prompts` writes
  `prompt-without.md` (task only) and `prompt-with.md` (task + the tree's text for plugins/notifications, its parents and its decorated subfolders).
- `answers/{with,without}-{1,2,3}.json`: saved by the coordinator from fresh subagents. Score: `node packages/decisions/dist/bench/m22.js --score packages/decisions/bench/m22/answers`.
- `--decorations-only`: times decorations + intent cards for every folder of Mole and of the overlay (laid over an empty skeleton of the
  scoped paths, so no clone is needed) and checks done-when 4 (no records → no decoration, no card).
