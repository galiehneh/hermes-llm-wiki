---
title: Viking Protocol
tags: [openviking, viking-uri, filesystem, retrieval, mcp]
category: openviking
date: 2026-10-05
sources: [raw/openviking-architecture.md, raw/hermes-knowledge-routing.md]
summary: The viking:// URI namespace, how OpenViking virtualizes memory as a filesystem, and the abstract, overview, read ladder agents use to spend as few tokens as possible.
---

# Viking Protocol

OpenViking presents memory and knowledge as a **virtual filesystem**. Everything an agent can recall has a `viking://` URI, and a small set of verbs (list, tree, read, find, grep, glob, write) works on those URIs the way shell tools work on paths. The design lets an agent *navigate* knowledge rather than receive it all at once. The server behind it is described in [[OpenViking Architecture]].

## The namespace

Two roots matter in this environment:

| Root | Contents |
|---|---|
| `viking://resources/projects/` | Shared repository specs, build guides, runbooks |
| `viking://~/memories/` | Agent working memories, preferences, session context |

The `~` in the second root is the calling user's home, so memories are scoped per user (here the `agent` user in account `default`) while resources are shared. Observed children under `resources/projects/`:

```
viking://resources/projects/
  agent-runbooks/
    claude9-wrapper.md/
    claudeg-wrapper.md/
  digital-receipt/
    build-and-versioning.md/
    multi-tenancy-and-sso.md/
  web-apps-inventory.md/
    Web_Applications_and_Projects_Inventory.md
```

Several of these directories mirror notes from the [[Obsidian Architecture]] vault, which is how vault knowledge becomes reachable from hosts that cannot read the vault.

## A resource is a directory

Ingesting a document creates a **directory named after it**, not a single file. Inside sit the original document plus generated companions:

- `.abstract.md`: one paragraph stating what the resource is and who it is for. Cheap to read.
- `.overview.md`: a structured summary with a "Quick Navigation" section pointing to the right child by intent ("what do you want to do?") and a detailed description of each child.
- Section files: the document split into chunks (for example `Purpose_11more_<hash>.md`), each with its own abstract.

The `abstract` and `overview` files are written by the summarizer model (`cmb-hermes`), and embeddings of this text and of the chunks are what search matches.

## The reading ladder

Retrieval is tiered so an agent pays only for the depth it needs:

1. **`find` / `search`**: returns ranked hits, each with a URI, a short abstract, and a score. Often the abstract alone answers the question.
2. **`abstract`**: read a directory's `.abstract.md` for a one-paragraph orientation.
3. **`overview`**: read `.overview.md` to choose which child to open.
4. **`read`**: open the full content of one chosen file, with optional line `offset` and `limit` for large files.

Hermes' `knowledge-routing` skill names the same tiers L0 (abstract), L1 (overview) and L2 (details). This ladder is the same economy that [[Obsidian Hermes Integration]] applies to the vault (index, then hub, then note) and that [[Memory Layering]] applies across tiers: widen only when the narrower view is insufficient.

## Tools in the MCP surface

| Tool | Use |
|---|---|
| `find` | Fast semantic retrieval; `min_score` defaults to 0.35, `limit` to 10; filter by `target_uri`, `context_type`, `level` |
| `search` | Retrieval using session context |
| `read` | Read one or more file URIs with line paging |
| `list`, `tree` | Directory listing and recursive tree, optionally with abstracts |
| `glob`, `grep` | Path pattern and text search |
| `write`, `edit` | Create or modify a file at a URI |
| `remember`, `forget` | Store or delete an agent memory |
| `add_resource`, `add_skill` | Ingest a document or skill package |
| `get_acl`, `set_acl` | Read or set access control |
| `health` | Server health |

Scores observed for strongly relevant semantic queries about the server's own runbooks were about 0.78 to 0.79, well above the 0.35 default floor, which is permissive. A higher `min_score` trades recall for precision.

## Conventions for agents

- Look before you write: `find` first so a memory is not duplicated.
- Put shared project knowledge under `viking://resources/projects/` and personal or session context under `viking://~/memories/`.
- Never write secrets to either root. Write references (a file path), as the vault does.
- Prefer abstracts and overviews over full reads in loops.

## Relation to this wiki

A `viking://` URI is a stable address for *raw working memory*. A `[[wikilink]]` in this repository is a stable address for *compiled synthesis*. The same fact can have both: the OpenViking resource is the retrievable source, and the wiki page cites it and adds cross-references. See [[Compounding Knowledge]].

## Sources

- [[raw/openviking-architecture]]
- [[raw/hermes-knowledge-routing]]
