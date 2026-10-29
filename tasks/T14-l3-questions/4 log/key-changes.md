# T14 key concerns (key NOT edited, loop rule R2)

- 2026-10-28 round 2: G1-guard-delete / G2-planted-plus-guard assume fix 9e19c51 "guards" describe('idle shutdown (T9)').
  9e19c51 never touched that describe: its daemon.test.ts hunk `@@ -60,0 +61,28 @@ describe('idle shutdown (T9)'`
  only adds describe('default sources (T9)') after it; the title comes from git's hunk-header context (same source T12
  uses for guarding-test names, so B3's mustMention "idle shutdown (T9)" has the same origin). Review-1 P1-1 asked to
  stop using hunk-header titles; round 2 keeps them ONLY when the change deletes the whole titled block, so G1/G2 still
  pass. If Raymond rules the key wrong here, G1/G2's guard items should be dropped and rule (c) in 2 insights.md removed.
