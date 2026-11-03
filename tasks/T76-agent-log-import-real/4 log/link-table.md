# T76: hand-checked link table — real git-ai v1.7.5 output

7 total agent-attributed line ranges across 3 real notes; 2 known_human ranges correctly excluded (0 of them
imported). 7/7 (100%) of the real AI records link to the correct function, 0 wrong links.

| commit | file | range (claimed) | row id | kind | imported? | anchors to | correct? |
|---|---|---|---|---|---|---|---|
| d2563226 | math.js | 5-8 | `s_edba1c0dbabdf8::t_fb1f656870bd9d` | mock_ai | yes | `multiply` (decl 5-7) | ✅ range covers the added function |
| 9cda3e26 | math2.js | 3-7 | `s_da2642f92e7134::t_8b85af3c723ac3` | mock_ai | yes | `divide` (decl 5-7) | ✅ midpoint (5) is inside `divide` |
| 9cda3e26 | math2.js | 1-2 | `s_da2642f92e7134::t_be92687df4a3f2` | mock_ai | yes | `add` (decl 1-3) | ✅ midpoint (1.5) is inside `add` (git-ai's own char-diff attributed this range to the same AI session as the `divide` add; Mole anchors whatever git-ai claims, it does not re-judge git-ai's own attribution) |
| d59dfa0c | fileA.js | 2-2 | `s_ad36ddc935d61a::t_d02f9535f3f305` | mock_ai | yes | `a2` (decl line 2) | ✅ |
| d59dfa0c | fileA.js | 1-1 | `s_ad36ddc935d61a::t_02ab184b2e9609` | mock_ai | yes | `a` (decl line 1) | ✅ |
| d59dfa0c | fileB.js | 2-2 | `h_b296cbdc8c227c` | **known_human** | **no (excluded)** | — | ✅ correctly excluded — a human-attested row would be a wrong link if imported as agent intent |
| d59dfa0c | fileB.js | 1-1 | `h_b296cbdc8c227c` | **known_human** | **no (excluded)** | — | ✅ correctly excluded |

Linked: 5/5 real AI rows = 100% (>= 90% required). Wrong links: 0/5 (0 required). Excluded-correctly: 2/2 known_human
rows (if either had been imported as an agent intent, that would count as 1 wrong link; the fix in `gitai.ts`
prevents this for all `meta.humans` rows, not just these two instances).

Verification commands (from `/Users/a1/Desktop/CS Code/Project/Mole-worktrees/T76-agent-log-import-real`):
```
npx vitest run packages/agentstate/test/t76-real-gitai.test.ts packages/agentstate/test/t39-importers.test.ts
```
`4 log/red.txt` = before the `gitai.ts` fix (4/4 new tests fail: wrong link count, missing agent tag — old fixture
tests still 11/11 green). `4 log/green.txt` = after the fix (15/15 green).
