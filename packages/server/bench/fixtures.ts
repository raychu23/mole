// T33 M25 bench fixtures (frozen 2026-10-29, R2: do not edit after the red-tests commit).
// Deterministic (seeded) generator: a small synthetic git repo per org with .mole/
// decision/tenet/exception records + code/test files, and a stream of GitHub-shaped
// push-webhook deliveries referencing commits in that repo, with a frozen duplicate
// rate and shuffle so the replay bench is reproducible across runs.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import key from './key.json' with { type: 'json' };

export interface FixtureOrg {
  id: string;
  name: string;
  repoDir: string;
  commits: string[]; // sha in order created
}

export interface FixtureDelivery {
  deliveryId: string;
  event: 'push';
  orgId: string;
  payload: {
    ref: string;
    after: string; // commit sha
    repository: { full_name: string; owner: { login: string } };
  };
  rawBody: string;
  signature: string;
}

// mulberry32 seeded PRNG, so the shuffle/duplicate pattern is stable across runs.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

/** Builds a tiny real git repo with .mole/ records so "rebuild from git" has real history. */
export function buildFixtureRepo(orgId: string, numCommits: number): { dir: string; commits: string[] } {
  const dir = mkdtempSync(path.join(tmpdir(), `mole-m25-${orgId}-`));
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 'bench@mole.test']);
  git(dir, ['config', 'user.name', 'Mole Bench']);
  mkdirSync(path.join(dir, '.mole', 'decisions'), { recursive: true });
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  mkdirSync(path.join(dir, 'CODEOWNERS').split('/').slice(0, -1).join('/') || dir, { recursive: true });
  writeFileSync(
    path.join(dir, 'CODEOWNERS'),
    (key as any).codeownersOrgB?.join('\n') ?? '* @default-owner'
  );
  const commits: string[] = [];
  for (let i = 0; i < numCommits; i++) {
    const decId = `d${i}`;
    writeFileSync(
      path.join(dir, '.mole', 'decisions', `${decId}.md`),
      `---\nid: ${decId}\nkind: decision\nstatus: accepted\ntitle: Decision ${i} for ${orgId}\nscope: [src/file${i}.ts]\nowner: owner-${i % 3}\n---\nWhy: bench fixture decision ${i}.\n`
    );
    writeFileSync(path.join(dir, 'src', `file${i}.ts`), `export const value${i} = ${i};\n`);
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', `decision ${i}`]);
    commits.push(git(dir, ['rev-parse', 'HEAD']));
  }
  return { dir, commits };
}

export function buildDeliveries(orgs: FixtureOrg[], secret: string): FixtureDelivery[] {
  const rand = mulberry32((key as any).seed);
  const base: FixtureDelivery[] = [];
  const total = (key as any).numDeliveries as number;
  const dupRate = (key as any).duplicateRate as number;
  let seq = 0;
  while (base.length < total) {
    const org = orgs[Math.floor(rand() * orgs.length)]!;
    const sha = org.commits[Math.floor(rand() * org.commits.length)]!;
    const deliveryId = `delivery-${seq++}`;
    const payload = {
      ref: 'refs/heads/main',
      after: sha,
      repository: { full_name: `${org.id}/${org.id}-repo`, owner: { login: org.id } },
    };
    const rawBody = JSON.stringify(payload);
    const signature = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    base.push({ deliveryId, event: 'push', orgId: org.id, payload, rawBody, signature });
    // plant duplicates: redeliver a prior delivery id with the same payload (GitHub keeps
    // the same X-GitHub-Delivery value on a true redelivery).
    if (rand() < dupRate && base.length > 1) {
      const dupOf = base[Math.floor(rand() * (base.length - 1))]!;
      base.push({ ...dupOf });
    }
  }
  const trimmed = base.slice(0, total);
  // shuffle (Fisher-Yates) with the same seeded rand, continuing its stream.
  for (let i = trimmed.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [trimmed[i], trimmed[j]] = [trimmed[j]!, trimmed[i]!];
  }
  return trimmed;
}
