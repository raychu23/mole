// T34 one-panel: runs inside the sidebar webview. Receives one `mole.update` postMessage per refresh (the
// extension host re-renders the data; this script only patches the DOM — see prior-art.md #1, the same
// "static HTML, patch on postMessage" idiom GitLens/Copilot/Cody use for fast refresh, M26b).
declare function acquireVsCodeApi(): { postMessage(m: unknown): void; getState(): unknown; setState(s: unknown): void };
const vscode = acquireVsCodeApi();
window.addEventListener('error', (e) => vscode.postMessage({ type: 'error', message: `${e.message} @ ${e.filename}:${e.lineno}` }));

const app = document.getElementById('app') as HTMLElement;

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
}

interface Section {
  status: 'ok' | 'empty' | 'unavailable' | 'error';
  caption: string;
  data?: unknown;
  message?: string;
}
interface Model {
  file: string;
  line: number;
  symbol?: string;
  generatedAt: number;
  cacheHit: boolean;
  sections: Record<string, Section>;
}

const ORDER: Array<[string, string]> = [
  ['decisions', 'Decisions'],
  ['pastFixes', 'Past fixes'],
  ['notes', 'Your notes'],
  ['since', 'Since you last looked'],
  ['questions', 'Questions'],
  ['tests', 'Tests that guard it'],
  ['agents', 'Agents'],
  ['blastRadius', 'Blast radius'],
  ['reviewNotes', 'Review / meeting notes'],
];

function countOf(id: string, data: unknown): number {
  if (!data || typeof data !== 'object') return 0;
  const d = data as Record<string, unknown>;
  const arr = (d.decisions ?? d.hunks ?? d.questions ?? d.files ?? d.claims ?? undefined) as unknown[] | undefined;
  if (Array.isArray(arr)) return arr.length;
  if (id === 'notes' && Array.isArray(data)) return (data as unknown[]).length;
  if (id === 'tests' && Array.isArray(data)) return (data as unknown[]).length;
  if (id === 'agents') {
    const a = data as { claims?: { claims?: unknown[] }; collisions?: { pairs?: unknown[] }; tried?: { tried?: unknown[] } };
    return (a.claims?.claims?.length ?? 0) + (a.collisions?.pairs?.length ?? 0) + (a.tried?.tried?.length ?? 0);
  }
  if (id === 'blastRadius') {
    const b = data as { map?: { nodes?: unknown[] }; flows?: { tests?: unknown[] } };
    return (b.map?.nodes?.length ?? 0) + (b.flows?.tests?.length ?? 0);
  }
  if (id === 'reviewNotes') {
    const r = data as { drafts?: unknown[] };
    return r.drafts?.length ?? 0;
  }
  return 0;
}

function render(model: Model): void {
  const parts: string[] = [`<div class="hdr">${esc(model.file)}:${model.line}${model.symbol ? `#${esc(model.symbol)}` : ''}${model.cacheHit ? ' <span class="cache">cached</span>' : ''}</div>`];
  for (const [id, label] of ORDER) {
    const s = model.sections[id];
    if (!s) continue;
    parts.push(`<section class="sec sec-${s.status}" data-id="${id}">`);
    parts.push(`<h3>${esc(label)} <span class="status">${s.status}</span></h3>`);
    parts.push(`<p class="caption">${esc(s.caption)}</p>`);
    if (s.status === 'ok') {
      parts.push(`<div class="count">${countOf(id, s.data)} item(s)</div>`);
    } else {
      parts.push(`<p class="msg">${esc(s.message ?? '')}</p>`);
    }
    if (id === 'notes') parts.push('<div class="addnote"><textarea data-note placeholder="add a note on this function"></textarea><button data-add-note>Add note</button></div>');
    if (id === 'questions') parts.push('<div class="explain"><textarea data-explain placeholder="explain it back (saved privately to .mole/local)"></textarea><button data-save-explain>Save</button></div>');
    if (id === 'tests') parts.push('<button data-run-tests>Run</button><span data-run-result></span>');
    // T40: the delta diagram rendered inline -- a deterministic SVG from @mole/reviews, no model, no script.
    if (id === 'reviewNotes' && s.status === 'ok') {
      const r = s.data as { diagramSvg?: string } | undefined;
      if (r?.diagramSvg) parts.push(`<div class="diagram">${r.diagramSvg}</div>`);
    }
    parts.push('</section>');
  }
  app.innerHTML = parts.join('\n');
  app.querySelector('[data-add-note]')?.addEventListener('click', () => {
    const ta = app.querySelector('[data-note]') as HTMLTextAreaElement | null;
    if (ta?.value.trim()) vscode.postMessage({ type: 'addNote', text: ta.value.trim() });
  });
  app.querySelector('[data-save-explain]')?.addEventListener('click', () => {
    const ta = app.querySelector('[data-explain]') as HTMLTextAreaElement | null;
    if (ta?.value.trim()) vscode.postMessage({ type: 'saveExplain', text: ta.value.trim() });
  });
  app.querySelector('[data-run-tests]')?.addEventListener('click', () => {
    const out = app.querySelector('[data-run-result]');
    if (out) out.textContent = ' running…';
    vscode.postMessage({ type: 'runTests' });
  });
}

window.addEventListener('message', (ev) => {
  const m = ev.data as { type: string; [k: string]: unknown };
  if (m.type === 'mole.update') {
    const t0 = performance.now();
    render(m.model as Model);
    vscode.postMessage({ type: 'rendered', seq: m.seq, paintMs: performance.now() - t0 });
  } else if (m.type === 'runResult') {
    const out = app.querySelector('[data-run-result]');
    if (out) out.textContent = ` ${String(m.summary)}`;
  }
});

vscode.postMessage({ type: 'ready' });
