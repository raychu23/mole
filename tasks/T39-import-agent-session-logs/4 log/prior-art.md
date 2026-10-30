```notes
T39 prior art      agent session logs → code      2026-10-29 (prior-art-first; searched today)
    entire              ex-GitHub CEO Thomas Dohmke · $60M seed · open-source CLI 'Checkpoints': on each agent commit stores transcript, prompts, files touched, tokens, line attribution as git objects (entire/checkpoints/v1 or refs/entire/checkpoints/*), linked by commit trailer
                        roadmap: 'a git-compatible database that unifies code, intent, constraints, and reasoning' + 'semantic reasoning layer' → closest future competitor to Mole's center
                        https://entire.io/blog/hello-entire-world · https://github.com/entireio/cli (docs/architecture/sessions-and-checkpoints.md)
    git-ai              open source · agents call 'git ai checkpoint'; on commit line-level Authorship Log in Git Notes (refs/notes/ai): line → agent, model, prompt · 'git ai blame' + VS Code gutter · Prompt + Context Store 'surfaces the why behind every line of AI-generated code'
                        https://github.com/git-ai-project/git-ai · https://usegitai.com/docs/get-started/ai-blame
    agent trace         open spec (Cursor RFC, Cognition, Jan 2026) v0.1.0: per file → conversations → line ranges + content_hash + model · https://agent-trace.dev/
    specstory           saves chats as markdown in .specstory/history, derives rules files · https://docs.specstory.com/
    gap Mole fills      all four record what an agent did when it wrote a line; none re-checks that the intent still holds after later edits, ties it to the team's decisions, or scopes it to a function (Agent Trace has content_hash per range, the closest hook)
    decision            consume, don't capture: Entire + git-ai + Agent Trace as sources; Mole adds function anchoring + staleness + decisions
```
