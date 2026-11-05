// T96 review FAIL #2 (deleg_b40d00a6): Ctrl-D/EOF at the optional `mole init` y/N prompt must not abort the
// whole command. readline/promises' rl.question() REJECTS (does not resolve with '') when its input stream
// closes mid-prompt, and that rejection was uncaught up to cli.ts's main().then(...) handler -- so a real
// Ctrl-D killed `mole init` before it ever wrote the .mole/decisions scaffold. A vitest-internal stdin pipe
// is never a TTY, so resolveAgentsSnippet() never even reaches the prompt in a normal test process; this
// drives the real CLI binary under an actual pty (Python's `pty.fork()`, same approach the review used
// manually) so the TTY branch and the real rl.question() rejection path are genuinely exercised.
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..');
const cliDist = join(pkg, 'dist/cli.js');

// argv[3] selects what is sent once "(y/N)" appears: "eof" (Ctrl-D), "y", or "n".
const PTY_DRIVER = `
import os, pty, sys, time, select
cwd, mole_bin, answer = sys.argv[1], sys.argv[2], sys.argv[3]
args = sys.argv[4:]
send = {"eof": b"\\x04", "y": b"y\\n", "n": b"n\\n"}[answer]
pid, fd = pty.fork()
if pid == 0:
    os.chdir(cwd)
    os.execv(mole_bin, [mole_bin] + args)
else:
    out = b""
    sent = False
    deadline = time.time() + 10
    status = 0
    while time.time() < deadline:
        r, _, _ = select.select([fd], [], [], 0.2)
        if fd in r:
            try:
                chunk = os.read(fd, 65536)
            except OSError:
                break
            if not chunk:
                break
            out += chunk
        if not sent and (b"(y/N)" in out):
            time.sleep(0.1)
            os.write(fd, send)
            sent = True
        done_pid, status = os.waitpid(pid, os.WNOHANG)
        if done_pid != 0:
            break
    sys.stdout.buffer.write(out)
    code = os.WEXITSTATUS(status) if os.WIFEXITED(status) else -1
    sys.stderr.write(f"EXITSTATUS {code}\\n")
`;

function havePython(): string | null {
  for (const bin of ['python3', 'python']) {
    const r = spawnSync(bin, ['--version']);
    if (r.status === 0) return bin;
  }
  return null;
}

let dirs: string[] = [];
function freshRepo(): string {
  const d = mkdtempSync(join(tmpdir(), 'mole-init-pty-test-'));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function runUnderPty(root: string, send: 'eof' | 'y' | 'n', args: string[]): { exitStatus: number; out: string } {
  const python = havePython();
  if (!python) throw new Error('no python3/python on PATH to drive a real pty');
  const r = spawnSync(python, ['-c', PTY_DRIVER, root, cliDist, send, ...args], { encoding: 'utf8', timeout: 15_000 });
  const m = /EXITSTATUS (-?\d+)/.exec(r.stderr ?? '');
  return { exitStatus: m ? Number(m[1]) : -1, out: r.stdout ?? '' };
}

describe('T96 review FAIL #2: mole init (real pty) -- Ctrl-D/EOF at the y/N prompt', () => {
  const python = havePython();
  it.skipIf(!python)('EOF (Ctrl-D) is treated as the default No: exits 0 and still writes the decision scaffold', () => {
    const root = freshRepo();
    const { exitStatus, out } = runUnderPty(root, 'eof', ['init']);
    expect(out).toContain('(y/N)');
    expect(exitStatus).toBe(0);
    expect(existsSync(join(root, '.mole/decisions/D001-example-decision.md'))).toBe(true);
    expect(existsSync(join(root, 'AGENTS.md'))).toBe(false); // EOF = No: never touches AGENTS.md
  });

  it.skipIf(!python)('typed "n" behaves the same as EOF (both are the printed default)', () => {
    const root = freshRepo();
    const { exitStatus, out } = runUnderPty(root, 'n', ['init']);
    expect(out).toContain('(y/N)');
    expect(exitStatus).toBe(0);
    expect(existsSync(join(root, '.mole/decisions/D001-example-decision.md'))).toBe(true);
    expect(existsSync(join(root, 'AGENTS.md'))).toBe(false);
  });

  it.skipIf(!python)('control: "y" under the same pty harness still writes AGENTS.md (proves the harness drives the real prompt)', () => {
    const root = freshRepo();
    const { out } = runUnderPty(root, 'y', ['init']);
    expect(out).toContain('(y/N)');
    expect(existsSync(join(root, 'AGENTS.md'))).toBe(true);
  });
});
