---
title: Obsidian Architecture
tags: [obsidian, vault, structure, human-kb]
category: obsidian
date: 2026-10-05
sources: [raw/obsidian-architecture.md, raw/karpathy-llm-wiki-gist.md]
summary: How the Obsidian vault on host 99 is laid out, what its hub notes and templates do, and which Obsidian features it uses today versus could adopt.
---

# Obsidian Architecture

The Obsidian vault is the **human-curated knowledge base** of the Hermes environment. It lives on host 10.0.0.10 at `~/ObsidianVault/` and holds the long-form operational memory that is too big, too detailed, or too repetitive for Hermes' own fast memory. In the three-layer model of [[Memory Layering]] it is the ground-truth tier; in the vocabulary of [[Compounding Knowledge]] it is the place where a *human* does what the LLM does in Karpathy's wiki: curate and keep honest.

## Purpose and rules

The vault index (`00-Index.md`) states four rules that shape everything else:

1. Hermes memory holds only compact, stable, high-signal facts.
2. Detailed troubleshooting, inventory, and timelines go in Obsidian.
3. **No secrets.** Notes store references and file locations, never credential values.
4. One note per topic.

The no-secrets rule is load-bearing. A runbook such as `Runbook - claude9 Wrapper` says explicitly that its token is not in the vault and names only the variable and file on host 99 where the token originates. This keeps the vault safe to read, to sync, and to index into [[OpenViking Architecture]].

## Directory design

The vault is flat at the top level (32 entries at observation time) with one `Projects/` folder. Structure comes from naming and linking rather than nesting. Numbered **hub notes** form the spine:

| Hub | Role |
|---|---|
| `00-Index` | Entry point: purpose, vault path, rules, core notes, suggested workflow |
| `10-User Profile` | Stable operator preferences and operational conventions, such as where downloaded files go |
| `20-Network Overview` | Sites, gateways, five ISP lines behind a Sophos XGS3300, MikroTik router hierarchy |
| `30-Runbooks Index` | Catalog of procedures and templates |
| `40-Inventory Index` | Catalog of devices, services and references, with the per-site inventories grouped under it |
| `50-Incidents Index` | Chronological log of incidents; each record notes date, site, symptom, data sources checked, timeline and root cause |
| `60-Memory Routing Rules` | The routing policy described in [[Obsidian Hermes Integration]] |
| `70-Border-Gateway`, `80-9Router` | Backward-compatibility stubs that point at `Firewall and Edge Inventory` and `9Router Inventory` |

The numeric prefixes sort the hubs to the top of any file listing and make their order stable. Everything else is a **topic note** named in plain language: inventories (Branch-East, HQ, Branch-West, Transit-Site, vSphere, Active Directory, Firewall and Edge, 9Router, Tracked Devices MAC, Web Applications and Projects), runbooks (claude9 and claudeg wrappers, Digital Receipt build and versioning), an incident note (2026-07-27 fileshare outage), and the `OpenViking Central Memory Server` system note.

## Linking pattern

Hub notes link down to topic notes with wikilinks, for example `[[30-Runbooks Index]]` listing `[[Runbook - claude9 Wrapper]]`. Topic notes link back up under a `Related:` line. Eighteen of the 32 top-level notes carry at least one wikilink. This hub-and-spoke pattern gives Obsidian's backlinks panel and graph view something useful to show: opening a hub reveals its topic notes, and opening a topic reveals which hubs list it.

## Templates

Four templates standardize recurring notes: Connectivity Check, Inventory Update, Recovery, and Restart. The Inventory Update template, for instance, fixes six sections: device name, IP, role, site, credential reference, last verified. Notice that the *credential reference* field is a pointer, again honoring the no-secrets rule. Templates matter for an LLM-assisted workflow because a consistent shape makes notes machine-readable without any special tooling.

## Conventions observed

- Plain CommonMark: ATX headings, tables for inventories, fenced blocks for commands and ASCII topology.
- Bilingual notes, English and Indonesian.
- A `Purpose` then `Reference` then procedure layout in runbooks, with dated history notes (for example the 2026-09-18 model change recorded in the claude9 runbook).

## What the vault does not use (yet)

At observation the vault had **no `.obsidian/` configuration visible and no Canvas files**, and **YAML frontmatter on only two of 32 notes**, both Digital-Receipt project notes (`title`, nested `tags` such as `project/digital-receipt`, and in one also `status`, `created`, `updated`). Everything else, including every inventory and runbook, has none. Dataview, Canvas, and graph-view tuning are therefore *available* but not *relied upon*. This is a useful finding for [[Obsidian Workflows]]: the two project notes already show the shape to copy, and extending frontmatter (`site`, `last-verified`) to inventories would unlock Dataview tables with no change to note bodies.

## Contrast with this wiki

The vault is written and curated by a human and optimized for operational lookup. This repository's `wiki/` is written by LLM agents and optimized for *synthesis*. They are complementary, and the vault is a **source** for the wiki, never a target. See [[Overview]] for the full picture and [[LLM Wiki Operations]] for how ingestion from the vault works.

## Sources

- [[raw/obsidian-architecture]]
- [[raw/karpathy-llm-wiki-gist]]
