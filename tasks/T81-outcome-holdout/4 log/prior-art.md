# T81 prior art — decision journals / pre-registration, holdouts, staged bets (D66 outcome ledger)

## 1. Decision journals / pre-registration: separate the forecast from the result

**Annie Duke, *Thinking in Bets: Making Smarter Decisions When You Don't Have All the Facts*, Portfolio/Penguin,
2018** (https://www.penguinrandomhouse.com/books/552885/thinking-in-bets-by-annie-duke, fetched 2026-11-03).
Duke's core mechanism: treat a belief-backed action as a bet that forces stating confidence and alternatives
*before* the outcome is known, then separate decision quality from luck/hidden information once the result is
in -- because hindsight otherwise rewrites what you "always knew." A later paper that directly cites her and
operationalizes the same split (arXiv 2610.34654, "Thinking-in-Bets at Test Time...", fetched 2026-11-03) states
it as a rule: "the remedy is to write down what you believe, why you believe it, and how sure you are before
seeing the outcome." T81 borrows the *separation*, not a confidence scale: `prediction:` is the pre-registered
belief (expected outcome + measurable signal + check date), `outcome:` is recorded later and never edits the
prediction block in place.

**What we borrow:** the hard separation between a pre-registered prediction and a later-recorded outcome, so
nothing can rewrite the prediction after the fact.
**What doesn't fit:** Duke's own practice is explicitly *not* a paperwork/journal template -- she argues for
quantified probabilities and reps across many decisions (a calibration-training program), which is out of scope
here. T81 doesn't add a probability field or a scoring rule; `expected`/`signal` are free text, same as every
other Mole front-matter field (door, assurance doubt/provenance) that stays human-authored, not scored.

## 2. The premortem: write down what could go wrong before committing

**Gary Klein, "Performing a Project Premortem," *Harvard Business Review*, September 2007**
(https://hbr.org/2007/09/performing-a-project-premortem, fetched 2026-11-03; original HBS reprint F0709A). The
premortem assumes the project has already failed and asks the team to generate reasons why, using "prospective
hindsight" (Mitchell/Russo/Pennington 1989) to surface risks that a normal risk-review would suppress. Daniel
Kahneman endorsed and popularized this technique in his own writing on decision-making (it is commonly cited
alongside Kahneman's work on outcome bias and hindsight, e.g. in *Thinking, Fast and Slow*'s discussion of
overconfidence and planning). The task brief names "Kahneman premortem" for this reason -- the technique is
Klein's, Kahneman is its best-known advocate.

**What we borrow:** the premortem's structural idea -- state the failure mode *before* it happens, not after --
maps directly onto why `prediction.expected`/`signal` must be written before `outcome.observed` exists; T81's
schema makes that physically impossible to violate (there is no field to pre-fill an outcome before a result).
**What doesn't fit:** the premortem is a live group exercise (a facilitated session enumerating many failure
reasons); T81 records one structured prediction per decision, not a brainstormed list of risks. Building a
premortem *facilitation* flow is out of this task's boundary (packages/decisions outcomes/, no new UI).

## 3. Holdout groups in online controlled experiments

**Kohavi, R., Tang, D., and Xu, Y., *Trustworthy Online Controlled Experiments: A Practical Guide to A/B
Testing*, Cambridge University Press, 2020** (https://doi.org/10.1017/9781108653985; summarized at
https://www.luckybookshelf.com/trustworthy-online-controlled-experiments-by-kohavi-tang-xu/, fetched 2026-11-03).
This is the standard reference for holdout groups: a portion of users/traffic deliberately excluded from a
rollout so the treated population's outcome can be compared against a population that never saw the change --
used at Microsoft/Bing, LinkedIn, Google to catch long-run regressions a short-term A/B test misses (the same
authors' earlier "Trustworthy Online Controlled Experiments: Five Puzzling Outcomes Explained," KDD 2012, makes
the case for why naive before/after comparisons mislead without a control).

**What we borrow:** the vocabulary and the *reason* for a holdout -- the outcome ledger's `rollout:` block names
a `treated` scope and a `holdout` scope precisely so a later-recorded outcome for the treated side can (in
principle, by a person) be checked against the holdout side, not just against its own prediction.
**What doesn't fit:** a real online-experiment holdout is backed by randomized traffic assignment, power
analysis and statistical significance testing -- none of which Mole has or should fake. D66 and this task's own
contract are explicit: "staged rollout + 1 holdout folder... no assignment logic beyond recording it." T81
records the two named scopes as plain strings; it assigns nothing, measures nothing statistically, and computes
no significance. A person decides what "treated" and "holdout" mean for their own change.

## 4. A lighter-weight industry analogue: Spotify's DIBB (Data-Insight-Belief-Bet)

**Henrik Kniberg, "Spotify Rhythm" (slides + talk, Agile Sverige), blog.crisp.se, 2016-06-08**
(https://blog.crisp.se/2016/06/08/henrikkniberg/spotify-rhythm, slides PDF
https://blog.crisp.se/wp-content/uploads/2016/06/Spotify-Rhythm-Agila-Sverige.pdf, fetched 2026-11-03). Spotify's
DIBB turns Data into an Insight, an Insight into a Belief, and a Belief into a Bet -- and the slide deck's own
"DIBB -- an argument framework" example explicitly pairs a bet with a feedback loop back to new data. Each
company/functional "Bet" gets a documented owner, success metrics and a 2-page brief so the organization can
later check whether the bet paid off.

**What we borrow:** the framing that every bet/decision should name its own measurable success metric up front
(DIBB's "success metrics" field) -- this is `prediction.signal`.
**What doesn't fit:** DIBB is an org-alignment and prioritization tool (Bets Board, stack-ranking, Now/Next/Later
columns across teams) with no holdout concept and no later "did it happen" recording format Mole could reuse
directly; T81 only borrows the single idea of naming the metric at bet time, not the board/ranking machinery.

## 5. What this task does NOT do (boundary)

- Does not compute statistical significance, p-values, or any holdout comparison -- `rollout:` is a recording
  of two named scopes only (D66: "no assignment logic").
- Does not infer `result: confirmed|contradicted|inconclusive` from `expected` vs `observed` text. Like `door`
  (T78), the verdict is a human-authored field Mole reads as-is, never an NLP/heuristic judgment call.
- Does not write, accept, or dismiss any incident record automatically. A contradicted outcome produces a
  `suggestedIncident.draft` string in the report only; saving it under `.mole/incidents/` and running the
  existing T58 `mole incident suggest/accept/dismiss` flow stays a person's act (see `draftIncidentRecord` in
  `incidents/revive.ts`, called by `outcomes/report.ts`, never by anything that writes files).
- Does not add a second ISO-date validator: reuses T78's exported `isValidIsoDate` from `assurance/report.ts`
  for both `prediction.check_at` and `outcome.date`, so the "reject non-ISO and calendar-invalid dates, report
  malformed entries, never drop silently" lesson from T78 applies identically here.
