---
title: Memory Layering
tags: [synthesis, memory, hermes, openviking, obsidian, routing]
category: synthesis
date: 2026-10-05
sources: [raw/hermes-agent-integration.md, raw/hermes-knowledge-routing.md, raw/obsidian-architecture.md, raw/openviking-architecture.md]
summary: The three-tier memory model of Hermes fast memory, OpenViking multi-agent context and the Obsidian human knowledge base, with routing, trust order and the compiled wiki above them.
---

# Memory Layering

The Hermes environment does not have one memory; it has **three tiers**, each tuned for a different cost, scope, and trust level, plus a compiled wiki on top. This page is the decision guide: which tier holds which fact, and why.

## The three tiers

### Tier 1: Hermes fast memory

- **Holds:** stable user preferences, small persistent mappings, high-signal facts used often. It is two files with hard caps: `USER.md` (1,375 characters) for who the user is and how they like to work, and `MEMORY.md` (2,200 characters) for environment facts, tool quirks, index pointers and standing conventions.
- **Cost model:** meant to be recalled instantly in future sessions, so it must stay tiny. The caps are the enforcement: on 2026-10-05 the two files were about 86% and 84% full by byte count, above the 80% point at which the `knowledge-routing` skill prescribes a pruning pass. Every character kept here is a character that cannot be used for something else.
- **Scope:** Hermes on host 99.
- **Rule of thumb:** if you would want it without asking, it belongs here. If it is long, it does not. Keep a pointer, not the content.

### Tier 2: OpenViking multi-agent context

- **Holds:** shared working memory and indexed resources: runbook mirrors, project specs, session reflections, agent-written memories. See [[OpenViking Architecture]].
- **Cost model:** pulled on demand through MCP. Semantic retrieval (Ollama `all-minilm`, 384 dimensions) returns ranked abstracts; a full read happens only for the chosen item ([[Viking Protocol]]).
- **Scope:** every agent on hosts 10.0.0.10, .84, and (unverified) .98. See [[Multi-Agent Topology]].
- **Rule of thumb:** if more than one agent or host will want it, and it can be found by meaning rather than by exact name, it belongs here.

### Tier 3: Obsidian human knowledge base

- **Holds:** long procedures, device inventories, troubleshooting timelines, site-specific detail, templates. See [[Obsidian Architecture]].
- **Cost model:** pulled on demand by reading files; navigation by hub notes and wikilinks ([[Obsidian Workflows]]).
- **Scope:** read directly by Hermes on host 99; reaches other hosts only through OpenViking ingestion.
- **Trust:** highest. Humans curate it and it is the ground truth. Everything else defers to it when they conflict.
- **Rule of thumb:** if it is long, detailed, or procedural, or if a human must be able to read and correct it, it belongs here.

## Side-by-side

| | Hermes fast memory | OpenViking | Obsidian vault |
|---|---|---|---|
| Size | Tiny: 1,375 + 2,200 character caps | Large | Large |
| Loaded | Recalled instantly, no lookup | On demand | On demand |
| Found by | Already in context | Semantic search | Index and links |
| Written by | Agent, curated | Agents, ingestion | Human (agents may assist) |
| Shared across hosts | No | Yes | Via OpenViking only |
| Trust | Medium | Medium (shared, may hold errors) | High |
| Secrets | Never | Never | Never; references only |

## Routing decisions

The vault's `60-Memory Routing Rules` gives the base policy ([[Obsidian Hermes Integration]]). Extended to three tiers:

1. Is it compact, stable, and used often? **Tier 1.**
2. Is it long, procedural, inventory-like, or needing human correction? **Tier 3**, and add a link from the right hub.
3. Do other agents on other hosts need to find it? Ingest the Tier 3 note into **Tier 2** (`viking://resources/projects/`); write agent-only working context directly to `viking://~/memories/`.
4. Is it a secret? **None of them.** Store the path of the credential file instead.

The review rule closes the loop: when a Tier 1 fact grows long or repetitive, demote it to Tier 3, leaving at most a pointer behind.

The `knowledge-routing` skill adds three operational rules worth keeping next to the model:

- **Pruning at 80%.** When memory passes 80% of its cap, move style and preference entries from `MEMORY.md` to `USER.md`, evict raw device and network dumps (IPs, router configs, CLI snippets) after confirming they live in Obsidian and the credential index, and merge fragmented rules into single lines. Do it in one atomic batch so the cap is validated against the net result.
- **Replace, do not append.** When the user corrects a held fact, replace the entry in place. Two versions of a fact in memory is a coin flip.
- **OpenViking is for what other agents need.** Ephemeral or evolving agent experience, context needed across harnesses and hosts, and unstructured text that benefits from tiered retrieval (the skill's L0 abstract, L1 overview and L2 details, which [[Viking Protocol]] describes as the reading ladder) go to `viking://~/memories/`.

Credentials fall outside all three tiers. They live in `~/.credentials/` with a quick-reference index, and a tier may hold at most a pointer. The skill's own audit explains why: the host backup encrypts the credential directory but copies the vault in plaintext, so a secret in Obsidian is a secret in the backup.

## Trust order and conflict handling

When tiers disagree, resolve in this order: Obsidian, then the OpenViking resource derived from it, then agent memories, then Hermes fast memory. A conflict is a bug to fix at the *highest* tier that is wrong, then propagate down. The host 98 question in [[Multi-Agent Topology]] is an example: two documents disagree, so the right move is to verify and update the vault note and runbook, not to pick a winner silently.

## The fourth layer: the compiled wiki

The three tiers store *facts*. None stores *synthesis*: the comparison, the contradiction flag, the rationale for the routing rules. That is the job of this wiki, described in [[Compounding Knowledge]] and maintained by the procedures in [[LLM Wiki Operations]]. It reads Tier 3 and Tier 2 as raw material and is itself a git repository of markdown, browsable in the Hermes dashboard. Its position in the whole stack is summarized in [[Overview]].

## Anti-patterns

- **Everything in Tier 1.** Context bloat; important preferences are crowded out.
- **Duplicated long-form facts** across tiers. They drift. Keep the long form in one place and pointers elsewhere.
- **Writing to OpenViking without checking the vault.** The mirror then outranks its source in retrieval while being less trustworthy.
- **Treating the wiki as ground truth.** It is a compiled artifact; its pages cite `raw/` sources, and the raw files cite the host files.

## Sources

- [[raw/hermes-agent-integration]]
- [[raw/hermes-knowledge-routing]]
- [[raw/obsidian-architecture]]
- [[raw/openviking-architecture]]
