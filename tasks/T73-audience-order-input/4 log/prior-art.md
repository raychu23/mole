# T73 prior art — setting and comparing the audience/value order from the CLI and IDE

## Summary
T60 already made a phase an audience (Bench-Capon: an ordered list of values a judge prefers) and T68 already
made "the phase in force today" the correct default for every reasoning tool except `mole_priorities` itself
(left out of that task's own boundary, logged as backlog `priorities-default`). T73 adds the missing write
side (a person edits the order; the CLI, never MCP, performs the edit) and the missing what-if side (judge the
SAME graph under an order that is never read from or written to `.mole/priorities.md`) — and finally closes the
`priorities-default` backlog item. Nothing here is a new reasoning method: `setPriorities` is a text edit to an
already-defined file format (T60), and `compareWithOrder`/`evaluateOrder` call the SAME `evaluate()` (T42) and
`diffPhases` (T60's `comparePhases`, now shared) that every other phase comparison already uses.

```notes
source                             what it says                                        we borrow
Bench-Capon, "Persuasion in        VAF = <AR, attacks, V, val, P>; P is the set of      unchanged from T60: an audience is
Practical Argument Using           possible AUDIENCES, each an ordering (preference      exactly one phase's tenet order; a
Value-based Argumentation          relation) on V; "any given argumentation will be      what-if order is just ONE MORE such
Frameworks", J. Logic & Comp.      assessed by an audience in accordance with its        ordering, evaluated the same way,
13(3):429-448, 2003 (re-fetched    preferred values" (sec 2, Def 2); an attack A->B       that happens not to be named or
2026-11-03, techreports.csc.       succeeds for audience a iff val(B) is not preferred    stored (T73's own addition: an
liv.ac.uk/tr2002/ulcs-02-017.pdf)  to val(A) by a (Def 3 "defeatsa")                      audience need not be P's member)
Gordon, Prakken & Walton, "The     Proof standards are a function (statement, argument-   the what-if's OWN proof standard is
Carneades Model of Argument and    graph) -> boolean, assigned per statement/issue, NOT   unchanged -- it is Bench-Capon's own
Burden of Proof", Artificial       globally; "the burden of proof ... may be reallocated  rule (reused from T60/engine.ts),
Intelligence 171(10-15):875-896,   by changing the assignment of premise types and        never a Carneades scintilla/
2007 (re-fetched 2026-11-03,       proof standards" AS THE DIALOGUE PROGRESSES, without    preponderance/beyond-reasonable-
webspace.science.uu.nl/~prakk101/  committing to a final graph (secs 1, 4-5)               doubt threshold; what we borrow is
pubs/GordonPrakkenWalton2007a.pdf)                                                         the STRUCTURAL idea: the model
                                                                                            supports re-evaluating under a
                                                                                            DIFFERENT standard/audience
                                                                                            assignment for the SAME graph
                                                                                            without altering the graph or
                                                                                            committing the dialogue to it --
                                                                                            exactly a what-if, non-writing,
                                                                                            reversible comparison (fit check)
VS Code UX Guidelines, "Quick      Quick Picks: "Use the description for displaying the   we do NOT use a vscode.QuickPick
Picks" (code.visualstudio.com/     current item(s)"; "Don't repeat existing               for this -- the sidebar panel
api/ux-guidelines/quick-picks,     functionality"; Overview: "Quick Picks capture a        (T34/T62) already has an
fetched 2026-11-03)                user's input in several different ways... single       established input+button pattern
                                    selection ... or even freeform text input"             for closely-related small inputs
                                                                                            in THIS surface (notes/questions
                                                                                            textareas, T34); a modal Quick
                                                                                            Pick would duplicate that
                                                                                            existing functionality ("Don't
                                                                                            repeat") for a single freeform
                                                                                            comma-list input the user can
                                                                                            already see pre-filled with the
                                                                                            current order (no description/
                                                                                            detail metaphor needed); we DO
                                                                                            keep the guideline's point that
                                                                                            applies here -- pre-fill the
                                                                                            current value so the person sees
                                                                                            what's in force before changing it
Mole T60 prior-art.md (2026-11)    phase has a `from` date; `.mole/priorities.md`          HEADING/ITEM regex and the
                                    `## <phase> · from YYYY-MM-DD` heading + ordered        round-trip contract reused AS-IS;
                                    list; "no priorities file = no audience"                setPriorities emits the identical
                                                                                            shape readPriorities already parses
Mole T68 prior-art.md (2026-11,    "mole_priorities tool doc ... documents an intent the    THE fix this task closes: same
already analyzed this exact gap)   CODE for evaluatePhase(root, {}) does NOT implement ...  selector (phaseInForce) T68 already
                                    scoped ONLY to the NEW incident/proposals selectors,     gave incident-suggest and
                                    NOT retrofitted onto mole_priorities itself"             proposals-compare, now also for
                                                                                             mole_priorities's own bare default
```

## Fit check
- **The what-if order is still a Bench-Capon audience, just not a member of the stored set P.** Nothing about
  Def 2/3 requires an audience to be named or saved; `compareWithOrder`/`evaluateOrder` build the identical
  `AVAF` (Def in T60's own prior-art, `attackSucceeds`/`succeeds`, unchanged) for an order that happens to come
  from a text box instead of a file. No new semantics; same `evaluate()` (T42), same `diffPhases` logic T60's
  `comparePhases` already used (now shared by both, one source of truth, AGENTS.md #5).
- **Carneades is cited for the STRUCTURE of a reversible re-evaluation, not for its proof-standard vocabulary.**
  Mole's engine is Dung/Bench-Capon grounded semantics with value-based attack filtering (T42/T60), not
  Carneades' scintilla-of-evidence / preponderance / beyond-reasonable-doubt standards, and this task does not
  add those. What Carneades's own paper demonstrates is that a model built to assign proof standards/burdens
  PER ISSUE, reassignable as a dialogue progresses, is exactly the kind of thing a what-if is: re-judge the
  same graph under a different assignment without committing it. We borrow the STRUCTURAL precedent, not the
  standard taxonomy — using Carneades vocabulary (e.g. "scintilla of evidence") here would be inventing a
  method Mole's engine does not implement. INFERENCE: the analogy is ours; Carneades's own paper never
  discusses value ORDERINGS the way Bench-Capon's VAF does (it allocates burdens to statements/parties, not an
  ordering over values), so it grounds the SHAPE of the what-if, not its evaluation rule (that stays T60/T42).
- **`set` never runs over MCP** (STOP clause + AGENTS.md "a human act, never MCP"): `setPriorities` lives in
  `@mole/decisions` and is wired ONLY into `prioritiesCli`'s `set` subcommand (packages/decisions/src/cli.ts);
  `packages/mcp/src/reasoning-tools.ts` is read-only (T61's own contract, unchanged) and does not import it.
- **The what-if never writes** (STOP clause): `evaluateOrder`/`compareWithOrder` (priorities.ts),
  `evaluateRecords`'s `sel.order` branch (proposals.ts), the CLI's `whatif` subcommand, and the panel's
  `reasoningWhatIf` message handler all call only read paths (`loadGraph`, `evaluate`) — none call
  `writeFileSync` on `.mole/priorities.md`. Proven for the CLI and the proposals library with a git-status
  assertion (packages/decisions/test/priorities.test.ts, packages/proposals/test/phase.test.ts) and for the
  real panel with a before/after `git status --porcelain` on the t61-replay copy (4 log/ this task's own log).
- **A phase name not yet in the file (`set`) is appended, dated today, after the latest phase** — the same
  ordering invariant `readPriorities` already enforces (`phase X must start after phase Y`); REVERSIBLE DEFAULT,
  INFERENCE (no prior art picks a date for a newly-named phase; the only date consistent with T60's existing
  invariant without asking the person for one is today, and the file remains hand-editable afterward to pick a
  different date). Updating an EXISTING phase's order keeps its stored `from` date and position untouched —
  the person is reranking, not relocating the phase in time.
- **`mole_priorities`'s own bare default (backlog priorities-default)**: T68's prior-art.md already diagnosed
  this precisely (see table) and deliberately left it alone ("out of boundary's spirit... changing its own
  default risks tests outside this task's boundary for no required gain"). This task's own goal text names it
  explicitly, so it is now in boundary: the MCP tool's selector now calls the SAME `phaseInForce` T68 gave the
  other two tools, computed once before falling back to `evaluatePhase`'s own (unchanged) plain-Dung default
  for the explicit-phase/at case. `evaluatePhase`'s OWN default (no `sel`) and `mole priorities` (the daemon
  CLI command) stay plain Dung, UNCHANGED — that is still "`mole priorities`'s own default" per its doc
  comment in priorities.ts, and T60's own test (`evaluatePhase(root).labels` equals the plain engine) still
  passes untouched. Only the MCP TOOL's selection of WHICH `sel` to pass changes.
```

## What does not fit (left out)
- No proof-standard layer (scintilla/preponderance/beyond-reasonable-doubt), no burden-of-proof allocation to
  premises/parties: Carneades's actual machinery is NOT implemented; only the reversible re-evaluation shape is
  borrowed, as stated above.
- No VS Code `QuickPick`/`InputBox` API call from the extension host: the what-if control is a plain
  input+button inside the EXISTING sidebar webview (apps/vscode/webview/panel.ts), matching the UX guideline's
  "don't repeat existing functionality" and this surface's own established pattern (T34 notes/questions).
- No change to how `evaluatePhase`'s OWN default behaves, or to `mole priorities`'s CLI default: T60's test for
  that ("done-when 2: no priorities file -> labels identical to the plain engine") still passes unmodified.

## Review 1 (deleg) HIGH 1 + HIGH 2 fixes — added prior art (2026-11-03)

```notes
source                             what it says                                        we borrow
git, Documentation/technical/       "`index.lock`... an atomic create of a lock file;    the mutex itself: O_EXCL
index-format.txt + widely           on success the process holds the lock. It then       create of `<file>.lock`,
documented `index.lock` convention  writes the new index content, then atomically        write-then-rename to publish,
(re-fetched 2026-11-03, see also    RENAMES `index.lock` to `index`" (git-cola #1438,     a crashed holder's lock left
github.com/git-cola/git-cola/       Stack Overflow 9282632: a crashed git leaves          behind -- WHY setPriorities
issues/1438, stackoverflow.com/     `index.lock` behind, requiring manual `rm`)           needs a STALE-lock escape
questions/9282632)                                                                       hatch, not just O_EXCL alone
moxystudio/node-proper-lockfile     "lockfile's `mtime` is periodically updated... this    the STALENESS convention: a
README (re-fetched 2026-11-03,      allows to effectively check if a lock is stale by     lock whose mtime exceeds the
github.com/moxystudio/              checking its `mtime` against a stale threshold";      bound is reclaimed (same
node-proper-lockfile)               default `stale` option is 10000ms (10s), "any crash   10s bound as proper-lockfile's
                                     or process kill... will leave the lock active         own default); we do NOT take
                                     forever" if stale defaults to 0 (their own argument    its `mkdir`-over-`open+O_EXCL`
                                     for a non-zero default); retries via an options        NFS point (Mole's lock lives
                                     object, exponential backoff is the caller's own        on a local repo checkout,
                                     concern (not in the core lock loop shown)              never NFS) or its periodic
                                                                                            mtime-refresh (setPriorities
                                                                                            holds the lock only for one
                                                                                            short synchronous read+write,
                                                                                            not a long-lived session)
```

- **The mutex is `O_EXCL` create, not `mkdir`.** proper-lockfile deliberately avoids `open(..., O_EXCL)` because
  it is unreliable on NFS; Mole's `.mole/priorities.md.lock` lives on a local git checkout, never a network
  filesystem, so git's own simpler `index.lock` convention (an exclusive create, not a directory) fits here
  without inheriting a problem neither Mole nor git's own index actually has.
- **Stale-lock reclaim by mtime age, same bound proper-lockfile itself defaults to (10s).** `setPriorities` holds
  its lock only across one synchronous read + edit + write (milliseconds in practice, bounded even with the
  test's own artificial 300 ms worst case), so a lock that is still present after 10s can only mean its holder
  crashed or was killed before reaching the `finally` release — reclaiming it is strictly a liveness fix, never
  a correctness risk a live holder could be confused by (its `mtime` would be fresh).
- **Retry with exponential backoff up to a bound, not proper-lockfile's own default of zero retries.** A CLI
  `set` run by a person (never a long-lived server) can reasonably wait up to LOCK_TIMEOUT_MS (5s) for a sibling
  `set` to finish instead of failing immediately; PrioritiesError on timeout is the SAME error type every other
  `setPriorities` validation failure already throws (file:line-style consistency the CLI's own exit-2 handling
  expects, packages/decisions/src/cli.ts).
- **Write via temp file + rename (git's own index.lock-to-index step), not an in-place `writeFileSync`.** A
  reader (`readPriorities`, any other `priorities` invocation) can never observe a half-written file; a process
  that crashes mid-write leaves only an orphaned `.NNN.tmp` file next to `priorities.md`, never a corrupt one.
