---
title: Log
tags: [log, chronology]
category: operations
date: 2026-10-05
sources: []
summary: Append-only chronological record of ingests, queries and lint passes on this wiki.
---

# Log

Append-only. Newest entries go at the bottom. Each entry heading is `## [YYYY-MM-DD] <type> | <title>` so `grep "^## \[" wiki/log.md | tail -5` lists recent activity. Types: `ingest`, `query`, `lint`, `schema`, `release`. See [[LLM Wiki Operations]] and [[Index]].

## [2026-10-05] ingest | Karpathy LLM Wiki gist

- Added `raw/karpathy-llm-wiki-gist.md`, the full text of the gist retrieved on 2026-10-05.
- Basis for [[Compounding Knowledge]] and [[LLM Wiki Operations]].

## [2026-10-05] ingest | Obsidian vault architecture

- Added `raw/obsidian-architecture.md` from a read-only listing of the vault on host 99.
- Noted that the vault has no frontmatter, no `.obsidian/` configuration and no Canvas files.
- Created [[Obsidian Architecture]], [[Obsidian Workflows]] and [[Obsidian Hermes Integration]].

## [2026-10-05] ingest | OpenViking central memory server

- Added `raw/openviking-architecture.md` from the admin runbook and vault note. No credential values recorded.
- Flagged a discrepancy: the vault lists host 98 as connected, the runbook says it was skipped.
- Created [[OpenViking Architecture]], [[Viking Protocol]] and [[Multi-Agent Topology]].

## [2026-10-05] ingest | Hermes agent integration

- Added `raw/hermes-agent-integration.md` covering memory layers and dashboard plugin structure.
- Created [[Memory Layering]] and [[Overview]].

## [2026-10-05] schema | Initial conventions

- Wrote `SCHEMA.md`: frontmatter fields, wikilink syntax, ingest, query and lint protocols, log format.
- Created [[Index]] and this log.

## [2026-10-05] lint | Initial pass

- All pages have the required frontmatter and are listed in [[Index]].
- Vault-internal links such as `[[30-Runbooks Index]]` appear only inside code spans and are intentionally not wiki links.
- Open item: verify OpenViking connectivity from host 98 (see [[Multi-Agent Topology]]).

## [2026-10-05] lint | Corrected the vault frontmatter claim

- The ingest entries above state that the vault has no frontmatter. That was wrong: two Digital-Receipt project notes have YAML frontmatter (`title`, nested `tags`, and in one `status`, `created`, `updated`). The error came from reading a `grep` for `---` as no matches before opening the files.
- An audit of claims inferred from file names found more: `70-Border-Gateway` is a backward-compatibility stub (not an "edge-site note"), and `obsidian-memory` is a browse-and-edit dashboard plugin for the vault (not a bridge into Hermes). The purposes of `10-User Profile`, `40-Inventory Index` and `50-Incidents Index` were rewritten from their actual contents.
- Corrected `raw/obsidian-architecture.md` and `raw/hermes-agent-integration.md` in place (each marked with a dated correction note, allowed by the Raw mutation check in `SCHEMA.md`) and the claims in [[Obsidian Architecture]], [[Obsidian Workflows]], [[Obsidian Hermes Integration]] and [[Overview]].
- The earlier log entries are left unedited, as the log is append-only.
