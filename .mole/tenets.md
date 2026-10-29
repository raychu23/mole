# Mole tenets

A few principles, each "unless you know better ones". Decisions in `.mole/decisions/` trace to them (`traces_to`).
A tenet is retired by adding `retired` to its heading line; decisions tracing to it then turn yellow.

## tenet-1 · Facts come from code and git, never from a model guess

Every edge, line and flag Mole shows is computed from the compiler, the files or git history, with a file:line behind it.
A model may reword what code found; it never adds a fact.

## tenet-2 · A background process nobody asked for must not outlive its editor

The daemon serves the editor. When nobody uses it, it stops on its own instead of running for days.

## tenet-3 · The map stays usable while you work

Opening a map is fast and the map never stops under your hands while you type or while the index runs.

## tenet-4 · What you read and what your agents did stays on your machine

Read history and agent transcripts are personal. Mole reads them locally, never writes into them and never commits them.
