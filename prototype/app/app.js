// Mole prototype app: one state, six settings (how it's used · editor sidebar · agent terminal ·
// agent panel in 4 hosts · pull request · settings). Graph data is real (data/ui-tui.js);
// roadmap, curated doc and agent session are SAMPLE inputs (sample/sample.js).
(function () {
  'use strict';
  const DATA = window.MOLE_DATA, M = window.MoleCore, SAMPLE = window.MOLE_SAMPLE;
  const EV = SAMPLE.events;
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const base = (f) => f.split('/').pop();
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const kb = (b) => (b / 1024).toFixed(1) + ' KB';
  const tok = (b) => Math.round(b / 4).toLocaleString();
  const agentById = Object.fromEntries(SAMPLE.agents.map((a) => [a.id, a]));
  const RANK = { 'search-hit': 1, 'read-range': 2, 'read-full': 3, edited: 4 };

  const PRESETS = {
    junior: { label: 'Junior learner', maxNodes: 18, explain: 'on-demand', guard: 'warn', layers: { current: true, roadmap: true, curated: true, activity: true } },
    senior: { label: 'Senior / lead', maxNodes: 40, explain: 'off', guard: 'warn', layers: { current: true, roadmap: true, curated: false, activity: false } },
    agents: { label: 'Agent-heavy', maxNodes: 25, explain: 'off', guard: 'block', sessionStartCap: 1000, layers: { current: true, roadmap: true, curated: false, activity: true } },
  };

  const S = {
    tab: 'how', file: 'src/app/slash/registry.ts', level: 'file', sym: null, box: null, pathTo: '', impactOn: false,
    cfg: { persona: 'junior', excludeTests: true, maxNodes: 18, debounceMs: 120, layers: { current: true, roadmap: true, curated: true, activity: true },
      driftIgnoreTests: true, driftIgnoreTypeOnly: true, guard: 'warn', explain: 'on-demand', consent: false, propagate: 'auto',
      sessionStartCap: 1500, messageText: false, retentionDays: 14 },
    roadmap: clone(SAMPLE.roadmap), roadmapMode: 'accepted',
    curatedStatus: {}, adopted: false,
    step: -1, proposals: {}, host: 'vscode', etab: 'file',
    openDirs: new Set(['src', 'src/app', 'src/app/slash']), viewedAt: {}, prevViewed: undefined, renders: [], skipped: 0,
    hl: null, explainFor: null, editOpen: false, seenHash: {}, published: null, baseHash: null, flash: null,
  };

  // ---------- derived state ----------
  let G, D, G0, D0, DBASE, ACT;
  const BASE_ROADMAP = clone(SAMPLE.roadmap); // roadmap at session start: baseline for 'resolved by roadmap change'
  const G0raw = M.load(DATA);
  function modelHash() { return M.hash(M.roadmapYaml(S.roadmap)); }
  function publish() { S.published = { hash: modelHash(), yaml: M.roadmapYaml(S.roadmap), block: M.managedBlock(S.roadmap, D, modelHash()), pointer: M.agentsPointer(S.roadmap, modelHash()) }; }
  function recompute() {
    const overlay = { imports: [], calls: [] };
    EV.slice(0, S.step + 1).forEach((e) => { if (e.effect) overlay.imports.push(...(e.effect.imports || [])); });
    G = M.load(DATA, overlay);
    G0 = G0raw;
    D = M.drift(G, S.roadmap, S.cfg);
    D0 = M.drift(G0, S.roadmap, S.cfg); // pre-existing code drift under the current roadmap
    DBASE = M.drift(G0, BASE_ROADMAP, S.cfg); // drift under the roadmap the session started with
    ACT = activity();
    if (!S.published || S.cfg.propagate === 'auto') publish();
  }
  const vkey = (v) => v.from + '|' + v.to + '|' + v.rule;
  function sessionDrift() { const old = new Set(D0.violations.map(vkey)); return D.violations.filter((v) => !old.has(vkey(v))); }

  const grepCache = {};
  function grepHits(e) {
    const k = e.target + '|' + e.pattern;
    if (grepCache[k]) return grepCache[k];
    const re = new RegExp(e.pattern, 'i');
    return (grepCache[k] = Object.keys(DATA.files).filter((f) => M.anchorMatch(e.target, f) && !DATA.files[f].test && DATA.files[f].text && re.test(DATA.files[f].text)).sort());
  }
  function activity() {
    const byFile = {}; const editStep = {}; const agents = {}; const pendingBash = {};
    SAMPLE.agents.forEach((a) => { agents[a.id] = { ...a, status: 'waiting', cur: '', edited: 0, read: 0, search: 0, tools: 0 }; });
    const mark = (f, a, level, i) => {
      const cur = (byFile[f] = byFile[f] || {});
      if ((RANK[level] || 0) > (RANK[cur[a]] || 0)) cur[a] = level;
      if (level === 'edited') { editStep[f] = i; agents[a].edited++; } else if (level === 'search-hit') agents[a].search++; else agents[a].read++;
    };
    EV.slice(0, S.step + 1).forEach((e, i) => {
      if (e.agent && agents[e.agent].status === 'waiting') agents[e.agent].status = 'running';
      if (e.t === 'hook' && e.hook === 'SubagentStop') { agents[e.agent].status = 'done'; (pendingBash[e.agent] || []).forEach((p) => mark(p.target, e.agent, 'edited', i)); }
      if (e.agent && e.t !== 'hook') { agents[e.agent].tools++; agents[e.agent].cur = e.target || e.tool; }
      if (!e.level) return;
      if (e.viaBash) { (pendingBash[e.agent] = pendingBash[e.agent] || []).push(e); return; }
      const files = e.level === 'search-hit' ? grepHits(e) : [e.target];
      files.forEach((f) => mark(f, e.agent, e.level, i));
    });
    if (S.step >= EV.length - 1) Object.values(agents).forEach((a) => { if (a.status !== 'waiting') a.status = 'done'; });
    return { byFile, editStep, agents };
  }
  const actColors = (f) => Object.keys((ACT.byFile[f]) || {}).map((a) => agentById[a].color);
  const curatedNodes = () => M.suggestAnchors(G0raw, M.parseMermaid(SAMPLE.curated.mermaid)).map((n) => {
    const st = S.curatedStatus[n.id];
    if (st && st.anchor) return { ...n, anchor: st.anchor, status: 'accepted' };
    return n;
  });
  const curatedFor = (f) => M.curatedFor(curatedNodes(), f); // any anchor (file or folder) → sidebar badge
  const curatedFile = (f) => curatedNodes().some((n) => n.anchor === f); // exact file anchor → ◆ on pills + explorer
  const curatedDir = (d) => curatedNodes().some((n) => n.anchor === d + '/**');
  const changedSinceViewed = (f) => ACT.editStep[f] !== undefined && ACT.editStep[f] > (S.viewedAt[f] === undefined ? -1 : S.viewedAt[f]);
  const visibleFiles = () => Object.keys(G.files).filter((f) => M.visibleFile(G, f, S.cfg)).sort();

  // ---------- navigation ----------
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 3200); }
  function setTab(tab) {
    S.tab = tab;
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('on', s.id === 'tab-' + tab));
    render();
  }
  function viewFile(f) {
    S.prevViewed = S.viewedAt[f];
    S.viewedAt[f] = S.step;
  }
  function openAt(file, line, opts) {
    if (!G.files[file]) return;
    S.file = file; S.etab = 'file'; S.hl = line || null;
    if (!opts || !opts.keepLevel) { S.level = 'file'; S.sym = null; S.impactOn = false; }
    viewFile(file);
    if (S.tab !== 'vscode') setTab('vscode'); else renderVSCode();
  }
  function go(o) {
    if (o.reset) resetSession();
    if (o.step !== undefined) { S.step = o.step === 'end' ? EV.length - 1 : o.step; recompute(); }
    if (o.file) { S.file = o.file; viewFile(o.file); S.etab = 'file'; }
    if (o.level) S.level = o.level;
    if (o.sym !== undefined) S.sym = o.sym;
    if (o.impact !== undefined) S.impactOn = o.impact;
    if (o.etab) S.etab = o.etab;
    if (o.host) S.host = o.host;
    if (o.edit !== undefined) S.editOpen = o.edit;
    if (o.explain !== undefined) S.explainFor = o.explain;
    if (o.line) S.hl = o.line;
    if (o.bootstrap) { S.roadmap = M.bootstrap(G0raw, S.cfg); S.roadmapMode = 'bootstrap'; recompute(); }
    setTab(o.tab || S.tab);
    if (o.walk) setTimeout(walk, 300);
    if (o.hi) setTimeout(() => { const el = $(o.hi); if (el) { el.scrollIntoView({ block: 'nearest' }); el.classList.add('hilite'); setTimeout(() => el.classList.remove('hilite'), 2600); } }, 60);
  }
  function resetSession() { S.step = -1; S.proposals = {}; S.roadmap = clone(SAMPLE.roadmap); S.roadmapMode = 'accepted'; S.published = null; recompute(); }
  function onModelChange(desc) {
    recompute();
    if (S.cfg.propagate === 'auto') { publish(); toast(`${desc} · model ${modelHash()} → sidebar, README block, AGENTS.md pointer, mole_roadmap updated`); }
    else toast(`${desc} · model ${modelHash()} changed · propagate=manual: run "mole sync" (CI mole check fails until then)`);
    render();
  }

  // ---------- truth strip + meta ----------
  const TRUTH = {
    how: '<span class="tag real">REAL</span>code graph from the TypeScript Compiler API over a real repo · <span class="tag sim">SIMULATED</span>roadmap rules, curated doc, agent session, PR · <span class="tag plan">PLAN</span>ids S1.x/S2.x/F… point to context/product-plan',
    vscode: '<span class="tag real">REAL</span>files, imports, calls with file:line, neighbourhood ranking, drift rule, render timing · <span class="tag sim">SIMULATED</span>roadmap (sample lead review), curated doc, explanation text, agent badges',
    cli: '<span class="tag real">REAL</span>mole_map / SessionStart / drift text computed from the graph, byte counts · <span class="tag sim">SIMULATED</span>the Claude Code session script and its edits (UI look-alike)',
    panel: '<span class="tag real">REAL</span>coverage + drift computed from the event log and graph · <span class="tag sim">SIMULATED</span>agents, events and host chrome (one renderer shown in 4 hosts)',
    pr: '<span class="tag real">REAL</span>architecture diff + drift computed from graph and the session edits · <span class="tag sim">SIMULATED</span>the PR, GitHub UI, checks',
    settings: '<span class="tag plan">PROPOSED</span>.mole/config.yaml format · every setting changes the other views live',
  };
  function renderChrome() {
    const st = DATA.stats;
    $('#meta').innerHTML = `${esc(SAMPLE.repoLabel)} @${esc(DATA.commit)} · ${esc(DATA.engine)}<br>${st.files} files (${st.testFiles} tests) · ${st.symbols.toLocaleString()} symbols · ${st.calls.toLocaleString()} calls · indexed in ${(st.totalMs / 1000).toFixed(1)} s`;
    $('#truth').innerHTML = TRUTH[S.tab];
  }

  function render() {
    renderChrome();
    ({ how: renderHow, vscode: renderVSCode, cli: renderCLI, panel: renderPanel, pr: renderPR, settings: renderSettings })[S.tab]();
  }

  // ================= HOW IT'S USED =================
  const goBtn = (o, label) => `<button class="go" data-go='${esc(JSON.stringify(o))}'>${label || 'show'}</button>`;
  function renderHow() {
    const st = DATA.stats;
    $('#tab-how').innerHTML = `<div class="page">
      <p style="font-size:15px;margin-top:4px"><b>Mole</b>: open a file and the map of where it sits, what it touches and whether it matches the intended design follows you. Agents read the same map, and their work shows up on it.</p>
      <p><span class="stat"><b>${st.files}</b> files</span><span class="stat"><b>${st.symbols.toLocaleString()}</b> symbols</span><span class="stat"><b>${st.imports.toLocaleString()}</b> imports</span><span class="stat"><b>${st.calls.toLocaleString()}</b> resolved calls</span><span class="stat"><b>${st.barrelHops}</b> calls resolved through re-exports</span><span class="stat"><b>${(st.totalMs / 1000).toFixed(1)} s</b> full index</span> <span class="tag real">REAL</span> ${esc(SAMPLE.repoLabel)} @${esc(DATA.commit)}</p>

      <h2>Mole in each setting</h2>
      <table class="t"><tr><th>setting</th><th>stage</th><th>who</th><th>what you see</th><th>plan</th><th></th></tr>
        <tr><td><b>Editor sidebar</b> (VS Code, Cursor, Windsurf)</td><td>1</td><td>C1 junior, C3 lead</td><td>map follows the open file · roadmap ghosted over real code · drift badges · dig to symbol · edit once, propagate</td><td>S1.1-S1.10</td><td>${goBtn({ tab: 'vscode' }, 'open')}</td></tr>
        <tr><td><b>Agent in terminal</b> (Claude Code CLI, Codex)</td><td>2</td><td>C2 agent user</td><td>SessionStart context · <code>mole_map</code> instead of reading files · drift note after an edit · guard on the roadmap · Stop report</td><td>S2.1-S2.5</td><td>${goBtn({ tab: 'cli' }, 'open')}</td></tr>
        <tr><td><b>Agent panel</b> (VS Code panel · Hermes pane · Claude desktop MCP App · localhost)</td><td>2</td><td>C2, C3</td><td>lane per agent · files touched on the map · coverage vs scope · drift this session · approve/reject proposals</td><td>S2.6, S2.7, S2.9</td><td>${goBtn({ tab: 'panel' }, 'open')}</td></tr>
        <tr><td><b>Pull request</b> (GitHub/GitLab CI)</td><td>3</td><td>C3 reviewer</td><td>architecture diff vs the accepted roadmap · new drift with file:line · managed-block check</td><td>S3.1, S3.2</td><td>${goBtn({ tab: 'pr' }, 'open')}</td></tr>
        <tr><td><b>Settings</b> (.mole/config.yaml)</td><td>all</td><td>everyone</td><td>persona presets · layers · drift guard warn/block · explanations + consent · propagate auto/manual</td><td>B7, B8</td><td>${goBtn({ tab: 'settings' }, 'open')}</td></tr>
      </table>

      <h2>How it's used</h2>
      <div class="journeys">
        <div class="journey"><h3>C1 · junior, first ticket</h3><div class="who">unfamiliar repo, needs a mental model fast</div><ol>
          <li>Open a file: the sidebar maps who uses it and what it uses. ${goBtn({ tab: 'vscode', file: 'src/app/slash/registry.ts', level: 'file', hi: '#mole .canvas' })}</li>
          <li>Arrow through files: map follows, boxes keep their place, 0 tokens. ${goBtn({ tab: 'vscode', walk: true, hi: '#mole .foot' }, 'walk 10 files')}</li>
          <li>Dig: whole-repo map → box → file → symbol. ${goBtn({ tab: 'vscode', level: 'map', hi: '#mole .canvas' })}</li>
          <li>"What breaks if I change this?" ${goBtn({ tab: 'vscode', file: 'src/app/uiStore.ts', level: 'symbol', sym: 'src/app/uiStore.ts#patchUiState', impact: true, hi: '#impact' })}</li>
          <li>Drift badge explains a design rule on the spot. ${goBtn({ tab: 'vscode', file: 'src/components/appLayout.tsx', level: 'file', hi: '#drifthere' })}</li>
          <li>Plain-language help, with consent, marked stale when code moves. ${goBtn({ tab: 'vscode', file: 'src/app/slash/registry.ts', explain: 'src/app/slash/registry.ts', hi: '#explain' })}</li>
        </ol></div>
        <div class="journey"><h3>C2 · developer running agents</h3><div class="who">wants cheap runs and to know what agents touched</div><ol>
          <li>Session starts with a capped map note; agent calls <code>mole_map</code>. ${goBtn({ tab: 'cli', reset: true, step: 1 })}</li>
          <li>An agent edit breaks a roadmap rule → told right after the edit. ${goBtn({ tab: 'cli', step: 11 })}</li>
          <li>Agent tries to rewrite the roadmap → denied, proposes instead. ${goBtn({ tab: 'cli', step: 13 })}</li>
          <li>Watch all agents on the map, in whichever host you use. ${goBtn({ tab: 'panel', step: 'end', host: 'hermes' })}</li>
          <li>Coverage vs task scope, honest levels ("touched", not "checked"). ${goBtn({ tab: 'panel', step: 'end', hi: '#cov' })}</li>
          <li>Stop hook reports only drift this session caused. ${goBtn({ tab: 'cli', step: 'end' })}</li>
        </ol></div>
        <div class="journey"><h3>C3 · lead / reviewer</h3><div class="who">keeps code matching the design</div><ol>
          <li>Repo has no diagrams → bootstrap a draft roadmap from structure. ${goBtn({ tab: 'vscode', level: 'map', bootstrap: true, hi: '#mole .canvas' }, 'bootstrap')}</li>
          <li>Accept the reviewed roadmap (6 boxes, rules R1-R5). ${goBtn({ tab: 'vscode', level: 'map', reset: true, hi: '#mole .canvas' })}</li>
          <li>Import the team's existing Mermaid diagram, anchor it to code. ${goBtn({ tab: 'vscode', etab: 'curated' })}</li>
          <li>Edit once in the sidebar → README block, AGENTS.md, agents update. ${goBtn({ tab: 'vscode', edit: true, hi: '#roadmapedit' })}</li>
          <li>Approve or reject an agent's roadmap proposal. ${goBtn({ tab: 'panel', step: 'end', hi: '#props' })}</li>
          <li>PR shows the architecture diff + checks. ${goBtn({ tab: 'pr', step: 'end' })}</li>
        </ol></div>
      </div>

      <h2>What's real vs simulated</h2>
      <table class="t"><tr><th>part</th><th>status</th><th>how</th></tr>
        <tr><td>current layer: files, symbols, imports, calls, file:line@commit</td><td><span class="tag real">REAL</span></td><td><code>prototype/indexer/index.mjs</code>: TypeScript ${esc(DATA.engine.split(' ')[1])} Compiler API + type checker over ${esc(SAMPLE.repoLabel)} (calls through re-exports land on the real declaration)</td></tr>
        <tr><td>neighbourhood, dig, impact, path, drift rule, bootstrap, Mermaid anchor matching, mole_map / SessionStart text</td><td><span class="tag real">REAL</span></td><td><code>prototype/core/mole-core.js</code>, same code in the browser and <code>node cli/mole.mjs</code></td></tr>
        <tr><td>render time per file switch</td><td><span class="tag real">REAL</span></td><td>measured in this browser, shown in the sidebar footer (no daemon, no SQLite yet)</td></tr>
        <tr><td>roadmap boxes + rules R1-R5</td><td><span class="tag sim">SAMPLE</span></td><td>bootstrap edges (≥2 observed uses) grouped into 6 boxes, rules picked as a lead might; the 4 drift items they flag are real code</td></tr>
        <tr><td>curated diagram, agent session (3 agents, 19 events), PR, checks</td><td><span class="tag sim">SIMULATED</span></td><td><code>prototype/sample/sample.js</code>; file paths and grep hits are real, the edits are not applied to the repo</td></tr>
        <tr><td>LLM explanations, hosts (VS Code, Hermes, Claude desktop, GitHub)</td><td><span class="tag sim">MOCK</span></td><td>look-alike chrome around one renderer; no LLM is called</td></tr>
      </table>
    </div>`;
  }

  // ================= EDITOR SIDEBAR (stage 1) =================
  let tree = null;
  function buildTree() {
    const rootN = { name: 'src', path: 'src', dirs: {}, files: [] };
    for (const f of Object.keys(DATA.files).sort()) {
      const parts = f.split('/'); let n = rootN;
      for (let i = 1; i < parts.length - 1; i++) {
        const p = parts.slice(0, i + 1).join('/');
        n = n.dirs[parts[i]] = n.dirs[parts[i]] || { name: parts[i], path: p, dirs: {}, files: [] };
      }
      n.files.push(f);
    }
    return rootN;
  }
  function renderExplorer() {
    tree = tree || buildTree();
    const out = [`<h4>EXPLORER · ${esc(SAMPLE.repoLabel.split('/').pop().toUpperCase())}</h4>`];
    const walkN = (n, depth) => {
      const open = S.openDirs.has(n.path);
      out.push(`<div class="row" data-dir="${esc(n.path)}" style="padding-left:${6 + depth * 12}px"><span class="dir">${open ? '▾' : '▸'} ${esc(n.name)}</span>${S.cfg.layers.curated && curatedDir(n.path) ? '<span class="bdg"><span class="c" title="folder anchored in a curated diagram">◆</span></span>' : ''}</div>`);
      if (!open) return;
      Object.values(n.dirs).sort((a, b) => a.name.localeCompare(b.name)).forEach((d) => {
        if (S.cfg.excludeTests && d.name === '__tests__') return;
        walkN(d, depth + 1);
      });
      n.files.filter((f) => M.visibleFile(G, f, S.cfg)).forEach((f) => {
        const dv = M.driftForFile(D, f).length; const cur = curatedFile(f); const ch = changedSinceViewed(f);
        const dots = actColors(f).map((c) => `<i class="a" style="background:${c}"></i>`).join('');
        out.push(`<div class="row${f === S.file ? ' sel' : ''}" data-file="${esc(f)}" style="padding-left:${18 + depth * 12}px"><span class="nm">${esc(base(f))}</span><span class="bdg">${dv ? `<span class="d" title="${dv} drift">⚠${dv}</span>` : ''}${cur && S.cfg.layers.curated ? '<span class="c" title="in a curated diagram">◆</span>' : ''}${ch ? '<span class="ch" title="changed by an agent since you last viewed">↻</span>' : ''}${S.cfg.layers.activity ? dots : ''}</span></div>`);
      });
    };
    walkN(tree, 0);
    $('#explorer').innerHTML = out.join('');
  }

  function renderVSCode() {
    const t0 = performance.now();
    renderExplorer();
    renderEditor();
    renderMole(t0);
  }

  // ----- editor -----
  function genDocs() {
    const pub = S.published;
    return {
      readme: `# ui-tui\n\nInk-based terminal UI for Hermes.\n\n## Architecture\n\n${pub.block}\n\n## Development\n\nnpm run dev`,
      agents: `# AGENTS.md (ui-tui)\n\n- Run tests with npm test.\n- Keep components pure; stores live in src/app.\n\n${pub.pointer}`,
      model: M.roadmapYaml(S.roadmap),
    };
  }
  function renderEditor() {
    const docs = genDocs();
    const hashes = { readme: M.hash(docs.readme), agents: M.hash(docs.agents), model: M.hash(docs.model), curated: M.hash(JSON.stringify(S.curatedStatus) + S.adopted) };
    for (const k in hashes) if (S.seenHash[k] === undefined) S.seenHash[k] = hashes[k];
    if (S.etab !== 'file') S.seenHash[S.etab] = hashes[S.etab];
    const tabs = [['file', base(S.file)], ['readme', 'README.md'], ['agents', 'AGENTS.md'], ['model', '.mole/model/roadmap.yaml'], ['curated', 'docs/tui-overview.md']];
    $('#etabs').innerHTML = tabs.map(([k, l]) => `<button data-etab="${k}" class="${S.etab === k ? 'on' : ''}">${esc(l)}${k !== 'file' && S.seenHash[k] !== hashes[k] ? '<span class="dot" title="updated by Mole since you last opened it">●</span>' : ''}</button>`).join('');
    const code = $('#code');
    if (S.etab === 'file') {
      $('#ecrumbs').textContent = S.file.split('/').join(' › ');
      const f = G.files[S.file];
      if (!f.text) { code.innerHTML = `<div class="note">${f.test ? 'Test file: source not embedded in the prototype (index policy shows tests only when "exclude tests" is off).' : 'No source embedded.'}</div>`; return; }
      const lines = f.text.split('\n');
      const lens = {};
      f.symbols.forEach((sid) => { const s = G.symbols[sid]; if (s.kind === 'module' || s.kind === 'method') return; const c = (G.symIn.get(sid) || []).length; const o = (G.symOut.get(sid) || []).length; if (c || o) lens[s.line] = { sid, c, o }; });
      const driftLines = new Set(M.driftForFile(D, S.file).filter((v) => v.from === S.file && !v.sim).map((v) => v.line));
      const inserts = [];
      EV.slice(0, S.step + 1).forEach((e) => { if (e.effect && e.effect.insert && e.effect.insert.file === S.file) inserts.push({ ...e.effect.insert, agent: e.agent }); });
      const html = [];
      lines.forEach((ln, i) => {
        const n = i + 1;
        if (lens[n]) html.push(`<div class="lens" data-sym="${esc(lens[n].sid)}">◖ mole · ${lens[n].c} caller${lens[n].c === 1 ? '' : 's'} · calls ${lens[n].o} · dig</div>`);
        inserts.filter((x) => x.line === n).forEach((x) => html.push(`<div class="ln drift" title="agent ${x.agent} edit (simulated)"><span class="no">+</span><span style="color:#ffcf9c">${esc(x.text)}   // ← agent ${esc(x.agent)} (simulated), new drift R1</span></div>`));
        html.push(`<div class="ln${S.hl === n ? ' hl' : ''}${driftLines.has(n) ? ' drift' : ''}" data-l="${n}"><span class="no">${n}</span><span>${esc(ln) || ' '}</span></div>`);
      });
      code.innerHTML = html.join('');
      if (S.hl) { const el = code.querySelector(`.ln[data-l="${S.hl}"]`); if (el) el.scrollIntoView({ block: 'center' }); }
      else code.scrollTop = 0;
      return;
    }
    if (S.etab === 'curated') { renderCurated(code); return; }
    const titles = { readme: 'README.md · the mole:diagram block is generated from .mole/model', agents: 'AGENTS.md · ≤10-line pointer block generated for agents', model: '.mole/model/roadmap.yaml · the one source; sidebar edits write here' };
    $('#ecrumbs').textContent = titles[S.etab];
    const stale = S.cfg.propagate === 'manual' && S.published.hash !== modelHash();
    code.innerHTML = (stale && S.etab !== 'model' ? `<div class="note" style="color:#e3c06d">⚠ out of date vs model ${modelHash()} (published ${S.published.hash}). propagate=manual → <button class="ib" data-act="sync">run mole sync</button></div>` : '') + `<pre class="gen">${esc(docs[S.etab])}</pre>`;
  }

  function renderCurated(code) {
    $('#ecrumbs').textContent = `${SAMPLE.curated.path} · ${SAMPLE.curated.title} · SAMPLE input`;
    const nodes = curatedNodes();
    const counts = nodes.reduce((m, n) => ((m[n.status] = (m[n.status] || 0) + 1), m), {});
    const rows = nodes.map((n) => {
      let act = '';
      if (n.status === 'inferred') act = `<button class="ib" data-accept="${esc(n.id)}" data-anchor="${esc(n.anchor)}">accept</button>`;
      if (n.status === 'ambiguous') act = n.candidates.map((c) => `<button class="ib" data-accept="${esc(n.id)}" data-anchor="${esc(c)}">${esc(c)}</button>`).join(' ');
      if (n.status === 'unanchored') act = '<span style="color:#8b8d93">shown as unanchored note</span>';
      const color = { accepted: '#92cf86', inferred: '#e3c06d', ambiguous: '#ef8b8b', unanchored: '#8b8d93' }[n.status];
      return `<tr><td>${esc(n.label)}</td><td style="color:${color}">${n.status}</td><td><code>${esc(n.anchor || '—')}</code></td><td style="color:#8b8d93">${esc(n.how)}</td><td>${act}</td></tr>`;
    }).join('');
    code.innerHTML = `<div style="padding:12px 16px;font-family:-apple-system,sans-serif;color:#d6d6d6">
      <div style="color:#8b8d93;margin-bottom:6px">Existing team diagram (hand-drawn Mermaid). Mole's importer parses the labels and suggests anchors by name match. <b>Inferred until a human accepts</b>; nothing is redrawn. <span class="tag sim">SAMPLE diagram</span> <span class="tag real">REAL matcher</span></div>
      <pre class="gen" style="background:#17181b;border-radius:6px">\`\`\`mermaid\n${esc(SAMPLE.curated.mermaid)}\n\`\`\`</pre>
      <div style="margin:10px 0 4px"><b>Anchors</b> · ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(' · ')} <span style="margin-left:10px"><button class="ib" data-act="adopt">${S.adopted ? '✓ adopted as managed block' : 'adopt → managed mole:diagram block (S1.5)'}</button></span></div>
      <table style="width:100%;border-collapse:collapse;font-size:12px" class="anch"><tr style="color:#8b8d93;text-align:left"><th>diagram node</th><th>status</th><th>anchor</th><th>how matched</th><th></th></tr>${rows}</table>
      <div style="color:#8b8d93;margin-top:8px">Anchored files show ◆ in the explorer and on the map. Renames re-anchor via git -M / onDidRenameFiles (plan S1.5, not in prototype).</div></div>`;
  }

  // ----- mole sidebar -----
  const W = 326;
  function renderMole(t0) {
    const R = S.roadmap; const f = S.file; const L = S.cfg.layers;
    const box = M.boxOf(R, f); const gid = M.groupOf(G, L.roadmap ? R : null, f);
    const crumbs = [`<a data-level="map">${esc(SAMPLE.repoLabel.split('/').pop())}</a>`, `<a data-level="map" data-box="${esc(gid)}">${esc(M.groupLabel(G, L.roadmap ? R : null, gid))}</a>`, S.level === 'map' ? null : `<a data-level="file">${esc(base(f))}</a>`, S.level === 'symbol' && S.sym ? `<span>${esc(G.symbols[S.sym].name)}</span>` : null, S.level === 'path' ? '<span>path</span>' : null].filter(Boolean);
    const dv = M.driftForFile(D, f);
    const cur = curatedFor(f);
    const N = M.neighbourhood(G, f, S.cfg, L.roadmap ? R : null, D);
    const changedN = S.prevViewed === undefined ? [] : [...N.incoming, ...N.outgoing].filter((x) => ACT.editStep[x.file] !== undefined && ACT.editStep[x.file] > S.prevViewed);
    const acts = Object.keys(ACT.byFile[f] || {});
    // layers appear only when they exist for the open file (offerings.json layers_rule, PROPOSED)
    const layerHas = { current: true, roadmap: !!M.boxOf(R, f), curated: cur.length > 0, activity: S.step >= 0 && Object.keys(ACT.byFile).length > 0 };
    const badges = [
      dv.length ? `<span class="pb d" title="forbidden edges touching this file">⚠ drift here · ${dv.length}</span>` : '',
      cur.length && L.curated ? `<span class="pb c" title="${esc(cur.map((n) => n.label).join(', '))}">◆ in ${esc(SAMPLE.curated.path)}</span>` : '',
      changedN.length ? `<span class="pb ch">↻ ${changedN.length} neighbour${changedN.length > 1 ? 's' : ''} changed since you last looked</span>` : '',
      acts.length && L.activity ? `<span class="pb a">✎ agents: ${acts.map((a) => `${a} ${ACT.byFile[f][a]}`).join(', ')}</span>` : '',
      box && L.roadmap && R.boxes.find((b) => b.id === box).status === 'inferred' ? '<span class="pb">roadmap box inferred (not accepted)</span>' : '',
    ].join('');
    let canvas = ''; let detail = '';
    if (S.level === 'map') ({ canvas, detail } = moleMapLevel(W));
    else if (S.level === 'symbol' && S.sym) ({ canvas, detail } = moleSymbolLevel(W));
    else if (S.level === 'path') ({ canvas, detail } = molePathLevel(W));
    else ({ canvas, detail } = moleFileLevel(W, N, dv, changedN));
    const ms = performance.now() - t0;
    S.renders.push(ms); if (S.renders.length > 200) S.renders.shift();
    const sorted = S.renders.slice().sort((a, b) => a - b); const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
    $('#mole').innerHTML = `
      <div class="mh"><b>MOLE</b><span class="st">@${esc(DATA.commit)} · ${S.roadmapMode === 'bootstrap' ? 'draft roadmap' : 'roadmap ' + modelHash()}</span><button class="ib" data-act="full" title="open full view">⤢ full</button></div>
      <div class="bc">${crumbs.join(' › ')}</div>
      <div class="chips">${['current', 'roadmap', 'curated', 'activity'].map((k) => { const has = layerHas[k]; return `<button class="ib${L[k] && has ? ' on' : ''}" data-layer="${k}" ${has ? '' : 'disabled style="opacity:.35;cursor:default"'} title="${has ? 'toggle layer' : 'no ' + k + ' layer for this file (layers appear only where they exist)'}">${k}</button>`; }).join('')}
        <button class="ib${S.level === 'map' ? ' on' : ''}" data-level="map">map</button><button class="ib${S.level === 'file' ? ' on' : ''}" data-level="file">file</button><button class="ib${S.level === 'path' ? ' on' : ''}" data-level="path">path</button></div>
      <div class="badges">${badges}</div>
      <div class="canvas">${canvas}</div>
      ${detail}
      ${S.editOpen ? roadmapEditor() : ''}
      <div class="foot">rendered in ${ms.toFixed(1)} ms · p95 ${p95.toFixed(1)} ms over ${S.renders.length} renders · 0 LLM calls · 0 tokens · debounce ${S.cfg.debounceMs} ms${S.skipped ? ` · ${S.skipped} quick-switch renders skipped` : ''}
        <div style="margin-top:5px"><button class="ib" data-act="walk">▶ walk 10 files</button> <span style="color:#6f7177">↑/↓ in the explorer also works</span></div></div>`;
  }

  // shared neighbourhood renderer (file + symbol level)
  function nbSVG(o) {
    const pad = 4, gut = 14, x0 = pad + gut, x1 = o.width - pad - gut, gw = x1 - x0;
    const cols = o.width >= 600 ? 3 : 2, ph = 20, pg = 5, pw = (gw - 12 - (cols - 1) * 6) / cols;
    const maxCh = Math.floor((pw - 18) / 6.1);
    const parts = []; const back = []; let y = pad;
    const order = o.groupOrder;
    const grouped = (items) => { const m = new Map(); items.forEach((it) => { (m.get(it.group) || m.set(it.group, []).get(it.group)).push(it); }); return m; };
    const sec = (items, more, label, side) => {
      const gm = grouped(items); const ys = [];
      parts.push(`<text x="${x0}" y="${y + 11}" font-size="10" fill="#8b8d93" letter-spacing=".06em">${esc(label)}</text>`); y += 16;
      const gids = order.filter((g) => gm.has(g) || (more && more[g]));
      if (!gids.length) { parts.push(`<text x="${x0 + 6}" y="${y + 12}" font-size="11" fill="#6f7177">${esc(side === 'in' ? (o.emptyIn || 'nothing in this repo uses it (entry point or unused)') : (o.emptyOut || 'uses nothing inside the repo'))}</text>`); y += 22; return ys; }
      for (const g of gids) {
        const items2 = (gm.get(g) || []).slice().sort((a, b) => a.label.localeCompare(b.label));
        const extra = more && more[g] ? 1 : 0;
        const rows = Math.ceil((items2.length + extra) / cols);
        const bh = 18 + rows * (ph + pg) + 2;
        const isBox = o.isBox(g);
        const st = o.groupStatus(g);
        back.push(`<rect x="${x0}" y="${y}" width="${gw}" height="${bh}" rx="6" fill="${isBox ? 'rgba(227,160,109,.05)' : 'rgba(255,255,255,.03)'}" stroke="${isBox ? (st === 'inferred' ? '#8a6a3c' : '#6d5a48') : '#3a3c42'}" stroke-dasharray="${isBox ? '4 3' : ''}"/>`);
        parts.push(`<text x="${x0 + 7}" y="${y + 12}" font-size="10.5" fill="${isBox ? '#e3a06d' : '#9a9ca3'}">${esc(o.groupLabel(g))}${isBox && st === 'inferred' ? ' · inferred' : ''}</text>`);
        items2.forEach((it, i) => {
          const c = i % cols, r = Math.floor(i / cols); const px = x0 + 6 + c * (pw + 6), py = y + 17 + r * (ph + pg);
          const fl = it.flags || {};
          const stroke = fl.drift ? '#ef6b6b' : fl.sim ? '#e0864a' : fl.typeOnly ? '#4a4c52' : '#3f4148';
          let lbl = (fl.drift ? '⚠ ' : '') + it.label; if (lbl.length > maxCh) lbl = lbl.slice(0, maxCh - 1) + '…';
          const dots = (fl.act || []).map((col, k) => `<circle cx="${px + 6 + k * 5}" cy="${py + 4}" r="2.3" fill="${col}"/>`).join('');
          parts.push(`<g class="pill" ${it.attrs}><title>${esc(it.title)}</title><rect class="p" x="${px}" y="${py}" width="${pw}" height="${ph}" rx="4" fill="${fl.drift ? '#3a2324' : '#2b2d33'}" stroke="${stroke}" stroke-dasharray="${fl.sim || fl.typeOnly ? '3 2' : ''}"/>${dots}<text x="${px + 7}" y="${py + 14}" font-size="11" fill="${fl.typeOnly ? '#8b8d93' : '#dcdde0'}">${esc(lbl)}</text>${fl.curated ? `<text x="${px + pw - 20}" y="${py + 14}" font-size="10" fill="#6ea8ef">◆</text>` : ''}${fl.changed ? `<text x="${px + pw - 10}" y="${py + 14}" font-size="10" fill="#e3b341">↻</text>` : ''}</g>`);
        });
        if (extra) { const i = items2.length; const c = i % cols, r = Math.floor(i / cols); const px = x0 + 6 + c * (pw + 6), py = y + 17 + r * (ph + pg); parts.push(`<text x="${px + 6}" y="${py + 14}" font-size="10.5" fill="#8b8d93">+${more[g]} more</text>`); }
        const midY = y + bh / 2; ys.push({ y: midY, bad: items2.some((it) => it.flags && it.flags.drift), sim: items2.some((it) => it.flags && it.flags.sim) });
        y += bh + 6;
      }
      return ys;
    };
    const inYs = sec(o.incoming, o.moreIn, o.labelIn, 'in');
    y += 2; const fy = y; const chips = o.focus.chips || []; const fh = 40 + (chips.length ? 24 : 0);
    parts.push(`<g id="focusnode"><rect x="${x0}" y="${fy}" width="${gw}" height="${fh}" rx="7" fill="#2f3646" stroke="#5a77a3" stroke-width="1.5"/><text x="${x0 + 9}" y="${fy + 17}" font-size="12.5" font-weight="700" fill="#fff">${esc(o.focus.title)}</text><text x="${x0 + 9}" y="${fy + 32}" font-size="10.5" fill="#a9b6cc">${esc(o.focus.sub)}</text>`);
    let cx = x0 + 9;
    chips.forEach((ch) => { const w = Math.min(gw - 20, ch.label.length * 6.2 + 12); if (cx + w > x1 - 6) return; parts.push(`<g class="pill" ${ch.attrs}><title>${esc(ch.title || ch.label)}</title><rect class="p" x="${cx}" y="${fy + 40}" width="${w}" height="18" rx="9" fill="#3a4357" stroke="#566583"/><text x="${cx + 6}" y="${fy + 53}" font-size="10.5" fill="#dfe6f3">${esc(ch.label)}</text></g>`); cx += w + 5; });
    parts.push('</g>');
    const fmid = fy + fh / 2; y = fy + fh + 8;
    const outYs = sec(o.outgoing, o.moreOut, o.labelOut, 'out');
    // spines: left = used-by → focus, right = focus → uses
    const sx = pad + gut / 2, rx = o.width - pad - gut / 2;
    const arrow = (x, yy, dir, col) => `<path d="M${x} ${yy} l${dir * -5} -3.5 l0 7 z" fill="${col}"/>`;
    if (inYs.length) {
      back.push(`<path d="M${sx} ${inYs[0].y} L${sx} ${fmid} L${x0 - 1} ${fmid}" fill="none" stroke="#5c6475" stroke-width="1.4"/>` + arrow(x0 - 1, fmid, 1, '#5c6475'));
      inYs.forEach((t) => back.push(`<path d="M${x0} ${t.y} L${sx} ${t.y}" stroke="${t.bad ? '#ef6b6b' : t.sim ? '#e0864a' : '#5c6475'}" stroke-width="${t.bad ? 2 : 1.4}"/>`));
    }
    if (outYs.length) {
      back.push(`<path d="M${x1 + 1} ${fmid} L${rx} ${fmid} L${rx} ${outYs[outYs.length - 1].y}" fill="none" stroke="#5c6475" stroke-width="1.4"/>`);
      outYs.forEach((t) => back.push(`<path d="M${rx} ${t.y} L${x1 + 1} ${t.y}" stroke="${t.bad ? '#ef6b6b' : t.sim ? '#e0864a' : '#5c6475'}" stroke-width="${t.bad ? 2 : 1.4}"/>` + arrow(x1 + 1, t.y, -1, t.bad ? '#ef6b6b' : '#5c6475')));
    }
    return `<svg width="${o.width}" height="${y + 2}" viewBox="0 0 ${o.width} ${y + 2}">${back.join('')}${parts.join('')}</svg>`;
  }
  const groupCtx = () => { const R = S.cfg.layers.roadmap ? S.roadmap : null; return { R, groupOrder: M.groupOrder(G, R), isBox: (g) => !!R && !g.startsWith('mod:'), groupLabel: (g) => M.groupLabel(G, R, g), groupStatus: (g) => { const b = R && M.boxById(R, g); return b ? b.status : ''; } }; };

  function fileItems(list, side, dv, changedN) {
    const L = S.cfg.layers; const { R } = groupCtx();
    const chSet = new Set(changedN.map((x) => x.file));
    return list.map((x) => {
      const e = x.edge; const other = x.file;
      const drift = dv.some((v) => (side === 'in' ? v.from === other && v.to === S.file : v.from === S.file && v.to === other));
      return {
        label: base(other), group: M.groupOf(G, R, other),
        title: `${other}\n${side === 'in' ? 'uses this file' : 'used by this file'}: ${e.imports} import${e.imports === 1 ? '' : 's'}${e.importLine ? ' (line ' + e.importLine + ')' : ''}, ${e.calls} call${e.calls === 1 ? '' : 's'}${e.typeOnly ? ' · type-only' : ''}${e.sim ? ' · added by agent (simulated)' : ''}${drift ? ' · DRIFT' : ''}`,
        attrs: `data-file="${esc(other)}"`,
        flags: { drift, sim: e.sim, typeOnly: e.typeOnly, act: L.activity ? actColors(other) : [], curated: L.curated && curatedFile(other), changed: chSet.has(other) },
      };
    });
  }
  function moleFileLevel(width, N, dv, changedN) {
    const ctx = groupCtx(); const f = G.files[S.file];
    const syms = f.symbols.map((s) => G.symbols[s]).filter((s) => s.kind !== 'module').map((s) => ({ s, c: (G.symIn.get(s.id) || []).length })).sort((a, b) => b.c - a.c || a.s.line - b.s.line);
    const svg = nbSVG({
      width, ...ctx, incoming: fileItems(N.incoming, 'in', dv, changedN), outgoing: fileItems(N.outgoing, 'out', dv, changedN), moreIn: N.moreIn, moreOut: N.moreOut,
      labelIn: `USED BY (${N.totalIn})`, labelOut: `USES (${N.totalOut})`,
      focus: { title: base(S.file), sub: `${ctx.groupLabel(M.groupOf(G, ctx.R, S.file))} · ${syms.length} symbols · ${f.lines} lines`, chips: syms.slice(0, 4).map(({ s, c }) => ({ label: `${s.name} · ${c}`, title: `${s.kind} ${s.name}, ${c} callers · dig`, attrs: `data-sym="${esc(s.id)}"` })) },
    });
    const R = S.roadmap; const box = M.boxOf(R, S.file);
    const intended = box && S.cfg.layers.roadmap ? R.edges.filter((e) => e.from === box).map((e) => (M.boxById(R, e.to) || {}).label + (e.status === 'planned' ? ' (planned)' : '')) : [];
    const forbidden = box && S.cfg.layers.roadmap ? R.rules.filter((r) => r.from === box).map((r) => `${r.id} ✕ ${(M.boxById(R, r.to) || {}).label}`) : [];
    const detail = `
      ${S.cfg.layers.roadmap && box ? `<div class="sec"><h5>ROADMAP FOR ${esc((M.boxById(R, box) || {}).label.toUpperCase())}</h5><div style="color:#b9bbc0">may use: ${esc(intended.join(' · ') || '—')}</div>${forbidden.length ? `<div style="color:#d9a1a1">forbidden: ${esc(forbidden.join(' · '))}</div>` : ''}</div>` : ''}
      <div class="sec" id="drifthere"><h5>DRIFT ON THIS FILE (${dv.length})</h5>${dv.length ? dv.map((v) => `<div class="dv" data-open="${esc(v.from)}" data-line="${v.line}">${esc(v.rule)} · ${esc(base(v.from))}:${v.line} → ${esc(base(v.to))}${v.sim ? ' <span style="color:#e0864a">(agent edit)</span>' : ''}<small>${esc(v.why)} · ${esc((M.boxById(R, v.boxes[0]) || {}).label)} → ${esc((M.boxById(R, v.boxes[1]) || {}).label)}</small></div>`).join('') : '<div style="color:#8b8d93">none · test-only and type-only imports are ignored by the drift rule</div>'}</div>
      <div class="sec"><h5>SYMBOLS (${syms.length})</h5>${syms.slice(0, 8).map(({ s, c }) => `<div class="li" data-sym="${esc(s.id)}"><span class="k">${esc(s.kind)}</span><span class="nm">${esc(s.name)}</span><span class="r">${c} callers · :${s.line}</span></div>`).join('')}${syms.length > 8 ? `<div style="color:#6f7177">+${syms.length - 8} more</div>` : ''}</div>
      <div class="sec"><h5>DIG</h5><div class="actions">
        ${syms[0] ? `<button class="ib" data-sym="${esc(syms[0].s.id)}" data-impact="1">what breaks if I change ${esc(syms[0].s.name)}?</button>` : ''}
        <button class="ib" data-level="path">path to…</button>
        ${S.cfg.explain !== 'off' ? `<button class="ib" data-explain="${esc(S.file)}">explain</button>` : ''}
        <button class="ib${S.editOpen ? ' on' : ''}" data-act="edit">edit roadmap</button></div>
        ${S.explainFor ? explainCard() : ''}</div>`;
    return { canvas: svg, detail };
  }

  function moleSymbolLevel(width) {
    const ctx = groupCtx(); const s = G.symbols[S.sym];
    const vis = (sid) => M.visibleFile(G, G.symbols[sid].file, S.cfg);
    const callers = (G.symIn.get(s.id) || []).filter((c) => vis(c.from));
    const callees = (G.symOut.get(s.id) || []).filter((c) => vis(c.to));
    const L = S.cfg.layers;
    const item = (sid, line, other) => { const t = G.symbols[sid]; return { label: t.name, group: M.groupOf(G, ctx.R, t.file), title: `${t.kind} ${t.name}\n${t.file}:${line}`, attrs: `data-sym="${esc(sid)}"`, flags: { act: L.activity ? actColors(t.file) : [], curated: L.curated && curatedFile(t.file), sim: false } }; };
    const cap = Math.max(4, Math.floor((S.cfg.maxNodes || 25) / 2));
    const more = (list, key) => { const m = {}; list.slice(cap).forEach((c) => { const g = M.groupOf(G, ctx.R, G.symbols[c[key]].file); m[g] = (m[g] || 0) + 1; }); return m; };
    const svg = nbSVG({
      width, ...ctx, incoming: callers.slice(0, cap).map((c) => item(c.from, c.line)), outgoing: callees.slice(0, cap).map((c) => item(c.to, G.symbols[c.to].line)),
      moreIn: more(callers, 'from'), moreOut: more(callees, 'to'), labelIn: `CALLED BY (${callers.length})`, labelOut: `CALLS (${callees.length})`, emptyIn: 'no callers inside the repo', emptyOut: 'calls nothing inside the repo',
      focus: { title: s.name, sub: `${s.kind} · ${base(s.file)}:${s.line}-${s.end} · body ${s.bodyHash}`, chips: [{ label: 'open source', attrs: `data-open="${esc(s.file)}" data-line="${s.line}"` }, { label: S.impactOn ? 'hide impact' : 'what breaks?', attrs: `data-impact="${S.impactOn ? 0 : 1}" data-sym="${esc(s.id)}"` }] },
    });
    let imp = '';
    if (S.impactOn) {
      const rows = M.impact(G, s.id, S.cfg, 3);
      const files = new Set(rows.map((r) => r.file)); const boxes = new Set(rows.map((r) => M.boxOf(S.roadmap, r.file)));
      imp = `<div class="sec" id="impact"><h5>WHAT BREAKS IF YOU CHANGE ${esc(s.name.toUpperCase())}</h5><div style="color:#dcdde0;margin-bottom:4px">${rows.length} callers (3 hops) in ${files.size} files across ${boxes.size} roadmap box${boxes.size === 1 ? '' : 'es'}</div>
        ${[1, 2, 3].map((d) => { const r = rows.filter((x) => x.depth === d); return r.length ? `<div style="color:#8b8d93;margin-top:4px">hop ${d} · ${r.length}</div>` + r.slice(0, d === 1 ? 12 : 6).map((x) => `<div class="li" data-open="${esc(x.file)}" data-line="${x.line}"><span class="nm">${esc(x.name)}</span><span class="r">${esc(base(x.file))}:${x.line}</span></div>`).join('') + (r.length > (d === 1 ? 12 : 6) ? `<div style="color:#6f7177">+${r.length - (d === 1 ? 12 : 6)} more</div>` : '') : ''; }).join('')}
        <div style="color:#6f7177;margin-top:4px">precise: type checker resolves aliases + re-exports (plan F0.1). Cross-check: VS Code call hierarchy.</div></div>`;
    }
    const detail = `${imp}<div class="sec"><h5>CALLERS (${callers.length})</h5>${callers.slice(0, 10).map((c) => `<div class="li" data-open="${esc(c.file)}" data-line="${c.line}"><span class="nm">${esc(G.symbols[c.from].name)}</span><span class="r">${esc(base(c.file))}:${c.line}${c.count > 1 ? ' ×' + c.count : ''}</span></div>`).join('') || '<div style="color:#8b8d93">no callers in the repo</div>'}</div>
      <div class="sec"><div class="actions"><button class="ib" data-level="file">← back to file</button>${S.cfg.explain !== 'off' ? `<button class="ib" data-explain="${esc(s.id)}">explain</button>` : ''}</div>${S.explainFor ? explainCard() : ''}</div>`;
    return { canvas: svg, detail };
  }

  function rectEdge(b, tx, ty) { const cx = b.x + b.w / 2, cy = b.y + b.h / 2; const dx = tx - cx, dy = ty - cy; const s = Math.min(Math.abs((b.w / 2) / (dx || 1e-6)), Math.abs((b.h / 2) / (dy || 1e-6))); return [cx + dx * s, cy + dy * s]; }
  function boxMapSVG(width, opts) {
    const R = opts.R; const gids = M.groupOrder(G, R);
    const cols = gids.length > 8 ? 3 : 2; const gap = 30, pad = 16; const bw = (width - pad * 2 - gap * (cols - 1)) / cols, bh = opts.bh || 52;
    const pos = {}; gids.forEach((g, i) => { pos[g] = { x: pad + (i % cols) * (bw + gap), y: 6 + Math.floor(i / cols) * (bh + gap), w: bw, h: bh, c: i % cols, r: Math.floor(i / cols) }; });
    const H = 12 + Math.ceil(gids.length / cols) * (bh + gap) - gap;
    const back = []; const front = [];
    const head = (x, y, ang, col) => `<path d="M${x} ${y} l${-7 * Math.cos(ang - 0.45)} ${-7 * Math.sin(ang - 0.45)} l${7 * Math.cos(ang - 0.45) - 7 * Math.cos(ang + 0.45)} ${7 * Math.sin(ang - 0.45) - 7 * Math.sin(ang + 0.45)} z" fill="${col}"/>`;
    const draw = (e) => {
      const A = pos[e.from], B = pos[e.to]; if (!A || !B) return;
      const layer = e.top ? front : back; const sw = e.w || 1.3; const dash = e.dash || '';
      let d, hx, hy, ang;
      if (A.c === B.c && Math.abs(A.r - B.r) > 1) {
        // same column, not adjacent: route around the outside so the line never hides behind a box
        const left = A.c === 0; const side = left ? A.x - 9 - (e.lane || 0) * 4 : A.x + A.w + 9 + (e.lane || 0) * 4;
        const ex = left ? A.x : A.x + A.w; const ay = A.y + A.h / 2 + (A.r < B.r ? 6 : -6), by = B.y + B.h / 2 + (A.r < B.r ? -6 : 6);
        d = `M${ex} ${ay} L${side} ${ay} L${side} ${by} L${ex} ${by}`; hx = ex; hy = by; ang = left ? 0 : Math.PI;
      } else {
        const off = e.from < e.to ? 4 : -4;
        const [x1, y1] = rectEdge(A, B.x + B.w / 2, B.y + B.h / 2); const [x2, y2] = rectEdge(B, A.x + A.w / 2, A.y + A.h / 2);
        const nx = -(y2 - y1), ny = x2 - x1, nl = Math.hypot(nx, ny) || 1; const ox = (nx / nl) * off, oy = (ny / nl) * off;
        d = `M${x1 + ox} ${y1 + oy} L${x2 + ox} ${y2 + oy}`; hx = x2 + ox; hy = y2 + oy; ang = Math.atan2(y2 - y1, x2 - x1);
      }
      layer.push(`<g><title>${esc(e.label || '')}</title><path d="${d}" fill="none" stroke="${e.col}" stroke-width="${sw}" stroke-dasharray="${dash}"/>${head(hx, hy, ang, e.col)}</g>`);
    };
    opts.edges.forEach(draw);
    const boxes = gids.map((g) => {
      const p = pos[g]; const b = R && M.boxById(R, g); const c = opts.content(g, p);
      return `<g class="pill" data-box="${esc(g)}" ${opts.boxAttrs ? opts.boxAttrs(g) : ''}><title>${esc(b ? b.note || b.label : g)}</title><rect class="p" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="7" fill="${opts.fill(g)}" stroke="${opts.stroke(g)}" stroke-width="${opts.focus === g ? 2 : 1}" stroke-dasharray="${b && b.status === 'inferred' ? '4 3' : ''}"/>
        <text x="${p.x + 8}" y="${p.y + 16}" font-size="11.5" font-weight="600" fill="#e8e8ea">${esc(M.groupLabel(G, R, g))}</text>${c}</g>`;
    }).join('');
    return { svg: `<svg width="${width}" height="${H}" viewBox="0 0 ${width} ${H}">${back.join('')}${boxes}${front.join('')}</svg>`, pos };
  }
  function groupEdges(R) {
    const agg = new Map();
    for (const e of G.fileEdges) {
      if (!M.visibleFile(G, e.from, S.cfg) || !M.visibleFile(G, e.to, S.cfg) || e.typeOnly) continue;
      const a = M.groupOf(G, R, e.from), b = M.groupOf(G, R, e.to); if (a === b) continue;
      const k = a + '>' + b; agg.set(k, (agg.get(k) || 0) + 1);
    }
    return agg;
  }
  function moleMapLevel(width) {
    const R = S.cfg.layers.roadmap ? S.roadmap : null; const focus = M.groupOf(G, R, S.file); const sel = S.box || focus;
    const agg = groupEdges(R); const viol = new Set(D.violations.map((v) => v.boxes.join('>')));
    const edges = [];
    for (const [k, n] of agg) {
      const [a, b] = k.split('>'); const bad = R && viol.has(k);
      if (!bad && a !== sel && b !== sel) continue;
      const intended = R && R.edges.some((e) => e.from === a && e.to === b);
      edges.push({ from: a, to: b, top: bad, lane: bad ? 1 : 0, col: bad ? '#ef6b6b' : intended ? '#6b7385' : '#4a4c52', dash: intended || bad || !R ? '' : '2 3', w: bad ? 2 : Math.min(3, 0.8 + n / 25), label: `${M.groupLabel(G, R, a)} → ${M.groupLabel(G, R, b)}: ${n} file edges${bad ? ' · DRIFT' : intended ? ' · intended' : R ? ' · not in roadmap' : ''}` });
    }
    if (R) R.edges.filter((e) => e.status === 'planned' && !agg.has(e.from + '>' + e.to)).forEach((e) => edges.push({ from: e.from, to: e.to, col: '#6ea8ef', dash: '5 4', label: 'planned (not built yet, never flagged)' }));
    const filesIn = (g) => visibleFiles().filter((f) => M.groupOf(G, R, f) === g);
    const { svg } = boxMapSVG(width, {
      R, edges, focus: sel, bh: 50,
      fill: (g) => (g === focus ? '#2f3646' : '#26272c'), stroke: (g) => (g === sel ? '#7d9bd0' : viol.size && [...viol].some((k) => k.startsWith(g + '>')) ? '#8a4a4a' : '#44464d'),
      content: (g, p) => { const n = filesIn(g).length; const dvn = D.violations.filter((v) => v.boxes[0] === g).length; const b = R && M.boxById(R, g); return `<text x="${p.x + 8}" y="${p.y + 31}" font-size="10.5" fill="${dvn ? '#ef9b9b' : '#9a9ca3'}">${n} files${b ? ' · ' + b.status : ''}${dvn ? ' · ⚠' + dvn : ''}</text>${g === focus ? `<text x="${p.x + 8}" y="${p.y + 44}" font-size="10" fill="#9fc1ef">● you are here</text>` : ''}`; },
    });
    const list = filesIn(sel).map((f) => ({ f, d: (G.fileIn.get(f) || []).length })).sort((a, b) => b.d - a.d);
    const detail = `<div class="sec"><h5>${esc(M.groupLabel(G, R, sel).toUpperCase())} · ${list.length} FILES (most used first)</h5>${list.slice(0, 14).map((x) => `<div class="li" data-file="${esc(x.f)}"><span class="nm">${esc(x.f.replace(DATA.src + '/', ''))}</span><span class="r">used by ${x.d}${M.driftForFile(D, x.f).length ? ' · ⚠' : ''}</span></div>`).join('')}${list.length > 14 ? `<div style="color:#6f7177">+${list.length - 14} more</div>` : ''}</div>
      <div class="sec"><h5>ROADMAP</h5>${S.roadmapMode === 'bootstrap'
        ? `<div style="color:#e3c06d">Draft from directory boundaries + observed edges (S1.10): ${S.roadmap.boxes.length} inferred boxes, ${S.roadmap.edges.length} inferred edges, no rules yet. A lead reviews once.</div><div class="actions" style="margin-top:6px"><button class="ib" data-act="acceptroadmap">accept sample lead review (6 boxes, R1-R5)</button></div>`
        : `<div style="color:#b9bbc0">${S.roadmap.boxes.length} boxes · ${S.roadmap.edges.length} edges · ${S.roadmap.rules.length} rules · drift ${D.violations.length} · planned ${D.planned.length}</div><div style="color:#6f7177">line: intended · dotted: in code, not in roadmap · red: forbidden (drift) · blue dashed: planned</div><div class="actions" style="margin-top:6px"><button class="ib" data-act="bootstrap">bootstrap a draft (repo with no diagrams)</button><button class="ib" data-act="edit">edit roadmap</button></div>`}</div>`;
    return { canvas: svg, detail };
  }

  function molePathLevel(width) {
    const files = visibleFiles();
    const target = S.pathTo && G.files[S.pathTo] ? S.pathTo : '';
    let svg = `<div style="color:#8b8d93;padding:6px">Pick a target: Mole finds the shortest import/call chain from <b>${esc(base(S.file))}</b>.</div>`;
    let info = '';
    if (target) {
      const p = M.pathBetween(G, S.file, target, S.cfg);
      if (!p) svg = `<div style="color:#e3c06d;padding:6px">No path from ${esc(base(S.file))} to ${esc(base(target))} (direction matters: try the reverse).</div>`;
      else {
        const h = p.length * 40 + 6; const parts = [];
        p.forEach((st, i) => { const y = 4 + i * 40; parts.push(`<g class="pill" data-file="${esc(st.file)}"><title>${esc(st.file)}</title><rect class="p" x="20" y="${y}" width="${width - 40}" height="24" rx="5" fill="${i === 0 || i === p.length - 1 ? '#2f3646' : '#2b2d33'}" stroke="#4a5160"/><text x="30" y="${y + 16}" font-size="11.5" fill="#e5e6e8">${esc(st.file.replace(DATA.src + '/', ''))}</text></g>`); if (i < p.length - 1) { const e = p[i + 1].edge; parts.push(`<path d="M${width / 2} ${y + 25} L${width / 2} ${y + 38}" stroke="#6b7385"/><text x="${width / 2 + 6}" y="${y + 35}" font-size="9.5" fill="#8b8d93">${e.imports ? 'imports' + (e.importLine ? ' :' + e.importLine : '') : ''}${e.calls ? ' · ' + e.calls + ' calls' : ''}</text>`); } });
        svg = `<svg width="${width}" height="${h}">${parts.join('')}</svg>`;
        info = `${p.length - 1} hop${p.length === 2 ? '' : 's'}`;
      }
    }
    const detail = `<div class="sec"><h5>PATH TO</h5><input list="pathfiles" id="pathto" value="${esc(target)}" placeholder="type a file…" style="width:100%"><datalist id="pathfiles">${files.map((f) => `<option value="${esc(f)}">`).join('')}</datalist>
      <div class="actions" style="margin-top:6px"><button class="ib" data-path="src/gatewayClient.ts">→ gatewayClient.ts</button><button class="ib" data-path="src/i18n/runtime.ts">→ i18n/runtime.ts</button><button class="ib" data-level="file">← back</button></div><div style="color:#8b8d93;margin-top:4px">${info}</div></div>`;
    return { canvas: svg, detail };
  }

  function explainCard() {
    const id = S.explainFor; const isSym = !!G.symbols[id]; const f = isSym ? G.symbols[id].file : id;
    if (!S.cfg.consent) return `<div class="card" id="explain"><div class="lbl">CONSENT NEEDED (B8)</div>Send ${isSym ? 'this symbol body (' + (G.symbols[id].end - G.symbols[id].line + 1) + ' lines)' : 'this file outline'} to <b>vscode.lm</b> (your existing Copilot/Claude entitlement, no key)? Code leaves the machine only with per-repo consent.<div class="actions" style="margin-top:6px"><button class="ib on" data-act="consent">allow for this repo</button><button class="ib" data-act="noexplain">cancel</button></div></div>`;
    const syms = isSym ? [G.symbols[id]] : G.files[f].symbols.map((s) => G.symbols[s]).filter((s) => s.exported);
    const callees = new Set(); syms.forEach((s) => (G.symOut.get(s.id) || []).forEach((c) => callees.add(c.to)));
    const key = M.hash(syms.map((s) => s.bodyHash).join('') + [...callees].map((c) => G.symbols[c].bodyHash).join('') + 'prompt-v1');
    const staleBy = [...callees].map((c) => G.symbols[c].file).filter((cf) => ACT.editStep[cf] !== undefined);
    const N = M.neighbourhood(G, f, S.cfg, S.roadmap);
    const box = M.boxById(S.roadmap, M.boxOf(S.roadmap, f));
    return `<div class="card" id="explain"><div class="lbl">EXPLANATION · INFERRED · cache ${key}${staleBy.length ? ' · <span style="color:#ef8b8b">STALE: ' + esc(base(staleBy[0])) + ' changed</span>' : ''}</div>
      <div style="margin:4px 0"><b>${esc(isSym ? G.symbols[id].name : base(f))}</b> sits in <b>${esc(box ? box.label : G.files[f].module)}</b>. It is used by ${N.totalIn} file${N.totalIn === 1 ? '' : 's'} and uses ${N.totalOut}. ${syms.length} exported symbol${syms.length === 1 ? '' : 's'}: ${esc(syms.slice(0, 4).map((s) => s.name).join(', '))}${syms.length > 4 ? '…' : ''}.</div>
      <div style="color:#8b8d93">↑ structural facts are real. <span class="tag sim">SIMULATED</span> The LLM paragraph would go here (no model is called in the prototype). Cache key = body hash + 1-hop callee hashes + prompt version, so it is marked stale when a callee changes (S1.7).</div>
      <div class="actions" style="margin-top:6px"><button class="ib" data-act="noexplain">close</button></div></div>`;
  }

  function roadmapEditor() {
    const R = S.roadmap; const opts = R.boxes.map((b) => `<option value="${esc(b.id)}">${esc(b.label)}</option>`).join('');
    return `<div class="sec" id="roadmapedit"><h5>EDIT ROADMAP → .mole/model (S1.6)</h5>
      <div class="form"><span>rename</span><span><select id="rb">${opts}</select> <input id="rl" placeholder="new label" style="width:90px"> <button class="ib" data-act="rename">ok</button></span>
        <span>forbid</span><span><select id="ff">${opts}</select> ✕→ <select id="ft">${opts}</select> <button class="ib" data-act="forbid">add</button></span>
        <span>planned</span><span><select id="pf">${opts}</select> → <select id="pt">${opts}</select> <button class="ib" data-act="plan">add</button></span></div>
      <div style="margin-top:4px">${R.rules.map((r) => `<div class="li"><span class="k">${esc(r.id)}</span><span class="nm">${esc((M.boxById(R, r.from) || {}).label)} ✕→ ${esc((M.boxById(R, r.to) || {}).label)}</span><span class="r"><button class="ib" data-delrule="${esc(r.id)}">remove</button></span></div>`).join('')}</div>
      <div style="color:#8b8d93;margin-top:6px">One edit updates: this map · README.md block · AGENTS.md pointer · mole_roadmap for agents · CI mole check. Code is never edited; unmet roadmap edges become tasks. propagate = <b>${S.cfg.propagate}</b>${S.cfg.propagate === 'manual' ? ' <button class="ib" data-act="sync">mole sync</button>' : ''}</div></div>`;
  }

  // full view
  function openFull() {
    const N = M.neighbourhood(G, S.file, { ...S.cfg, maxNodes: Math.max(40, S.cfg.maxNodes) }, S.cfg.layers.roadmap ? S.roadmap : null, D);
    const dv = M.driftForFile(D, S.file);
    const res = S.level === 'map' ? moleMapLevel(820) : S.level === 'symbol' && S.sym ? moleSymbolLevel(820) : moleFileLevel(820, N, dv, []);
    const m = $('#modal'); m.classList.remove('hidden');
    m.innerHTML = `<div class="mbox" style="width:860px"><div class="mt"><b>MOLE · full view</b>&nbsp;<span style="color:#8b8d93">${esc(S.file)} · same model, editor-area panel (S1.3)</span><button class="ib" data-act="closemodal">close</button></div>${res.canvas}</div>`;
  }

  // walk demo + keyboard
  function walk() {
    const files = visibleFiles(); let i = Math.max(0, files.indexOf(S.file)); let n = 0;
    clearInterval(walk.t);
    walk.t = setInterval(() => { i = (i + 1) % files.length; S.file = files[i]; viewFile(S.file); S.level = 'file'; S.sym = null; S.hl = null; if (S.tab === 'vscode') renderVSCode(); if (++n >= 10) clearInterval(walk.t); }, 450);
  }
  let kbTimer = null;
  function keyNav(dir) {
    const files = visibleFiles(); let i = files.indexOf(S.file); i = Math.min(files.length - 1, Math.max(0, i + dir));
    S.file = files[i];
    // ensure parent dirs open
    const parts = S.file.split('/'); for (let k = 1; k < parts.length - 1; k++) S.openDirs.add(parts.slice(0, k + 1).join('/'));
    renderExplorer();
    const sel = $('#explorer .row.sel'); if (sel) sel.scrollIntoView({ block: 'nearest' });
    if (kbTimer) S.skipped++;
    clearTimeout(kbTimer);
    kbTimer = setTimeout(() => { kbTimer = null; viewFile(S.file); S.level = 'file'; S.sym = null; S.hl = null; const t0 = performance.now(); renderEditor(); renderMole(t0); }, S.cfg.debounceMs);
  }

  // ================= AGENT IN TERMINAL (stage 2) =================
  function replayCtl() {
    return `<div class="ctl"><button class="btn small" data-step="reset">⏮ reset</button><button class="btn small" data-step="-1">◀ back</button><button class="btn small primary" data-step="+1">next step ▶</button><button class="btn small" data-step="end">run to end ⏭</button><span class="pos">step ${S.step + 1} / ${EV.length}</span></div>`;
  }
  const atag = (id) => { const a = agentById[id]; return a ? `<span class="ag" style="background:${a.color}">${esc(a.id)}</span>` : ''; };
  function mapCost(target) {
    const N = M.neighbourhood(G, target, S.cfg, S.roadmap);
    const files = [...N.incoming.slice(0, 8), ...N.outgoing.slice(0, 8)].map((x) => x.file);
    const bytes = files.reduce((s, f) => s + G.files[f].bytes, 0);
    const text = M.moleMap(G, target, S.cfg, S.roadmap, D);
    return { text, mapBytes: new Blob([text]).size, files: files.length, fileBytes: bytes };
  }
  function evHtml(e, i) {
    const a = agentById[e.agent];
    const tc = (s) => `<div class="tc">${atag(e.agent)}⏺ ${s}</div>`;
    if (e.t === 'hook' && e.hook === 'SessionStart') { const txt = M.sessionStart(G, S.roadmap, S.cfg, D, null); return `<div class="hook">⎿ SessionStart:mole hook → additionalContext (${txt.length} chars, cap ${S.cfg.sessionStartCap})</div><div class="out box">${esc(txt)}</div>`; }
    if (e.t === 'hook' && e.hook === 'SubagentStart') return tc(`Task(${esc(a.name)}: "${esc(a.task)}")`) + `<div class="hook">⎿ SubagentStart:mole → lane ${esc(a.id)} registered · worktree ${esc(a.worktree)}</div>`;
    if (e.t === 'hook' && e.hook === 'SubagentStop') return `<div class="hook">⎿ SubagentStop:mole (${esc(a.id)}) → git-diff snapshot of ${esc(a.worktree)}: +1 file edited via Bash: src/components/thinking.tsx → activity + coverage updated</div>`;
    if (e.t === 'hook' && e.hook === 'Stop') {
      const nd = sessionDrift();
      const pre = D0.violations.length;
      if (!nd.length) return `<div class="hook">⎿ Stop:mole → no new drift this session (${pre} pre-existing items not repeated)</div>`;
      const items = nd.map((v) => `${v.rule} ${v.from}:${v.line} → ${v.to} (${v.why})`).join('\n  ');
      return S.cfg.guard === 'block'
        ? `<div class="hook bad">⎿ Stop:mole → {"decision":"block","reason":"this session added ${nd.length} forbidden edge${nd.length > 1 ? 's' : ''}:\n  ${esc(items)}\nmove the call or mole_propose a roadmap change"} · blocks once (stop_hook_active respected)</div>`
        : `<div class="hook warnc">⎿ Stop:mole (warn) → this session added ${nd.length} drift:\n  ${esc(items)}\n  ${pre} pre-existing items not repeated · open the agent panel to review</div>`;
    }
    if (e.tool === 'mole_map') { const c = mapCost(e.target); return tc(`mole · mole_map (MCP)(path: "${esc(e.target)}")`) + `<div class="out box">${esc(c.text)}</div><div class="out">⎿ ${c.mapBytes} B ≈ ${tok(c.mapBytes)} tokens · reading the ${c.files} files it points to instead: ${kb(c.fileBytes)} ≈ ${tok(c.fileBytes)} tokens <span class="tag sim" style="font-family:sans-serif">proxy</span></div>`; }
    if (e.tool === 'Read') { const f = G.files[e.target]; return tc(`Read(${esc(e.target)})`) + `<div class="out">⎿ ${e.range ? `Read lines ${e.range[0]}-${e.range[1]}` : `Read ${f.lines} lines`} <span style="color:#6f7177">· PostToolUse:mole records ${esc(e.level)} (async, no context injected)</span></div>`; }
    if (e.tool === 'Grep') { const h = grepHits(e); return tc(`Search(pattern: "${esc(e.pattern)}", path: "${esc(e.target.replace('/**', ''))}")`) + `<div class="out">⎿ Found ${h.length} files\n${h.map((x) => '   ' + esc(x)).join('\n')} <span style="color:#6f7177">· recorded as search-hit (not "read")</span></div>`; }
    if (e.t === 'deny') return tc(`Update(${esc(e.target)})`) + `<div class="out bad">⎿ PreToolUse:mole denied: .mole/model is read-only for agents. Use mole_propose(edit).</div>`;
    if (e.t === 'propose') { const p = e.proposal; const st = S.proposals[p.id] || 'pending'; return tc(`mole · mole_propose (MCP)(change: "${esc(p.change)}", reason: "${esc(p.reason)}")`) + `<div class="out">⎿ queued ${esc(p.id)} for human review · base hash ${modelHash()} · status: <b>${st}</b> <button class="go" data-go='${esc(JSON.stringify({ tab: 'panel', hi: '#props' }))}'>review in agent panel</button></div>`; }
    if (e.tool === 'Bash') return tc(`Bash(${esc(e.cmd)})`) + `<div class="out">⎿ (no output) <span style="color:#6f7177">· activity hook sees a Bash call, not which file changed → caught at SubagentStop snapshot</span></div>`;
    if (e.tool === 'Edit') {
      let h = tc(`Update(${esc(e.target)})`) + `<div class="out">⎿ ${esc(e.note || 'edited')}</div>`;
      if (e.effect && e.effect.insert) {
        h += `<div class="out add">   ${e.effect.insert.line} + ${esc(e.effect.insert.text)}</div>`;
        const nd = sessionDrift().filter((v) => v.from === e.target);
        h += nd.length ? `<div class="hook warnc">⎿ PostToolUse:mole → additionalContext: [mole] new drift ${esc(nd.map((v) => `${v.rule} ${v.from}:${v.line} → ${v.to} (${v.why})`).join('; '))}. Move the call or mole_propose a roadmap change.</div>` : '';
      } else h += '<div class="out" style="color:#6f7177">   PostToolUse:mole recorded edit · drift for this file unchanged → nothing injected</div>';
      return h;
    }
    return `<div class="out">${esc(JSON.stringify(e))}</div>`;
  }
  const STEP_INFO = (e) => {
    if (!e) return { id: '—', what: 'Press "next step". The user asks Claude Code for a fix; Mole is installed as one plugin (MCP server + hooks + skills).', why: 'One install, no hand-written CLAUDE.md rules (S2.1).' };
    if (e.hook === 'SessionStart') return { id: 'S2.3 SessionStart hook', what: 'Injects a short note: the map exists, use mole_map, roadmap is read-only, drift on files changed on this branch. Hard cap, counted in token totals.', why: 'Agents use the map without the user typing it, at a cost that is measured.' };
    if (e.tool === 'mole_map') return { id: 'S1.9 / S2.2 mole_map', what: 'Compact text: box, who uses the file, what it uses, exports, drift, all with file:line. Same picture the human sees in the sidebar.', why: 'Cheaper ticket starts: the agent reads a small map instead of a dozen files (measured for real at M1.5/M4).' };
    if (e.tool === 'Read' || e.tool === 'Grep') return { id: 'S2.4 activity hooks', what: `Async hook records ${e.level} for ${e.agent}, keyed by agent_id + worktree. Search hits are not counted as reads.`, why: 'Coverage stays honest: "touched", never "checked".' };
    if (e.t === 'deny') return { id: 'S2.2 guard (F2.8)', what: 'PreToolUse denies Edit/Write on .mole/model/** and managed blocks. CI mole check + CODEOWNERS catch Bash bypasses.', why: 'Agents cannot silently rewrite the intended design.' };
    if (e.t === 'propose') return { id: 'S2.2 mole_propose', what: 'The change goes to a human queue with the model base hash; stale proposals are rebased or rejected.', why: 'Agents can suggest design changes, humans decide.' };
    if (e.tool === 'Bash') return { id: 'S2.4 Bash edits', what: 'A Bash edit fires no Edit event. Mole snapshots git diff at SubagentStop/Stop to catch it.', why: 'Coverage map does not miss shell edits.' };
    if (e.hook === 'SubagentStart' || e.hook === 'SubagentStop') return { id: 'S2.4 lanes', what: 'Each subagent/worktree gets its own lane in the agent panel; Stop-side snapshots fill in Bash edits.', why: 'Parallel agents are visible separately.' };
    if (e.hook === 'Stop') return { id: 'S2.5 drift guard', what: `Force-syncs edited files and reports only drift this session created. Guard = ${S.cfg.guard} (Settings).`, why: 'Flags new erosion, not the pre-existing backlog; no nagging loops.' };
    if (e.tool === 'Edit') return { id: 'S2.4 + S2.2 PostToolUse', what: e.effect ? 'Edit added a forbidden edge (foundation → app shell). Mole injects one line right after the edit.' : 'Edit recorded; drift unchanged so nothing is injected.', why: 'The agent learns about the rule while it can still fix it.' };
    return { id: '', what: '', why: '' };
  };
  function renderCLI() {
    const blocks = EV.slice(0, S.step + 1).map((e, i) => `<div class="blk${i === S.step ? ' cur' : ''}" id="ev${i}">${evHtml(e, i)}</div>`).join('');
    const info = STEP_INFO(EV[S.step]);
    let inj = 0, mapB = 0, fileB = 0, maps = 0;
    EV.slice(0, S.step + 1).forEach((e) => { if (e.hook === 'SessionStart') inj += M.sessionStart(G, S.roadmap, S.cfg, D, null).length; if (e.tool === 'mole_map') { const c = mapCost(e.target); mapB += c.mapBytes; fileB += c.fileBytes; maps++; } });
    const tot = Math.max(1, inj + mapB, fileB);
    $('#tab-cli').innerHTML = `<div class="split"><div class="term" id="term"><div class="bar"><span class="dots"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></span> claude · ~/hermes-agent/ui-tui · Claude Code with the mole plugin <span class="tag sim" style="margin-left:auto">SIMULATED SESSION</span></div>
        <div class="blk"><div class="u">&gt; ${esc(agentById.a1.task)}. Use a subagent for the plugin-widget spacing and another to review the slash fuzzy matching.</div></div>${blocks}
        ${S.step < 0 ? '<div class="blk" style="color:#6f7177">press "next step ▶" →</div>' : ''}</div>
      <div class="side"><h3>Agent in terminal</h3>${replayCtl()}
        <div class="card2"><div style="font-size:11px;color:var(--muted)">THIS STEP · ${esc(info.id)}</div><div style="margin:4px 0">${esc(info.what)}</div><div style="color:var(--ok)">→ ${esc(info.why)}</div></div>
        <div class="card2"><div style="font-size:11px;color:var(--muted)">COST SO FAR (proxy, bytes ÷ 4 ≈ tokens)</div>
          <div>Mole context: SessionStart ${inj} chars + ${maps} mole_map = ${mapB} B</div><div class="meter"><i style="width:${(100 * (inj + mapB)) / tot}%"></i></div>
          <div>reading the files those maps point to: ${kb(fileB)}</div><div class="meter"><i style="width:${(100 * fileB) / tot}%;background:#c58a12"></i></div>
          <div style="color:var(--muted);font-size:11.5px">Not a measured saving: agents may still read files. Real numbers come from M1.5/M4 (same tickets with vs without Mole: total session tokens, wall time, correctness).</div></div>
        <div class="card2"><div style="font-size:11px;color:var(--muted)">SAME SESSION ELSEWHERE</div>
          <button class="go" data-go='{"tab":"panel"}'>agent panel</button><button class="go" data-go='{"tab":"vscode","file":"src/lib/text.ts"}'>sidebar at src/lib/text.ts</button><button class="go" data-go='{"tab":"pr"}'>pull request</button><button class="go" data-go='{"tab":"settings","hi":"#cfg-guard"}'>guard warn/block</button></div>
        <div class="card2" style="font-size:11.5px;color:var(--muted)">Other harnesses (Codex, Cursor, Hermes) get the same MCP tools; hooks stay Claude-specific until equivalents exist (S2.8).</div></div></div>`;
    const cur = $('#ev' + S.step); if (cur) cur.scrollIntoView({ block: 'nearest' });
  }

  // ================= AGENT PANEL (stage 2, 4 hosts) =================
  function agentPanelHTML(width) {
    const A = ACT; const scopeFiles = visibleFiles().filter((f) => M.anchorMatch(SAMPLE.scope.glob, f));
    const touched = Object.keys(A.byFile);
    const nd = sessionDrift();
    const evs = EV.slice(0, S.step + 1);
    const props = evs.filter((e) => e.t === 'propose').map((e) => e.proposal);
    const pending = props.filter((p) => !S.proposals[p.id]).length;
    const lanes = SAMPLE.agents.map((a) => { const s = A.agents[a.id]; return `<div class="lane"><i style="background:${a.color}"></i><span><b>${esc(a.name)}</b><br><span style="color:#8b8d93;font-size:10.5px">${esc(a.worktree)} · ${s.status}</span></span><span class="cur" title="${esc(s.cur)}">${esc(s.cur || '—')}</span><span class="cnt">✎${s.edited} · 👁${s.read} · ⌕${s.search}</span></div>`; }).join('');
    // map with agent dots
    const R = S.roadmap; const cnt = {};
    touched.forEach((f) => { const g = M.groupOf(G, R, f); (cnt[g] = cnt[g] || []).push(f); });
    const ndBoxes = nd.map((v) => ({ from: v.boxes[0], to: v.boxes[1], top: true, col: '#ef6b6b', w: 2.2, label: `new drift ${v.rule}: ${v.from} → ${v.to}` }));
    const mapW = Math.max(300, Math.min(560, width * 0.52));
    const { svg } = boxMapSVG(mapW, {
      R, edges: ndBoxes, bh: 62, fill: () => '#26272c', stroke: (g) => (cnt[g] ? '#6d7a92' : '#3a3c42'),
      content: (g, p) => {
        const fs = (cnt[g] || []); let s = `<text x="${p.x + 8}" y="${p.y + 30}" font-size="10" fill="#8b8d93">${fs.length ? fs.length + ' touched' : 'untouched'}</text>`;
        const per = Math.max(1, Math.floor((p.w - 16) / 12)); let i = 0;
        fs.slice(0, 16).forEach((f) => { Object.entries(A.byFile[f]).forEach(([ag, lv]) => { s += `<circle cx="${p.x + 12 + (i % per) * 12}" cy="${p.y + 44 + Math.floor(i / per) * 11}" r="4.2" fill="${lv === 'edited' ? agentById[ag].color : 'none'}" stroke="${agentById[ag].color}" stroke-width="1.6"><title>${esc(f)} · ${ag} ${lv}</title></circle>`; i++; }); });
        return s;
      },
    });
    const cov = scopeFiles.map((f) => { const by = A.byFile[f] || {}; const best = Object.values(by).sort((a, b) => RANK[b] - RANK[a])[0] || 'untouched'; return { f, by, best }; });
    const unc = cov.filter((c) => c.best === 'untouched').length;
    const covRows = cov.map((c) => `<tr><td class="mono" style="font-size:11px">${esc(c.f.replace('src/app/slash/', ''))}</td><td>${Object.entries(c.by).map(([ag, lv]) => `<span style="color:${agentById[ag].color}">${ag}</span>`).join(' ') || '—'}</td><td><span class="lv ${c.best}">${c.best}</span></td></tr>`).join('');
    const propHtml = props.length ? props.map((p) => { const st = S.proposals[p.id]; return `<div class="prop ${st || ''}"><b>${esc(p.id)}</b> from ${atag(evs.find((e) => e.proposal === p).agent)} ${esc(p.change)}<div style="color:#9a9ca3;margin-top:2px">why: ${esc(p.reason)}</div><div style="color:#9a9ca3">effect: ${DBASE.violations.filter((v) => v.rule === p.ruleRemove).length} drift items ${st === 'approved' ? 'no longer' : 'would no longer be'} flagged</div>${st ? `<div style="margin-top:4px">${st === 'approved' ? '✓ approved · model ' + modelHash() + ' · propagated' : '✕ rejected'}</div>` : `<div class="acts"><button class="ib on" data-prop="${esc(p.id)}" data-v="approved">approve</button><button class="ib" data-prop="${esc(p.id)}" data-v="rejected">reject</button></div>`}</div>`; }).join('') : '<div style="color:#8b8d93">none yet</div>';
    return `<div class="ap" data-w="${width}"><div class="hd"><b>MOLE · AGENTS</b><span>step ${S.step + 1}/${EV.length}</span><span>${touched.length} files touched</span><span style="color:${nd.length ? '#ef8b8b' : '#9a9ca3'}">drift +${nd.length} this session</span><span>${pending} proposal${pending === 1 ? '' : 's'} waiting</span></div>
      <div class="grid"><div><div class="box"><h5>LANES</h5>${lanes}</div><div class="box" style="margin-top:10px"><h5>WHERE THEY ARE ON THE MAP · filled = edited, ring = read/search</h5>${svg}</div></div>
      <div><div class="box" id="cov"><h5>COVERAGE VS ${esc(SAMPLE.scope.label.toUpperCase())} · ${unc} of ${cov.length} untouched</h5><table><tr><th>file</th><th>agents</th><th>best level</th></tr>${covRows}</table><div style="color:#8b8d93;margin-top:4px;font-size:11px">levels: edited › read-full › read-range › search-hit › untouched. "touched" ≠ "checked".</div></div>
        <div class="box" style="margin-top:10px"><h5>DRIFT CREATED THIS SESSION</h5>${nd.length ? nd.map((v) => `<div class="li" style="cursor:pointer;color:#ef9b9b" data-go='${esc(JSON.stringify({ tab: 'vscode', file: v.from, line: v.line }))}'>${esc(v.rule)} · ${esc(v.from)}:${v.line} → ${esc(base(v.to))}</div>`).join('') : '<div style="color:#8b8d93">none</div>'}</div>
        <div class="box" style="margin-top:10px" id="props"><h5>PROPOSALS (mole_propose → human queue)</h5>${propHtml}</div></div></div></div>`;
  }
  function renderPanel() {
    const hosts = [['vscode', 'VS Code panel'], ['hermes', 'Hermes plugin pane'], ['claude', 'Claude desktop · MCP App'], ['local', 'localhost page']];
    const p = agentPanelHTML(1080);
    let frame = '';
    if (S.host === 'vscode') frame = `<div class="frame vscode"><div class="chrome"><span class="ptabs"><span>PROBLEMS</span><span>OUTPUT</span><span>TERMINAL</span><span>CLAUDE CODE</span><span class="on">MOLE AGENTS</span></span><span style="margin-left:auto">bottom panel beside the Claude Code VS Code extension</span></div>${p}</div>`;
    if (S.host === 'hermes') frame = `<div class="frame hermes"><div class="chrome"><span class="ptabs"><span>Docs ▾</span><span>Files</span><span class="on">◖ Mole agents</span></span><span style="margin-left:auto">Hermes desktop · preview-strip pane via @hermes/plugin-sdk (same pattern as the docs-page plugin)</span></div>${p}</div>`;
    if (S.host === 'claude') frame = `<div class="frame claude"><div class="bubble me">how are the agents doing on the /model fix?</div><div class="bubble">Here's the live Mole view of this session. a1 added an import that breaks R1; a2 is asking to drop R3.<div class="appcard" style="margin-top:8px"><div class="cap">ui://mole/agents · MCP App (text/html;profile=mcp-app) rendered inline</div>${p}</div></div></div>`;
    if (S.host === 'local') frame = `<div class="frame local"><div class="chrome"><span>◀ ▶ ⟳</span><span class="url">http://127.0.0.1:7357/agents?repo=ui-tui</span><span>daemon page for terminal harnesses (Claude Code CLI, Codex)</span></div>${p}</div>`;
    $('#tab-panel').innerHTML = `<div class="hosts"><b>Host:</b> <span class="seg">${hosts.map(([k, l]) => `<button data-host="${k}" class="${S.host === k ? 'on' : ''}">${l}</button>`).join('')}</span> ${replayCtl()}</div>
      <div style="padding:0 16px 6px;color:var(--muted);font-size:12px">One React renderer fed live by the daemon, shipped in 4 shells (S2.9). Switch hosts: the content is identical, only the frame changes.</div>
      <div class="hostwrap">${frame}</div>`;
  }

  // ================= PULL REQUEST (stage 3) =================
  function renderPR() {
    const A = ACT; const edited = Object.keys(A.byFile).filter((f) => Object.values(A.byFile[f]).includes('edited'));
    const nd = sessionDrift();
    const resolved = DBASE.violations.filter((v) => !D.violations.some((x) => vkey(x) === vkey(v)));
    const modelChanged = modelHash() !== S.baseHash;
    const stale = S.published.hash !== modelHash();
    const R = S.roadmap;
    const changedBoxes = new Set(edited.map((f) => M.boxOf(R, f)));
    const newEdges = G.fileEdges.filter((e) => e.sim);
    const { svg } = boxMapSVG(560, {
      R, bh: 46, edges: [...newEdges.map((e) => ({ from: M.boxOf(R, e.from), to: M.boxOf(R, e.to), top: true, col: nd.length ? '#cf222e' : '#9a6700', w: 2.4, label: `new edge ${e.from} → ${e.to}` }))],
      fill: (g) => (changedBoxes.has(g) ? '#fff8c5' : '#f6f8fa'), stroke: (g) => (changedBoxes.has(g) ? '#d4a72c' : '#d0d7de'),
      content: (g, p) => { const n = edited.filter((f) => M.boxOf(R, f) === g).length; return `<text x="${p.x + 8}" y="${p.y + 32}" font-size="10.5" fill="#57606a">${n ? n + ' file' + (n > 1 ? 's' : '') + ' changed' : 'unchanged'}</text>`; },
    });
    const svgLight = svg.replace(/fill="#e8e8ea"/g, 'fill="#24292f"');
    const ck = (ic, cls, name, txt) => `<div class="ck"><span class="ic ${cls}">${ic}</span><b>${name}</b><span style="color:#57606a">${txt}</span></div>`;
    const driftCheck = nd.length ? (S.cfg.guard === 'block' ? ck('✕', 'bad', 'mole drift', `${nd.length} new forbidden edge (guard: block)`) : ck('!', 'warn', 'mole drift', `${nd.length} new forbidden edge (guard: warn)`)) : ck('✓', 'ok', 'mole drift', 'no new drift');
    const notDone = S.step < EV.length - 1;
    $('#tab-pr').innerHTML = `<div class="gh">
      ${notDone ? `<div style="background:#fff8c5;border:1px solid #d4a72c;border-radius:6px;padding:8px 12px;margin-bottom:12px">Agent session at step ${S.step + 1}/${EV.length}: the PR shows the edits so far. <button class="btn small" data-step="end">run session to end</button></div>` : ''}
      <h1>fix: /model shows a stale provider after switching <span>#1287</span></h1>
      <div style="margin-bottom:10px"><span class="state">Open</span><span style="color:#57606a">agents a1 + a2 want to merge ${edited.length} changed files into <code>main</code> · <span class="tag sim">SIMULATED PR</span></span></div>
      <div class="cmt"><div class="ch">Files changed (${edited.length})</div><div class="cb">${edited.map((f) => `<div><a data-go='${esc(JSON.stringify({ tab: 'vscode', file: f }))}'>${esc(f)}</a> <span style="color:#57606a">· ${esc((M.boxById(R, M.boxOf(R, f)) || {}).label || '')} · ${Object.entries(A.byFile[f]).filter(([, l]) => l === 'edited').map(([a]) => a).join(', ')}</span></div>`).join('') || '<span style="color:#57606a">no edits yet</span>'}${modelChanged ? `<div><a>.mole/model/roadmap.yaml</a> <span style="color:#57606a">· roadmap change (CODEOWNERS)</span></div>` : ''}</div></div>
      <div class="cmt"><div class="ch"><b>mole</b> bot commented · architecture diff vs the accepted roadmap @ head <span class="tag real">REAL diff</span></div><div class="cb">
        <div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap"><div>${svgLight}</div><div style="flex:1;min-width:260px">
          <b>New drift (${nd.length})</b>${nd.length ? `<table class="t"><tr><th>rule</th><th>edge @ head</th><th>why</th></tr>${nd.map((v) => `<tr><td>${esc(v.rule)}</td><td><a data-go='${esc(JSON.stringify({ tab: 'vscode', file: v.from, line: v.line }))}'>${esc(v.from)}:${v.line}</a> → ${esc(v.to)}</td><td>${esc(v.why)}</td></tr>`).join('')}</table>` : '<p style="color:#57606a">none</p>'}
          <b>Resolved by roadmap change (${resolved.length})</b>${resolved.length ? `<p style="color:#57606a">${resolved.map((v) => `${esc(v.rule)} ${esc(base(v.from))}:${v.line} → ${esc(base(v.to))}`).join('<br>')}<br>via .mole/model change (proposal approved) · needs CODEOWNERS review</p>` : '<p style="color:#57606a">none</p>'}
          <b>New edges (${newEdges.length})</b><p style="color:#57606a">${newEdges.map((e) => `${esc(e.from)} → ${esc(e.to)} (${esc((M.boxById(R, M.boxOf(R, e.from)) || {}).label)} → ${esc((M.boxById(R, M.boxOf(R, e.to)) || {}).label)})`).join('<br>') || 'none'}</p>
          <p style="color:#57606a;font-size:12px">Pre-existing drift (${D0.violations.length}) is not repeated. Each line links to file:line at the PR head commit (S3.2).</p></div></div>
        <details><summary style="cursor:pointer;color:#57606a">Mermaid source (renders natively on GitHub)</summary><pre class="mono" style="background:#f6f8fa;padding:8px;border-radius:6px">${esc(M.mermaid(R, D))}</pre></details></div></div>
      <div class="cmt checks"><div class="ch">Checks</div>
        ${stale ? ck('✕', 'bad', 'mole check', 'README.md mole:diagram block is stale vs .mole/model → run mole sync (propagate = manual)') : ck('✓', 'ok', 'mole check', 'managed blocks regenerate byte-identical from .mole/model')}
        ${driftCheck}
        ${modelChanged ? ck('!', 'warn', 'CODEOWNERS', '.mole/model changed → review required from @ui-leads') : ck('–', 'neu', 'CODEOWNERS', 'no roadmap change')}
        ${ck('–', 'neu', 'CodeRabbit', 'line-level review, runs alongside (not Mole)')}
        ${ck('–', 'neu', 'shared graph (S3.1)', `CI builds the graph once per merge to main, artifact keyed by commit ${esc(DATA.commit)}`)}</div>
      ${stale ? '<button class="btn" data-act="sync">run mole sync</button>' : ''}</div>`;
  }

  // ================= SETTINGS =================
  function renderSettings() {
    const c = S.cfg;
    const sel = (k, opts) => `<select data-cfg="${k}" id="cfg-${k}">${opts.map((o) => `<option ${String(c[k]) === String(o) ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
    const chk = (k) => `<input type="checkbox" data-cfg="${k}" ${c[k] ? 'checked' : ''}>`;
    const row = (label, ctl, help) => `<div class="row2"><div><b>${label}</b><div>${ctl}</div></div><div class="help">${help}</div></div>`;
    const N = M.neighbourhood(G, S.file, c, S.roadmap);
    const ss = M.sessionStart(G, S.roadmap, c, D, null);
    $('#tab-settings').innerHTML = `<div class="set"><div>
      <div class="grp"><h3>Persona presets</h3><div class="ctl">${Object.entries(PRESETS).map(([k, p]) => `<button class="btn${c.persona === k ? ' primary' : ''}" data-preset="${k}">${p.label}</button>`).join('')}</div>
        <div class="help" style="color:var(--muted);margin-top:6px">Junior: fewer nodes, all layers, explanations on demand. Senior: dense map, quiet, no explanations. Agent-heavy: activity on, smaller SessionStart, guard blocks.</div></div>
      <div class="grp"><h3>Index policy (B4)</h3>
        ${row('exclude tests', chk('excludeTests'), `Tests vanish from the explorer and map. Now: ${DATA.stats.testFiles} test files hidden.`)}</div>
      <div class="grp"><h3>Sidebar view (S1.2, S1.3)</h3>
        ${row('max nodes', `<input type="range" min="8" max="40" data-cfg="maxNodes" value="${c.maxNodes}"> ${c.maxNodes}`, `Neighbourhood cap; the rest folds into "+N more" per box. ${base(S.file)} now shows ${N.incoming.length + N.outgoing.length} of ${N.totalIn + N.totalOut}.`)}
        ${row('debounce ms', `<input type="range" min="0" max="400" step="20" data-cfg="debounceMs" value="${c.debounceMs}"> ${c.debounceMs}`, 'Arrowing through files renders only where you stop (no thrash). Try ↑/↓ in the explorer.')}
        ${row('layers', ['current', 'roadmap', 'curated', 'activity'].map((k) => `<label style="margin-right:8px"><input type="checkbox" data-layer="${k}" ${c.layers[k] ? 'checked' : ''}> ${k}</label>`).join(''), 'Default layers on the one canvas: code graph, roadmap boxes, curated-doc badges, agent activity dots.')}</div>
      <div class="grp"><h3>Drift (B3, S2.5)</h3>
        ${row('ignore tests', chk('driftIgnoreTests'), 'Test-only imports never count as drift.')}
        ${row('ignore type-only', chk('driftIgnoreTypeOnly'), `"import type" never counts. ${DATA.stats.typeOnlyImports} type-only imports in this repo.`)}
        ${row('guard', sel('guard', ['warn', 'block']), 'Stop hook: warn reports new drift; block makes the agent fix it once (respects stop_hook_active). Also sets the PR check.')}</div>
      <div class="grp"><h3>Explanations + privacy (S1.7, B8)</h3>
        ${row('mode', sel('explain', ['on-demand', 'off']), 'Never generated idle. Off hides the explain button.')}
        ${row('consent', chk('consent'), 'Per-repo consent before any code goes to vscode.lm / your key.')}
        ${row('agent message text', chk('messageText'), 'Activity stores ids, paths, ops, line ranges only, unless this is on.')}
        ${row('retention days', `<input type="number" min="1" max="90" data-cfg="retentionDays" value="${c.retentionDays}" style="width:60px">`, 'Activity log retention; never leaves the machine unless enabled per repo.')}</div>
      <div class="grp"><h3>Propagation + agents (S1.6, S2.3)</h3>
        ${row('propagate', sel('propagate', ['auto', 'manual']), 'auto: a roadmap edit rewrites README block + AGENTS.md pointer at once. manual: they go stale until "mole sync"; CI mole check fails meanwhile.')}
        ${row('SessionStart cap', `<input type="range" min="400" max="3000" step="100" data-cfg="sessionStartCap" value="${c.sessionStartCap}"> ${c.sessionStartCap}`, `Chars injected at session start (hook limit 10,000). Now ${ss.length} chars.`)}</div></div>
      <div><pre class="yaml">${esc(M.configYaml(c))}</pre>
        <div class="eff"><b>Live effect</b><div style="color:var(--muted);font-size:12px;margin-top:4px">
          map for ${esc(base(S.file))}: ${N.incoming.length + N.outgoing.length} nodes shown<br>drift items: ${D.violations.length} (${sessionDrift().length} from the agent session)<br>SessionStart: ${ss.length} chars ≈ ${tok(ss.length)} tokens<br>Stop hook: ${c.guard} · explanations: ${c.explain}${c.explain !== 'off' ? (c.consent ? ' (consented)' : ' (asks consent)') : ''}<br>propagate: ${c.propagate}${S.published.hash !== modelHash() ? ' · <b style="color:var(--bad)">managed blocks stale</b>' : ''}</div>
          <div style="margin-top:8px"><button class="go" data-go='{"tab":"vscode"}'>see sidebar</button><button class="go" data-go='{"tab":"cli","step":"end"}'>see Stop hook</button><button class="go" data-go='{"tab":"pr"}'>see PR checks</button></div></div></div></div>`;
  }

  // ================= events =================
  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('button, [data-file], [data-dir], [data-sym], [data-open], [data-level], [data-go], [data-box], [data-explain], .lens');
    if (!t) return;
    const d = t.dataset;
    if (t.closest('#tabs') && d.tab) return setTab(d.tab);
    if (d.go) return go(JSON.parse(d.go));
    if (d.step) {
      if (d.step === 'reset') { resetSession(); }
      else { S.step = d.step === 'end' ? EV.length - 1 : Math.max(-1, Math.min(EV.length - 1, S.step + (+d.step))); recompute(); }
      return render();
    }
    if (d.host) { S.host = d.host; return renderPanel(); }
    if (d.prop) {
      S.proposals[d.prop] = d.v;
      if (d.v === 'approved') { const p = EV.find((e) => e.proposal && e.proposal.id === d.prop).proposal; S.roadmap.rules = S.roadmap.rules.filter((r) => r.id !== p.ruleRemove); onModelChange(`approved ${d.prop}: rule ${p.ruleRemove} dropped`); }
      else render();
      return;
    }
    if (d.preset) { const p = PRESETS[d.preset]; Object.assign(S.cfg, clone(p), { persona: d.preset }); delete S.cfg.label; recompute(); return render(); }
    if (d.etab) { S.etab = d.etab; return renderVSCode(); }
    if (d.layer && t.closest('#mole')) { S.cfg.layers[d.layer] = !S.cfg.layers[d.layer]; recompute(); return renderVSCode(); }
    if (d.accept) { S.curatedStatus[d.accept] = { anchor: d.anchor }; return renderVSCode(); }
    if (d.delrule) { S.roadmap.rules = S.roadmap.rules.filter((r) => r.id !== d.delrule); return onModelChange(`removed rule ${d.delrule}`); }
    if (d.path) { S.pathTo = d.path; S.level = 'path'; return renderVSCode(); }
    if (d.explain) { S.explainFor = d.explain; return renderVSCode(); }
    if (d.act) return act(d.act);
    if (d.dir) { S.openDirs.has(d.dir) ? S.openDirs.delete(d.dir) : S.openDirs.add(d.dir); return renderExplorer(); }
    if (d.impact !== undefined && d.sym) { S.sym = d.sym; S.level = 'symbol'; S.impactOn = d.impact === '1'; return renderVSCode(); }
    if (d.open) return openAt(d.open, +d.line, { keepLevel: true });
    if (d.sym) { const s = G.symbols[d.sym]; S.sym = d.sym; S.level = 'symbol'; S.impactOn = false; S.file = s.file; S.hl = s.line; S.etab = 'file'; viewFile(s.file); closeModal(); return renderVSCode(); }
    if (d.box && t.closest('#mole')) { S.box = d.box; S.level = 'map'; return renderVSCode(); }
    if (d.level) { S.level = d.level; if (d.level !== 'map') S.box = null; if (d.box) S.box = d.box; return renderVSCode(); }
    if (d.file) { closeModal(); S.box = null; return openAt(d.file, null); }
  });
  function closeModal() { $('#modal').classList.add('hidden'); }
  function act(a) {
    const v = (id) => $('#' + id).value;
    if (a === 'full') return openFull();
    if (a === 'closemodal') return closeModal();
    if (a === 'walk') return walk();
    if (a === 'edit') { S.editOpen = !S.editOpen; return renderVSCode(); }
    if (a === 'consent') { S.cfg.consent = true; return renderVSCode(); }
    if (a === 'noexplain') { S.explainFor = null; return renderVSCode(); }
    if (a === 'bootstrap') { S.roadmap = M.bootstrap(G0raw, S.cfg); S.roadmapMode = 'bootstrap'; S.level = 'map'; return onModelChange('bootstrapped a draft roadmap'); }
    if (a === 'acceptroadmap') { S.roadmap = clone(SAMPLE.roadmap); S.roadmapMode = 'accepted'; return onModelChange('accepted the reviewed roadmap'); }
    if (a === 'adopt') { S.adopted = true; toast('adopted: docs/tui-overview.md Mermaid is now a managed mole:diagram block (round-trips through .mole/model)'); return renderVSCode(); }
    if (a === 'sync') { publish(); toast(`mole sync: README block + AGENTS.md pointer regenerated from model ${modelHash()}`); return render(); }
    if (a === 'rename') { const b = S.roadmap.boxes.find((x) => x.id === v('rb')); const l = v('rl').trim(); if (!l) return toast('type a new label first'); const old = b.label; b.label = l; return onModelChange(`renamed "${old}" → "${l}"`); }
    if (a === 'forbid' || a === 'plan') {
      const from = v(a === 'forbid' ? 'ff' : 'pf'), to = v(a === 'forbid' ? 'ft' : 'pt'); if (from === to) return toast('pick two different boxes');
      if (a === 'forbid') { const id = 'R' + (Math.max(0, ...S.roadmap.rules.map((r) => +r.id.slice(1) || 0)) + 1); S.roadmap.rules.push({ id, from, to, why: 'added in the sidebar' }); S.roadmap.edges = S.roadmap.edges.filter((e) => !(e.from === from && e.to === to)); return onModelChange(`added rule ${id}: ${from} ✕→ ${to}`); }
      S.roadmap.edges.push({ from, to, status: 'planned' }); return onModelChange(`planned edge ${from} → ${to}`);
    }
  }
  document.addEventListener('change', (ev) => {
    const t = ev.target; const d = t.dataset;
    if (t.id === 'pathto') { S.pathTo = t.value; return renderVSCode(); }
    if (d.layer && t.closest('#tab-settings')) { S.cfg.layers[d.layer] = t.checked; recompute(); return renderSettings(); }
    if (!d.cfg) return;
    const k = d.cfg; const prev = S.cfg[k];
    S.cfg[k] = t.type === 'checkbox' ? t.checked : t.type === 'range' || t.type === 'number' ? +t.value : t.value;
    if (k === 'propagate' && S.cfg.propagate === 'auto') publish();
    if (prev !== S.cfg[k]) { S.cfg.persona = 'custom'; recompute(); renderSettings(); }
  });
  document.addEventListener('input', (ev) => { const t = ev.target; if (t.type === 'range' && t.dataset.cfg) { S.cfg[t.dataset.cfg] = +t.value; S.cfg.persona = 'custom'; recompute(); renderSettings(); const el = $(`[data-cfg="${t.dataset.cfg}"]`); if (el) el.focus(); } });
  $('#explorer').addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); keyNav(ev.key === 'ArrowDown' ? 1 : -1); }
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeModal(); });

  // ---------- boot ----------
  recompute();
  S.baseHash = modelHash();
  viewFile(S.file);
  const hashTab = location.hash.slice(1);
  setTab(['how', 'vscode', 'cli', 'panel', 'pr', 'settings'].includes(hashTab) ? hashTab : 'how');
  window.__mole = { S, go, get G() { return G; }, get D() { return D; } };
})();
