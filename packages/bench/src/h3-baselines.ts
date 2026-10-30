// H3 baselines STUB for the R1 red commit — real reimplementation (Swimm Auto-sync, Copilot Memory citation
// check, path-touched) lands in the next commit. See 4 log/prior-art.md for the cited vendor docs.
export interface H3Prediction {
  symbol: string;
  swimmStale: boolean;
  copilotStale: boolean;
  pathTouchedStale: boolean;
}

export function runH3Baselines(_parentText: string, _childText: string, _symbolTail: string, _fileTouched: boolean): H3Prediction {
  throw new Error('not implemented: runH3Baselines');
}
