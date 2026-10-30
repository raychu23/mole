// T41 M35: head-to-head scoreboard assembly. STUB for the R1 red commit — real implementation lands in the
// next commit. Types match the contract; every function throws so the harness's tests fail honestly.
export interface ReusedSource {
  path: string;
  sha256: string;
  bytes: number;
}
export interface ReusedKeys {
  written: string;
  note: string;
  sources: Record<string, ReusedSource>;
}

export function sha256File(_root: string, _relPath: string): string {
  throw new Error('not implemented: sha256File');
}

export function loadReusedKeys(_root: string): ReusedKeys {
  throw new Error('not implemented: loadReusedKeys');
}

export function readJSON<T>(_root: string, _relPath: string): T {
  throw new Error('not implemented: readJSON');
}

export function readJSONL<T>(_root: string, _relPath: string): T[] {
  throw new Error('not implemented: readJSONL');
}

export interface ScoreRow {
  claim: string;
  mole: string;
  baseline_best: string;
  baseline_tool: string;
  all_baselines: Record<string, string>;
  metric: string;
  n: string;
  key_path: string;
  how_baseline_ran: string;
  amazon_jd_line: string;
}

export function precisionRecallF1(_tp: number, _fp: number, _fn: number): { precision: number; recall: number; f1: number } {
  throw new Error('not implemented: precisionRecallF1');
}

export function pct(_x: number): string {
  throw new Error('not implemented: pct');
}
