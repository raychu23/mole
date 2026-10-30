// SAMPLE inputs for the prototype (everything here is simulated, labelled in the UI).
// roadmap  : what a lead might accept after bootstrap review (6 boxes, rules R1-R5)
// curated  : a Mermaid diagram as if it already lived in the team's docs
// agents   : one scripted Claude Code session (3 agents) replayed by the CLI view and agent panel
(function (root) {
  'use strict';
  const A = (from, to) => ({ from, to, status: 'accepted' });
  const S = {
    repoLabel: 'hermes-agent/ui-tui',
    roadmap: {
      version: 1,
      meta: 'SAMPLE: bootstrap edges with >=2 observed uses grouped into 6 boxes + rules R1-R5, as a lead might accept them (simulated review)',
      boxes: [
        { id: 'entry', label: 'entry + gateway', anchors: ['src/*'], status: 'accepted', note: 'process entry, gateway client, shared types/theme' },
        { id: 'app', label: 'app shell', anchors: ['src/app/**'], status: 'accepted', note: 'stores, slash commands, turn loop' },
        { id: 'ui', label: 'ui', anchors: ['src/components/**', 'src/hooks/**'], status: 'accepted', note: 'Ink components + hooks' },
        { id: 'sdk', label: 'plugin sdk', anchors: ['src/sdk/**'], status: 'accepted', note: 'widget/app host surface for plugins' },
        { id: 'domain', label: 'domain + protocol', anchors: ['src/domain/**', 'src/protocol/**'], status: 'accepted', note: 'pure logic, wire protocol' },
        { id: 'foundation', label: 'foundation', anchors: ['src/lib/**', 'src/config/**', 'src/i18n/**', 'src/content/**', 'src/types/**'], status: 'accepted', note: 'utilities, config, i18n, static content' },
      ],
      edges: [
        A('app', 'domain'), A('app', 'entry'), A('app', 'foundation'), A('app', 'sdk'), A('app', 'ui'), A('domain', 'foundation'),
        A('entry', 'app'), A('entry', 'foundation'), A('foundation', 'entry'), A('sdk', 'app'), A('sdk', 'foundation'), A('sdk', 'ui'),
        A('ui', 'app'), A('ui', 'domain'), A('ui', 'entry'), A('ui', 'foundation'),
        { from: 'sdk', to: 'domain', status: 'planned' },
      ],
      rules: [
        { id: 'R1', from: 'foundation', to: 'app', why: 'foundation is the bottom layer' },
        { id: 'R2', from: 'foundation', to: 'ui', why: 'foundation is the bottom layer' },
        { id: 'R3', from: 'ui', to: 'sdk', why: 'core UI must not depend on the plugin surface' },
        { id: 'R4', from: 'domain', to: 'ui', why: 'domain stays UI-free' },
        { id: 'R5', from: 'domain', to: 'app', why: 'domain stays UI-free' },
      ],
    },
    curated: {
      path: 'docs/tui-overview.md',
      title: 'TUI overview (team doc, hand-drawn)',
      mermaid: [
        'flowchart LR',
        '  Entry["entry.tsx"] --> Shell["App shell"]',
        '  Shell --> Client["gatewayClient"]',
        '  Shell --> Overlays["appOverlays"]',
        '  Shell --> Input["textInput"]',
        '  Slash["Slash commands"] --> Client',
        '  Client --> Proto["protocol"]',
        '  Shell --> Theme["theme"]',
        '  Shell --> Widgets["Plugin widgets"]',
      ].join('\n'),
    },
    scope: { label: 'task scope: src/app/slash/**', glob: 'src/app/slash/**' },
    agents: [
      { id: 'a1', name: 'main · slash-fix', color: '#e0864a', worktree: 'main', task: 'fix: /model shows a stale provider after switching' },
      { id: 'a2', name: 'sub · theme-tweak', color: '#5aa1e3', worktree: 'wt-theme', task: 'tighten layout spacing for plugin widgets' },
      { id: 'a3', name: 'sub · reviewer', color: '#7fbf6a', worktree: 'main', task: 'review slash fuzzy matching' },
    ],
    // level: edited | read-full | read-range | search-hit ; effect: extra graph edges / proposal / deny
    events: [
      { t: 'hook', hook: 'SessionStart', note: 'SessionStart hook injects ≤cap chars: map ready + drift on this branch' },
      { t: 'tool', agent: 'a1', tool: 'mole_map', target: 'src/app/slash/registry.ts', note: 'agent starts from the map instead of reading files' },
      { t: 'tool', agent: 'a1', tool: 'Read', target: 'src/app/slash/registry.ts', level: 'read-full' },
      { t: 'tool', agent: 'a1', tool: 'Grep', target: 'src/app/slash/**', pattern: 'model', level: 'search-hit', note: 'hits computed from the real file text' },
      { t: 'tool', agent: 'a1', tool: 'Read', target: 'src/app/slash/commands/session.ts', level: 'read-full' },
      { t: 'tool', agent: 'a1', tool: 'Read', target: 'src/app/slash/types.ts', range: [1, 40], level: 'read-range' },
      { t: 'hook', hook: 'SubagentStart', agent: 'a2', note: 'a2 starts in worktree wt-theme; lane registered (WorktreeCreate)' },
      { t: 'tool', agent: 'a2', tool: 'mole_map', target: 'src/components/appLayout.tsx' },
      { t: 'tool', agent: 'a2', tool: 'Read', target: 'src/components/appLayout.tsx', level: 'read-full' },
      { t: 'tool', agent: 'a2', tool: 'Edit', target: 'src/components/appLayout.tsx', level: 'edited', note: 'spacing change, no new imports' },
      { t: 'tool', agent: 'a1', tool: 'Edit', target: 'src/app/slash/commands/session.ts', level: 'edited', note: 'refresh provider label after /model' },
      { t: 'tool', agent: 'a1', tool: 'Edit', target: 'src/lib/text.ts', level: 'edited', note: "adds import { getUiState } from '../app/uiStore.js'",
        effect: { imports: [{ from: 'src/lib/text.ts', to: 'src/app/uiStore.ts', line: 3, typeOnly: false, reexport: false, sim: true }],
          insert: { file: 'src/lib/text.ts', line: 3, text: "import { getUiState } from '../app/uiStore.js'" } } },
      { t: 'deny', agent: 'a2', tool: 'Edit', target: '.mole/model/roadmap.yaml', note: 'PreToolUse deny: .mole/model is read-only for agents → use mole_propose' },
      { t: 'propose', agent: 'a2', tool: 'mole_propose', proposal: { id: 'P-17', change: 'drop rule R3 (ui → plugin sdk forbidden)', reason: 'appLayout hosts plugin widgets by design; R3 flags 3 intended imports', ruleRemove: 'R3' } },
      { t: 'hook', hook: 'SubagentStart', agent: 'a3', note: 'a3 reviewer starts (read-only)' },
      { t: 'tool', agent: 'a3', tool: 'Read', target: 'src/app/slash/fuzzyScore.ts', level: 'read-full' },
      { t: 'tool', agent: 'a2', tool: 'Bash', target: 'src/components/thinking.tsx', cmd: "sed -i '' 's/marginTop={1}/marginTop={0}/' src/components/thinking.tsx", level: 'edited', viaBash: true, note: 'Bash edit: no Edit event, caught by git-diff snapshot at SubagentStop' },
      { t: 'hook', hook: 'SubagentStop', agent: 'a2', note: 'git-diff snapshot: +1 file edited via Bash (src/components/thinking.tsx)' },
      { t: 'hook', hook: 'Stop', note: 'Stop hook: force-sync edited files, report only drift this session created' },
    ],
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = S; else root.MOLE_SAMPLE = S;
})(typeof window !== 'undefined' ? window : globalThis);
