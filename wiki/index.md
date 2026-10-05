---
title: Index
tags: [index, catalog]
category: overview
date: 2026-10-05
sources: []
summary: Catalog of every page in the wiki, grouped by category, each with a one-line summary.
---

# Index

Content-oriented catalog of the wiki. Agents read this first when answering a query and update it on every ingest (see [[LLM Wiki Operations]]). Chronology lives in [[Log]].

## Overview

- [[Overview]] — How Obsidian, OpenViking and the LLM Wiki connect around Hermes Agent.

## Obsidian

- [[Obsidian Architecture]] — Layout of the human-curated vault on host 99: hub notes, templates, conventions.
- [[Obsidian Workflows]] — Note taking, web clipping, tagging, Dataview and graph exploration, in use versus recommended.
- [[Obsidian Hermes Integration]] — Memory routing rules that keep runbooks and inventories out of the context window.

## OpenViking

- [[OpenViking Architecture]] — Central memory server: container, storage, Ollama embeddings, 9router summarizer, auth, firewall.
- [[Viking Protocol]] — The viking:// namespace and the find, abstract, overview, read ladder.
- [[Multi-Agent Topology]] — Which agents on hosts 99, 84 and 98 share memory, and the open question on host 98.

## Synthesis

- [[Compounding Knowledge]] — Karpathy's persistent wiki versus query-time RAG, mapped onto this environment.
- [[Memory Layering]] — The three-tier model: Hermes fast memory, OpenViking context, Obsidian knowledge base.

## Operations

- [[LLM Wiki Operations]] — Ingest, Query and Lint lifecycles for autonomous agents.
- [[Log]] — Chronological record of ingests, queries and lint passes.

## Sources

- [[raw/karpathy-llm-wiki-gist]] — Karpathy's LLM Wiki pattern: three layers, three operations, index and log.
- [[raw/obsidian-architecture]] — Observed structure and conventions of the Obsidian vault on host 99.
- [[raw/openviking-architecture]] — Observed deployment, models, auth, firewall and clients of OpenViking.
- [[raw/hermes-agent-integration]] — Hermes memory layers and dashboard plugin architecture.
