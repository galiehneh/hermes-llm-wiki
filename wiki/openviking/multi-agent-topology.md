---
title: Multi-Agent Topology
tags: [openviking, multi-agent, topology, hosts, mcp, firewall]
category: openviking
date: 2026-10-05
sources: [raw/openviking-architecture.md, raw/hermes-agent-integration.md]
summary: Which agents on hosts 10.0.0.10, 10.0.0.20 and 10.0.0.30 share OpenViking memory, how each is configured, and the documented discrepancy about host 98.
---

# Multi-Agent Topology

The point of a central memory server is that **several agents on several machines share one memory**. This page maps who connects to [[OpenViking Architecture]], how, and what is still uncertain.

## The shape

```
        10.0.0.20                  10.0.0.30
        Claude Code                  Claude Code (see note)
              \                          /
               \   HTTP MCP + Bearer    /
                v                      v
              +--------------------------+
              | OpenViking  10.0.0.10  |
              | :1933 /mcp   (UFW-gated) |
              +--------------------------+
                ^        ^         ^
   Hermes Agent |  Claude Code  OpenCode
                10.0.0.10 (local clients)
```

All clients speak **Streamable-HTTP MCP** to `http://10.0.0.10:1933/mcp` with an `Authorization: Bearer <agent_user_key>` header. Because every client uses the same `agent` user in account `default`, they see one shared memory space; a `remember` from one host is retrievable from another. See [[Viking Protocol]] for the verbs and URIs they share.

## Host by host

| Host | Harnesses | Where configured |
|---|---|---|
| 10.0.0.10 | Hermes Agent, Claude Code, OpenCode | Hermes: `/root/.hermes/config.yaml` under `mcp_servers.openviking`. Claude Code: `/root/.claude.json` under `mcpServers.openviking`. OpenCode: `/root/.config/opencode/opencode.jsonc` under `mcp.openviking` |
| 10.0.0.20 | Claude Code | `/home/user/.claude.json` under `mcpServers.openviking` |
| 10.0.0.30 | Claude Code | Disputed; see below |

Host 99 is both the server and its busiest client. Its clients reach the server over `127.0.0.1` or its own LAN address, both allowed by the firewall.

## Role-based keys

The access model separates **administration** from **agent use**:

- The `root_api_key` is for operators running `ov admin ... --sudo`. It is not placed in any harness configuration.
- The `agent_user_key` is what harnesses carry. Giving every harness the same agent key is simple and gives a shared memory, but it means attribution is by *content* (what an agent writes) rather than by *identity*. If per-agent identity or isolation is later required, OpenViking supports users, groups, and ACLs (`list_users`, `list_groups`, `get_acl`, `set_acl`), so separate keys per role are possible without changing the topology.

Keys are stored only in `~/.credentials/openviking.json` (mode 600) and in each harness's own config. They never appear in the vault ([[Obsidian Architecture]]) or in this wiki.

## Network access control

UFW on host 99 admits TCP 1933 from `10.0.0.20`, `10.0.0.10`, and `127.0.0.1` only. A new harness host needs a UFW rule first:

```
ufw allow from <HOST_IP> to any port 1933 proto tcp comment "OpenViking from <HOST>"
```

and then its MCP entry pointing at the endpoint with the bearer header. Removing OpenViking reverses this: delete the rules and restore each `*.bak-pre-openviking` config backup.

## The host 98 discrepancy

Two first-party sources disagree:

- The vault note `OpenViking Central Memory Server` lists 10.0.0.30 as a connected client with "MCP openviking configured & connected".
- The admin runbook `README_ADMIN.md` says "Node 98: Skipped (no AI harnesses, disk 100% full)" and its firewall list has no entry for 98.

These can both be true at different times: the runbook may describe the original rollout and the vault note a later connection. But the runbook's firewall list was not updated to match, so a 98 client could not reach the server unless a rule was added elsewhere. **Status: unverified.** The verification is cheap: from host 98 run `curl -s http://10.0.0.10:1933/health`, and on host 99 run `ufw status | grep 1933`. Until then, treat 98 as *intended* but unconfirmed. This is the kind of contradiction the lint step in [[LLM Wiki Operations]] exists to flag, so it is recorded here rather than silently resolved.

## Why share one memory

Without sharing, each agent relearns the same facts: the endpoint of the 9router proxy, how a wrapper script is deployed, which host runs which web app. With one server, a runbook ingested once is retrievable everywhere, and a bug resolution recorded by one agent saves the next. The cost is that a bad memory is also shared, which is why the human-curated vault stays the ground truth and why [[Memory Layering]] puts Obsidian at the top of the trust order.

## Sources

- [[raw/openviking-architecture]]
- [[raw/hermes-agent-integration]]
