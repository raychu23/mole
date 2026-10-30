# Design review: decision graph core

- AGREED: `loadGraph()` is the only place that reads `.mole/decisions/*.md` off disk; everything else takes the parsed graph as an argument.
- deferred: whether to cache the parsed graph between CLI invocations
