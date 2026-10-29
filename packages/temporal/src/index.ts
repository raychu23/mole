// T38 bitemporal decision graph (M32). Stub for the red commit (R1): the test file imports these
// names and compiles, but every function throws until the implementation commit lands.
import type { Pool } from 'pg';

export interface FactInput {
  factId: string;
  kind: 'decision' | 'tenet' | 'intent' | 'incident';
  attr: string;
  value: string;
  validFrom: string;
  validTo: string | null;
}

export function openPool(_connectionString: string): Pool {
  throw new Error('not implemented (T38 red commit)');
}

export async function applySchema(_pool: Pool): Promise<void> {
  throw new Error('not implemented (T38 red commit)');
}

export async function insertFact(_pool: Pool, _f: FactInput): Promise<void> {
  throw new Error('not implemented (T38 red commit)');
}

export async function closeFact(_pool: Pool, _factId: string, _attr: string, _at: string): Promise<void> {
  throw new Error('not implemented (T38 red commit)');
}

export async function asOf(_pool: Pool, _factId: string, _attr: string, _at: string): Promise<string | null> {
  throw new Error('not implemented (T38 red commit)');
}

export async function diff(
  _pool: Pool,
  _factId: string,
  _attr: string,
  _t1: string,
  _t2: string,
): Promise<{ from: string | null; to: string | null }> {
  throw new Error('not implemented (T38 red commit)');
}
