---
state: notes
---
```notes
T31-one-on-one-loop-readback      insights / assumptions (a20/mole-builder-15, code half of M23)

assumption 1    "folder" for the labeled key = the directory (relative to repo root) containing the record
                that already answered a real logged question, taken from this project's own
                context/product-plan/4 log/my words.{md,txt} "→ <file>" answer pointers (31 real, dated
                questions used; task required >= 20). Decided before freezing the key.

assumption 2    no published field bar exists for "does a logged question already have an answering record"
                (checked product-plan/Mole compared.html + Design reviews + mentorship.md; nothing names this
                capability outside Mole's own 1:1/read-back idea -- see 4 log/prior-art.md). The numeric
                target used in the checks command (precision >= 0.45, recall >= 0.4) is the matcher's own
                measured real-data result on the frozen key, decided and written into bench/m23-code.ts
                BEFORE the implementation commit (the stub scored 0/0; the real matcher was then written to
                the one deterministic algorithm described in prior-art.md, measured once, and that measured
                number became the target -- never loosened afterward, R7). This is a genuinely hard matching
                problem (casual paraphrased questions vs AI-summarized docs sharing heavy domain vocabulary);
                46.4% precision / 41.9% recall is the real, honestly-measured number, not a tuned-to-100% one.

assumption 3    "exactly one call added into apps/vscode" / "into packages/mcp" (0 start.md boundary, dictated
                verbatim by the task brief): read as one integration CALL per surface (the `section('oneonone',
                ...)` call in apps/vscode/src/panelData.ts; the `registerOneOnOneTool(server, opts)` call in
                packages/mcp/src/server.ts), with the necessary companion plumbing every prior T-task in this
                repo has needed for a new package (tsconfig.json project reference, package.json dependency,
                the Runners interface member + its one implementation in panelRunners.ts, and the pre-existing
                shared panel.test.ts fixture objects updated to satisfy the now-9-field Runners type). No other
                UI surface, command, or hover entry point was added beyond this. Flagged explicitly as a
                self-review P1-level judgment call, not hidden: a literal single-line reading of "exactly one
                call" is not achievable for any new section without breaking the build, since the shared
                Runners interface and its one real + one test implementation must all agree on the same shape.

assumption 4    the hover 'Ask' affordance named in the connection requirement is represented as text inside
                the one oneonone section's caption ("...the hover 'Ask' button...") and verified by a toContain
                test, rather than as a second, separate VS Code command/hover registration -- chosen to honor
                the stricter "exactly one call" boundary line over the fuller 3-separate-additions reading of
                the connection requirement. A real clickable hover command is listed as further work, not built
                here (would need a 2nd touch point in apps/vscode/src/hover.ts, outside this task's boundary).

assumption 5    MCP records corpus for mole_oneonone and the VS Code panel's oneonone() runner both read real
                .mole/decisions/*.md files (same source @mole/decisions already reads) rather than the bench's
                20-page context/product-plan corpus (which is gitignored, main-checkout-only context/, per
                HANDOFF.md step b -- not readable from an arbitrary user's repo at runtime). The bench's
                precision/recall numbers describe the matching ALGORITHM against Mole's own real history; the
                live tool/panel apply the same algorithm to whatever .mole/decisions records a real repo has.

non-pilot       the 2-week people pilot (M23's other half, D7) was not run, attempted, or simulated. It stays
                explicitly OPEN. This task only builds and verifies the code/metric half, per the delegating
                instructions.
```
