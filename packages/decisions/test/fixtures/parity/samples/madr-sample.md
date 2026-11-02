---
id: '0099'
title: Test
status: accepted
---

## Context and Problem Statement

We need to decide how to store configuration for the service layer so that both local development and
production deployments can share the same loading code path without duplicating parsing logic.

## Decision Drivers

* Must work with zero external dependencies
* Must support environment-variable overrides

## Considered Options

* A single JSON file read at startup
* A layered config (defaults + env overrides)

## Decision

We picked option A because it is simplest and the team already has tooling for JSON validation.

## Consequences

Future changes must keep option A's shape backward compatible, or ship a migration script alongside them.
