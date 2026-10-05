---
title: OpenViking Architecture
tags: [openviking, memory-server, ollama, 9router, docker]
category: openviking
date: 2026-10-05
sources: [raw/openviking-architecture.md]
summary: The central OpenViking memory server on host 99, its container, storage, embedding and summarizer backends, authentication, firewall, and operations.
---

# OpenViking Architecture

OpenViking is the **centralized AI-agent memory and context database** for the Hermes environment. One server on host 10.0.0.10 serves every agent on the network, so a fact recorded by Claude Code on one host can be retrieved by Hermes or OpenCode on another. In the layered model of [[Memory Layering]] it is the shared, semantically searchable tier between Hermes' fast memory and the human-curated [[Obsidian Architecture]] vault.

## Deployment at a glance

| Item | Value |
|---|---|
| Endpoint | `10.0.0.10:1933`; MCP at `http://10.0.0.10:1933/mcp` (Streamable HTTP) |
| Container | `openviking`, image `ghcr.io/volcengine/openviking:latest` (v0.4.23 when documented) |
| Network mode | `host`, listening on `0.0.0.0:1933` |
| Restart policy | `unless-stopped` |
| Compose directory | `/opt/openviking` |
| Config | `/opt/openviking/ov.conf` |
| Storage | `/var/lib/openviking_data` (local persistent volume) |
| CLI | `/usr/local/bin/ov`, configured by `/root/.openviking/ovcli.conf` |
| Admin runbook | `/opt/openviking/README_ADMIN.md` |

Running in host network mode means the container shares the host's network stack, so port 1933 is bound directly. That makes the firewall (below) the primary access control rather than Docker port mapping.

## Two model backends

OpenViking does not run models itself; it calls two local endpoints.

1. **Embedding: Ollama `all-minilm`** at `http://127.0.0.1:11434/v1`, producing **384-dimensional** vectors. Every stored chunk and every query is embedded with this model, and retrieval ranks by vector similarity. A small local embedding model keeps ingestion free and private. The trade-off is lower recall on subtle queries than a large hosted embedder; the layered abstracts described below compensate by giving search a clean, dense summary to match against.
2. **VLM / summarizer: 9router model `cmb-hermes`** at `http://127.0.0.1:20128/v1`. When a resource is ingested, this model writes the abstract and overview files that sit next to the content. 9router is the same OpenAI-compatible proxy that fronts the Claude Code wrapper runbooks kept in the vault (see [[Obsidian Hermes Integration]]).

Changing the embedding model would require re-embedding all stored content, because vectors from different models are not comparable. Dimension (384) is fixed by the model.

## Authentication

Two key types exist, and the separation is deliberate:

- `root_api_key`: administration only (`ov admin ... --sudo`). Never given to agents.
- `agent_user_key`: user `agent` in account `default`. This is what MCP clients and data endpoints use, sent as `Authorization: Bearer <key>`.

Neither value is recorded in this wiki or in the vault. They live in `~/.credentials/openviking.json`, mode 600. A read-only dashboard plugin reads only the agent key, and only server-side.

## Firewall

UFW on host 99 allows TCP 1933 from `10.0.0.20`, `10.0.0.10`, and `127.0.0.1`, and denies everything else including WAN. Onboarding a new host is a two-step change: add a UFW rule for its IP, then configure its MCP client. See [[Multi-Agent Topology]] for who is connected and for an unresolved question about host 98.

## Operations

- **Health:** `curl -s http://127.0.0.1:1933/health` or `ov status`.
- **Restart:** `docker compose restart` in the compose directory.
- **Logs:** `docker logs -f --tail 50 openviking`.
- **Backup:** `ov backup --sudo <path>.ovpack` for an internal export, plus a tarball of `ov.conf` and `openviking_data` for a file-level copy.
- **Restore:** `docker compose down`, extract the tarball over `/`, `docker compose up -d`.
- **Rollback of the whole deployment:** `docker compose down -v`, remove the three UFW rules, restore the `*.bak-pre-openviking` copies of each harness configuration.

Because the data volume is a plain directory, standard file backups work, but copying it while the container writes can capture an inconsistent state; prefer `ov backup` or stop the container first.

## How content gets in and out

Resources are added with the `add_resource` MCP tool or the CLI; agent memories are added with `remember` or `write`. Each item becomes a directory with generated layers, described in [[Viking Protocol]]. Retrieval uses `find` (fast semantic search) and `search` (session-aware), then `read` to open a chosen URI.

## Division of responsibility

- **Obsidian:** ground truth, written by humans, long-form.
- **OpenViking:** working memory shared across agents, semantic retrieval, session reflection.

OpenViking never replaces the vault. It holds an indexed mirror of selected vault notes under `viking://resources/projects/` and the agents' own memories under `viking://~/memories/`. The compiled synthesis layer on top of both is the subject of [[Compounding Knowledge]].

## Sources

- [[raw/openviking-architecture]]
