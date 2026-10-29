```notes
T19 insights      mole-builder-2      2026-10-29
    key
        candidates          mechanical (bench/m9-key-builder.ts): per non-merge commit, TS/TSX function / const-arrow / class / method names that leave the
                            commit's touched files × same-kind names that appear; same file, git -M renamed file, or other touched file when token Jaccard >= 0.5
                            Mole: 200 commits → 7 pairs (1 rename+change); Excalidraw: 250 commits → 144 pairs (4 rename, 31 rename+change)
        labels              by hand from the diffs, with a reason each; aids used: whitespace-insensitive diffs, git grep of call sites; not the re-anchor code
        INFERENCE           merges (2 old → 1 generalized new) and splits with no single successor labelled not-rename; methods moved App → AppText (this → this.app)
                            labelled rename+change; component bodies that moved under a new name while the old name became a memo/wrapper labelled rename+change
        thresholds          0.55 / tie 0.01 / min 16 tokens were picked after reading the labelled pairs' similarity distribution, before reanchor.ts existed
                            INFERENCE: fitted to this data, so the real-world margin is unknown
    design
        old body            a note has only a hash, so the old body comes from git: notes now store `commit:` (HEAD at write); older notes search the file's
                            last 200 commits for a version with the note's hash; seen events already carry their commit
        scoring             token-bigram Dice, own name → $SELF, class → $CLS; identical = renamed (fresh); >= 0.55 = renamed + changed (stale)
        one-to-one          a candidate that another vanished symbol (old file / candidate's old file) matches better goes to that one; an equal claim = ambiguous
                            (catches the getMenuTriggerComponent + getMenuContentComponent → getMenuComponent merge)
        tie-break           callers of the old name that now reference the candidate + same file; still tied → ambiguous with every tied candidate
        tiny bodies         < 16 tokens never re-anchor on body alone (needs an exact match + a caller that switched): `() => null` placeholders stay deleted
        since               a look at the old name and a later look at the new name merge (latest wins); renamed entries list the rename commit and later
                            commits on the new name; status 'renamed' / 'renamed+changed'; ambiguous → 'deleted' + candidates
    boundary
        cli.ts              packages/daemon/src/cli.ts formatMemory: only the printed status wording (renamed / renamed + changed / ambiguous candidates)
        past-fix links      not touched: @mole/history finds past fixes by blaming edited lines, which does not depend on the symbol's name (outside boundary)
        symbols.ts          declsOfText exposes the tokens symbolsOfText already hashed; hashes unchanged (all existing tests pass)
    log
        runs.jsonl line 1   records commit a458d04 (the checks commit before it was amended to include runs.jsonl → b19fd8a; same files otherwise)
    gaps
        M9                  88.9% (32/36) < 95%: target NOT MET. option A failed the held-out gate (ruling 1) and was reverted (see held-out gate below)
        perf                memory()/since() parse every source file once per call when a symbol is missing (same as the T11 'moved' scan) + git show per note
    held-out gate (key ruling 1, 2026-10-29)
        headline            M9 frozen key (body-only per key) 88.9% · with call-graph path 97.2% (path added after seeing key) · held-out hermes ui-tui 81.8% (labelled before path), wrong 3
        order               28c0a5e held-out key + bench (labels before any score) → c101cd8 option A → one scored run → 69de7af log → 00951ab revert of A
        key                 bench/m9-heldout-key.json: hermes-agent ui-tui TS/TSX at bf0203a794, newest first, stop at walk 507 (d8fcab47) when expected re-anchors reached 22 (>= 20)
                            158 pairs, 42 old symbols (22 re-anchor, 20 stay unanchored); builder bench/m9-heldout-builder.ts; bench bench/m9-heldout.ts
        result              right 81.8% (18/22), wrong 3, silent-fresh 0; band 0.40-0.55 = 8 old symbols (5 pos, 3 neg) → conclusive
                            option A itself: +3 right (0.485-0.547), 0 wrong; band misses 0.548 + 0.494 because the only caller was renamed in the same commit
                            the 3 wrong are from the unchanged body path (>= 0.55): AwaitingBrowser → Header 0.686 (true successor BrowserPhase 0.569),
                            snip → paste 0.783 (labelled too small to tell), setTerminalBackground → defaultColorSlot 0.595 (the name survives as a binding)
                            body-only on held-out (derived, A's 3 band rights become misses): 68.2% (15/22), wrong 3
        verdict             gate fails twice over (< 95% and wrong > 0) → option A reverted, B final for T19 (ruling §7: no further threshold or label requests)
        INFERENCE           the 0.55 body threshold does not generalize: on fresh history it both misses rewrites and re-anchors to the wrong symbol;
                            wrong cases are a factored-out helper beating the real successor, a renamed test fixture, and a name that survived as a non-function binding
                            (declsOfText doesn't see `const x = factory().set`-style bindings, so the old name looks gone)
        incident            the first builder run read ~/.hermes/hermes-agent directly; it is a blob:none partial clone, so git lazily fetched old blobs into its
                            object store and git auto-gc repacked it (98 → 14 pack files). no checkout, ref or history change. fixed by reading through a bare scratch
                            repo with objects/info/alternates (fetched blobs land in scratch); the bench repo path in the key is that scratch repo
        invalid run         first held-out run at c101cd8 had a git archive pathspec bug (empty new tree → 0/22, every similarity 0): logged INVALID, extraction fixed
                            in 29d56c3 (+ throw on an empty tree), key/labels/A untouched, then the one scored run
```
