## Summary
Of the 15 seeded dcbench decisions, only **2 (D-001, D-005)** are honestly expressible as Mole crisp
`rules:` (forbid: import | call) against this seed repo's actual code, without false positives. The other
13 stay advisory-only in the M arm (same as before): either they are "must call X" requirements (Mole's
`rules:` has no `require` kind, only `forbid`), or their dcbench "fail" check matches generic keywords /
property access / file existence that are not import-or-call-graph facts at all.

## Method
Read `docs/decisions-and-rules.md` (Mole's own spec: `RuleKind = 'import' | 'call'`,
`packages/decisions/src/rules/types.ts`/`parse.ts` -- only `forbid: import` (module specifier/path) and
`forbid: call` (named callee) exist; no "require a call/import" kind). Cross-checked each of the 15
decisions in `benchmark/seed-data.ts` against its own gotcha's `fail` regex in `benchmark/tasks.ts` (dcbench
pin 9f507ce) AND the actual importable symbols in the seed repo's `src/` (read directly, not guessed).

## Per-decision verdict

| id | decision (short) | dcbench fail pattern | crisp via Mole `rules:`? | why |
|---|---|---|---|---|
| D-001 | DateRangePicker not CalendarRange | `import.*CalendarRange` | **YES** | `CalendarRange` is a real export at `@/components/ui/calendar-range`, already imported in `notification-preferences.tsx` -- `forbid: import, to: ["@/components/ui/calendar-range"]` |
| D-002 | exports must call withAuditLog() | (pass-only; no fail) | no | requires a call to exist; Mole's rules only forbid, never require |
| D-003 | button variant convention | string literal `variant="secondary"` vs context | no | a JSX prop-value convention, not an import or a named function call |
| D-004 | cursor pagination, not offset | keywords `offset=/limit=/page=/skip=` | no | generic variable/keyword use in API files, not a specific importable module or distinguishable callee -- forbidding a callee named e.g. `skip` would false-positive on unrelated code |
| D-005 | ShimmerSkeleton not PulseLoader(Dots) | `import.*PulseLoader(Dots)?` | **YES** | `PulseLoader`/`PulseLoaderDots` are real exports at `@/components/ui/pulse-loader`, already imported in `src/app/dashboard/loading.tsx` -- `forbid: import, to: ["@/components/ui/pulse-loader"]` |
| D-006 | auth middleware frozen (file_not_modified) | `file_not_modified: src/lib/auth/middleware.ts` | no | "never touch this file" is not an import/call fact; Mole has no frozen-file rule kind |
| D-007 | errors need help-center links | keywords `help.example.com/errors\|createErrorResponse\|errorResponse` | no | requires calling a helper that may or may not exist yet; a forbid rule can't require it |
| D-008 | feature flags via PostHog | keywords `ENABLE_/FEATURE_/isEnabled=true\|false` | no | forbidding a naming CONVENTION (env-var-shaped constants), not an import or call |
| D-009 | test co-location, no `__tests__/` | `file_exists: **/__tests__/**` | no | a file-location policy, not an import/call fact |
| D-010 | Zod + withAuth on API routes | (pass-only; no reliable fail) | no | requires calls to exist; no forbid target |
| D-011 | async digest, no realtime push | keywords `realtime\|websocket\|SSE\|socket.io...` | no (checked) | no real-time/push package (`socket.io` etc.) is actually installed or imported anywhere in this seed repo -- a `forbid: import` rule would never fire on the model's actual trap (which is inline code/comments, not a new dependency); would be rules-theater, not a real test |
| D-012 | keyboard nav / ARIA | keywords `onKeyDown\|aria-*\|role=...\|tabIndex` | no | accessibility attribute usage, not import/call |
| D-013 | Drizzle only, no raw SQL | keywords `` sql` \|$queryRaw\|knex\|prisma.\|raw(\|execute('SELECT `` | no (checked) | no `knex`/raw-SQL alternative package is installed in this repo (only `drizzle-orm` + `better-sqlite3`); the realistic trap is calling `.prepare()`/raw SQL text through the EXISTING `better-sqlite3` driver, which is also what Mole's own `src/lib/db/index.ts` legitimately does -- forbidding it would false-positive on the framework's own code |
| D-014 | env via @t3-oss/env-nextjs, no process.env | `process\.env\.` | no | `process.env` is a global property read, not an import or a named function call Mole's AST scan tracks |
| D-015 | sonner toast, not react-hot-toast | `import.*from.*react-hot-toast` | yes in general (not in the 8 scored tasks) | `react-hot-toast` is a real forbiddable import specifier, but its only gotcha is TASK-010, which is NOT one of the 8 tasks v1/v3/v4 score -- irrelevant to this pilot, noted for completeness |

## What this means for the M-block arm
`.mole/decisions-m/` (scratch/dcbench-v4/arms/M) carries the SAME 15 decision texts as the R arm's
CLAUDE.md (T63's fairness rule, unchanged), but only `D-001.md` and `D-005.md` get a `rules:` block. The
other 13 remain plain decision records: Mole's SessionStart/PreToolUse context still surfaces them
(advisory, by-meaning), but no `rules:` block means D102's Stop:block / PreToolUse:deny can never fire on
them -- consistent with "crisp rules are Mole's enforcement mechanism; everything else stays advisory" (no
rules invented or stretched to make the hit-rate look better).

Practical consequence: of this pilot's 8 scored tasks, only TASK-001 (D-001 gotcha) and TASK-013 (D-005
gotcha) carry a decision the M-block arm can actually BLOCK on. TASK-001 is the smoke task (see
4 log/evidence.md) because it is in the 8-task set, has a crisp rule, and was also v1's single biggest M
loss (results-72.md: "M's biggest loss: shown D-002 + D-001, edited elsewhere").
