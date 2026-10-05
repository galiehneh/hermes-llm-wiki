## LLM Wiki installed

The **LLM WIKI** tab (`/llm-wiki`, after the OpenViking tab) is read-only. It serves the markdown in `wiki/`, `raw/` and `SCHEMA.md` from this plugin's own directory.

1. Make sure the plugin lives at `~/.hermes/plugins/llm-wiki/` (the directory name must match the plugin name). From a local copy of this repository:

   ```bash
   git clone /path/to/llm-wiki ~/.hermes/plugins/llm-wiki     # or: cp -r /path/to/llm-wiki ~/.hermes/plugins/llm-wiki
   ```

2. Make sure `plugins.enabled` in the Hermes config contains `llm-wiki`. This step edits your Hermes configuration, so it is left to you.
3. Restart the dashboard once. The backend router is mounted at startup; a plugin rescan only refreshes the tab list. Restarting a service is likewise left to you.
4. Open the dashboard and click **LLM WIKI**.

### Verify

With the dashboard running (adjust host and port to your setup, and add authentication if the dashboard requires it):

```bash
curl -s http://127.0.0.1:<dashboard-port>/api/plugins/llm-wiki/status
```

You should see JSON with `articles`, `words`, `sources` and `categories`. In the UI the stat row at the top shows the same figures, and the sidebar lists the categories Overview, Obsidian, OpenViking, Synthesis, Operations and Sources.

### Optional configuration

| Variable | Effect |
|---|---|
| `LLM_WIKI_ROOT` | Directory containing `wiki/`, `raw/` and `SCHEMA.md`. Defaults to the plugin directory. Add it to `~/.hermes/.env` if you keep the wiki elsewhere. |

### Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Tab missing | `llm-wiki` is not in `plugins.enabled`, or the directory name differs from `llm-wiki`. Fix, then rescan. |
| Tab opens but shows an error or "Loading…" forever | The backend router was not mounted. Restart the dashboard once. |
| `404` on `/api/plugins/llm-wiki/*` | Same as above, or the plugin directory is not `~/.hermes/plugins/llm-wiki`. |
| Empty wiki (zero articles) | `LLM_WIKI_ROOT` points at a directory without `wiki/`, or the files were not copied. |
| "Not in index" warning on the Index view | A page exists that `wiki/index.md` does not list. Ask the maintaining agent to run a lint pass. |
| Red links in an article | A `[[wikilink]]` target does not exist. See the lint checks in `SCHEMA.md`. |
| Orphans count in the stat row | Pages that no other page links to. See the lint checks in `SCHEMA.md`. |

### Keeping the wiki current

Agents (Hermes, Claude Code) maintain the wiki by following `SCHEMA.md`: add a source under `raw/`, update the affected pages, update `wiki/index.md`, append to `wiki/log.md`, lint, and commit locally. The dashboard picks up changes on the next request; use the **Refresh** button to reload the stats and sidebar.

One open item is recorded in the wiki: whether host `10.0.0.30` is really connected to OpenViking. The vault says yes and the admin runbook says it was skipped. See the *Multi-Agent Topology* page for the two commands that settle it.

### Safe to remove

Uninstalling is deleting `~/.hermes/plugins/llm-wiki/`, removing `llm-wiki` from `plugins.enabled` and restarting the dashboard. The plugin writes nothing outside its own directory; browser-side it stores only a list of opened pages in `localStorage` under `llm-wiki:visited:v1`.
