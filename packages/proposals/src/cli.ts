#!/usr/bin/env node
// mole-proposals: create / evaluate / compare what-if branches of the decision records (T56, D67).
//   mole-proposals create --repo <dir> --name <slug> --path <absolute new dir> [--base <rev>]
//   mole-proposals evaluate --path <proposal worktree>
//   mole-proposals compare --left <proposal> --right <proposal> [--also <proposal> ...]
// Output: JSON on stdout. Errors: one line on stderr, exit 1.
import { compareProposals, createProposal, evaluateProposal, ProposalError } from './proposals.js';

function flags(argv: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]!;
    if (!k.startsWith('--')) throw new ProposalError(`unexpected argument: ${k}`);
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) throw new ProposalError(`missing value for ${k}`);
    out.set(k.slice(2), [...(out.get(k.slice(2)) ?? []), v]);
    i++;
  }
  return out;
}

function one(f: Map<string, string[]>, k: string): string {
  const v = f.get(k);
  if (!v || v.length !== 1) throw new ProposalError(`--${k} is required (once)`);
  return v[0]!;
}

function main(argv: string[]): unknown {
  const [cmd, ...rest] = argv;
  const f = flags(rest);
  switch (cmd) {
    case 'create':
      return createProposal({ repo: one(f, 'repo'), name: one(f, 'name'), path: one(f, 'path'), ...(f.has('base') ? { base: one(f, 'base') } : {}) });
    case 'evaluate':
      return evaluateProposal(one(f, 'path'));
    case 'compare':
      return compareProposals([one(f, 'left'), one(f, 'right'), ...(f.get('also') ?? [])]);
    default:
      throw new ProposalError('usage: mole-proposals create|evaluate|compare (see the header of src/cli.ts)');
  }
}

try {
  process.stdout.write(JSON.stringify(main(process.argv.slice(2)), null, 2) + '\n');
} catch (e) {
  process.stderr.write(`mole-proposals: ${(e as Error).message}\n`);
  process.exitCode = 1;
  if (!(e instanceof ProposalError)) process.stderr.write(`${(e as Error).stack ?? ''}\n`);
}
