import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cliPath = join(here, '..', 'dist', 'src', 'cli.js');

function runCli(input: string): { stdout: string; stderr: string; status: number | null } {
  const res = spawnSync(process.execPath, [cliPath], { input, encoding: 'utf8' });
  return { stdout: res.stdout, stderr: res.stderr, status: res.status };
}

describe('reasoning CLI (JSON stdin -> JSON stdout)', () => {
  it('evaluates a framework passed on stdin', () => {
    const input = JSON.stringify({
      framework: { args: [{ id: 'a' }, { id: 'b' }], attacks: [['a', 'b']] },
    });
    const { stdout, status } = runCli(input);
    expect(status).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      labels: { a: 'in', b: 'out' },
      why: { a: { defendedBy: [] }, b: { defeatedBy: 'a' } },
    });
  });

  it('honours an audience list', () => {
    const input = JSON.stringify({
      framework: {
        args: [
          { id: 'b1', value: 'liberty' },
          { id: 'b2', value: 'security' },
        ],
        attacks: [
          ['b1', 'b2'],
          ['b2', 'b1'],
        ],
      },
      audience: ['liberty', 'security'],
    });
    const { stdout, status } = runCli(input);
    expect(status).toBe(0);
    expect(JSON.parse(stdout).labels).toEqual({ b1: 'in', b2: 'out' });
  });

  it('exits non-zero with a message on invalid JSON', () => {
    const { status, stderr } = runCli('not json');
    expect(status).toBe(1);
    expect(stderr).toMatch(/invalid JSON/);
  });
});

describe('reasoning CLI input validation (T42 review P2)', () => {
  it('rejects an argument without an id', () => {
    const { status, stderr } = runCli(JSON.stringify({ framework: { args: [{}], attacks: [] } }));
    expect(status).not.toBe(0);
    expect(stderr).toMatch(/non-empty string id/);
  });
  it('rejects a non-string audience', () => {
    const { status, stderr } = runCli(JSON.stringify({ framework: { args: [{ id: 'a' }], attacks: [] }, audience: [1, 2] }));
    expect(status).not.toBe(0);
    expect(stderr).toMatch(/audience must be an array/);
  });
});
