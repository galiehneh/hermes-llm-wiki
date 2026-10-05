---
title: Obsidian Human Knowledge Base on Host 99
source: ~/ObsidianVault (observed 2026-10-05)
author: Hermes operator (galiehneh)
retrieved: 2026-10-05
immutable: true
---

# Obsidian Human KB: Observed Architecture

This source records the Obsidian vault as it exists on host 10.0.0.10, taken from a read-only listing of the vault directory and its notes on 2026-10-05. Secrets are never stored in the vault; this document likewise contains none.

## Location and role

- **Vault path:** `~/ObsidianVault/`
- **Role:** long-form operational memory for Hermes: runbooks, inventories, incident timelines, reusable procedures. It is the human-curated ground truth.
- **Rules stated in `00-Index.md`:**
  - Keep Hermes memory for compact, stable, high-signal facts.
  - Keep detailed troubleshooting, inventory, and timelines in Obsidian.
  - Do not store secrets; store references or file locations only.
  - One note per topic.

## Observed structure (32 entries at top level)

Numbered hub notes act as the navigation spine; topic notes hang off them.

| Note | Purpose |
|---|---|
| `00-Index.md` | Vault index: purpose, vault path, rules, core notes, suggested workflow |
| `10-User Profile.md` | Stable operator preferences (direct Indonesian responses, data-first troubleshooting, concise technical output, Telegram as primary chat) and operational conventions (downloaded files go to `~/data/`; long detail moves to Obsidian) |
| `20-Network Overview.md` | Sites, gateways, controllers, ISP topology (Sophos XGS3300, five ISP lines), MikroTik router hierarchy |
| `30-Runbooks Index.md` | Index of reusable operational procedures and template links |
| `40-Inventory Index.md` | Index of devices, services and references, grouped (network device groups link to the per-site inventories) |
| `50-Incidents Index.md` | Chronological log of incidents and their resolution; the stated record format is date/time, site, symptom, data sources checked, timeline, root cause |
| `60-Memory Routing Rules.md` | What belongs in Hermes memory versus Obsidian |
| `70-Border-Gateway.md` | Backward-compatibility stub that points to `Firewall and Edge Inventory` |
| `80-9Router.md` | Backward-compatibility stub that points to `9Router Inventory` |

Topic notes include inventories (`Branch-East Inventory`, `Branch-East MikroTik Inventory`, `HQ Inventory`, `Branch-West Inventory`, `Transit-Site Inventory`, `Firewall and Edge Inventory`, `Active Directory CORP.INTERNAL Inventory`, `vSphere Inventory`, `9Router Inventory`, `Tracked Devices MAC`, `Web Applications and Projects Inventory`), runbooks (`Runbook - claude9 Wrapper`, `Runbook - claudeg Wrapper`, `Digital Receipt - Build and Versioning`), an incident note (`Incident 2026-07-27 - Fileshare Down CORP.INTERNAL`), a recon note, a multi-tenancy project note, a `Projects/` folder, and the system note `OpenViking Central Memory Server`.

## Templates

Four templates standardize recurring notes:

- `Connectivity Check Template`
- `Inventory Update Template`: sections are Device name, IP, Role, Site, Credential reference, Last verified. Use when device metadata changes.
- `Recovery Template`
- `Restart Template`

## Markdown conventions observed

- Plain CommonMark with ATX headings (`#`, `##`).
- Internal links use Obsidian wikilinks, for example `[[30-Runbooks Index]]` and `[[Runbook - claude9 Wrapper]]`. Hub notes link to topic notes; topic notes link back to hubs under a `Related:` line. Eighteen of the 32 top-level notes contain at least one wikilink.
- Tables are used for inventories and host matrices.
- Fenced code blocks hold command lines and ASCII topology diagrams.
- Notes are written in English and Indonesian.
- **Frontmatter is rare.** Two of the 32 top-level notes carry YAML frontmatter, both Digital-Receipt project notes: `Proyek Digital-Receipt - Multi-Tenancy & SSO` (`title`, `tags` as a nested list containing `project/digital-receipt` and `planning`, `status: draft`, `created`, `updated`) and `Digital Receipt - Build and Versioning` (`title`, `tags` containing `project/digital-receipt` and `devops`). The other 30 notes have none. Two further notes (`Web Applications and Projects Inventory`, `Recon - app.corp.internal`) use `---` only as horizontal rules.
- At the time of observation the vault had **no `.obsidian/` directory** visible from the filesystem listing and **no `.canvas` files**. Dataview, Canvas, and the graph view are therefore capabilities of Obsidian that this vault can adopt more widely, not features it relies on today.
- *Corrections, 2026-10-05:* an earlier revision of this snapshot stated that no note had frontmatter, and described `70-Border-Gateway` as an "edge-site note" and `10-User Profile`, `40-Inventory Index` and `50-Incidents Index` from their names alone. All were wrong or unverified; they were rewritten after opening the notes. See the `lint` entry in `wiki/log.md`.

## Core notes quoted

`00-Index.md` suggested workflow:

1. Check memory for stable facts.
2. Check Obsidian for detailed context.
3. Update memory only if the fact is compact and reusable.
4. Write everything else to Obsidian.

`60-Memory Routing Rules.md`:

> **Keep in Hermes memory:** stable user preferences; small persistent mappings; high-signal facts used often.
>
> **Keep in Obsidian:** long procedures; device inventories; troubleshooting timelines; site-specific operational detail; anything likely to overflow memory.
>
> **Review rule:** if a fact is long, detailed, or repetitive, move it out of memory into Obsidian.

`30-Runbooks Index.md` lists these existing runbook topics: connectivity checks, AP restart procedures, MikroTik access checks, SNMP verification, traceroute and latency interpretation, the inventory update workflow, Claude Code via 9Router with DeepSeek, and Claude Code via 9Router with Gemini Flash and Opus Thinking.

## Example runbook shape

`Runbook - claude9 Wrapper` demonstrates the house style: a `Purpose` section, a `Reference` section with `Related:` wikilinks and endpoints, an explicit statement that the token is **not stored in the vault** (only the location of its source variable is named), a per-host implementation table, and a dated model-history note. Host 99 uses a shell alias; host 84 uses a wrapper script, which is the recommended form for new hosts because it also works in cron and non-interactive shells.

## Relationship to OpenViking

The note `OpenViking Central Memory Server` records the division of responsibility:

- **Obsidian:** human-curated knowledge base, infrastructure documentation, runbooks, ground truth.
- **OpenViking:** multi-agent working memory, cross-machine context sharing (`viking://`), semantic retrieval, automated session reflection.

The OpenViking resource tree under `viking://resources/projects/` mirrors selected vault notes (agent runbooks, the web-apps inventory, Digital-Receipt notes), so agents can retrieve vault content semantically without reading the vault directly.

## Obsidian features relevant to LLM-maintained wikis

These are general Obsidian capabilities cited in the Karpathy gist, not claims about the host 99 vault:

- **Wikilinks and backlinks** make a folder of markdown into a navigable graph.
- **Graph view** shows hubs, clusters, and orphan notes.
- **Dataview** queries YAML frontmatter to build dynamic tables and lists.
- **Canvas** provides freeform boards for visual synthesis.
- **Web Clipper** converts web pages to markdown for the raw collection.
