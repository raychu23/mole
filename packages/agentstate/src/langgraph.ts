// T20 stub (red commit): the LangGraph export is not implemented yet.
import type { RunGraph } from './types.js';

export interface LangGraphExport {
  file: string;
  thread_id: string;
  checkpoints: number;
  note: string | null;
}

export async function exportLangGraph(g: RunGraph, file: string): Promise<LangGraphExport> {
  void g;
  void file;
  throw new Error('exportLangGraph: not implemented (T20)');
}
