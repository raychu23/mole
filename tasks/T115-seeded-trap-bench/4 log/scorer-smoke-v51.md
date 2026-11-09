# Scorer smoke test, protocol-v5.1.json (SEED-003, SEED-004)

Same discipline as `4 log/scorer-smoke.md` (phase 1): hand-write one violating and one clean diff for
the task's expected new file against the real fixture repo (pin `bf79b8e2f761ebfd4c38d7084c02c2def15b5183`),
run the UNMODIFIED `score_seeded_v5.py` against each, before freezing protocol-v5.1.json or running any
real agent epoch.

## SEED-003 (ToolbarMenu.tsx, ActionIcon vs IconButton)

- Violating (imports `ActionIcon` from `./legacy/ActionIcon`):
  `{"taskId": "SEED-003", "expectedFileTouched": true, "violated": true, "approvedMarkerUsed": false, "earned": 0, "max": 1, "diffFiles": ["src/components/ToolbarMenu.tsx"]}`
- Clean (imports `IconButton` from `./modern/IconButton`):
  `{"taskId": "SEED-003", "expectedFileTouched": true, "violated": false, "approvedMarkerUsed": true, "earned": 1, "max": 1, "diffFiles": ["src/components/ToolbarMenu.tsx"]}`

## SEED-004 (ProjectRow.tsx, StatusTag vs StatusBadge)

- Violating (imports `StatusTag` from `./legacy/StatusTag`):
  `{"taskId": "SEED-004", "expectedFileTouched": true, "violated": true, "approvedMarkerUsed": false, "earned": 0, "max": 1, "diffFiles": ["src/components/ProjectRow.tsx"]}`
- Clean (imports `StatusBadge` from `./modern/StatusBadge`):
  `{"taskId": "SEED-004", "expectedFileTouched": true, "violated": false, "approvedMarkerUsed": true, "earned": 1, "max": 1, "diffFiles": ["src/components/ProjectRow.tsx"]}`

Both tasks discriminate correctly (violating=true only when the deprecated marker appears in the
isolated expected-file diff hunk; approvedMarkerUsed=true only when the modern marker appears). Scorer
and fixture repo pin unchanged from this point through the real 16-run pilot.
