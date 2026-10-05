# Hermes LLM Wiki

[![CI](https://github.com/galiehneh/hermes-llm-wiki/actions/workflows/ci.yml/badge.svg)](https://github.com/galiehneh/hermes-llm-wiki/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/galiehneh/hermes-llm-wiki)](https://github.com/galiehneh/hermes-llm-wiki/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Hermes Dashboard Plugin](https://img.shields.io/badge/hermes-dashboard--plugin-informational.svg)](https://hermes-agent.nousresearch.com)

A **Karpathy-style LLM Wiki** about the Hermes Agent knowledge stack, plus a **read-only Hermes dashboard plugin** that lets you browse it as a tab.

The wiki's subject is how three knowledge systems fit together around Hermes Agent on the `10.0.0.x` network:

| System | Role |
|---|---|
| **Obsidian** | Human-curated knowledge base: runbooks, inventories, incidents. The ground truth. |
| **OpenViking** | Central, multi-agent working memory served over MCP at `viking://`. |
| **LLM Wiki** (this repo) | Persistent, compounding synthesis that agents maintain from immutable raw sources. |

## The idea

Most LLM-over-documents setups are RAG: retrieve chunks at query time and re-derive the answer every time. Andrej Karpathy's [LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) instead has the LLM **build and maintain a persistent wiki** between you and the raw sources. When a source arrives, the agent integrates it into interlinked pages, flags contradictions, and keeps cross-references current. Knowledge is compiled once and kept up to date, so it *compounds*. The full gist is preserved in `raw/karpathy-llm-wiki-gist.md`, and the analysis is in the wiki page *Compounding Knowledge*.

There are three layers:

| Layer | Path | Owner | Rule |
|---|---|---|---|
| Raw sources | `raw/` | Operator | Immutable ground truth |
| Wiki | `wiki/` | Agents | Interlinked markdown with `[[wikilinks]]` |
| Schema | `SCHEMA.md` | Operator and agents | Conventions and workflows |

## Directory layout

```
raw/                               immutable sources
  karpathy-llm-wiki-gist.md
  obsidian-architecture.md
  openviking-architecture.md
  hermes-agent-integration.md
wiki/
  index.md                         catalog by category
  log.md                           append-only chronology
  overview.md                      top-level synthesis
  obsidian/                        architecture, workflows, hermes-integration
  openviking/                      architecture, viking-protocol, multi-agent-topology
  synthesis/                       compounding-knowledge, memory-layering, llm-wiki-operations
SCHEMA.md                          rules for agents that maintain the wiki
plugin.yaml                        Hermes plugin metadata
dashboard/
  manifest.json                    tab declaration
  api.py                           read-only FastAPI router
  plugin.js                        self-contained React UI
tests/
  test_api.py                      pytest suite for the API and for wiki integrity
  plugin.test.js                   node:test suite for the UI logic
```

No secrets are stored anywhere in the wiki. Credential locations are referred to by path only.

## Dashboard plugin

Adds an **LLM Wiki** tab (`/llm-wiki`, icon `BookOpen`, positioned `after:openviking`).

- **Sidebar:** navigation (Index, Log, Graph, Sources, Schema), live search with highlighted snippets, and a category tree showing `unread/total` per category. "Read" is tracked per browser in `localStorage`.
- **Reader:** breadcrumbs, title, category, word count, revision date, tags, summary; cleanly rendered headings, lists, bold, italics, tables, code blocks and blockquotes.
- **Wikilinks:** every `[[Page]]`, `[[Page|alias]]` and `[[raw/source]]` is a link that opens the target in place. Unresolved links are shown in red.
- **Linked references:** backlinks (pages that cite this page) and outgoing links at the bottom of every article.
- **Graph:** force-directed SVG of pages and raw sources, coloured by category. Hover to highlight neighbours, drag to rearrange, click or press Enter to open, toggle categories in the legend. Honors `prefers-reduced-motion`.
- **Activity log:** timeline of `log.md`, newest first, filterable by entry type.
- **Sources:** inspector for the raw documents, rendered or raw, with a "cited by" list.
- **Schema:** renders `SCHEMA.md`.

The UI uses only `window.__HERMES_PLUGIN_SDK__` (`React`, `fetchJSON`). It loads no CDN script, font, stylesheet or image, and it never uses `innerHTML`: markdown is parsed into React elements, and only `http`, `https` and `mailto` URLs become links.

### Install

See [`after-install.md`](after-install.md). In short:

```bash
git clone /path/to/this/repo ~/.hermes/plugins/llm-wiki      # or copy the directory
# add llm-wiki to plugins.enabled in the Hermes config, then restart the dashboard once
```

The backend needs only `fastapi`, which ships with Hermes.

## API

Mounted by Hermes at `/api/plugins/llm-wiki`. Every route is `GET` and read-only.

| Endpoint | Purpose |
|---|---|
| `/status` | `articles`, `pages`, `words`, `sources`, `categories` (name to count), `orphans`, `log_entries`, `last_log_date`, `last_update` |
| `/index` | `index.md` parsed into `categories[].pages[]` (`title`, `path`, `kind`, `summary`) and `unlisted` (pages missing from the index) |
| `/page?path=` | One article: `title`, `category`, `meta` (frontmatter), `body`, `words`, `modified`, `links` (forward, resolved) and `backlinks` |
| `/log` | `log.md` parsed into `entries[]` (`date`, `type`, `title`, `body`, `links`), in file order |
| `/sources` | Raw documents with `name`, `title`, `source`, `retrieved`, `words`, `bytes` |
| `/source?name=` | One raw document with `meta`, `body` and `cited_by` |
| `/search?q=` | Full-text search over wiki and raw sources; results carry `scope`, `score`, `matches`, `snippet` |
| `/graph` | `nodes` (`id`, `title`, `group`, `words`, `degree`), `edges` (`source`, `target`) and `groups` |
| `/schema` | `SCHEMA.md` |

Conventions:

- `path` is relative to `wiki/` (for example `openviking/viking-protocol.md`); the `.md` suffix is optional. `name` is a file name inside `raw/` with no subdirectory.
- *Articles* are every wiki page except the special files `index.md` and `log.md`. *Words* count the body only, not the frontmatter.
- Wikilinks resolve by page `title`, then by path, then by file stem, case-insensitively. `[[raw/<name>]]` resolves to a raw source. Links inside code spans and fenced blocks are ignored.
- Backlinks come from articles only; `index.md` and `log.md` are excluded. The graph also excludes them (the index would link to everything and flatten the layout), and it lists each directed edge once with no self-loops.
- Search requires every term to appear in the title, tags or body; title matches rank first. Queries are 2 to 200 characters, at most 8 terms are used, and at most 50 results are returned.
- Errors have the form `{"detail": {"code": "...", "message": "..."}}`: `bad_path` (400), `bad_query` (400), `not_found` (404), `too_large` (413). FastAPI returns 422 for a missing or over-long parameter.

The wiki root defaults to the plugin directory. Set `LLM_WIKI_ROOT` to serve a wiki from somewhere else.

## Security model

The backend is strictly read-only and confined to `wiki/`, `raw/` and `SCHEMA.md`. Client paths are validated for control characters, backslashes, absolute paths, `.`, `..` and hidden segments, including after repeated percent-decoding. They are then resolved with `Path.resolve()` and must stay inside the layer's base directory, which also rejects symlinks that escape it. Files over 1 MB are not served. See [`SECURITY.md`](SECURITY.md).

## Tests

```bash
pip install fastapi httpx pytest
python3 -m pytest tests -q          # API, traversal attempts, parsing, wiki integrity
node --test tests/plugin.test.js    # markdown parser, wikilinks, renderer safety, graph layout
npm test                            # both
```

`tests/test_api.py` runs against a small fixture wiki with counts known by construction, and against the real repository to catch drift: missing frontmatter, broken wikilinks, orphan pages, pages missing from the index, an unparseable log, or anything that looks like a credential.

## Maintaining the wiki

Agents follow [`SCHEMA.md`](SCHEMA.md): ingest a source into `raw/`, update the affected pages, update `wiki/index.md`, append to `wiki/log.md`, lint, and commit. The reasoning behind each step is in the wiki page *LLM Wiki Operations*. Commits are local; this repository has no remote configured.

## Provenance

Wiki content is grounded in observations of the Hermes host on 2026-10-05 and in Karpathy's gist, and each page cites its raw sources. One known open question is recorded rather than resolved: whether host `10.0.0.30` is actually connected to OpenViking (the vault says yes, the admin runbook says it was skipped). See *Multi-Agent Topology*.

Not affiliated with Anthropic, Nous Research, Obsidian or the OpenViking project.

## License

[MIT](LICENSE)
