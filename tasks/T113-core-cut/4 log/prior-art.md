# T113 prior art (R0, prior-art-first)

Goal: cut Mole to a core per `context/product-plan/13 Cut it down.md` + `context/product-plan/19 Can it stand
up.md` fix 5 (D77): define the core, mark the rest experimental in docs + CLI help without deleting tested
code, reduce the MCP default toolset to ~5 intent tools behind an opt-in flag, one-page README core section.

## Sources (dated, fetched 2026-11-08)

1. **Anthropic, "Writing effective tools for agents"** (anthropic.com/engineering, referenced via AWS's 2026
   summary below; original post predates this task) -- "more tools don't always lead to better outcomes";
   recommends consolidating near-duplicate tools and keeping the default set lean; tool-search / deferred
   loading as the complementary mechanism for truly large catalogs.
2. **Anthropic, "Code execution with MCP: building more efficient agents"** (anthropic.com/engineering,
   fetched 2026-11-08) -- tool definitions loaded upfront occupy context on every turn regardless of use;
   their own worked example cuts 150,000 -> 2,000 tokens (98.7%) by having the agent discover tools on demand
   instead of loading every definition. Directly analogous to gating Mole's 16 non-core tools behind
   `allTools`.
3. **AWS, "MCP tool design: practical approaches and tradeoffs"** (aws.amazon.com/blogs/machine-learning,
   fetched 2026-11-08) -- "bloat" (context cost of unused tool defs) and "confusion" (wrong tool/params picked
   as the catalog grows) as the two concrete failure modes; cites Anthropic's own Tool Search Tool giving up
   to 85% token reduction by loading definitions only when relevant -- the same shape of fix as this task's
   `allTools` flag, at zero new infrastructure.
4. **arXiv 2606.30317, "MCP Server Architecture Patterns for LLM-Integrated Applications"** (fetched
   2026-11-08) -- measured tool-count accuracy thresholds (e.g. Claude Sonnet-class models hold >90% up to
   ~20-30 tools, degrading sharply beyond; smaller Haiku-class models degrade starting ~10-15) and recommends
   the "Proxy Aggregator" pattern: partition the tool space so only the relevant subset is visible by default,
   full set available on request -- exactly this task's core/opt-in split.
5. **Mole's own prior research, `context/product-plan/13 Cut it down.md`** (10-30, already in this repo) --
   Adams et al. (Nature, 2021, "People systematically overlook subtractive changes") on the subtract-first
   bias; Fowler's YAGNI; Shape Up's appetite; Intercom's usage x frequency feature audit; the prior MCP-tool
   count target it names for this exact cut: "MCP 9 -> 5".

## What this confirms / changes from the plan

- The external evidence (sources 1-4) independently supports the repo's own plan (source 5): a model choosing
  among tools degrades as the catalog grows, and the standard fix is config-time gating to a lean default with
  a full-set opt-in -- not deleting anything. This task implements exactly that: `MoleMcpOptions.allTools`
  (default off), same tool implementations, same schemas, same tests (extended, not replaced).
- The repo's plan doc's own merge list (`mole_decisions (with as_of)`, `mole_agents_here (tried + intent +
  coverage)`, `mole_questions`) is a deeper refactor (renaming/merging tool implementations) than this task's
  scope allows under AGENTS.md's "no deletions of tested code without a usage check" and the brief's bounded-
  task rule; implemented instead as **exposure gating** of the existing, already-tested tool set, which
  achieves the measured goal (default tools exposed, tool-description tokens) without removing or renaming any
  tool. Tool consolidation is left as a candidate follow-up, not done here.
