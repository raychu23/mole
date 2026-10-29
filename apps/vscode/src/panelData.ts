// T34 one-panel: pure data layer for the Mole sidebar view. No `vscode` import here (unit-testable without
// the editor), mirroring webview/render.ts and src/hover.ts's split. Each of the 8 sections below is built
// from its own runner call, wrapped independently (failure case b: one bad source degrades only its own
// section). Every caption says what the section is for the center of everything (D31): the decisions
// behind the code (tenets -> decisions -> exceptions -> code, tests, incidents, people).
export type SectionId = 'decisions' | 'pastFixes' | 'notes' | 'since' | 'questions' | 'tests' | 'agents' | 'blastRadius';

export const SECTION_IDS: readonly SectionId[] = ['decisions', 'pastFixes', 'notes', 'since', 'questions', 'tests', 'agents', 'blastRadius'];

export type SectionStatus = 'ok' | 'empty' | 'unavailable' | 'error';

export interface Section<T> {
  status: SectionStatus;
  /** one line tying this section back to D31 (the center of everything) */
  caption: string;
  data?: T;
  /** set when status is not 'ok': a single line, never a stack trace, the user can act on */
  message?: string;
}

export interface PanelModel {
  file: string;
  line: number;
  symbol?: string;
  generatedAt: number;
  cacheHit: boolean;
  sections: Record<SectionId, Section<unknown>>;
}

/** Every external call the panel needs. Real implementations run the Mole CLI (child_process, off the UI
 *  thread) or call @mole/verify's pure testsAtLine directly; tests inject stubs per-call so one failing
 *  source can be exercised without touching the others. */
export interface Runners {
  map(target: string): Promise<unknown>;
  impact(target: string): Promise<unknown>;
  flows(target: string): Promise<unknown>;
  noteList(file: string): Promise<unknown[]>;
  since(): Promise<unknown>;
  check(): Promise<unknown>; // past fixes (T12)
  questions(): Promise<unknown>; // T14, built on the same `check`
  decisions(): Promise<unknown>;
  rules(): Promise<unknown>;
  testsAtLine(file: string, line: number): unknown[] | Promise<unknown[]>;
  claims(run?: string): Promise<unknown>;
  collisions(): Promise<unknown>;
  tried(target: string): Promise<unknown>;
}

export interface BuildTarget {
  root: string;
  file: string;
  line: number;
  symbol?: string;
}

const CAPTIONS: Record<SectionId, string> = {
  decisions: 'Decisions: the record that governs this code and why it was made (@mole/decisions, T29).',
  pastFixes:
    'Past fixes: the decision that changed these lines before, its reason, and the test that still guards it (@mole/history PastFix, T12).',
  notes: 'Your notes: what you decided about this code, kept beside the decisions it belongs to (@mole/memory note/memory, T11).',
  since: 'Since you last looked: what changed in the decisions and code you already read, so stale understanding never passes for current (@mole/memory SinceResult, T13).',
  questions: 'Questions: up to 3 aimed at the understanding a change to this code assumes, from the decisions and fixes above (@mole/questions, T14).',
  tests: 'Tests that guard it: the record proving a decision still holds, with a button to re-check it now (@mole/verify testsAtLine/testMap, T22).',
  agents: 'Agents: who touched this code and its governing decisions, what they already tried, and whether two agents collided here (@mole/agentstate, T18/T21/T24).',
  blastRadius: 'Blast radius: the decisions, tests and runtime callers this change would reach (daemon map/impact + @mole/flows, T28).',
};

/** One line a developer can act on; never the raw error text, which may contain a stack trace or secrets. */
function toMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.split('\n')[0]!.slice(0, 200);
}

/** Errors that mean "there is nothing to read here" rather than "this broke": distinguishes failure case a
 *  (no .mole / no git -> a one-line instruction, not a reported bug) from failure case b (a real fault,
 *  which must still surface as 'error' so it's visibly different from "nothing here"). */
const UNAVAILABLE_PATTERN = /not a git repository|no \.mole|enoent|not (a |an )?mole repo|not initiali[sz]ed|run `?mole (reindex|init|flows record)|nothing recorded in/i;

async function section<T>(id: SectionId, run: () => Promise<T> | T, isEmpty: (v: T) => boolean): Promise<Section<T>> {
  try {
    const data = await run();
    if (isEmpty(data)) return { status: 'empty', caption: CAPTIONS[id], data, message: 'nothing found here yet' };
    return { status: 'ok', caption: CAPTIONS[id], data };
  } catch (e) {
    const message = toMessage(e) || 'failed to load';
    const status: SectionStatus = UNAVAILABLE_PATTERN.test(message) ? 'unavailable' : 'error';
    return { status, caption: CAPTIONS[id], message };
  }
}

const emptyArr = (v: unknown): boolean => Array.isArray(v) && v.length === 0;

export async function buildPanelModel(target: BuildTarget, r: Runners): Promise<PanelModel> {
  const at = target.symbol ? `${target.file}#${target.symbol}` : target.file;

  const [decisions, pastFixes, notes, since, questions, tests, agents, blastRadius] = await Promise.all([
    section('decisions', () => r.decisions(), (v: any) => emptyArr(v?.decisions)),
    section('pastFixes', () => r.check(), (v: any) => emptyArr(v?.hunks) || (v?.hunks ?? []).every((h: any) => emptyArr(h.pastFixes))),
    section('notes', () => r.noteList(target.file), emptyArr),
    section('since', () => r.since(), (v: any) => emptyArr(v?.files)),
    section('questions', () => r.questions(), (v: any) => emptyArr(v?.questions)),
    section('tests', () => r.testsAtLine(target.file, target.line), emptyArr),
    section('agents', async () => {
      const [claims, collisions, tried] = await Promise.all([r.claims(), r.collisions(), r.tried(at)]);
      return { claims, collisions, tried };
    }, (v: any) => emptyArr(v?.claims?.claims) && emptyArr(v?.collisions?.pairs) && emptyArr(v?.tried?.tried)),
    section('blastRadius', async () => {
      const [map, impact, flows] = await Promise.all([r.map(at), r.impact(at), r.flows(at)]);
      return { map, impact, flows };
    }, (v: any) => (v?.map as any)?.state === 'error' && (v?.impact as any)?.state === 'error'),
  ]);

  // a section whose runner reported a clean "not applicable here" (e.g. not a git repo) reads as one
  // friendly line, same shape as a thrown error, so the view never special-cases it
  for (const s of [decisions, pastFixes, notes, since, questions, tests, agents, blastRadius] as Section<any>[]) {
    if (s.status === 'ok' && (s.data as any)?.state === 'error') {
      s.status = 'unavailable';
      s.message = toMessage((s.data as any).message ?? 'not available here');
    }
  }

  return {
    file: target.file,
    line: target.line,
    symbol: target.symbol,
    generatedAt: Date.now(),
    cacheHit: false,
    sections: { decisions, pastFixes, notes, since, questions, tests, agents, blastRadius },
  };
}
