---
title: Obsidian Workflows
tags: [obsidian, workflows, dataview, graph, clipping]
category: obsidian
date: 2026-10-05
sources: [raw/obsidian-architecture.md, raw/karpathy-llm-wiki-gist.md]
summary: Day-to-day note taking, web clipping, tagging, Dataview queries and graph exploration for the vault, separating what is in use from what is recommended.
---

# Obsidian Workflows

This page describes how work flows through the vault described in [[Obsidian Architecture]]. Each workflow is labeled **in use** (observed on host 99) or **recommended** (a capability named in the Karpathy gist that the vault can adopt). Keeping that distinction honest is the whole point; see [[LLM Wiki Operations]] for the lint rule that enforces it.

## 1. Note taking (in use)

The vault's own suggested workflow is a four-step loop:

1. Check Hermes memory for stable facts.
2. Check Obsidian for detailed context.
3. Update memory only if the fact is compact and reusable.
4. Write everything else to Obsidian.

In practice a new note starts from a **template**. For a device change the operator (or Hermes on their behalf) copies the Inventory Update template and fills in device name, IP, role, site, credential *reference*, and last verified. For an outage the Recovery or Restart template provides the skeleton. After writing the note, the matching hub (`40-Inventory Index`, `30-Runbooks Index`, or `50-Incidents Index`) gets one new wikilink so the note is reachable.

The rule **one note per topic** keeps notes short and linkable. When a note starts covering two topics, split it and link the halves.

## 2. Linking and hubs (in use)

Link downward from hubs and upward with a `Related:` line. A runbook typically ends up with a `Reference` section such as: related inventory `[[9Router Inventory]]`, parent index `[[30-Runbooks Index]]`. Because links are bidirectional in Obsidian's backlinks panel, either direction is enough to find the relationship later.

## 3. Web clipping (recommended)

The gist recommends **Obsidian Web Clipper**, a browser extension that converts a web page into markdown. For this project the clipper's role is to feed the *raw* layer of the LLM Wiki, not the operational vault: clipped pages are saved under `raw/`, treated as immutable, and later ingested by an agent (see [[LLM Wiki Operations]]). The gist also suggests setting the attachment folder to a fixed directory such as `raw/assets/` and binding "Download attachments for current file" to a hotkey so images are stored locally and survive link rot.

## 4. Tagging and frontmatter (recommended)

Only two vault notes currently have YAML frontmatter, the Digital-Receipt project notes, which use `title`, a nested `tags` list such as `project/digital-receipt`, and in one case `status`, `created` and `updated`. Inventories and runbooks have none. The LLM Wiki in this repository puts frontmatter on every page, with the fields in `SCHEMA.md` (title, tags, category, date, sources, summary). Extending a minimal version to the rest of the vault, for instance `type`, `site`, and `last-verified`, would make inventories queryable. Tags are best kept to a short controlled vocabulary because every new tag fragments retrieval.

## 5. Dataview queries (recommended)

Dataview runs queries over page frontmatter and renders live tables. Once inventories carry `site` and `last-verified`, a query like this lists stale entries:

```dataview
TABLE site, last-verified
FROM "Inventory"
WHERE last-verified < date(today) - dur(90 days)
SORT last-verified ASC
```

The same technique applies to this wiki: if every page has `date` and `category`, a Dataview table of pages per category reproduces `wiki/index.md` automatically. The dashboard's `/status` endpoint computes the same counts server-side for people who do not use Obsidian.

## 6. Graph exploration (in use as a capability)

The graph view shows hubs, clusters, and orphans. For the operational vault the numbered hubs should appear as large nodes with inventories and runbooks clustered around them; a note floating alone has no inbound link and needs one from its hub. The Hermes dashboard plugin renders an equivalent force-directed graph of this wiki's pages, colored by category, so the check does not require opening Obsidian. See [[Overview]].

## 7. Canvas (recommended, optional)

Canvas is a freeform board. It suits visual syntheses such as the router hierarchy in `20-Network Overview`, which is currently an ASCII diagram in a code fence. A canvas version would let nodes link directly to inventories. Since none exist today, treat Canvas as an enhancement, not a dependency.

## 8. Handing material to the agents

When a vault note matters to agents on other hosts, it is ingested into OpenViking under `viking://resources/projects/` (see [[OpenViking Architecture]] and [[Viking Protocol]]). The vault remains the source of truth; OpenViking holds a semantically searchable mirror with generated abstracts. Edit the vault first, then re-ingest, never the reverse. The routing policy that decides *what* moves where is in [[Obsidian Hermes Integration]].

## Sources

- [[raw/obsidian-architecture]]
- [[raw/karpathy-llm-wiki-gist]]
