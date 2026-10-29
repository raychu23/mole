```notes
core        T15 key ruling 1: exact MCP tool-name list in check.test.ts broke on merge w T18's mole_tried      fresh reviewer, R2/R7, 2026-10-29
    ruling          APPROVE w 1 exact edit, line 51 only      → §ruling
    why             exact list tests registry membership, not done-when 3 (same JSON as CLI)      → §contract
    r7              no contract check loosened: 3 deep-equals, error results, no-daemon check all unchanged      → §r7
    precedent       T18 review-1 accepted the same change in mcp.test.ts (toEqual → toContain)      → §evidence
```

```notes
ruling
    decision        APPROVE the key-changes 2026-10-29 03:45 proposal, w this exact edit and no other
    file            packages/mcp/test/check.test.ts line 51
    before          expect((await client.listTools()).tools.map((t) => t.name).sort()).toEqual(['mole_check', 'mole_map']);
    after           expect((await client.listTools()).tools.map((t) => t.name)).toEqual(expect.arrayContaining(['mole_check', 'mole_map']));
    not allowed     any other line in check.test.ts      dropping either name      a toBeGreaterThan / length-only check
contract
    done-when 3     "MCP tool mole_check returns the same JSON as the CLI" (0 start.md line 17)
    what it needs   mole_check is listed + callable, and its output deep-equals `mole check --json` in each change mode
    exact list adds 1 extra claim: the server has NO tool besides mole_check + mole_map
        in contract     no      T15 never says the tool set is closed      T18 owns mole_tried, T2 owns mole_map
        effect          any parallel task adding a tool fails T15's test w no T15 regression      it already happened (T18)
    after keeps     mole_check listed (the registration claim done-when 3 relies on)      mole_map still listed (T15 must not drop it)
r7
    unchanged       worktree / sha / diff+base: strip(viaMcp) toEqual strip(viaCli)      past-fix subject + questions > 0
                    explicit root == server root      bad input → isError + /exactly one of/      stateDir never created
    so              the contract's core assertions are as strict as in red a11b256      only the closed-set claim outside the contract goes
evidence
    red             a11b256 "T15 red" added check.test.ts w the exact list
    break           T18 3e2dcf4 registered mole_tried (packages/mcp/src/server.ts line 46) → received ['mole_check','mole_map','mole_tried']
    precedent       T18 review-1.md line 25: mcp.test.ts "1 line toEqual → toContain, as the contract's assumption allows"
                    T15's own red commit made the same change to mcp.test.ts line 35 for mole_check
    not run         reviewer edited no test file      implementer must run npm run check after applying + log the result
```
