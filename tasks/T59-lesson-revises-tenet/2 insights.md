# T59 insights — a lesson revises a tenet (double-loop learning)

## Summary
`mole-proposals lesson --repo R --lesson L --path P` turns a lesson record (.mole/lessons: learned_from incidents,
revises a tenet, owner, the new wording under "## Proposed tenet") into a DRAFT of that tenet on a proposal branch: one
commit that rewrites only that tenet's section and names the lesson + incident, plus the list of records that trace to
the tenet and so rest on the old wording. Approved tenets never change; a person approves by merging the branch.
Replay on Mole's own records: tenet-2 drafted from the real 2026-10-27 incident (lesson written for the replay), 4
records to re-review (decisions 0007/0008/0009 + daemon intent). Open: no flag for a lesson without a check; no UI.

```notes
design          Argyris & Schön double loop (change the governing variable = the tenet) · SRE postmortem: owner required,
                record in the repo · draft = T56 proposal branch · prior art 4 log/prior-art.md
validation      read-only, before any write: lesson committed (.mole clean) · owner · learned_from incidents exist ·
                tenet exists, not retired · Proposed tenet section present · then createProposal's own checks
writes          only the proposal worktree: .mole/tenets.md target section + one commit on mole/proposal/lesson-<id>
tests           packages/proposals/test/lesson.test.ts 7 (red.txt 7/7) · proposals 15
replay          4 log/replay.txt · /Users/a1/.hermes/cache/scratch/t59-replay (shallow clone of main)
limits          INFERENCE: `check:` is recorded, not enforced (human graph "lesson without a mechanism is flagged" = later)
                · tenet text is the person's, never generated · approval/merge is plain git
```

## 11-02 19:20 review 1 (deleg_6e3ca1c0) FAIL → fixed tests-first (1 red → green, proposals 16)
- HIGH .mole gitignored: validation read the working tree, `git status -- .mole` was empty, the branch was built from
  a HEAD with no .mole, the tenet write threw ENOENT after branch + worktree existed → (1) every record the draft needs
  (lesson, tenets.md, learned_from incidents) must exist at HEAD (`git cat-file -e`), else "not committed at HEAD";
  (2) any failure after createProposal removes the worktree + branch it made. (2) proven separately with (1) switched
  off: crash → clean error, 0 branches, 1 worktree, no folder
- MEDIUM noted, not changed: a "## " heading inside the Proposed tenet text ends the section (same rule as tenets.md)
- held per reviewer: tenet-1 vs tenet-10 · retired refused · CRLF + last section · invalid branch names refused
  before writes · missing git identity → Mole <mole@localhost> · re-review = every traces_to edge (decisions + intent)

## 11-02 19:30 review 2 (deleg_06b5fca1) FAIL → validation now reads the baseline itself (1 red → green, proposals 17)
- HIGH skip-worktree/assume-unchanged hide a disk edit from `git status`; existence at HEAD (round-1 fix) was not
  enough: a retired-at-HEAD tenet passed because validation read the disk → lesson, tenets, incidents are now read
  from HEAD's .mole via `git archive` (baselineSnapshot, exported from proposals.ts, same as T56 evaluate), and the
  proposal is created from that same rev. The round-1 existence loop is gone (subsumed)
- INFERENCE: rounds 1+2 = one root cause, "validate one source, build from another"; the fix is one source
- held: cleanup never deletes a pre-existing branch/worktree (createProposal refuses both first) · rename/deleted
  incident fail safe · replay re-run: same tenet-2 draft, 4 records, approved checkout clean

## 11-02 19:35 review 3 (deleg_359c3a22) FAIL on 2 message-only findings → fixed + parent-verified
- rounds 1-2 fixes confirmed by reproducer: gitignored .mole, skip-worktree tenets/lesson/incident, detached HEAD,
  one rev for snapshot + createProposal, snapshot removed on every validation throw, T56 cli tests unchanged
- HIGH (literal stop rule, message-only): on a missing lesson the catch re-read the WORKING TREE to pick the message →
  removed; one message covers both cases. Now only `snap` is read (readLesson(snap), loadGraph(snap))
- MEDIUM empty repo → raw git error → clean "repository has no commits yet" (test added)
- parent check: proposals 18 · no mole-proposal-base-* left in TMPDIR · no 4th reviewer: both fixes change only
  error text/guards, no write path changed (skill rule: a P1-only fix may be parent-verified)
