# SCHEMA

Conventions for autonomous agents (Claude Code, Hermes Agent, or any LLM with file and git access) that maintain this wiki. This is the third layer of the pattern described in `raw/karpathy-llm-wiki-gist.md`: it is what makes the agent a disciplined maintainer rather than a generic chatbot. Read it before every session. Co-evolve it with the operator, and log every change to it.

## 1. Layers and ownership

| Layer | Path | Owner | Rule |
|---|---|---|---|
| Raw sources | `raw/` | Operator, with agents adding files | **Immutable.** Never edit an existing raw file; add a new one |
| Wiki | `wiki/` | Agents | Agents create and revise; humans read and direct |
| Schema | `SCHEMA.md` | Operator and agents together | Changes are logged as `schema` entries |
| Dashboard plugin | `dashboard/`, `plugin.yaml` | Developers | Read-only view of the layers above |

Special wiki files: `wiki/index.md` (content catalog) and `wiki/log.md` (chronology).

## 2. Directory layout

```
raw/                       immutable source documents, *.md
wiki/
  index.md                 catalog by category
  log.md                   append-only chronology
  overview.md              top-level synthesis
  obsidian/                category: obsidian
  openviking/              category: openviking
  synthesis/               categories: synthesis, operations
```

Page file names are lowercase kebab-case (`viking-protocol.md`). Page *titles* are Title Case and are what wikilinks use.

## 3. Frontmatter specification

Every file under `wiki/` begins with a YAML block delimited by `---`. All six fields are required.

```yaml
---
title: Viking Protocol
tags: [openviking, viking-uri, retrieval]
category: openviking
date: 2026-10-05
sources: [raw/openviking-architecture.md]
summary: One sentence stating what the page covers.
---
```

| Field | Type | Rules |
|---|---|---|
| `title` | string | Unique across the wiki, case-insensitive. Used as the wikilink target |
| `tags` | inline list | 2 to 6 lowercase kebab-case tags. Reuse existing tags; do not mint near-duplicates |
| `category` | string | One of `overview`, `obsidian`, `openviking`, `synthesis`, `operations` |
| `date` | `YYYY-MM-DD` | Date of the last substantive revision. Update it when you change claims, not for typos |
| `sources` | inline list | Repo-relative paths of the `raw/` files the page draws on. Use `[]` only for `index.md` and `log.md` |
| `summary` | string | One sentence, no trailing details; reused in the index |

Frontmatter is kept to single-line scalars and inline lists so that simple parsers (including the dashboard API) read it without a YAML library. Do not use multi-line values, anchors, or nested maps.

Raw files carry their own frontmatter: `title`, `source` (URL or host path), `author`, `retrieved` (`YYYY-MM-DD`), `immutable: true`.

## 4. Cross-referencing

- Link pages with **wikilinks**: `[[Page Title]]`. The target is the target page's `title`, matched case-insensitively. The file stem (`[[viking-protocol]]`) also resolves, but titles are preferred.
- Alias: `[[Page Title|display text]]`.
- Section anchor: `[[Page Title#Heading]]`. The anchor is informational; navigation opens the page.
- Raw sources: `[[raw/openviking-architecture]]`. The `.md` extension is optional.
- Wikilinks inside fenced code blocks and inline code spans are **not links**. Use this to show vault-internal link syntax such as `` `[[30-Runbooks Index]]` `` without creating a broken link.
- Link on first meaningful mention in a section, not every occurrence.
- Every page ends with a `## Sources` section listing the raw files it cites as wikilinks, matching its `sources` frontmatter.
- Every page must be reachable from at least one page other than `index.md` and must link out to at least one other page.
- Do not use Markdown links for internal pages. Use Markdown links only for external URLs.

## 5. Writing rules

1. **Ground every claim.** A statement of fact must be traceable to a raw file. If you cannot cite it, either add a raw source or do not state it.
2. **Separate observed from recommended.** Say what is in use and what is a capability or suggestion.
3. **Flag contradictions, do not erase them.** State both claims, name both sources, give a status (`unverified`, `resolved`), and say what would settle it.
4. **No secrets.** Never write API keys, tokens, passwords, or credential file contents. Write the path of the credential file instead. If you find a secret in a source, do not copy it into `raw/`.
5. **No placeholders.** No `TODO`, `TBD`, `lorem ipsum`, or empty sections. If a page is not ready, do not create it.
6. **Plain Markdown.** ATX headings, GitHub-flavored tables, fenced code with a language tag. No HTML, no external images, no embedded scripts.
7. **One topic per page.** Split pages that cover two topics.
8. **Start with the answer.** The first paragraph says what the page is and why it matters.

## 6. Workflow protocols

### 6.1 Ingest

1. Add the source to `raw/` with frontmatter. Never rewrite an existing raw file.
2. Read the source in full and read `wiki/index.md`.
3. Create or update the affected wiki pages (commonly several). Update each touched page's `date`, `sources`, and `## Sources` section.
4. Record contradictions with existing pages.
5. Update `wiki/index.md`: place each new page under its category with `- [[Title]] — summary`.
6. Append a log entry (section 7).
7. Run the lint checks (6.3).
8. Commit locally (section 8).

### 6.2 Query

1. Read `wiki/index.md`, then the relevant pages, following wikilinks and checking backlinks.
2. Search (`grep -ri`, or the dashboard `/search` endpoint) if the index is insufficient.
3. Answer with citations to wiki pages.
4. If the answer is a durable synthesis, file it as a new page, update the index, and log a `query` entry. Do not file throwaway answers.
5. If the wiki cannot answer, say so and propose a source to ingest. Never invent.

### 6.3 Lint

Run after every ingest and periodically. Report findings in a `lint` log entry.

| Check | Definition |
|---|---|
| Orphans | A page with no inbound wikilink from any page other than `index.md` |
| Broken links | A wikilink whose target matches no page title, file stem, or raw file |
| Missing frontmatter | Any of the six required fields absent or empty (except `sources` on index and log) |
| Index drift | A page absent from `index.md`, or listed there but missing on disk |
| Stale claims | A page whose `date` is older than a raw file that supersedes it |
| Contradictions | Two pages asserting incompatible facts without a flagged status |
| Missing concepts | A term used in three or more pages with no page of its own |
| Secrets | Strings resembling keys, tokens, or passwords |
| Log format | Headings not matching section 7 |
| Raw mutation | Any change to an existing `raw/` file in git history after its first commit, except a correction of a factual error in an observation snapshot that is marked inside the file and recorded as a `lint` log entry |

## 7. Log format

`wiki/log.md` is append-only. Add new entries at the **bottom**. Each entry is a level-2 heading followed by bullets:

```markdown
## [YYYY-MM-DD] <type> | <title>

- What changed, in one line per bullet.
- Pages created or updated, as wikilinks.
```

- `type` is one of `ingest`, `query`, `lint`, `schema`, `release`.
- The heading matches the regular expression `^## \[(\d{4}-\d{2}-\d{2})\] ([a-z]+) \| (.+)$`, so `grep "^## \[" wiki/log.md | tail -5` gives the latest five entries.
- Never edit or delete past entries. If an entry was wrong, add a new entry that corrects it.

## 8. Git protocol

- The wiki is a local git repository. **Do not add a remote and do not push** unless the operator explicitly asks.
- One commit per operation (an ingest, a query filed back, a lint pass), with a conventional message: `docs: ingest <title>`, `docs: lint <summary>`, `docs(schema): <change>`.
- Commit the raw file, wiki pages, index, and log together so the history shows a coherent step.
- Never rewrite published history.

## 9. Safety constraints for agents working on this repository

- Do not restart services or edit Hermes configuration as part of wiki maintenance.
- Treat the dashboard plugin as read-only with respect to the wiki: it never writes to `raw/` or `wiki/`.
- Do not introduce external assets (CDN scripts, web fonts, remote images) into the plugin or the pages.
- Keep file sizes reasonable: pages of roughly 300 to 1500 words. Split larger topics.

## 10. Categories

| Category | Directory | Purpose |
|---|---|---|
| `overview` | `wiki/` | Orientation and navigation |
| `obsidian` | `wiki/obsidian/` | The human-curated vault |
| `openviking` | `wiki/openviking/` | The central agent memory server |
| `synthesis` | `wiki/synthesis/` | Cross-cutting analysis and models |
| `operations` | `wiki/synthesis/`, `wiki/` | How the wiki itself is run; the log |

To add a category: create the directory, add a section to `index.md`, add it to this table, and log a `schema` entry.
