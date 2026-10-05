---
title: OpenViking Central Memory Server on Host 99
source: /opt/openviking/README_ADMIN.md and the vault note "OpenViking Central Memory Server" (observed 2026-10-05)
author: Hermes operator (galiehneh)
retrieved: 2026-10-05
immutable: true
---

# OpenViking Central Memory Server: Observed Architecture

This source condenses the administration runbook and vault note for the OpenViking deployment on host 10.0.0.10. **No credential values appear here.** Keys live in a chmod 600 file on host 99 and are referred to by path only.

## Identity

- **Role:** centralized AI-agent memory and context database.
- **Endpoint:** `10.0.0.10:1933`. The MCP endpoint is `http://10.0.0.10:1933/mcp` (Streamable HTTP).
- **Container:** `openviking`, image `ghcr.io/volcengine/openviking:latest`, version `v0.4.23` at the time of the runbook.
- **Network mode:** `host`, listening on `0.0.0.0:1933`, protected by UFW.
- **Restart policy:** `unless-stopped`.
- **Compose directory:** `/opt/openviking`.
- **Config file:** `/opt/openviking/ov.conf`.
- **Storage:** `/var/lib/openviking_data` (local persistent volume).
- **CLI:** `/usr/local/bin/ov`, configured by `/root/.openviking/ovcli.conf`.
- **Admin runbook:** `/opt/openviking/README_ADMIN.md`.
- **Credential reference:** `~/.credentials/openviking.json` (chmod 600).

## Model backends

| Function | Backend | Detail |
|---|---|---|
| Embedding | Ollama `all-minilm` | Local, `http://127.0.0.1:11434/v1`, 384 dimensions |
| VLM / summarizer | 9router model `cmb-hermes` | `http://127.0.0.1:20128/v1` |

Embeddings power semantic retrieval. The summarizer writes the layered abstracts and overviews that agents read before opening full content.

## Authentication model

- `root_api_key`: system administration only (`ov admin ... --sudo`).
- `agent_user_key`: user `agent` in account `default`; used for the MCP endpoint and data endpoints. Clients send it as `Authorization: Bearer <agent_user_key>`.

## Firewall (UFW on host 99)

- Allowed to TCP 1933: `10.0.0.20`, `10.0.0.10`, `127.0.0.1`.
- Denied: all other IPs and WAN.
- Adding a harness on a new host requires `ufw allow from <HOST_IP> to any port 1933 proto tcp comment "OpenViking from <HOST>"`, then pointing its MCP config at the endpoint with the bearer header.

## CLI

`ov status` reports server state. `ov backup --sudo <file>.ovpack` takes an internal backup. The CLI is the operator's manual interface; agents use MCP tools instead.

## Operations

- **Health:** `curl -s http://127.0.0.1:1933/health` or `ov status`.
- **Restart:** `cd /opt/openviking && docker compose restart`.
- **Logs:** `docker logs -f --tail 50 openviking`.
- **Backup:** `ov backup --sudo /opt/openviking/backup.ovpack`, plus a tarball of `ov.conf` and `openviking_data`.
- **Restore:** `docker compose down`, extract the tarball to `/`, `docker compose up -d`.
- **Rollback:** `docker compose down -v`, delete the three UFW rules, restore the `*.bak-pre-openviking` copies of the harness configs.

## Connected clients (multi-agent topology)

| Host | Harnesses | Config location |
|---|---|---|
| 10.0.0.10 | Hermes Agent, Claude Code, OpenCode | `/root/.hermes/config.yaml` (`mcp_servers.openviking`), `/root/.claude.json` (`mcpServers.openviking`), `/root/.config/opencode/opencode.jsonc` (`mcp.openviking`) |
| 10.0.0.20 | Claude Code | `/home/user/.claude.json` (`mcpServers.openviking`) |
| 10.0.0.30 | Claude Code | See the discrepancy below |

**Source discrepancy on host 98.** The vault note `OpenViking Central Memory Server` lists 10.0.0.30 as a connected client ("Claude Code, MCP openviking configured & connected"). The admin runbook `README_ADMIN.md` section "Connected Harnesses" says "Node 98: Skipped (no AI harnesses, disk 100% full)", and its UFW allow list contains only 84, 99, and localhost. The two documents were written at different times; the vault note is the more recent statement of intent, but a UFW rule for 98 is not listed in the runbook. Treat host 98 connectivity as needing verification.

## The `viking://` namespace

OpenViking virtualizes memory and knowledge as a filesystem addressed by `viking://` URIs.

- `viking://resources/projects/` holds shared repository specs, build guides, and runbooks. Observed children: `agent-runbooks/` (`claude9-wrapper.md`, `claudeg-wrapper.md`), `digital-receipt/` (`build-and-versioning.md`, `multi-tenancy-and-sso.md`), `web-apps-inventory.md/`.
- `viking://~/memories/` holds agent working memories, preferences, and session context.
- Each ingested resource becomes a directory containing the source document plus generated layers: `.abstract.md` (one-paragraph summary), `.overview.md` (structured overview with navigation hints), and chunked section files. Search hits return a URI, an abstract, and a score.
- Observed hit scores for relevant semantic queries were around 0.78 to 0.79; the default `min_score` of the `find` tool is 0.35.

## MCP tool surface

The `openviking` MCP server exposes, among others: `find` (fast semantic retrieval), `search` (session-aware retrieval), `read`, `list`, `tree`, `glob`, `grep`, `write`, `edit`, `remember`, `forget`, `add_resource`, `add_skill`, `health`, ACL tools (`get_acl`, `set_acl`), and listing tools for users, groups, and watches.

## Division of responsibility with Obsidian

- **Obsidian:** human-curated knowledge base, infrastructure documentation, runbooks, ground truth.
- **OpenViking:** multi-agent working memory, cross-machine context sharing, semantic retrieval, automated session reflection.

## Related Hermes plugin

A separate read-only dashboard plugin, `openviking-browser`, provides an **OpenViking** tab for browsing the tree, reading abstracts and overviews, and searching. It resolves the agent key server-side so the key never reaches the browser. The LLM Wiki plugin is positioned after it in the dashboard.
