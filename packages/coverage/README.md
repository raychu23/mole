# @mole/coverage (T35, M27)

Which agent sessions (Hermes, Claude Code, Codex) read or edited each file, when a human last looked (T13), what
guards it (static test-import reachability) and what decision governs it (T29), with a weak-spot reason computed
from that data: agent-edited with no human read since, and no guarding test or a red/yellow decision. This is the
decisions-behind-the-code view (D31) for "who touched this, has anyone reviewed it, is it still governed" -- at the
command line (`mole coverage [file] [--session ID] [--weak] [--json]`), in the MCP tool agents already call
(`mole_coverage`), and read by T34's VS Code panel.

Read-only: local session logs + git + `.mole/` records. Never message text; nothing leaves the machine.

See `tasks/T35-agent-coverage/4 log/prior-art.md` for the method and its field precedents (git-ai, Cursor's Agent
Trace spec, Istanbul/lcov, Bird et al. code-ownership research, GitHub CODEOWNERS), and `bench/m27.ts` for the
metrics (M27a attribution precision/recall, M27b weak-spot reason correctness, M27c query/scan latency).
