## Summary

The steering inbox could crash a sender under load. The first send in a session created the inbox file and then filled it (`'wx'` = create, then write). For that instant the file existed but was empty. A second sender could take the lock in that gap and fail to parse the empty file: `SyntaxError: Unexpected end of JSON input`.

The stress test only ever showed `sender.mjs exited 1`. Once it was changed to record each sender's error (main `45b8638`), T79's ledger check caught the real message. Fix:
- the first inbox is written to a private temp file, then hard-linked into place, so the inbox only ever appears complete;
- an empty inbox left by older code or a crash is read as empty.

Red 1/2 → green 2/2; the steer package passed 20/20 three times; `mole rules` 0 violations.

```notes
cause           store.ts withInboxClaim bootstrap: writeFileSync(canonical, …, { flag: 'wx' }) outside the lock
                    open(O_CREAT|O_EXCL) then write → a reader under the lock can see 0 bytes
evidence        T79 ledger verified check 11-03 08:33 (close-waveD1c/T79-…-ver.txt): sender errors =
                    "SyntaxError: Unexpected end of JSON input at withInboxClaim (store.js:184) at sendSignal"
fix             temp file + linkSync(boot, canonical): link(2) is atomic and EEXIST if another process won
                    the same create-then-publish idea as the temp+rename already used for every later write
                    temp removed in finally; test asserts no .boot-* leftovers
                under the lock an empty file = empty inbox (pre-T84 files, crash before first write)
audit           readInbox (outside lock, read-only) already falls back on parse error; every later inbox write is
                    temp + rename (atomic); orphan claim files are renamed into place (complete) → no other partial read
earlier flakes  06:40 'lock timeout' fix (dc16593) was a different, legitimate refusal; this crash was the real bug
                    behind at least the 08:13 and 08:33 failures (INFERENCE for the 06:30 one: its message was not captured)
proof           4 log/red.txt (exact production message reproduced) · 4 log/green.txt
```

```notes
review 1 (deleg_3ab2d2f1)   PASS · 20x5 stress green · probe 20 procs x 50 rounds first-send: 0 errors/lost/doubled
    LOW 1   no hard links (FAT/exFAT, some network mounts) → linkSync EPERM/ENOTSUP/EXDEV crashed every first send
            → fall back to O_EXCL create; the empty-file tolerance covers its window
    LOW 2   .boot-* left by a crash between link and unlink never swept → removed when older than 60 s at bootstrap
    LOW 3   corrupt non-empty inbox still crashed under the lock → moved aside as .corrupt-<ts> (kept for a person),
            stderr note, fresh inbox; never silently destroyed
    tests   2 red → 22/22 green x3 (4 log/red.txt, green.txt)
```
