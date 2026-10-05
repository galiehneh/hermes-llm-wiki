---
title: Overview
tags: [overview, synthesis, hermes, obsidian, openviking, llm-wiki]
category: overview
date: 2026-10-05
sources: [raw/karpathy-llm-wiki-gist.md, raw/obsidian-architecture.md, raw/openviking-architecture.md, raw/hermes-agent-integration.md]
summary: High-level synthesis connecting Obsidian as the human knowledge base, OpenViking as agent working memory, and the LLM Wiki as persistent compounding knowledge.
---

# Overview

This wiki documents how three knowledge systems fit together around **Hermes Agent** on the 10.0.0.x network, and is itself the third of them.

| System | Role | One-line description |
|---|---|---|
| **Obsidian** | Human-curated knowledge base | Markdown vault of runbooks, inventories and incidents; the ground truth ([[Obsidian Architecture]]) |
| **OpenViking** | Agent working memory | Central `viking://` memory server shared by agents on three hosts ([[OpenViking Architecture]]) |
| **LLM Wiki** | Persistent compounding knowledge | Agent-maintained, interlinked synthesis built from raw sources ([[Compounding Knowledge]]) |

Hermes' own fast memory sits beside them as a small always-loaded tier. The decision guide for all of it is [[Memory Layering]].

## The story in five sentences

Hermes needs to know a lot more than fits in its prompt, so long-form knowledge lives in an Obsidian vault written by a human and guarded by a no-secrets rule ([[Obsidian Hermes Integration]]). Because Hermes is only one of several agents, selected vault content and agent memories are served from one OpenViking server that Claude Code, OpenCode and Hermes all reach over MCP ([[Multi-Agent Topology]]). Neither store holds *synthesis*: the comparison between them, the contradictions between documents, the reasoning behind the routing rules. Andrej Karpathy's LLM Wiki pattern supplies the missing layer: an LLM builds and maintains a persistent wiki from immutable raw sources so that knowledge compounds instead of being re-derived at every query. This repository is that wiki, and its Hermes dashboard plugin lets the operator browse it as a tab.

## How the pieces connect

```
 human curates              agents read/write            agent compiles
 +-------------+  ingest   +----------------+  ingest   +-----------------+
 |  Obsidian   | --------> |   OpenViking   | --------> |   LLM Wiki      |
 |  vault (99) |  (mirror) |  viking:// (99)|  (raw/)   |  raw/ wiki/ ... |
 +-------------+           +----------------+           +-----------------+
        ^                          ^                            |
        |  pull on demand          |  MCP: find/read/remember   | dashboard tab
        +---------- Hermes Agent + Claude Code + OpenCode ------+
```

- **Obsidian to OpenViking:** selected notes are ingested so agents on other hosts can retrieve them by meaning ([[Viking Protocol]]).
- **Both to the wiki:** snapshots become files in `raw/`; agents integrate them into pages using the procedures in [[LLM Wiki Operations]].
- **Trust flows downhill:** when sources disagree, the human-curated vault outranks its OpenViking mirror, which outranks agent memories, which outrank Hermes' fast memory.

## What each layer is best at

- **Obsidian:** correctness and human readability. A person can open a runbook, read it, and fix it.
- **OpenViking:** reach and retrieval. One ingest serves every agent; search is semantic (Ollama `all-minilm`, 384 dimensions) and tiered by abstract, overview and full read.
- **LLM Wiki:** accumulated understanding. Each source and each filed-back answer makes later answers cheaper and more consistent.

## Open questions the wiki currently tracks

- **Host 98.** The vault says it is connected to OpenViking; the admin runbook says it was skipped and no firewall rule is listed. Unverified; see [[Multi-Agent Topology]].
- **Vault structure.** The vault has frontmatter on only two of 32 notes and no Canvas files or visible `.obsidian/` configuration, so Dataview and Canvas are available but largely unused ([[Obsidian Workflows]]).

## Reading guide

1. Start with [[Memory Layering]] for the model.
2. Read [[Obsidian Architecture]] and [[OpenViking Architecture]] for the two stores.
3. Read [[Compounding Knowledge]] for why a third layer is worth maintaining.
4. Use [[LLM Wiki Operations]] if you are an agent about to edit this wiki, and `SCHEMA.md` for the exact conventions.

## Sources

- [[raw/karpathy-llm-wiki-gist]]
- [[raw/obsidian-architecture]]
- [[raw/openviking-architecture]]
- [[raw/hermes-agent-integration]]
