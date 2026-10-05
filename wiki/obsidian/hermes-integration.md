---
title: Obsidian Hermes Integration
tags: [obsidian, hermes, memory-routing, runbooks]
category: obsidian
date: 2026-10-05
sources: [raw/obsidian-architecture.md, raw/hermes-agent-integration.md, raw/hermes-knowledge-routing.md]
summary: The memory routing rules that tell Hermes what to keep in fast memory versus Obsidian, and how that keeps runbooks and inventories out of the context window.
---

# Obsidian Hermes Integration

Hermes Agent on host 99 has a small, always-loaded memory and access to a large vault. The integration between them is a **routing policy**, written down in the vault note `60-Memory Routing Rules`, that decides where each fact lives. Its purpose is to avoid context window bloat while keeping detailed knowledge one lookup away.

## The routing rules

**Keep in Hermes memory**
- Stable user preferences
- Small persistent mappings
- High-signal facts used often

**Keep in Obsidian**
- Long procedures
- Device inventories
- Troubleshooting timelines
- Site-specific operational detail
- Anything likely to overflow memory

**Review rule:** if a fact is long, detailed, or repetitive, move it out of memory into Obsidian.

## Why this avoids context bloat

Hermes memory is meant to be recalled instantly in future sessions, so it is kept deliberately tiny, and the size limits are hard: `USER.md` holds at most 1,375 characters and `MEMORY.md` at most 2,200 (see [[Memory Layering]]). On 2026-10-05 both were already above 80% full by byte count. A five-ISP topology table would not fit, and one would only be there by evicting something more important. Stored in Obsidian instead, the same material costs nothing until a task needs it, and then Hermes reads exactly one note.

This is a **pull** model versus a **push** model. Memory pushes everything into the prompt; the vault is pulled on demand. The numbered hub notes (see [[Obsidian Architecture]]) make the pull cheap: Hermes reads `00-Index`, follows one link to the right hub, and from there to the topic note. Three small reads replace a large permanent prompt.

## The lookup order

The vault's suggested workflow doubles as Hermes' operating procedure:

1. Check memory for a stable fact.
2. If more detail is needed, read Obsidian: index, then hub, then topic note.
3. After solving something, ask whether the new fact is compact and reusable. If yes, update memory. If not, write it to Obsidian.
4. Never record a secret. Record where the secret lives.

## Runbooks and inventories in practice

- **Runbooks.** `30-Runbooks Index` lists procedures: connectivity checks, AP restarts, MikroTik access checks, SNMP verification, traceroute interpretation, the inventory update workflow, and Claude Code via 9Router. When asked to restart an access point, Hermes opens the runbook rather than relying on remembered steps, so a corrected runbook corrects Hermes immediately.
- **Inventories.** Device facts (IP, role, site, credential reference, last verified) live one per note. Memory may hold a *pointer* such as "Branch-East core router is documented in Branch-East MikroTik Inventory", which is a small mapping and so allowed.
- **Incidents.** Timelines like the 2026-07-27 fileshare outage stay in the vault. Memory keeps at most the lesson.

## How the vault reaches other agents

Hermes reads the vault directly because it shares host 99 with it. Agents on 10.0.0.20 and 10.0.0.30 cannot, so selected notes are ingested into OpenViking and retrieved with `find` and `read`; see [[OpenViking Architecture]] and [[Multi-Agent Topology]]. The vault note `OpenViking Central Memory Server` states the split: Obsidian is ground truth, OpenViking is working memory. The full model is in [[Memory Layering]].

## Where this wiki fits

The `obsidian-memory` plugin on host 99 is a dashboard surface for browsing and editing the vault itself (graph, wikilinks, inline editing). This repository's plugin is deliberately different: read-only, and focused on a compiled layer with synthesis pages the vault does not contain. When the vault changes, an agent follows the ingest procedure in [[LLM Wiki Operations]] and updates the affected pages.

## Failure modes the rules prevent

- **Memory overflow:** long text crowds out preferences, and the character caps make this a hard failure, not a gradual one. Fix: move to Obsidian, and prune in one atomic batch past 80% fill.
- **Stale duplicated facts:** the same fact in memory and vault diverges. Fix: keep the long form in the vault, the pointer in memory.
- **Secret leakage:** a token in a note is readable by anything that reads or indexes the vault, and the host backup copies the vault in plaintext while encrypting the credential directory. Fix: references only, with the secret itself in `~/.credentials/`.

## Sources

- [[raw/obsidian-architecture]]
- [[raw/hermes-agent-integration]]
- [[raw/hermes-knowledge-routing]]
