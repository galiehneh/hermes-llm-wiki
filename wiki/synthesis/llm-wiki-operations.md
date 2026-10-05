---
title: LLM Wiki Operations
tags: [operations, ingest, query, lint, schema, agents]
category: operations
date: 2026-10-05
sources: [raw/karpathy-llm-wiki-gist.md, raw/hermes-agent-integration.md]
summary: The Ingest, Query and Lint lifecycles an autonomous agent follows to keep this wiki correct, indexed and logged.
---

# LLM Wiki Operations

Three operations keep an LLM wiki healthy: **ingest**, **query**, and **lint**. They come from the Karpathy gist ([[raw/karpathy-llm-wiki-gist]]) and are specified for this repository in `SCHEMA.md`. This page explains the *why* behind each step so an agent (Claude Code, Hermes, or another) can follow the procedure intelligently. The paradigm behind them is in [[Compounding Knowledge]].

## Ground rules

- `raw/` is **immutable**. Agents read it and never edit it. New knowledge arrives as a *new* raw file.
- `wiki/` is **agent-owned**. Agents create and revise pages; humans read and direct.
- `SCHEMA.md` is the contract. If the procedure here and the schema disagree, the schema wins and this page gets fixed.
- No secrets, anywhere. Write the path to a credential file, never its contents.
- Everything is local git. Commit after each operation with a message that names it; never push unless the operator asks.

## Ingest

Goal: fold a new source into the wiki so the knowledge is compiled, not just stored.

1. **Place the source** in `raw/` as markdown with frontmatter (title, source, author, retrieved, immutable). Never rewrite an existing raw file.
2. **Read it fully**, and read `wiki/index.md` to see what already covers the topic.
3. **Discuss or note key takeaways.** For unattended runs, write them into the log entry instead.
4. **Write or update pages.** A single source commonly touches several pages: the entity or topic page it belongs to, related pages that should now link to it, and any synthesis page whose conclusion changes. Cite the raw file in each page's `sources` frontmatter and in its `## Sources` section as `[[raw/<name>]]`.
5. **Flag contradictions** rather than overwriting. State both claims, name both sources, and mark status. The host 98 note in [[Multi-Agent Topology]] is the model.
6. **Update `wiki/index.md`**: add each new page under its category with a one-line summary.
7. **Append to `wiki/log.md`**: `## [YYYY-MM-DD] ingest | <title>` plus bullets listing pages created and updated.
8. **Validate** (see Lint) and **commit**.

Ingesting from this environment's stores follows the same shape:

- *From the vault* ([[Obsidian Architecture]]): snapshot the relevant notes into a new `raw/` file, citing the vault path and observation date. Skip secrets.
- *From OpenViking* ([[Viking Protocol]]): use `find`, then `abstract` or `overview`, then `read`; quote what you used and the `viking://` URI in the raw file.

## Query

Goal: answer a question from the wiki, and let good answers compound.

1. **Read `wiki/index.md` first.** It is the catalog; at this scale it replaces vector search.
2. **Open the relevant pages**, then follow wikilinks and check the backlinks of key pages for related material. The dashboard's Linked References panel and `/page` endpoint expose exactly this.
3. **Search** with the dashboard's `/search` endpoint or `grep -ri` if the index is not enough.
4. **Answer with citations** to wiki pages, and through them to raw sources.
5. **File back** any answer that is a durable synthesis (a comparison, a decision, a connection) as a new page, then update the index and log (`## [date] query | <title>`). Throwaway answers are not filed.
6. If the wiki cannot answer, say so, and propose a source to ingest. Do not invent.

## Lint

Goal: catch rot before it spreads. Run after every ingest, and periodically on its own.

| Check | How | Fix |
|---|---|---|
| Orphan pages | A page with no inbound wikilink other than the index | Link it from a related page |
| Broken wikilinks | A `[[target]]` that resolves to no page and no raw file | Create the page, fix the spelling, or remove the link |
| Missing frontmatter | Required fields absent: title, tags, category, date, sources, summary | Add them |
| Index drift | A page exists that the index lacks, or the reverse | Reconcile `index.md` |
| Stale claims | A page's `date` older than a source that supersedes it | Re-read the source and revise |
| Contradictions | Two pages assert incompatible facts | Record both, cite both, mark status; resolve at the highest-trust tier ([[Memory Layering]]) |
| Concepts without pages | A term mentioned repeatedly, no page | Create a page |
| Secrets | Anything resembling a key, token, or password | Remove and report to the operator |
| Log format | Entries not matching `## [YYYY-MM-DD] type \| title` | Fix the heading |

Lint results go in the log as `## [date] lint | <summary>`. The dashboard supports these checks: `/status` shows page, word, and source counts; `/graph` shows orphans as isolated nodes; `/log` shows the timeline.

## Cadence

- **Ingest:** whenever a source is added; one at a time when the operator wants to stay involved.
- **Lint:** after each ingest, plus a periodic pass, for example monthly.
- **Query:** any time; file back selectively.

## Who runs it

Any agent that can read and write files and run git can maintain the wiki. On host 99 that includes Hermes Agent and Claude Code; the shared operating procedure lets different agents hand off cleanly because the log records what was done. The wider system, and how this wiki relates to the other stores, is in [[Overview]].

## Sources

- [[raw/karpathy-llm-wiki-gist]]
- [[raw/hermes-agent-integration]]
