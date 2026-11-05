# Minimal Linux sandbox for mole_ab's agent=claude_code/codex path (T93 review FAIL fix #3): Inspect's
# sandbox_agent_bridge() unconditionally calls sandbox_with_injected_tools(), whose container-tools
# injector only knows how to install into a Linux filesystem layout (inspect_ai/util/_sandbox/recon.py:
# "Tool support injection is not implemented for OS: Darwin. Only Linux containers are currently
# supported."), so a macOS host needs a Docker sandbox instead of "local" -- the same workaround
# evals/inspect/mole_eval/task.py's own claude_code() usage (T17) already takes. See docs/experiments.md
# for how to run this.
#
# git: external_agent.py's agent runs INSIDE this container, cwd'd into a worktree bind-mounted in by
# compose.yaml (see that file's comment for the mount); it may itself invoke git (status/diff/commit), so
# git needs to be on PATH here even though the worktree was created with a HOST git by worktree_agent.py's
# make_worktree().
# node 22 + npm: the `claude`/`codex` CLIs inspect-swe downloads at runtime (version="auto") are standalone
# binaries that do not themselves need node to run, but inspect-swe's own documented fallback install path
# (inspect_swe/_util/node.py, used if a binary download fails) shells out to npm, and any real repo under
# test may need node/npm to build or test itself -- keeping both pre-installed avoids a cold download for
# either on first use.
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates curl bash \
 && rm -rf /var/lib/apt/lists/*

# Pre-install the CLIs inspect-swe expects (claude_code()/codex_cli() call these binaries once on PATH,
# version="auto" by default) so a sandboxed run does not depend on inspect-swe's own download endpoints
# (claude.ai/install.sh, github.com/openai/codex releases) being reachable from inside the container at
# eval time -- if either upstream package name changes, inspect-swe's version="auto" still falls back to
# its own direct-download path, so this is a speed/robustness optimization, not a hard dependency.
RUN npm install -g @anthropic-ai/claude-code @openai/codex || true

WORKDIR /work
