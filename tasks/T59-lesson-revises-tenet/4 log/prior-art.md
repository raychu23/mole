# T59 prior art — a lesson revises a tenet (double-loop learning)

## Summary
Argyris & Schön: single-loop learning fixes the action; double-loop learning changes the "governing variables"
(values, norms, goals) that produced it. In a team's decision graph the governing variables are the tenets. Industry
postmortem practice (Google SRE) makes learning stick by giving every action item an owner and a verifiable end state,
and by keeping the record in a shared repository. T59 makes a lesson a record with an owner, links it to the incident it
came from, and turns "this should change our rule" into a reviewable DRAFT of the tenet on a proposal branch (T56),
listing every decision that rests on that tenet. A person approves by merging; nothing changes the approved tenets.

```notes
source                          what it says                                                  we borrow
Argyris 1977, HBR Sep-Oct       double loop = change the governing variables of the theory-    a lesson may target a TENET (the governing
"Double loop learning in        in-use, not just the action; few organizations do it          variable), not only code · the draft
organizations"; Argyris &       (summary: actiondesign.com/resources/readings/                 rewrites the tenet text
Schön 1978 (Org. Learning)      double-loop-learning, fetched 11-02)
Google SRE book ch. 15 +        postmortem = written record + root cause + follow-up actions; owner required on a lesson · learned_from
workbook ch. 10 (sre.google,    every action item has an owner, priority and a verifiable end  must name a recorded incident · record kept
fetched 11-02)                  state; postmortems kept in a shared repository                 in the repo (.mole/lessons)
plan update 11-01 §6 + §5       approval is an event; a re-open is a new draft revision on a   draft = a commit on a mole-proposals branch;
                                branch (D67); old version closed, not deleted                  approval = merge; baseline untouched
Mole human graph 11-01          relations learned_from (lesson → incident) and revises         record fields learned_from / revises
(all relations.md:40,42)        (lesson → tenet), both DESIGN                                 
T56 mole-proposals              proposal branch + worktree from a pinned baseline, evaluate    createProposal reused; tenet draft is a
                                shows argument/decision changes                               normal proposal, evaluate/compare work on it
```

## Fit check
- SRE's "verifiable end state" maps to a CHECK on the new tenet (a test or alarm); T59 records an optional `check:` but
  does not enforce it. INFERENCE: enforcing a mechanism is the human graph's "lesson without a mechanism is flagged"
  idea (the human graph 11-01 :248) — a later flag, not this task.
- Argyris warns double-loop learning is behavioural and rare; a tool can only make the proposal cheap and visible, not
  make the team change its mind. Hence draft + re-review list, never auto-apply.
