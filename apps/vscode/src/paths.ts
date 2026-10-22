import { relative, resolve, sep } from 'node:path';

/** Repo-relative POSIX path of a file URI's fsPath, or undefined when it is outside the repo root. */
export function toRepoPath(root: string, fsPath: string): string | undefined {
  const rel = relative(resolve(root), resolve(fsPath));
  if (!rel || rel.startsWith('..') || resolve(rel) === rel) return undefined;
  return rel.split(sep).join('/');
}

/** Trailing-edge debounce that exposes how long it waited (for the latency report). */
export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number): (...a: A) => void {
  let t: NodeJS.Timeout | undefined;
  return (...a: A) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}
