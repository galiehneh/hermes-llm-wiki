---
title: Compounding Knowledge
tags: [synthesis, karpathy, rag, llm-wiki, compounding]
category: synthesis
date: 2026-10-05
sources: [raw/karpathy-llm-wiki-gist.md, raw/hermes-agent-integration.md]
summary: Analysis of Karpathy's persistent compounding wiki against query-time RAG, and where each approach fits among Hermes memory, OpenViking, and Obsidian.
---

# Compounding Knowledge

Andrej Karpathy's LLM Wiki gist ([[raw/karpathy-llm-wiki-gist]]) argues for a change in how LLMs relate to documents. This page restates the argument, tests it against the environment described in the rest of this wiki, and says where it does and does not apply.

## The two paradigms

**Query-time retrieval (RAG).** Documents are chunked, embedded, and stored. At question time the system retrieves the most similar chunks and the model writes an answer from them. Knowledge is *re-derived on every question*. Ask something that needs five documents synthesized and the model must find and combine the fragments again, every time. Nothing is built up. Karpathy names NotebookLM, ChatGPT file uploads, and most RAG systems as examples.

**The compounding wiki.** An LLM *incrementally builds and maintains* a persistent set of interlinked markdown pages between the human and the raw sources. When a source arrives, the model reads it, extracts the key points, and *integrates* them: it updates entity pages, revises summaries, and notes where new data contradicts old claims. Knowledge is **compiled once and kept current**. The cross-references already exist; the contradictions are already flagged.

The gist's analogy is software: Obsidian is the IDE, the LLM is the programmer, the wiki is the codebase. The raw sources are like upstream dependencies, immutable; the schema is the style guide and build configuration.

## Why it compounds

Three properties produce the compounding effect:

1. **Synthesis is stored.** An answer that required connecting four sources becomes a page, so the next question starts from the connection rather than from scratch. The gist says good query answers should be *filed back* as new pages.
2. **Maintenance cost is near zero.** The tedious part of a knowledge base is bookkeeping: cross-references, summaries, consistency. People abandon wikis because upkeep outgrows value. An LLM does not tire and can touch many files in one pass.
3. **Errors are visible.** Because claims live in a durable, linked place, a contradiction between two pages can be detected by lint ([[LLM Wiki Operations]]). In pure RAG, a contradiction between two chunks is invisible until a query happens to surface both.

## Where RAG is still right

The wiki is not a replacement for retrieval. It has costs: an ingest pass per source, and a risk that a compiled claim drifts from its source. Retrieval remains the better tool when:

- the corpus is large, changes constantly, or is mostly looked up rather than synthesized (log streams, raw inventories);
- exact text matters more than summary (a configuration value, a command line);
- nobody has yet decided what the synthesis should be.

Karpathy himself notes the index file "works surprisingly well at moderate scale (~100 sources, ~hundreds of pages)" and only then suggests a search tool such as qmd. Below that scale the wiki's own `index.md` is the retrieval layer, which is why this repository has an index and no vector store.

## Mapping onto this environment

The Hermes environment already runs several memory systems; each corresponds to a position on the spectrum.

| System | Closest paradigm | Strength | Weakness |
|---|---|---|---|
| Hermes fast memory | Small capped notes (`USER.md`, `MEMORY.md`) | Zero lookup cost | Tiny: 1,375 and 2,200 character caps |
| OpenViking | Query-time retrieval, with abstracts | Cross-agent, semantic, scalable | Re-derives synthesis per query; shared bad memory |
| Obsidian vault | Human-curated source | Trusted ground truth | Manual upkeep; no synthesis across notes |
| **This LLM Wiki** | Compounding wiki | Synthesis stored, contradictions flagged | Needs ingest discipline; can lag its sources |

OpenViking is retrieval-shaped: [[Viking Protocol]] describes a ladder (find, abstract, overview, read) that is an efficient query-time design. The vault is source-shaped: [[Obsidian Architecture]] describes human-written notes that an LLM could ingest. The wiki sits *on top of both*. It reads the vault and OpenViking resources as raw material and produces pages such as this one, which neither of them contains. See [[Memory Layering]] for how the tiers divide labor.

## A worked example

Consider the question: *"Can the agent on host 98 use shared memory?"* A retrieval system fetches the vault note (which says yes) and the admin runbook (which says host 98 was skipped) and must notice the conflict in that moment. The compounding wiki handled it once, at ingest: [[Multi-Agent Topology]] records both statements, marks the status unverified, and gives the two commands that would settle it. Every later question starts from that resolved view. This is the compounding benefit in miniature.

## What compounding requires

- **Immutable raw sources.** The three layers are separate so the wiki can always be checked against ground truth.
- **A schema** that makes the agent a disciplined maintainer rather than a chatbot. In this repository that is `SCHEMA.md`.
- **A log** (`wiki/log.md`) so any agent can see what was done recently.
- **Lint passes** to catch orphans, stale claims, and contradictions.

Without these, a wiki degrades into an unreviewed pile of generated text, which is worse than retrieval because it looks authoritative.

## Sources

- [[raw/karpathy-llm-wiki-gist]]
- [[raw/hermes-agent-integration]]
