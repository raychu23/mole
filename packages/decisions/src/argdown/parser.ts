// T48: a small subset of Argdown's own grammar (christianvoigt/argdown, MIT), covering only the
// top-level titled statement/argument relation graph the decision graph needs -- NOT Argdown's full
// grammar (premise-conclusion reconstruction `--`/`----` inference blocks, ranges, tags, YAML head,
// `><` contradiction/entailment-derivation, CLI, HTML/dot/map export). That full grammar is exactly
// what `@argdown/core` (MIT, used as a devDependency only -- see package.json) already implements;
// re-implementing it here is this task's own non-goal. The relation *symbols* and their *direction*
// are copied exactly from argdown-core's lexer.ts (matchIncomingSupport/.../matchOutgoingUndercut)
// and cross-checked against argdown-core's own ModelPlugin unit test ("can create statement
// relations and ignore duplicates") and a from-scratch undercut fixture, both run through the real
// @argdown/core parser and saved as oracle JSON in fixtures/argdown/*.oracle.json
// (test/argdown-parser.test.ts asserts this parser's output matches those oracles exactly).
//
// Symbol -> direction, from argdown-core/src/lexer.ts's matchers (bare `+`/`-` default to the
// "outgoing" reading per `/^([' '\t]*)(<?\+)/` and `/^([' '\t]*)(<?-)/`):
//   +>  incoming support   parent --supports--> child   (ModelPlugin.ts INCOMING_SUPPORT: from=parent)
//   ->  incoming attack     parent --attacks-->  child   (INCOMING_ATTACK: from=parent)
//   _>  incoming undercut   parent --undercuts--> child  (INCOMING_UNDERCUT: from=parent)
//   <+ or +   outgoing support   child --supports--> parent   (OUTGOING_SUPPORT: to=parent)
//   <- or -   outgoing attack    child --attacks-->  parent   (OUTGOING_ATTACK: to=parent)
//   <_        outgoing undercut  child --undercuts--> parent  (OUTGOING_UNDERCUT: to=parent)
// `><` (contradiction) and bare statement-to-statement ENTAILS/CONTRARY derivations are a logical
// relation, not a dialectical one (model.ts:46-53) -- out of scope for an EdgeType that only has
// supports/attacks/undercuts; lines using `><` are left unparsed (no relation emitted).

export type ArgdownItemKind = 'statement' | 'argument';
export type ArgdownRelationType = 'supports' | 'attacks' | 'undercuts';

export interface ArgdownItem {
  /** Argdown keys its statement/argument dictionaries by title; Mole's graph id is that same title. */
  id: string;
  kind: ArgdownItemKind;
  title: string;
  /** 1-based line of the first occurrence (definition or reference) seen. */
  line: number;
}

export interface ArgdownRelation {
  from: string;
  to: string;
  type: ArgdownRelationType;
  line: number;
}

export interface ParsedArgdown {
  items: ArgdownItem[];
  relations: ArgdownRelation[];
}

const REL_TOKENS: Array<{ tok: string; dir: 'in' | 'out'; type: ArgdownRelationType }> = [
  { tok: '+>', dir: 'in', type: 'supports' },
  { tok: '->', dir: 'in', type: 'attacks' },
  { tok: '_>', dir: 'in', type: 'undercuts' },
  { tok: '<+', dir: 'out', type: 'supports' },
  { tok: '<-', dir: 'out', type: 'attacks' },
  { tok: '<_', dir: 'out', type: 'undercuts' },
  { tok: '+', dir: 'out', type: 'supports' },
  { tok: '-', dir: 'out', type: 'attacks' },
];

// Relation lines start at the beginning of the (indentation-stripped) line, same as argdown-core's
// lexer (relations only match "at BOF or after a newline", lexer.ts:139).
const RELATION_LINE = /^(\s*)(\+>|->|_>|<\+|<-|<_|\+|-)\s*(.*)$/;
const TITLE_DEF = /^(\[([^\]]+)\]|<([^>]+)>)\s*:\s*(.*)$/;
const TITLE_REF = /^@?(\[([^\]]+)\]|<([^>]+)>)\s*$/;
const INLINE_REF = /^@?(\[([^\]]+)\]|<([^>]+)>)\s*(:\s*.*)?$/;

interface StackItem {
  id: string;
  indent: number;
}

/** Parse one `.argdown` source (or one fenced ```argdown block's inner text) into its items + relations. */
export function parseArgdown(text: string): ParsedArgdown {
  const items = new Map<string, ArgdownItem>();
  const relKeys = new Set<string>();
  const relations: ArgdownRelation[] = [];
  const stack: StackItem[] = [];

  const ensure = (kind: ArgdownItemKind, title: string, line: number): string => {
    const id = title;
    if (!items.has(id)) items.set(id, { id, kind, title, line });
    return id;
  };
  const addRelation = (from: string, to: string, type: ArgdownRelationType, line: number): void => {
    if (!from || !to || from === to) return;
    const key = `${from}\0${to}\0${type}`;
    if (relKeys.has(key)) return;
    relKeys.add(key);
    relations.push({ from, to, type, line });
  };
  const pushScope = (id: string, indent: number): void => {
    while (stack.length > 0 && stack[stack.length - 1]!.indent >= indent) stack.pop();
    stack.push({ id, indent });
  };

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    const line = i + 1;
    if (!raw.trim()) continue;

    const relM = RELATION_LINE.exec(raw);
    if (relM) {
      const indent = relM[1]!.length;
      const tok = relM[2]!;
      const rest = relM[3]!.trim();
      const found = REL_TOKENS.find((t) => t.tok === tok);
      const refM = found ? INLINE_REF.exec(rest) : null;
      if (found && refM && stack.length > 0) {
        while (stack.length > 0 && stack[stack.length - 1]!.indent >= indent) stack.pop();
        const parent = stack[stack.length - 1];
        if (parent) {
          const kind: ArgdownItemKind = refM[2] !== undefined ? 'statement' : 'argument';
          const title = (refM[2] ?? refM[3])!;
          const childId = ensure(kind, title, line);
          const [from, to] = found.dir === 'in' ? [parent.id, childId] : [childId, parent.id];
          addRelation(from, to, found.type, line);
          stack.push({ id: childId, indent });
          continue;
        }
      }
      // a relation token with no enclosing item, or an unrecognized reference (`><`, free text):
      // not a relation this schema models -- fall through and let title matching below have a shot,
      // but in practice relation tokens never also match TITLE_DEF/TITLE_REF, so the line is dropped.
      continue;
    }

    const indentMatch = /^(\s*)/.exec(raw)!;
    const indent = indentMatch[1]!.length;
    const content = raw.slice(indent);

    const defM = TITLE_DEF.exec(content);
    if (defM) {
      const kind: ArgdownItemKind = defM[2] !== undefined ? 'statement' : 'argument';
      const title = (defM[2] ?? defM[3])!;
      pushScope(ensure(kind, title, line), indent);
      continue;
    }
    const refM = TITLE_REF.exec(content);
    if (refM) {
      const kind: ArgdownItemKind = refM[2] !== undefined ? 'statement' : 'argument';
      const title = (refM[2] ?? refM[3])!;
      pushScope(ensure(kind, title, line), indent);
      continue;
    }
    // Plain prose (wrapped title text, PCS premises/inferences, free commentary): not part of the
    // relation graph this loader builds; left unparsed, same as the `><`/free-text case above.
  }

  return { items: [...items.values()], relations };
}
