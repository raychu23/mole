# T14 review round 2: question texts from the CLI (after the round-2 fix)

Commands run in the worktree on the round-2 build; excalidraw = `~/.hermes/cache/scratch/impact/excalidraw` (read-only clone; `git status --short` afterwards = `?? .mcp.json` only, not ours).

## 808d068 before (54647b0)
```
  1. [past-fix] You edit packages/element/src/collision.ts:323-326, lines 4850bf3 "fix(editor): Binding hit test based on distance (#10753)" wrote as a fix (why: frames are only bindable from the outside, so arrows ending inside). Does your change keep that fix working? Its guarding test: packages/element/tests/binding.test.tsx » "binding for simple arrows". (source: 4850bf3 packages/element/src/collision.ts:317)
  2. [past-fix] You edit packages/element/src/transform.ts:301, lines d3a9c2a "fix(packages/excalidraw): complete cross-document runtime ownership (#11997)" wrote as a fix (why: * fix: complete cross-document runtime ownership * fix: schedule cross-document animations in owner window * fix: Prewarm the right font ev…). Does your change keep that fix working? Its guarding test: packages/element/src/__tests__/stickyNote.test.ts » "sticky note text layout". (source: d3a9c2a packages/element/src/transform.ts:301)
  3. [guard-test] This change edits packages/element/tests/linearElementEditor.test.tsx » "Test Linear Elements", a test guarding d3a9c2a "fix(packages/excalidraw): complete cross-document runtime ownership (#11997)". If that fix breaks again, what will catch it? (source: packages/element/tests/linearElementEditor.test.tsx:1520 at 95307fa136; fix d3a9c2a)
```

## After (round 2)
```
### mole check 808d068 --root <excalidraw>
questions (3):
  1. [past-fix] You edit packages/element/src/collision.ts:323-326, lines 4850bf3 "fix(editor): Binding hit test based on distance (#10753)" wrote as a fix. Does your change keep that fix working? Its guarding test: packages/element/tests/binding.test.tsx » "binding for simple arrows". (source: 4850bf3 packages/element/src/collision.ts:317)
     source: 4850bf336f packages/element/src/collision.ts:317
  2. [past-fix] You edit packages/element/src/transform.ts:301, lines d3a9c2a "fix(packages/excalidraw): complete cross-document runtime ownership (#11997)" wrote as a fix. Does your change keep that fix working? Its guarding test: packages/element/src/__tests__/stickyNote.test.ts » "sticky note text layout". (source: d3a9c2a packages/element/src/transform.ts:301)
     source: d3a9c2a195 packages/element/src/transform.ts:301
  3. [past-fix] You edit packages/excalidraw/components/ConvertElementTypePopup.tsx:490, lines 31df3e6 "fix(editor): Tab convert bound arrow update (#12143)" wrote as a fix. Does your change keep that fix working? Its guarding test: packages/excalidraw/tests/convertElementType.binding.test.tsx » "convert element type keeps bound arrows attached". (source: 31df3e6 packages/excalidraw/components/ConvertElementTypePopup.tsx:484)
     source: 31df3e6ef2 packages/excalidraw/components/ConvertElementTypePopup.tsx:484
### mole check 02fc9f3 --root <excalidraw>
questions (1):
  1. [past-fix] You edit packages/excalidraw/components/App.viewport.ts:668, lines 3747163 "fix(editor): improve UX around locked animations (#11671)" wrote as a fix (why: Navigates to a target and optionally installs scroll/zoom constraints.). Does your change keep that fix working? Its guarding test: packages/excalidraw/tests/cursorHint.test.tsx » "cursor hint". (source: 3747163 packages/excalidraw/components/App.viewport.ts:633)
     source: 374716304a packages/excalidraw/components/App.viewport.ts:633
### mole check 53973c3 --root <excalidraw>
questions (2):
  1. [past-fix] You edit packages/excalidraw/components/App.tsx:8347-8837, lines a3b9089 "fix(editor): Lost focus point on transition to inside-inside (#10964)" wrote as a fix. Does your change keep that fix working? A test that references this code: excalidraw-app/tests/collab.test.tsx. (source: a3b9089 packages/excalidraw/components/App.tsx:9242)
     source: a3b90897b5 packages/excalidraw/components/App.tsx:9242
  2. [past-fix] You edit packages/excalidraw/components/App.tsx:12453-12695, lines dd8296a "fix(editor): narrow `NonDeleted` type to `isDeleted: false` (#11470)" wrote as a fix (why: SAFETY: This should never happen, but log it just in case…). Does your change keep that fix working? Its guarding test: packages/element/tests/cropElement.test.tsx » "Cropping and other features". (source: dd8296a packages/excalidraw/components/App.tsx:12903)
     source: dd8296af18 packages/excalidraw/components/App.tsx:12903
### mole check --diff packages/history/bench/fixtures/planted-m8.diff (base bdeff14 per the diff)
questions (1):
  1. [past-fix] You edit packages/daemon/src/server.ts:211-212, lines 9e19c51 "T9 review fixes: Node-too-old message shown in panel, whole-folder default when no src/…" wrote as a fix (why: editing counts as use: a person typing in one file for an hour must not lose the map…). Does your change keep that fix working? Its guarding test: packages/daemon/test/daemon.test.ts » "idle shutdown (T9)". (source: 9e19c51 packages/daemon/src/server.ts:211)
     source: 9e19c51865 packages/daemon/src/server.ts:211
```

## Other real-history probes (review-1 sample)
Guard facts after the fix (library `questions()`, `facts.guards`):
- 93dd510, 214cd6e, e65eca9, afa3a65, f3d99c4, ef53e54, 53732f0: no guard-test question (were describe-level "named" guards before).
- e1b7aac: 2 guard-test questions, both `via: blame` (61fe15a wrote the edited lines of it("keeps a horizontal arrow with a bound label visible (#11439)"); dd8296a wrote edited lines of "with exportPadding"/"with deleted elements"); they take the 2 free slots after 1 past-fix question.
- 4850bf3: guard facts only `via: blame` (8462bb8 on binding.test.tsx:800, 31df3e6 on convertElementType.binding.test.tsx:86); the import-line blame guard (collision.test.tsx:1) is gone.
