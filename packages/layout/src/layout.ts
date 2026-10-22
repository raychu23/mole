// Column layout of a Neighborhood: callers/importers left, the focus and what it defines in the middle,
// callees/imports right. Built to hold still: a node that was drawn before keeps its row, new nodes take the free row
// nearest the middle of their column. (ELK layered was tried first; it cannot pin role columns, see the T2 report.)
import type { NeighborEdge, NeighborNode, NeighborRole, Neighborhood } from '@mole/core';

export interface Placed {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  role: NeighborRole;
  column: 0 | 1 | 2;
}
export interface Layout {
  nodes: Placed[];
  edges: NeighborEdge[];
  /** Bounding box of the nodes in world coordinates (y can be negative: rows grow both ways from the focus row 0). */
  bounds: { x: number; y: number; w: number; h: number };
}
/** Remembered positions of nodes drawn earlier (mutated by layoutNeighborhood). Bounded, so it cannot grow without limit. */
export type Home = Map<string, { row: number; column: number }>;

export const ROW_H = 32;
export const NODE_H = 26;
const COL_GAP = 120;
const HOME_LIMIT = 400;
const COLUMN: Record<NeighborRole, 0 | 1 | 2> = { caller: 0, importer: 0, container: 0, focus: 1, own: 1, callee: 2, imported: 2 };

/** Label shown in a node box. Files show their basename, symbols their name. */
export function labelOf(n: Pick<NeighborNode, 'kind' | 'name' | 'path'>): string {
  return n.kind === 'file' ? n.path.slice(n.path.lastIndexOf('/') + 1) : n.name;
}

export function widthOf(n: Pick<NeighborNode, 'kind' | 'name' | 'path' | 'role'>): number {
  return Math.max(n.role === 'focus' ? 160 : 110, Math.min(260, Math.round((labelOf(n).length + 3) * 7.4 + 28)));
}

/** Free row nearest `center` (ties go below), skipping rows in `taken`. */
function nearestFree(center: number, taken: Set<number>): number {
  for (let d = 0; ; d++) {
    for (const r of d === 0 ? [center] : [center + d, center - d]) if (!taken.has(r)) return r;
  }
}

export function layoutNeighborhood(map: Neighborhood, home: Home = new Map()): Layout {
  const nodes = map.nodes;
  if (!nodes.length) return { nodes: [], edges: [], bounds: { x: 0, y: 0, w: 0, h: 0 } };
  const cols: NeighborNode[][] = [[], [], []];
  for (const n of nodes) (cols[COLUMN[n.role]] as NeighborNode[]).push(n);

  const rows = new Map<string, number>(); // node id -> row, all columns
  for (const [c, col] of cols.entries()) {
    const taken = new Set<number>();
    const mine = new Map<string, number>(); // this column only
    // 1. nodes drawn before in this same column keep their row
    const fresh: NeighborNode[] = [];
    for (const n of col) {
      const h = home.get(n.id);
      if (n.role === 'focus') continue; // the focus is always row 0 of the middle column, placed below
      if (h && h.column === c && !taken.has(h.row)) {
        taken.add(h.row);
        mine.set(n.id, h.row);
      } else fresh.push(n);
    }
    if (c === 1) {
      const f = col.find((n) => n.role === 'focus');
      if (f) {
        // focus row 0; if a kept node squats there (it was the focus last time as an 'own'), it is moved
        for (const [id, r] of mine) if (r === 0 && id !== f.id) {
          mine.delete(id);
          const squatter = col.find((n) => n.id === id);
          if (squatter) fresh.push(squatter);
        }
        taken.add(0);
        mine.set(f.id, 0);
      }
    }
    // 2. the rest take the free row nearest the middle of what is already placed (best score first)
    const mid = mine.size ? Math.round([...mine.values()].reduce((a, b) => a + b, 0) / mine.size) : 0;
    for (const n of fresh.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))) {
      const r = nearestFree(c === 1 ? 1 : mid, taken);
      taken.add(r);
      mine.set(n.id, r);
    }
    for (const [id, r] of mine) rows.set(id, r);
  }

  const colW = cols.map((col) => col.reduce((m, n) => Math.max(m, widthOf(n)), 0));
  const colX = [0, colW[0] === 0 ? 0 : (colW[0] as number) + COL_GAP, 0];
  colX[1] = colW[0] === 0 ? 0 : (colW[0] as number) + COL_GAP;
  colX[2] = (colX[1] as number) + (colW[1] as number) + COL_GAP;
  const placed: Placed[] = nodes.map((n) => {
    const column = COLUMN[n.role];
    return { id: n.id, x: colX[column] as number, y: (rows.get(n.id) as number) * ROW_H, w: colW[column] as number, h: NODE_H, role: n.role, column };
  });

  for (const p of placed) {
    home.delete(p.id);
    home.set(p.id, { row: p.y / ROW_H, column: p.column });
  }
  while (home.size > HOME_LIMIT) home.delete(home.keys().next().value as string);

  const minY = Math.min(...placed.map((p) => p.y));
  const maxY = Math.max(...placed.map((p) => p.y + p.h));
  const ids = new Set(nodes.map((n) => n.id));
  return { nodes: placed, edges: map.edges.filter((e) => ids.has(e.from) && ids.has(e.to)), bounds: { x: 0, y: minY, w: (colX[2] as number) + (colW[2] as number), h: maxY - minY } };
}
