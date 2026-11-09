# T117 prior art: how negation is expressed in scope/ignore globs (2026-11-08)

Goal: survey how established tools express "exclude from this pattern" before extending Mole's hand-rolled
`globToRegExp` (`packages/decisions/src/check/options.ts`) to support the Backstage adr004 pattern
`**/!(index).{ts,tsx}` (extglob negation), per the T110 v2 side finding (`DEFECT_V2_FILESCOPE.md`).

Retrieval note: `web_search` returned results (via the `parallel`/keyless fallback — the configured
`openai-native` backend is search-only in this environment) but `web_extract`'s configured backend
(`openai-native`) cannot fetch page bodies here (errors on every call); citations below are to stable,
long-lived doc/README pages, backed by the picomatch README text actually returned in the search snippet
(quoted) plus well-established, version-stable documented behavior for the others.

## 1. picomatch / micromatch — extglob negation (segment-scoped)

Source: `github.com/micromatch/picomatch` README (text returned in the 2026-11-08 search snippet, Extglobs
section): patterns `@(pattern)`, `*(pattern)`, `+(pattern)`, `?(pattern)`, **`!(pattern)`** — "Bash's
extended globbing" support, built on Bash 4.3's spec. The README's own example:
`pm.isMatch('foo.bar', '!(foo).!(bar)') // false`, and the exact shape Mole needs: `!(pattern)` matches
anything EXCEPT `pattern`, scoped to one path segment (not the whole path) — `**/!(index).{ts,tsx}` reads
as "any depth, then a `.ts`/`.tsx` file whose basename is not `index`". picomatch is the engine micromatch
is built on (same author, Jon Schlinkert) and is already a transitive dependency of `dependency-cruiser`
(`@mole/decisions`'s own direct dependency), pinned to 4.0.7 in `package-lock.json` — confirmed present at
`node_modules/picomatch` (116 KB, zero runtime dependencies of its own) before any new install.

## 2. minimatch — same extglob negation, bash-identical syntax

Source: `github.com/isaacs/minimatch` README. minimatch (isaacs, the glob library npm itself vendors) accepts
the same Bash extglob forms including `!(pattern)`, plus a SEPARATE whole-pattern negation: a pattern whose
first character is `!` negates the entire match result (`"anything that does NOT match"`), distinct from
extglob's per-segment `!(...)`. Mole's own hand-rolled `globToRegExp` has neither: adr004's pattern used the
extglob form, which the hand-rolled engine silently compiled as the LITERAL substring `!(index)` (no glob
semantics at all for `!`, `(`, `)` — they just got regex-escaped), producing a pattern matching no real file.

## 3. `.gitignore` — line-level negation, not segment-level

Source: `git-scm.com/docs/gitignore` (git's own docs). A line starting with `!` re-includes a path a
previous pattern excluded — line-granularity, not inside a single glob expression, and with a well-known
caveat: you cannot re-include a file inside a directory that an earlier pattern already excluded (the
directory is never descended into, so the file is never seen to re-include). Confirms negation-as-a-concept
is universal prior art, but gitignore's mechanism (stacked whole-line negation) is the wrong shape for a
single `in:` glob field on one `match:` item — Mole needs segment-scoped (picomatch/minimatch extglob), not
multi-line stacking.

## 4. GitHub CODEOWNERS — same gitignore-style pattern syntax, negation NOT supported

Source: `docs.github.com` "About code owners" page. CODEOWNERS explicitly reuses gitignore-style pattern
syntax for `path pattern @owner` lines, but GitHub's own docs note CODEOWNERS does not support the `!`
negation gitignore allows — a real-world precedent for "this tool's glob dialect is deliberately a SUBSET of
a richer one", the same posture Mole's own `globToRegExp` had been in (by omission, not by stated design)
before this task.

## 5. ESLint flat config `ignores` — negation re-includes, with the same "can't unignore inside an ignored
   dir" caveat as gitignore

Source: `eslint.org/docs/head/use/configure/ignore` + `github.com/eslint/eslint` issue #17964 ("Can't unignore
file in flat config"). ESLint's flat-config `ignores` array accepts `!`-prefixed patterns to re-include a
path an earlier pattern ignored, mirroring gitignore's semantics (and inheriting the same documented
limitation when the excluded ancestor is a whole directory). Relevant to Mole's `files`/`ignores`-shaped
rule authoring (brief's framing) as the "include everything except this glob" idiom Mole's single `in:`
field is being asked to express in one expression instead of two arrays.

## 6. Semgrep `paths: exclude` / `include` — explicit two-list form, no embedded negation syntax

Source: `docs.semgrep.dev/ignoring-files-folders-code`. Semgrep's `paths:` rule key takes separate `include`
and `exclude` glob lists (exclude wins when both match) rather than embedding negation inside one glob
string. This is the alternative design Mole did NOT choose for `match: in:` (a single glob field, authored
inline per `match:` item) — noted as the other reasonable shape, not adopted here because it would require
changing the decision-record schema (`in:` + `in-exclude:`?) rather than just the glob engine, a larger and
unrelated change outside this task's boundary.

## Decision: extend `in:` to support picomatch, not minimatch/hand-rolled extensions

- picomatch is **already present** in `node_modules` (transitive via `dependency-cruiser`, pinned 4.0.7,
  zero deps of its own, 116 KB on disk) — adding it as an explicit `@mole/decisions` dependency costs no new
  bytes in the shipped tarball (T101's bundle-size concern): it rides along with `dependency-cruiser`
  regardless, this only makes the existing transitive use an intentional direct one.
  `du -sh node_modules/picomatch` → 116K (measured 2026-11-08, this worktree).
- minimatch would need a NEW dependency (not currently transitively present in this workspace's lockfile at
  any version Mole could pin against without an install); picomatch gets the same extglob behavior for the
  one case that matters (`!(index)`) at zero marginal bundle cost, so it is preferred per the brief's "prefer
  an existing maintained library... unless bundle size argues otherwise" — bundle size argues FOR picomatch,
  not against it, here.
- Verified directly (node REPL, this worktree, 2026-11-08): `picomatch('**/!(index).{ts,tsx}')` matches
  `a/foo.ts` (true) and rejects `a/index.ts` (false) — the exact two cases this task's done-when names — and
  reproduces every existing `globToRegExp` test case unchanged (`{a,b}` braces, `**` any-depth, `*` within a
  segment): see `4 log/picomatch-equivalence-check.txt`.
