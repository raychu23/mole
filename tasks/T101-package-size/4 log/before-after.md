# T101-package-size: before/after measurements

All measured 2026-11-04 on this Mac, worktree
`Mole-worktrees/T101-package-size`, `node release/mole-code/tools/build.mjs`
then `npm pack --dry-run --json` / `npm pack` inside `release/mole-code`.
Not publishing (brief boundary).

## npm pack (release/mole-code)

| metric | before | after | change |
|---|---|---|---|
| packed (tarball) | 13,546,802 B (13.55 MB) | 6,021,329 B (6.02 MB) | -55.5% |
| unpacked | 72,756,122 B (72.76 MB) | 28,384,787 B (28.38 MB) | -61.0% |
| file count | 1216 | 1087 | -129 files |
| dist/cli.js | 13.8 MB | 4.3 MB | |
| dist/mcp.cjs | 14.2 MB | 4.7 MB | |
| dist/node_modules/typescript | 24 MB | 13 MB | |

## cold `npx -y <tarball> --help`

| | time |
|---|---|
| before | 1.476s (real) |
| after | 2.301s (real) |

No improvement claimed here -- noisy on this machine tonight (T97's
dcbench-v4 benchmark pilot is running concurrently per the Wave H shared
note); both numbers are single-run `time npx -y ./<tarball> --help` and
both produced correct `mole --help` output. The size/file-count numbers
above are exact (`npm pack --dry-run --json`), not timing-sensitive.
