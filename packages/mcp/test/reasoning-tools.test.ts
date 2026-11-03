// T61: the built reasoning features (T60 priorities, T58 incident suggestions, T56 proposals) as READ-ONLY MCP tools.
// Tests first. Each tool's structuredContent must equal the library call on the same temp repo (done-when 2), errors
// come back as isError results (MCP 2025-06-18 "tool execution errors"), and nothing in the repo changes (done-when 5).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it } from 'vitest';
import { comparePhases, evaluatePhase, suggestRevivals, today } from '@mole/decisions';
import { compareProposals, createProposal, evaluateProposal } from '@mole/proposals';
import { createServer } from '../src/server.js';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

const ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (root: string, ...args: string[]): string => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', env: ENV }).trim();
function tmp(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}
function write(root: string, file: string, text: string): void {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), text);
}

// one repo with all three features' inputs: D1 rests on <ship-fast> (speed) vs <use-kafka> (cost); launch ranks speed
// first, scale cost first (one-way attack: use-kafka is out with no phase and at launch, in at scale); incident inc-1
// names D1; committed so proposals can branch from it
function repo(): string {
  const root = tmp('mole-t61-');
  git(root, 'init', '-q', '-b', 'main');
  write(root, '.mole/tenets.md', ['# Tenets', '', '## tenet-speed · Ship fast', '', '## tenet-cost · Keep cost per request low', ''].join('\n'));
  write(root, '.mole/priorities.md', ['# Priorities', '', '## launch · from 2026-01-01', '', '1. tenet-speed', '2. tenet-cost', '', '## scale · from 2026-09-01', '', '1. tenet-cost', '2. tenet-speed', ''].join('\n'));
  write(root, '.mole/decisions/d1.md', ['---', 'id: D1', 'title: Hand-roll the job queue', 'status: accepted', 'scope: [src/queue/]', 'cites: [ship-fast]', '---', ''].join('\n'));
  write(root, '.mole/arguments/queue.argdown', ['<ship-fast>: A hand-rolled queue ships this week. #tenet-speed', '  -> <use-kafka>: A managed queue is cheaper per message at scale. #tenet-cost', ''].join('\n'));
  write(root, '.mole/incidents/inc-1.md', ['---', 'id: inc-1', 'title: Hand-rolled queue lost messages under load', 'decisions: [D1]', '---', '', 'The queue dropped messages at peak.', ''].join('\n'));
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'baseline');
  return root;
}

async function connect(root: string): Promise<Client> {
  const server = createServer({ root, noStart: true });
  const client = new Client({ name: 'test', version: '0' });
  const [c, s] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(c), server.connect(s)]);
  return client;
}

// every file under the repo (outside .git) with its mtime + size, and git status: "nothing written"
function fingerprint(root: string): string {
  const files = readdirSync(root, { recursive: true }).map(String).filter((f) => !f.startsWith('.git')).sort();
  return JSON.stringify([git(root, 'status', '--porcelain'), files.map((f) => { const s = statSync(join(root, f)); return [f, s.mtimeMs, s.size]; })]);
}

const call = (client: Client, name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args });

describe('T61 mole_priorities', () => {
  it('evaluates a phase and compares two, equal to the library, writing nothing', async () => {
    const root = repo();
    const before = fingerprint(root);
    const client = await connect(root);
    const ev = await call(client, 'mole_priorities', { phase: 'launch' });
    expect(ev.isError).toBeFalsy();
    expect(ev.structuredContent).toEqual(JSON.parse(JSON.stringify(evaluatePhase(root, { phase: 'launch' }))));
    const at = await call(client, 'mole_priorities', { at: '2026-10-01' });
    expect((at.structuredContent as { phase: string }).phase).toBe('scale');
    const cmp = await call(client, 'mole_priorities', { compare: ['launch', 'scale'] });
    expect(JSON.stringify(cmp.structuredContent)).toContain('use-kafka');
    expect(cmp.structuredContent).toEqual(JSON.parse(JSON.stringify(comparePhases(root, 'launch', 'scale'))));
    expect(JSON.parse((cmp.content as Array<{ text: string }>)[0]!.text)).toEqual(cmp.structuredContent);
    expect(fingerprint(root)).toBe(before);
  });
  it('an unknown phase is an isError result with the library message, not a throw', async () => {
    const client = await connect(repo());
    const r = await call(client, 'mole_priorities', { phase: 'growth' });
    expect(r.isError).toBe(true);
    expect((r.content as Array<{ text: string }>)[0]!.text).toMatch(/growth/);
  });

  // T73 backlog priorities-default: the tool's own doc says "none = the phase in force today" (reasoning-tools.ts),
  // but evaluatePhase(root, {}) was plain Dung (T68 prior-art.md #8, left out of that task's own boundary). Fixed
  // here so the doc and the behaviour finally agree, using the SAME selector (phaseInForce) T68 gave the other two.
  it('T73: the bare call (no phase/at/compare) defaults to the phase in force today, matching its own doc', async () => {
    const root = repo();
    const client = await connect(root);
    const bare = await call(client, 'mole_priorities', {});
    expect(bare.isError).toBeFalsy();
    expect((bare.structuredContent as { phase?: string }).phase).toBe('scale'); // repo()'s priorities.md: scale from 2026-09-01, today is well after
    expect(bare.structuredContent).toEqual(JSON.parse(JSON.stringify(evaluatePhase(root, { at: today() }))));
  });
});

describe('T61 mole_incident_suggest', () => {
  it('lists revival candidates equal to the library, writing nothing (no accept over MCP)', async () => {
    const root = repo();
    const before = fingerprint(root);
    const client = await connect(root);
    const r = await call(client, 'mole_incident_suggest', { incident: 'inc-1', phase: 'launch' });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toEqual({ incident: 'inc-1', candidates: JSON.parse(JSON.stringify(suggestRevivals(root, 'inc-1', { phase: 'launch' }))) });
    expect((r.structuredContent as { candidates: unknown[] }).candidates.length).toBeGreaterThan(0);
    expect(fingerprint(root)).toBe(before);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).filter((n) => /accept|dismiss/.test(n))).toEqual([]);
  });
  it('an unknown incident is an isError result', async () => {
    const r = await call(await connect(repo()), 'mole_incident_suggest', { incident: 'inc-404' });
    expect(r.isError).toBe(true);
    expect((r.content as Array<{ text: string }>)[0]!.text).toMatch(/inc-404/);
  });
  // T68: --at/--phase and the default (phase in force today, not plain Dung)
  it('T68: takes phase/at, defaulting to the phase in force today', async () => {
    const root = repo();
    const client = await connect(root);
    const at = await call(client, 'mole_incident_suggest', { incident: 'inc-1', at: '2026-10-01' });
    expect(at.isError).toBeFalsy();
    expect(at.structuredContent).toEqual({ incident: 'inc-1', candidates: JSON.parse(JSON.stringify(suggestRevivals(root, 'inc-1', { at: '2026-10-01' }))) });
    const bare = await call(client, 'mole_incident_suggest', { incident: 'inc-1' });
    expect(bare.structuredContent).toEqual({ incident: 'inc-1', candidates: JSON.parse(JSON.stringify(suggestRevivals(root, 'inc-1'))) });
    const { tools } = await client.listTools();
    const t = tools.find((x) => x.name === 'mole_incident_suggest')!;
    expect(Object.keys((t.inputSchema as { properties: object }).properties).sort()).toEqual(['at', 'incident', 'limit', 'phase']);
  });
});

describe('T61 mole_proposals_compare', () => {
  it("finds this repo's proposal worktrees itself and compares them, equal to the library, writing nothing", async () => {
    const root = repo();
    const base = tmp('mole-t61-props-');
    const a = createProposal({ repo: root, name: 'kafka-now', path: join(base, 'a') });
    const b = createProposal({ repo: root, name: 'keep-queue', path: join(base, 'b') });
    write(join(base, 'a'), '.mole/arguments/queue.argdown', ['<use-kafka>: A managed queue is cheaper per message at scale. #tenet-cost', '  -> <ship-fast>', ''].join('\n'));
    const before = [fingerprint(root), fingerprint(join(base, 'a')), fingerprint(join(base, 'b'))];
    const client = await connect(root);
    const r = await call(client, 'mole_proposals_compare', { phase: 'launch' });
    expect(r.isError).toBeFalsy();
    const paths = [join(base, 'a'), join(base, 'b')];
    expect(r.structuredContent).toEqual(JSON.parse(JSON.stringify(compareProposals(paths, { phase: 'launch' }))));
    expect([a.name, b.name]).toEqual(['kafka-now', 'keep-queue']);
    const one = await call(client, 'mole_proposals_compare', { names: ['kafka-now'], phase: 'launch' });
    expect(one.structuredContent).toEqual({ baselineRevision: a.baselineRevision, proposals: [JSON.parse(JSON.stringify(evaluateProposal(paths[0]!, { phase: 'launch' })))] });
    expect([fingerprint(root), fingerprint(join(base, 'a')), fingerprint(join(base, 'b'))]).toEqual(before);
  });
  // T68: default (no phase/at) uses the phase in force today, not plain Dung; result carries plainDung beside it
  it('T68: defaults to the phase in force today, and shows plainDung beside the phase-resolved changes', async () => {
    const root = repo();
    const base = tmp('mole-t61-props-at-');
    createProposal({ repo: root, name: 'kafka-now', path: join(base, 'a') });
    createProposal({ repo: root, name: 'keep-queue', path: join(base, 'b') });
    const client = await connect(root);
    const r = await call(client, 'mole_proposals_compare', {});
    expect(r.isError).toBeFalsy();
    const paths = [join(base, 'a'), join(base, 'b')];
    expect(r.structuredContent).toEqual(JSON.parse(JSON.stringify(compareProposals(paths))));
    const proposals = (r.structuredContent as { proposals: Array<{ plainDung: unknown; phase: unknown }> }).proposals;
    expect(proposals.every((p) => 'plainDung' in p && 'phase' in p)).toBe(true);
  });
  it('no proposals, or an unknown name, is an isError result; it takes names, never filesystem paths', async () => {
    const root = repo();
    const client = await connect(root);
    const none = await call(client, 'mole_proposals_compare', {});
    expect(none.isError).toBe(true);
    expect((none.content as Array<{ text: string }>)[0]!.text).toMatch(/no proposals/);
    const bad = await call(client, 'mole_proposals_compare', { names: ['/etc'] });
    expect(bad.isError).toBe(true);
    const { tools } = await client.listTools();
    const t = tools.find((x) => x.name === 'mole_proposals_compare')!;
    expect(Object.keys((t.inputSchema as { properties: object }).properties).sort()).toEqual(['at', 'names', 'phase']);
  });
});

// review 1 (deleg_ef4c137c) HIGH: a hand-written mole-proposal.json in an unrelated linked worktree was trusted
describe('T61 review 1: a proposal is a worktree on its own mole/proposal/<name> branch, nothing else', () => {
  it('ignores an unrelated linked worktree carrying a forged proposal meta (by name or by its own branch)', async () => {
    const root = repo();
    const base = tmp('mole-t61-forge-');
    const legit = createProposal({ repo: root, name: 'legit', path: join(base, 'legit') });
    git(root, 'worktree', 'add', '-q', '-b', 'evilbranch', join(base, 'evil'), 'HEAD');
    const forged = { ...legit, branch: 'evilbranch' };
    writeFileSync(git(join(base, 'evil'), 'rev-parse', '--path-format=absolute', '--git-path', 'mole-proposal.json'), JSON.stringify(forged));
    const client = await connect(root);
    const r = await call(client, 'mole_proposals_compare', {});
    expect(r.isError).toBeFalsy();
    expect((r.structuredContent as { proposals: Array<{ path: string }> }).proposals.map((p) => realpathSync(p.path))).toEqual([realpathSync(join(base, 'legit'))]);
    // even a meta that claims the evil worktree's own branch name is not a proposal: the branch must be mole/proposal/<name>
    writeFileSync(git(join(base, 'evil'), 'rev-parse', '--path-format=absolute', '--git-path', 'mole-proposal.json'), JSON.stringify({ ...legit, name: 'evil', branch: 'evilbranch' }));
    expect(((await call(client, 'mole_proposals_compare', {})).structuredContent as { proposals: unknown[] }).proposals).toHaveLength(1);
  });
  it('limit 0 returns no candidates, as the library does (review 1 LOW)', async () => {
    const root = repo();
    const r = await call(await connect(root), 'mole_incident_suggest', { incident: 'inc-1', limit: 0 });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toEqual({ incident: 'inc-1', candidates: JSON.parse(JSON.stringify(suggestRevivals(root, 'inc-1', { limit: 0 }))) });
  });
});

describe('T61 annotations', () => {
  it('all three are read-only, closed-world, with an outputSchema', async () => {
    const { tools } = await (await connect(repo())).listTools();
    for (const name of ['mole_priorities', 'mole_incident_suggest', 'mole_proposals_compare']) {
      const t = tools.find((x) => x.name === name);
      expect(t, name).toBeDefined();
      expect(t!.annotations).toEqual(expect.objectContaining({ readOnlyHint: true, openWorldHint: false }));
      expect(t!.outputSchema).toBeDefined();
    }
  });
});

describe('T71 mole_recall', () => {
  it('recalls a similar past decision/incident by text, equal to the library, writing nothing', async () => {
    const root = repo();
    const before = fingerprint(root);
    const client = await connect(root);
    const r = await call(client, 'mole_recall', { text: 'hand-roll a job queue instead of a managed broker' });
    expect(r.isError).toBeFalsy();
    const cases = (r.structuredContent as { cases: Array<{ id: string }> }).cases;
    expect(cases.map((c) => c.id)).toContain('D1');
    expect((r.structuredContent as { note: string }).note.toLowerCase()).toMatch(/similar case/);
    expect((r.structuredContent as { note: string }).note.toLowerCase()).not.toMatch(/\bcaused?\b/);
    expect(fingerprint(root)).toBe(before);
  });
  it('recalls by an existing record id, excluding that record from its own results', async () => {
    const r = await call(await connect(repo()), 'mole_recall', { record: 'inc-1' });
    expect(r.isError).toBeFalsy();
    const cases = (r.structuredContent as { cases: Array<{ id: string }> }).cases;
    expect(cases.map((c) => c.id)).not.toContain('inc-1');
  });
  it('neither text nor record, or both, is an isError result', async () => {
    const client = await connect(repo());
    expect((await call(client, 'mole_recall', {})).isError).toBe(true);
    expect((await call(client, 'mole_recall', { text: 'x', record: 'D1' })).isError).toBe(true);
  });
  it('an unknown record id is an isError result with the library message', async () => {
    const r = await call(await connect(repo()), 'mole_recall', { record: 'no-such-id' });
    expect(r.isError).toBe(true);
    expect((r.content as Array<{ text: string }>)[0]!.text).toMatch(/no-such-id/);
  });
  it('is read-only, closed-world, with an outputSchema', async () => {
    const { tools } = await (await connect(repo())).listTools();
    const t = tools.find((x) => x.name === 'mole_recall');
    expect(t).toBeDefined();
    expect(t!.annotations).toEqual(expect.objectContaining({ readOnlyHint: true, openWorldHint: false }));
    expect(t!.outputSchema).toBeDefined();
  });
});
