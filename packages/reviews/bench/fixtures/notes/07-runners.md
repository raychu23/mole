# Design review: panel runners

- AGREED: `makeRunners()` shells out to the daemon CLI for every heavy read instead of importing those packages into the extension host bundle, to keep the webview bundle small.
- open question about retry backoff, no decision yet
