// T15: the panel's "Since you last looked" section, fed by `mole since --json` (T13). Kept out of the map's layout code.
import type { SinceResult } from '@mole/memory';

export function renderSince(_r: SinceResult | undefined, _now = Date.now()): string {
  throw new Error('not implemented');
}
