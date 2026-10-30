// Mole prototype core: graph queries shared by the browser app and the CLI.
// Plain script: in the browser it sets window.MoleCore, in Node it is require()-able.
// Maps to plan components: neighbourhood (S1.2), drift rule (S1.3/B3), dig + impact (S1.4),
// anchors + Mermaid import (S1.5), propagation outputs (S1.6), mole_map (S1.9), bootstrap (S1.10),
// SessionStart text (S2.3).
(function (root) {
  'use strict';

  // ---------- load + indexes ----------
  function load(data, overlay) {
    const G = { data, files: data.files, symbols: data.symbols, imports: data.imports.slice(), calls: data.calls.slice() };
    if (overlay) { G.imports.push(...(overlay.imports || [])); G.calls.push(...(overlay.calls || [])); }
    G.fileOut = new Map(); G.fileIn = new Map(); G.symOut = new Map(); G.symIn = new Map();
    const push = (m, k, v) => { (m.get(k) || m.set(k, []).get(k)).push(v); };
    const fileEdge = new Map();
    const addFileEdge = (from, to, rec) => {
      if (from === to) return;
      const key = from + '|' + to;
      let e = fileEdge.get(key);
      if (!e) { e = { from, to, imports: 0, calls: 0, typeOnly: true, line: rec.line, sim: false }; fileEdge.set(key, e); }
      if (rec.kind === 'import') { e.imports++; if (!rec.typeOnly) e.typeOnly = false; if (!e.importLine) e.importLine = rec.line; }
      else { e.calls += rec.count || 1; e.typeOnly = false; }
      if (rec.sim) e.sim = true;
    };
    for (const i of G.imports) addFileEdge(i.from, i.to, { kind: 'import', line: i.line, typeOnly: i.typeOnly, sim: i.sim });
    for (const c of G.calls) {
      const fs = G.symbols[c.from], ts = G.symbols[c.to];
      if (!fs || !ts) continue;
      push(G.symOut, c.from, c); push(G.symIn, c.to, c);
      addFileEdge(fs.file, ts.file, { kind: 'call', line: c.line, count: c.count, sim: c.sim });
    }
    for (const e of fileEdge.values()) { push(G.fileOut, e.from, e); push(G.fileIn, e.to, e); }
    G.fileEdges = [...fileEdge.values()];
    return G;
  }

  const visibleFile = (G, f, cfg) => !!G.files[f] && !(cfg.excludeTests && G.files[f].test);

  // ---------- roadmap anchors ----------
  function anchorMatch(pattern, file) {
    if (pattern.endsWith('/**')) return file.startsWith(pattern.slice(0, -2));
    if (pattern.endsWith('/*')) { const p = pattern.slice(0, -1); return file.startsWith(p) && !file.slice(p.length).includes('/'); }
    return file === pattern;
  }
  function boxOf(roadmap, file) {
    if (!roadmap) return null;
    for (const b of roadmap.boxes) if (b.anchors.some((a) => anchorMatch(a, file))) return b.id;
    return null;
  }
  const boxById = (roadmap, id) => roadmap && roadmap.boxes.find((b) => b.id === id);
  function groupOf(G, roadmap, file) {
    const b = boxOf(roadmap, file);
    return b || ('mod:' + G.files[file].module);
  }
  function groupLabel(G, roadmap, gid) {
    if (gid.startsWith('mod:')) return gid.slice(4);
    const b = boxById(roadmap, gid); return b ? b.label : gid;
  }
  function groupOrder(G, roadmap) {
    // fixed global order per index → stable positions across file switches (S1.2)
    if (roadmap) return roadmap.boxes.map((b) => b.id);
    const mods = [...new Set(Object.values(G.files).map((f) => f.module))].sort();
    return mods.map((m) => 'mod:' + m);
  }

  // ---------- drift rule (S1.3 / B3) ----------
  // A roadmap edge is satisfied by >=1 non-test, non-type-only import/call between anchored sets.
  // Violations only for forbidden edges. Planned edges are never flagged.
  function drift(G, roadmap, cfg) {
    const out = { violations: [], satisfied: new Set(), planned: [], unmodelled: new Map() };
    if (!roadmap) return out;
    const forbid = new Map(roadmap.rules.map((r) => [r.from + '>' + r.to, r]));
    const intended = new Map(roadmap.edges.map((e) => [e.from + '>' + e.to, e]));
    for (const e of G.fileEdges) {
      const ff = G.files[e.from], tf = G.files[e.to];
      if (!ff || !tf) continue;
      if (cfg.driftIgnoreTests && (ff.test || tf.test)) continue;
      if (cfg.driftIgnoreTypeOnly && e.typeOnly) continue;
      const a = boxOf(roadmap, e.from), b = boxOf(roadmap, e.to);
      if (!a || !b || a === b) continue;
      const key = a + '>' + b;
      const rule = forbid.get(key);
      if (rule) out.violations.push({ from: e.from, to: e.to, line: e.importLine || e.line, rule: rule.id, why: rule.why, boxes: [a, b], sim: e.sim });
      else if (intended.has(key)) out.satisfied.add(key);
      else out.unmodelled.set(key, (out.unmodelled.get(key) || 0) + 1);
    }
    for (const e of roadmap.edges) if (e.status === 'planned' && !out.satisfied.has(e.from + '>' + e.to)) out.planned.push(e);
    return out;
  }
  const driftForFile = (D, file) => D.violations.filter((v) => v.from === file || v.to === file);

  // ---------- neighbourhood (S1.2) ----------
  function neighbourhood(G, file, cfg, roadmap, D) {
    const max = cfg.maxNodes || 25;
    // drift partners are always shown (pinned), then by call count + imports
    const pinned = new Set(D ? D.violations.filter((v) => v.from === file || v.to === file).map((v) => (v.from === file ? 'out:' + v.to : 'in:' + v.from)) : []);
    const score = (e) => (pinned.has('out:' + e.to) && e.from === file) || (pinned.has('in:' + e.from) && e.to === file) ? 1e6 : e.calls * 2 + e.imports;
    const pick = (edges, side) => edges
      .filter((e) => visibleFile(G, side === 'in' ? e.from : e.to, cfg))
      .map((e) => ({ file: side === 'in' ? e.from : e.to, edge: e, w: score(e) }))
      .sort((a, b) => b.w - a.w || a.file.localeCompare(b.file));
    const inc = pick(G.fileIn.get(file) || [], 'in');
    const out = pick(G.fileOut.get(file) || [], 'out');
    const half = Math.max(4, Math.floor(max / 2));
    const takeIn = inc.slice(0, Math.min(inc.length, out.length < half ? max - out.length : half));
    const takeOut = out.slice(0, Math.max(0, max - takeIn.length));
    const more = (all, taken) => {
      const m = {}; const keep = new Set(taken.map((x) => x.file));
      for (const x of all) if (!keep.has(x.file)) { const g = groupOf(G, roadmap, x.file); m[g] = (m[g] || 0) + 1; }
      return m;
    };
    return { focus: file, incoming: takeIn, outgoing: takeOut, moreIn: more(inc, takeIn), moreOut: more(out, takeOut), totalIn: inc.length, totalOut: out.length };
  }

  // ---------- dig + impact (S1.4) ----------
  function impact(G, symId, cfg, depth) {
    depth = depth || 3;
    const seen = new Map([[symId, 0]]); const q = [symId]; const rows = [];
    while (q.length) {
      const s = q.shift(); const d = seen.get(s);
      if (d >= depth) continue;
      for (const c of G.symIn.get(s) || []) {
        const caller = G.symbols[c.from];
        if (!caller || !visibleFile(G, caller.file, cfg) || seen.has(c.from)) continue;
        seen.set(c.from, d + 1); q.push(c.from);
        rows.push({ sym: c.from, name: caller.name, file: caller.file, line: c.line, depth: d + 1, via: s });
      }
    }
    return rows;
  }
  function pathBetween(G, a, b, cfg) {
    const prev = new Map([[a, null]]); const q = [a];
    while (q.length) {
      const f = q.shift(); if (f === b) break;
      for (const e of G.fileOut.get(f) || []) {
        if (!visibleFile(G, e.to, cfg) || prev.has(e.to)) continue;
        prev.set(e.to, { f, e }); q.push(e.to);
      }
    }
    if (!prev.has(b)) return null;
    const path = []; let cur = b;
    while (cur) { const p = prev.get(cur); path.unshift({ file: cur, edge: p && p.e }); cur = p && p.f; }
    return path;
  }

  // ---------- bootstrap (S1.10) ----------
  function bootstrap(G, cfg) {
    const mods = [...new Set(Object.values(G.files).filter((f) => !f.test).map((f) => f.module))].sort();
    const src = G.data.src;
    const boxes = mods.map((m) => ({ id: m === '(root)' ? 'root' : m, label: m, anchors: [m === '(root)' ? src + '/*' : src + '/' + m + '/**'], status: 'inferred', note: 'drafted from directory boundary' }));
    const R = { version: 1, boxes, edges: [], rules: [] };
    const count = new Map();
    for (const e of G.fileEdges) {
      if (e.typeOnly || G.files[e.from].test || G.files[e.to].test) continue;
      const a = boxOf(R, e.from), b = boxOf(R, e.to);
      if (a && b && a !== b) count.set(a + '>' + b, (count.get(a + '>' + b) || 0) + 1);
    }
    for (const [k, n] of count) if (n >= 2) { const [from, to] = k.split('>'); R.edges.push({ from, to, status: 'inferred', evidence: n }); }
    return R;
  }

  // ---------- curated import + anchors (S1.5) ----------
  function parseMermaid(text) {
    const nodes = new Map(); const edges = [];
    const nodeRe = /([A-Za-z_][\w]*)\s*(?:\[\s*"?([^\]"]+)"?\s*\]|\(\s*"?([^)"]+)"?\s*\))?/g;
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line || /^(flowchart|graph|%%|subgraph|end\b|classDef|style)/.test(line)) continue;
      const parts = line.split(/\s*-->\s*|\s*---\s*|\s*-\.->\s*/);
      const ids = [];
      for (const p of parts) {
        nodeRe.lastIndex = 0; const m = nodeRe.exec(p);
        if (!m) continue;
        const id = m[1]; const label = (m[2] || m[3] || '').trim();
        if (!nodes.has(id) || label) nodes.set(id, label || (nodes.get(id) || id));
        ids.push(id);
      }
      for (let i = 0; i + 1 < ids.length; i++) edges.push({ from: ids[i], to: ids[i + 1] });
    }
    return { nodes: [...nodes].map(([id, label]) => ({ id, label })), edges };
  }
  const norm = (s) => s.toLowerCase().replace(/\.(tsx?|jsx?)$/, '').replace(/[^a-z0-9]/g, '');
  function suggestAnchors(G, diagram) {
    const files = Object.keys(G.files).filter((f) => !G.files[f].test);
    const dirs = [...new Set(files.map((f) => f.split('/').slice(0, -1).join('/')))];
    return diagram.nodes.map((n) => {
      const key = norm(n.label);
      const words = n.label.toLowerCase().split(/\s+/).map(norm).filter((w) => w.length > 2);
      const exactFile = files.filter((f) => norm(f.split('/').pop()) === key);
      if (exactFile.length === 1) return { ...n, anchor: exactFile[0], kind: 'file', status: 'inferred', how: 'file name = label' };
      const dir = dirs.filter((d) => words.some((w) => norm(d.split('/').pop()) === w));
      if (dir.length === 1) return { ...n, anchor: dir[0] + '/**', kind: 'dir', status: 'inferred', how: 'folder name in label' };
      if (exactFile.length + dir.length > 1) return { ...n, anchor: null, candidates: [...exactFile, ...dir.map((d) => d + '/**')], status: 'ambiguous', how: 'several matches' };
      return { ...n, anchor: null, status: 'unanchored', how: 'no match' };
    });
  }
  const curatedFor = (anchored, file) => anchored.filter((n) => n.anchor && anchorMatch(n.anchor, file));

  // ---------- agent-facing text (S1.9 mole_map, S2.3 SessionStart) ----------
  function moleMap(G, target, cfg, roadmap, D) {
    let file = target, sym = null;
    if (G.symbols[target]) { sym = G.symbols[target]; file = sym.file; }
    if (!G.files[file]) return `mole_map: no node for ${target}`;
    const N = neighbourhood(G, file, cfg, roadmap, D);
    const box = boxOf(roadmap, file);
    const loc = (e, side) => `${side === 'in' ? e.from : e.to}${e.importLine ? ':' + e.importLine : ''}`;
    const lines = [];
    lines.push(`mole_map ${file}${sym ? '#' + sym.name : ''} @${G.data.commit}`);
    lines.push(`box: ${box ? boxById(roadmap, box).label + ' (' + boxById(roadmap, box).status + ')' : G.files[file].module}`);
    if (sym) {
      const callers = (G.symIn.get(sym.id) || []).slice(0, 8).map((c) => `${G.symbols[c.from].name} ${G.symbols[c.from].file}:${c.line}`);
      const callees = (G.symOut.get(sym.id) || []).slice(0, 8).map((c) => `${G.symbols[c.to].name} ${G.symbols[c.to].file}:${G.symbols[c.to].line}`);
      lines.push(`callers(${(G.symIn.get(sym.id) || []).length}): ${callers.join('; ') || '-'}`);
      lines.push(`calls(${(G.symOut.get(sym.id) || []).length}): ${callees.join('; ') || '-'}`);
    } else {
      lines.push(`used by(${N.totalIn}): ${N.incoming.slice(0, 8).map((x) => loc(x.edge, 'in')).join(', ') || '-'}`);
      lines.push(`uses(${N.totalOut}): ${N.outgoing.slice(0, 8).map((x) => loc(x.edge, 'out')).join(', ') || '-'}`);
      const syms = G.files[file].symbols.filter((s) => G.symbols[s].exported).slice(0, 6).map((s) => `${G.symbols[s].name}:${G.symbols[s].line}`);
      lines.push(`exports: ${syms.join(', ') || '-'}`);
    }
    const dv = D ? driftForFile(D, file) : [];
    lines.push(`drift: ${dv.length ? dv.map((v) => `${v.rule} ${v.from}:${v.line} -> ${v.to}`).join('; ') : 'none'}`);
    lines.push(`view: mole://map/${file}`);
    return lines.join('\n');
  }

  function sessionStart(G, roadmap, cfg, D, branchFiles) {
    const cap = cfg.sessionStartCap || 1500;
    const touched = new Set(branchFiles || []);
    const items = D.violations.filter((v) => !touched.size || touched.has(v.from) || touched.has(v.to));
    let s = `[mole] map ready @${G.data.commit}. Use mole_map(path) before reading files; mole_propose for roadmap edits (.mole/model is read-only for agents).`;
    s += items.length ? `\n[mole] drift on this branch (${items.length}):` : '\n[mole] no drift on files changed on this branch.';
    for (const v of items) {
      const add = `\n- ${v.rule} ${v.from}:${v.line} -> ${v.to} (${v.why})`;
      if (s.length + add.length > cap - 40) { s += `\n- … ${items.length} total, see mole_drift()`; break; }
      s += add;
    }
    return s;
  }

  // ---------- propagation outputs (S1.6) ----------
  const ymlStr = (s) => (/^[\w./*()+-]+$/.test(s) ? s : JSON.stringify(s));
  function roadmapYaml(R) {
    const L = ['# .mole/model/roadmap.yaml  (committed, reviewed in PRs)', `version: ${R.version}`, 'boxes:'];
    for (const b of R.boxes) {
      L.push(`  - id: ${b.id}`, `    label: ${ymlStr(b.label)}`, `    status: ${b.status}`, `    anchors: [${b.anchors.map(ymlStr).join(', ')}]`);
    }
    L.push('edges:');
    for (const e of R.edges) L.push(`  - { from: ${e.from}, to: ${e.to}, status: ${e.status} }`);
    L.push('rules:');
    for (const r of R.rules) L.push(`  - { id: ${r.id}, forbid: ${r.from} -> ${r.to}, why: ${ymlStr(r.why)} }`);
    return L.join('\n');
  }
  function mermaid(R, D) {
    const id = (s) => s.replace(/[^\w]/g, '_');
    const L = ['flowchart TB'];
    for (const b of R.boxes) L.push(`  ${id(b.id)}["${b.label}"]`);
    for (const e of R.edges) L.push(`  ${id(e.from)} ${e.status === 'planned' ? '-.->' : '-->'} ${id(e.to)}`);
    if (D) {
      const seen = new Set();
      for (const v of D.violations) { const k = v.boxes.join('>'); if (seen.has(k)) continue; seen.add(k); L.push(`  ${id(v.boxes[0])} -- "drift ${v.rule}" --x ${id(v.boxes[1])}`); }
    }
    return L.join('\n');
  }
  function managedBlock(R, D, hash) {
    return `<!-- mole:diagram roadmap hash=${hash} (generated, edit in the Mole sidebar) -->\n\`\`\`mermaid\n${mermaid(R, D)}\n\`\`\`\n<!-- /mole:diagram -->`;
  }
  function agentsPointer(R, hash) {
    return ['<!-- mole:pointer (generated, ≤10 lines) -->', '## Architecture map (Mole)', `- Roadmap: ${R.boxes.map((b) => b.label).join(' · ')}`,
      '- Before reading files, call `mole_map(path)`; for blast radius `mole_impact(symbol)`.',
      '- Do not edit `.mole/model/**` or `mole:diagram` blocks; use `mole_propose`.',
      `- Model hash ${hash}.`, '<!-- /mole:pointer -->'].join('\n');
  }
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, '0'); }

  function configYaml(cfg) {
    return ['# .mole/config.yaml', 'index:', `  exclude_tests: ${cfg.excludeTests}`, '  respect_gitignore: true', '  large_file_bytes: 1000000',
      'view:', `  max_nodes: ${cfg.maxNodes}`, `  debounce_ms: ${cfg.debounceMs}`, `  layers: [${Object.keys(cfg.layers).filter((k) => cfg.layers[k]).join(', ')}]`,
      'drift:', `  ignore_tests: ${cfg.driftIgnoreTests}`, `  ignore_type_only: ${cfg.driftIgnoreTypeOnly}`, `  guard: ${cfg.guard}            # warn | block (Stop hook)`,
      'explanations:', `  mode: ${cfg.explain}       # off | on-demand`, `  provider: vscode.lm`, `  consent: ${cfg.consent}`,
      'propagate:', `  mode: ${cfg.propagate}         # auto | manual (mole sync)`,
      'agents:', `  session_start_cap: ${cfg.sessionStartCap}`, `  activity_message_text: ${cfg.messageText}`, `  retention_days: ${cfg.retentionDays}`].join('\n');
  }

  const api = { load, visibleFile, anchorMatch, boxOf, boxById, groupOf, groupLabel, groupOrder, drift, driftForFile, neighbourhood, impact, pathBetween, bootstrap, parseMermaid, suggestAnchors, curatedFor, moleMap, sessionStart, roadmapYaml, mermaid, managedBlock, agentsPointer, hash, configYaml };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MoleCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
