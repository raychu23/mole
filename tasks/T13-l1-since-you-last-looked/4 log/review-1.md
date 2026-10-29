```notes
T13 review round 1      reviewer-T13-r1 (fresh context, not the implementer)      2026-10-28      branch ledger/t13-l1-since-you-last-looked @ a36df6c
    verdict                 no P0 / P1      2 P2      → verified
    checks                  npm run check && node packages/memory/dist/bench/m3.js → exit 0 first run: 16 files, 110/110 tests; M3 precision 100% (3/3), recall 100% (3/3), unseen listed 0, at target true
                            npm run bundle (apps/vscode) → exit 0
    loop rules              R1 red b56bbe8 (key + m3.ts + since.test.ts + seen.test.ts) before impl 89f015b; red run logged exit 1, 18 failed, M3 0/3 ✓
                            R2 git diff b56bbe8 HEAD -- key, bench, 2 red tests → empty ✓
                            R4 runs.jsonl 4 lines (red, impl, 2 flake rounds, green 5da96ea) ✓
    key                     m3-key.json 'written' 22:09, before the red commit; it states the fixture (base, 5 seen, 3 unseen incl. class Cart, 3 commits, relook) and the expected output by hand
                            expected follows from the fixture: c1 adds to Cart.add, c2 (Claude trailer) login, c3 greet + formatPrice whitespace/comment only → greet, login, Cart.add; relook clears Cart.add ✓
                            a trivial pass isn't possible: the bench checks exact order, commit/author/agent, unseen listed = 0, relook result; the red stub scored 0/3
    boundary                files touched: .gitignore, apps/vscode/package.json (only mole.recordSeen), apps/vscode/src/{extension,seen}.ts, apps/vscode/test/*, packages/daemon/src/cli.ts, packages/memory/**, tasks/T13/** ✓
    privacy                 seen.jsonl only in <root>/.mole/local; .gitignore lists .mole/local/ and appendSeen also writes .mole/local/.gitignore '*' (git status clean after a look) ✓
                            the extension spawns the local CLI and passes dirty buffer text over stdin; no network calls ✓
    extension               5 s dwell (DwellTracker, resets on scroll-out / unfocus / save), hover provider returns undefined (adds nothing), class with listed members is excluded from the dwell
                            setting off: view(undefined), hover/tick/flush drop everything ✓ (unit-tested)
    CLI attack (temp repos)  empty log → 'nothing seen yet' + how to start, exit 0 ✓      whitespace/comment-only → not listed ✓      changed then changed back → not listed ✓
                            Co-authored-by: Claude → agent Claude ✓      moved to another file with the same body → not listed ✓      deleted → 'deleted' + commit ✓
                            uncommitted edit → 'uncommitted' ✓      unseen symbol changed → never listed ✓      seen twice → latest wins; later change lists only that commit ✓
                            corrupt middle line → skipped, rest listed ✓      rebase -f --root (seen commit no longer an ancestor) → only the post-look commit listed ✓      no git → uncommitted ✓

P2-1  a torn last line swallows the next look
    what                    readSeen skips a torn last line, but appendSeen appends without first ending it with '\n', so the next event is glued onto the torn text and is dropped as malformed
    effect                  the new look is lost silently; `since` then reports nothing changed for a symbol that did change (missed entry)
    repro                   mole seen 'src/a.ts#beta' --root R; printf '{"time":"2026' >> R/.mole/local/seen.jsonl; mole seen 'src/a.ts#alpha' --root R
                            → last line is {"time":"2026{"time":...,"symbol":"src/a.ts#alpha",...}; commit an alpha change; since --json → []  (expected alpha)
    fix                     in appendSeen, if the file exists and its last byte isn't '\n', write '\n' before the batch
    why P2                  needs a write killed mid-line; each CLI write is a single small appendFileSync

P2-2  renamed, or moved and changed, is reported as 'deleted'
    what                    locate() re-anchors only when the body is the same; the newPath ('moved to X and changed') branch in since()/formatSince can't be reached
    repro                   seen src/a.ts#alpha; commit alpha → alpha2 with the same body → status 'deleted'
                            seen src/a.ts#alpha; move alpha to src/b.ts and change its body in one commit → status 'deleted' (no newPath)
    effect                  the entry is still listed with the right commit, so recall is fine, but the label is wrong. Fix it later or remove the dead newPath branch
```
