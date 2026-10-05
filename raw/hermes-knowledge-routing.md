---
title: Hermes Knowledge Routing Skill
source: /root/.hermes/skills/note-taking/knowledge-routing/SKILL.md and /root/.hermes/memories/ (observed 2026-10-05)
author: Hermes operator (galiehneh)
retrieved: 2026-10-05
immutable: true
---

# Hermes Knowledge Routing: Observed Skill and Memory Budgets

This source records the `knowledge-routing` skill installed on host 10.0.0.10 and the current size of Hermes' built-in memory files. It is the operational origin of the three-tier model in this project. No memory contents and no credential values are recorded here, only sizes and rules.

## The skill

`knowledge-routing` (platforms: linux, macos, windows) is described as: "Route stable facts into Hermes memory and detailed operational knowledge into Obsidian." Its core idea, quoted in substance:

- **Hermes memory** is for compact, stable, high-signal facts, split across two files:
  - `target="user"` is `USER.md`, **cap 1,375 characters**: who the user is, role, style, coding and deploy standards, UI and interaction preferences.
  - `target="memory"` is `MEMORY.md`, **cap 2,200 characters**: agent environment facts, tool quirks, index pointers, standing conventions.
- **Obsidian** is for long-form operational detail, inventories, timelines and reusable procedures. It is the human-curated ground truth.
- **OpenViking** (`viking://`) is the agent context database: multi-agent working memory, dynamic session reflections, and semantic retrieval across machines via MCP.
- "The best setup is a three-tier model: memory holds core directives and pointers, Obsidian holds human truth, and OpenViking holds shared agent context."

## When each store gets a fact

**Hermes memory**, when the fact is stable across sessions, short enough to stay concise, frequently reused, and helpful for reducing repeated steering.

**Obsidian**, when the fact is detailed or procedural, chronological or incident-based, site-specific or device-specific, likely to expand over time, or better represented as a note, template or inventory.

**OpenViking** (`viking://~/memories/`), when the information is ephemeral, cross-session or evolving agent experience (tool quirks, session trajectories, task memories); needed across several AI harnesses and hosts (Claude Code on 84, Hermes on 99, OpenCode on 99); unstructured text that benefits from semantic search or tiered retrieval (**L0 abstract, L1 overview, L2 details**); or machine-oriented context that does not belong in human-edited Obsidian notes.

**Credential store**, for any device or server login, API token or SSH password: files under `~/.credentials/`, never Obsidian and never the only copy in memory. Memory may hold at most a compact pointer (host plus which file). Writing a credential is a two-file operation: the per-device JSON file with full detail, and the matching row in `00-CREDENTIAL-INDEX.md` so the quick-reference stays truthful.

## Hybrid pattern

1. Store the full detail in Obsidian.
2. Store only the short summary or routing rule in Hermes memory.
3. Keep an index note that links to deeper notes.
4. Prefer one note per topic.

## Memory budget audit

When memory passes **80% saturation** the skill prescribes:

1. Sort by target: move user style and preference entries out of `MEMORY.md` into `USER.md`.
2. Evict raw device and network dumps (specific IPs, router configs, CLI snippets) from `MEMORY.md`, after confirming they exist in the credential index and Obsidian.
3. Consolidate fragmented rules in `USER.md` into single high-signal lines.
4. Apply all pruning in **one atomic batch** `memory(target=..., operations=[...])` call, so the character budget is validated against the net result rather than failing on intermediate steps.

## Secret-placement audit

The skill includes an audit to run when reorganizing memory and notes: grep the vault for known password strings and generic `password = value` patterns; check memory for inline passwords, which must become pointers; check file modes in `device_credentials/` and normalize to `600`. It records a specific risk: the host's backup script encrypts `device_credentials/` but copies the Obsidian vault in **plaintext**, so any secret placed in Obsidian is also in the backup. Cleaning the current files does not clean git history, so remediation presents the operator with an explicit choice (accept for a private repository, rewrite history, or rotate the leaked secret). This is why the vault's no-secrets rule is a hard rule, not a preference.

## Pitfalls listed by the skill

- Do not store secrets in Obsidian; keep references or file locations only.
- When the user corrects a fact already held, **replace the entry in place** rather than adding a second one, because memory and the credential index are both read as authoritative and two versions means a coin flip.
- Do not generalize one host's credential to a group; write each host explicitly, since shared-looking credentials drift.
- Re-read the target file before editing it; an index accumulates site-specific caveats that a blind overwrite destroys.
- Do not bloat Hermes memory with long inventories or timelines.
- Do not create many narrow notes when one umbrella index plus child notes is enough.

## Verification questions

After adding a new fact, ask: does it need to be recalled instantly in future sessions? Is it short and stable enough for memory? If not, keep it in Obsidian and add only a compact pointer to memory.

## Observed memory sizes (2026-10-05)

| File | Size on disk | Cap | Fill (by bytes) |
|---|---|---|---|
| `/root/.hermes/memories/MEMORY.md` | 1,852 bytes | 2,200 characters | about 84% |
| `/root/.hermes/memories/USER.md` | 1,184 bytes | 1,375 characters | about 86% |

Both are above the skill's 80% trigger when measured in bytes. Character counts can be lower than byte counts when text contains multi-byte characters (the operator's notes mix English and Indonesian), so the true fill could be slightly lower. The point stands either way: both files are close to their caps, which is the practical reason routing matters.
