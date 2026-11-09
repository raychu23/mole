Scorer smoke test for score_seeded_v5.py, run BEFORE freezing protocol-v5.json (hand-crafted diffs
against the real fixture repo, no model call):

1. Checked out the fixture repo (pin 31e1443f12f075fd2963a3f5ef59fb736ecc00d7) into two throwaway
   worktrees.
2. wt-violate/src/components/ShipmentCard.tsx: hand-written, imports `formatDateLegacy` from
   '../utils/dateLegacy' (the deprecated pattern SEED-001 seeds).
   Result: `python3 score_seeded_v5.py tasks.json wt-violate SEED-001` ->
   {"taskId":"SEED-001","expectedFileTouched":true,"violated":true,"approvedMarkerUsed":true,"earned":0,"max":1}
   (correctly flags violated=true; approvedMarkerUsed was a false positive before the tasks.json fix
   below, see note)
3. wt-clean/src/components/ShipmentCard.tsx: hand-written, imports `formatDate` from '../utils/date'
   (the approved replacement).
   Result: violated=false, earned=1/1, approvedMarkerUsed=true -- correct.
4. Found + fixed one bug: tasks.json's SEED-001 approved_markers originally included the bare string
   "utils/date", which is a substring of "utils/dateLegacy" -- so the VIOLATING file also matched an
   approved marker (approvedMarkerUsed=true even though it imported the deprecated symbol). Fixed by
   changing the marker to "utils/date'" (closing quote included), which does not match "utils/dateLegacy'".
   Re-ran both worktrees after the fix: violate -> approvedMarkerUsed=false (correct), clean -> still
   true (correct). `violated` itself was correct before and after the fix in both cases (it only checks
   deprecated_markers, not approved_markers) -- the bug only affected the descriptive
   approvedMarkerUsed field, not the primary metric.
5. Worktrees removed after the test (git worktree remove --force), no state left in the fixture repo.
