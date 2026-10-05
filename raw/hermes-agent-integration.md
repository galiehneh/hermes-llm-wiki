---
title: Hermes Agent Integration and Memory Layers
source: Hermes host 99 observations (/root/.hermes/plugins, vault routing rules, OpenViking runbook), 2026-10-05
author: Hermes operator (galiehneh)
retrieved: 2026-10-05
immutable: true
---

# Hermes Agent: Persona, Memory Layers, and Dashboard Plugins

This source describes how Hermes Agent on host 10.0.0.10 relates to the three knowledge stores in this project, and how dashboard plugins are packaged. Facts are limited to what was observed on the host.

## Hermes Agent

Hermes Agent is the operator-facing assistant running on host 99. It reads its persona from `SOUL.md` files under `/root/.hermes/` (several `bak_SOUL*.md` backups exist, showing the persona has been revised over time). Its configuration is `/root/.hermes/config.yaml`, which carries the `mcp_servers.openviking` entry and the `plugins.enabled` list. Local plugins live in `/root/.hermes/plugins/`. Observed plugins: `hermes-achievements`, `hermes-memory-ui`, `obsidian-memory`, `openviking-browser`.

The operator's working language mixes English and Indonesian, and the vault reflects that.

## Memory layers

| Layer | Store | Holds | Lifetime | Access path |
|---|---|---|---|---|
| 1. Fast persistent memory | Hermes built-in memory | Stable user preferences, small mappings, high-signal facts used often | Persistent, size-limited | Injected into every Hermes session |
| 2. Agent context | OpenViking (`viking://`) | Cross-agent working memory, indexed resources, session reflections | Persistent, shared across hosts | MCP tools (`find`, `read`, `remember`) |
| 3. Human knowledge base | Obsidian vault | Runbooks, inventories, incident timelines, templates | Persistent, human-curated ground truth | File reads on host 99 |
| 4. Compiled wiki | This LLM Wiki repo | Synthesized, interlinked articles with cited raw sources | Persistent, compounding, git-versioned | Dashboard tab and markdown files |

### Routing rules (from the vault)

- Keep in Hermes memory: stable user preferences, small persistent mappings, high-signal facts used often.
- Keep in Obsidian: long procedures, device inventories, troubleshooting timelines, site-specific operational detail, anything likely to overflow memory.
- Review rule: if a fact is long, detailed, or repetitive, move it out of memory into Obsidian.
- Never store secrets in the vault; store references or file locations only.

### Why layering matters

Hermes memory is injected into every conversation, so it has a hard size pressure: each stored fact costs context in every future session. Long material must live outside it and be fetched on demand. Obsidian holds the long material as ground truth. OpenViking makes that material, plus agent-written memories, retrievable semantically by every agent on the network, with abstracts and overviews that let an agent read a summary before paying for full content. The LLM Wiki adds a fourth role: a *compiled* artifact in which cross-references and syntheses already exist, so agents do not re-derive them from raw material at query time.

## Dashboard tab plugins

Hermes dashboard plugins are directories under `~/.hermes/plugins/<name>/` with this shape, observed from `openviking-browser`:

```
<name>/
  plugin.yaml              metadata: name, version, description, tags, dashboard {label, icon, path, position}
  README.md
  after-install.md         operator notes shown after install
  dashboard/
    manifest.json          name, label, icon, version, tab {path, position}, entry, css, api, has_api
    api.py                 FastAPI APIRouter, mounted at /api/plugins/<name>/
    plugin.js              browser bundle, registers a React component
```

- **Frontend contract:** `plugin.js` runs in the dashboard page. It reads `window.__HERMES_PLUGINS__` (a registry with `register(name, component)`) and `window.__HERMES_PLUGIN_SDK__` (which provides `React` and `fetchJSON`). The plugin registers its root component under its plugin name. There is no bundler: the file is a self-contained IIFE using `React.createElement`.
- **Backend contract:** `api.py` exports `router = APIRouter(...)`. The router is mounted at startup under `/api/plugins/<name>/`, so a dashboard restart is needed after install; a rescan only refreshes the tab list.
- **Tab placement:** `position` is relative, for example `after:skills` for the OpenViking browser. The LLM Wiki plugin uses `after:openviking`.
- **Enablement:** `plugins.enabled` in the Hermes config must list the plugin name.
- **Constraints adopted by this project:** no external assets (no CDN scripts, fonts, or stylesheets), no `innerHTML` for untrusted text, read-only backend.

## The `obsidian-memory` and `hermes-memory-ui` plugins

Both exist on host 99 as peers of this project, as read from their `plugin.yaml` files:

- `obsidian-memory` (version 3.0.0, author Kyssta, MIT): "Browse, search, and edit Obsidian vault notes from the Hermes dashboard", with force-directed graph visualization, multi-vault support, markdown rendering with wikilinks and inline note editing. It is a *dashboard* surface for the human knowledge base, and unlike this project's plugin it can edit.
- `hermes-memory-ui` (version 0.6.0): a "read-only Hermes Dashboard and Desktop plugin for inspecting built-in, holographic, Mem0, Honcho, Mnemosyne, Hindsight, and ByteRover memory".

Together with `openviking-browser` they show that each memory store has its own dashboard surface; the LLM Wiki tab is the surface for the compiled layer.

*Correction, 2026-10-05:* an earlier revision described `obsidian-memory` as bridging the vault into Hermes and `hermes-memory-ui` as presenting Hermes memory, inferred from their names. The descriptions above come from the plugins' metadata.

## Operator constraints for this project

- Local git commits only; the repo has no remote.
- Do not restart services or edit `/root/.hermes/config.yaml` as part of building the wiki.
- Everything the dashboard needs is served from the plugin itself.
