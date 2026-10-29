# T17 sandbox: the subject repo (Mole at the key's subject commit, with its history) at /repo, built;
# the Mole tool (T15 hooks + MCP server + CLI, key's tool commit) at /opt/mole, built. No credentials, no host mounts.
# Claude Code itself is copied in at run time by Inspect SWE (claude_code(version="auto")).
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates python3 \
 && apt-get clean && rm -rf /var/lib/apt/lists/*
RUN git config --global user.email eval@example.invalid && git config --global user.name eval \
 && git config --global init.defaultBranch main

COPY context/subject.bundle /tmp/subject.bundle
RUN git clone -q -b main /tmp/subject.bundle /repo && rm /tmp/subject.bundle \
 && cd /repo && git remote remove origin \
 && for f in AGENTS.md CLAUDE.md; do \
      if git ls-files --error-unmatch "$f" >/dev/null 2>&1; then git update-index --skip-worktree "$f"; rm -f "$f"; fi; \
    done \
 && printf '.claude/\n' >> .git/info/exclude
WORKDIR /repo
RUN npm ci --no-audit --no-fund && npm run build && npm cache clean --force

COPY context/tool.tar /tmp/tool.tar
RUN mkdir -p /opt/mole && tar -xf /tmp/tool.tar -C /opt/mole && rm /tmp/tool.tar \
 && cd /opt/mole && npm ci --no-audit --no-fund \
 && npx tsc -b packages/daemon/tsconfig.json packages/mcp/tsconfig.json \
 && npm cache clean --force
CMD ["sleep", "infinity"]
