# T68 prior art — incident suggestions and proposal comparison under the phase in force

## Summary
T68 is a composition, not a new method: T60 already gives a phase = an audience (ordered tenet list with a
`from` date, `phaseAt` picks the one in force on a date); T58 already gives incident revival = Dung reinstatement
over a grounded labelling; T56/T62 already give proposal comparison = two grounded labellings (baseline vs
worktree) diffed. T58's `suggestRevivals` and T56/T62's `evaluateProposal` both call `evaluate()` with NO
audience (plain Dung) — that is the gap T68 closes: feed them the same audience T60 already computes, and show
the plain-Dung result beside it so a silent switch is never hidden (STOP clause).

```notes
source                              what it says                                                 we borrow
Bench-Capon, "Persuasion in         VAF: argument -> value; AUDIENCE = an ordering of values;     unchanged from T60: audience =
Practical Argument Using            an attack from a to b succeeds unless val(b) is strictly      one phase's tenet order; the
Value-based Argumentation           preferred to val(a) for that audience (Def 5.2, 5.6-5.7,      ONLY new idea T68 adds is: which
Frameworks", J. Logic & Comp.       AVAF); re-fetched 2026-11-03 (jcl03.pdf, Liverpool CS)         caller resolves the audience and
13(3):429-448, 2003                                                                                when (suggest/compare time, not
                                                                                                    accept time -- see fit check)
Dung, "On the acceptability of      grounded extension = least fixed point of the characteristic  an attack with an unranked value
arguments...", Artificial            function; reinstatement labelling: in/out/undec, an argument  (no #tenet- tag) is unfiltered
Intelligence 77:321-357, 1995        attacked only by 'out' is 'in'; re-confirmed via Wikipedia's   REGARDLESS of phase (same rule as
(re-fetched 2026-11-03)              reinstatement-labelling summary of Dung's own definitions     T60's attackSucceeds, engine.ts:46)
                                                                                                    -- so an accepted incident attack
                                                                                                    (unvalued) always succeeds, in
                                                                                                    every phase: the T58 freeze needs
                                                                                                    no change to stay correct (fit check)
Mole T60 prior-art.md (2026-11,      phase has a `from` date; --at picks the latest phase with     phaseAt/readPriorities reused
already cites Le-Brun AWS tenets     from <= date; no priorities file = no audience                AS-IS (no boundary file touched
practice 2023-06)                                                                                  outside priorities.ts)
Mole T58 prior-art.md (2026-11,      candidates must share a node (decision/scope) with the        unchanged: phase only changes
already cites Graphiti               incident; accept freezes the attack targets at accept time,   WHICH arguments pass the label
get_edge_invalidation_candidates)    read-only suggest vs the person's accept                      filter ('out'), not the candidate
                                                                                                    admission rule itself
Mole T56/T62 (evaluateProposal,      before = baseline git-archive snapshot of .mole/, after =     before/after both resolved
proposals.ts:204, list.ts:1-3)       the worktree; ONE evaluateRecords() call per side, no          independently (own priorities.md,
                                      audience; one impl shared by CLI, MCP and the panel           own phases) -- same pattern T60
                                                                                                    uses for comparePhases(a, b)
mole_priorities tool doc             "none = the phase in force today" (reasoning-tools.ts:33) --  default selector = phaseAt(..,
(packages/mcp/src/reasoning-        documents an intent the CODE for evaluatePhase(root, {}) does  today) when phase/at both absent;
tools.ts, pre-T68)                   NOT implement (sel={} -> no audience, confirmed by reading     scoped ONLY to the NEW incident/
                                      priorities.ts:138-146): the default this task must deliver    proposals selectors (T68's own),
                                      for incident/proposals is already the project's stated intent NOT retrofitted onto mole_priorities
                                                                                                     itself (narrower blast radius,
                                                                                                     preserves existing T60 tests/behavior)
replay fixture (t61-replay/r,        <best-effort>#tenet-focus <-> <parallel>#tenet-users mutual    THE empirical case: plain Dung
.mole/arguments/0002.argdown,        attack (python-tuf ADR-0002-style trade-off, ILLUSTRATIVE,     leaves a mutual-attack cycle
dated 2026-11-02 by T61's replay     ".mole/priorities.md: launch (focus>users) / scale (users>    'undecided' on both sides (no
commits 5dd191a..929837a)            focus) from 2024-01-01")                                      'out' candidate at all); the
                                                                                                     phase breaks the tie and makes
                                                                                                     the loser 'out' -- a revival a
                                                                                                     person can act on that plain
                                                                                                     Dung never surfaces (done-when 2)
```

## Fit check
- D93 (reversible default, recorded here and in code comments -- `context/product-plan/systems/decisions.py` is
  not present in this worktree/boundary, so the id is not separately registered by this task; see insights.md):
  1. **Which phase applies**: `suggestRevivals`/`incidentSummary`/`acceptIncident` and
     `evaluateProposal`/`compareProposals`/`summarizeProposals` take `{ phase?, at? }`; absent both, the phase
     IN FORCE TODAY (`phaseAt(phases, today)`) is used if a `.mole/priorities.md` exists, else no audience
     (identical to T60's existing no-file fallback). This matches the MCP tool's own pre-existing doc comment
     for `mole_priorities`, extended to the two tools that did not have it. `mole_priorities` itself is left
     untouched (out of boundary's spirit: it already exposes `phase`/`at` and changing its own default risks
     tests outside this task's boundary for no required gain).
  2. **Whether accept freezes it**: unchanged from T58 BY CONSTRUCTION, not by a new rule -- `acceptIncident`
     writes the attack as a plain, unvalued Dung attack (`attacks: [...]` in the record, turned into an
     unvalued `incident-<id> -> target` edge by the loader). Dung/Bench-Capon's own rule
     (`attackSucceeds`/`succeeds`: no value on either side = unfiltered) means an unvalued attack succeeds in
     EVERY phase, so freezing is phase-independent automatically; the only change is that `acceptIncident` now
     computes "which attackers are currently IN" using the SAME selector `suggest` used (so accept matches what
     the person just saw), not always plain Dung.
- STOP clause ("T58 and T62 cannot be reconciled -> show both side by side"): resolved generically, not by a
  special case -- every candidate/report carries BOTH the phase-resolved label and the always-plain-Dung label
  (`plainLabel` / `plainDung`), so a caller (incident suggest, proposals compare, their MCP tools, and T62's
  panel/list, which reuses the same library calls) never has one silently substituted for the other.
- A proposal's baseline snapshot (git-archive temp dir) and its worktree each carry their OWN
  `.mole/priorities.md`; `--at <date>` is resolved against each side's own phases independently (same pattern
  `comparePhases` already uses for two named phases), so a proposal that itself edits priorities.md is compared
  fairly. INFERENCE (no prior art decides this; it is the only reading consistent with T60's existing "own
  priorities file" rule and testable without inventing a merge rule).
- Scored/ranked candidate ADMISSION in `suggestRevivals` (shares a node, 3-gram Jaccard rank) is UNCHANGED by
  phase: phase only changes whether an admitted candidate's label is 'out' (eligible) or not. No new admission
  rule is introduced.
