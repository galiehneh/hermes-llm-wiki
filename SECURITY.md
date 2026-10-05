# Security Policy

## Reporting a vulnerability

Please report suspected vulnerabilities **privately** to the maintainer (`galiehneh`) through the channel you received this plugin from. Do not open a public issue or post details publicly until a fix is available.

Include: what you found, the request or file that triggers it, the version (`plugin.yaml`), and what an attacker gains. A proof of concept helps. Expect an acknowledgement and a fix or mitigation plan; this is a small, volunteer-maintained project and there is no formal SLA.

## Supported versions

Only the latest release (currently 1.0.x) receives fixes.

## Security model

The plugin shows a local, git-versioned markdown wiki inside the Hermes dashboard. Its design goal is that it can **read only the wiki and nothing else, and change nothing**.

### Backend (`dashboard/api.py`)

- **Read-only.** Only `GET` routes exist. The code contains no write, rename, delete or subprocess call, and no outbound network call. A test asserts that the router exposes only `GET` and that `POST`, `PUT`, `DELETE` and `PATCH` return 405.
- **Fixed scope.** It reads `wiki/**/*.md`, `raw/*.md` and `SCHEMA.md` under one root (the plugin directory, or `LLM_WIKI_ROOT`). There is no generic file-read route and no directory listing of arbitrary paths.
- **Path traversal prevention.** Every client-supplied `path` or `name` is checked in two stages:
  1. Syntactic: reject empty or over-long values, control characters including NUL, backslashes, a leading `/`, a `:`, and any segment that is empty, `.`, `..` or starts with a dot. The check runs on the value after repeated percent-decoding (up to three rounds; a value that is still changing after that is rejected), so `%2e%2e/`, `%252e%252e/` and `..%2f` are caught.
  2. Semantic: the path is joined to the layer's base directory, resolved with `Path.resolve()`, and must remain inside that base. A symlink inside `wiki/` that points outside is therefore refused when requested and skipped when listing or searching. Containment is checked before existence, so a probe cannot learn whether a file outside the base exists.
- **Resource limits.** Files over 1,000,000 bytes are not served or indexed. Search queries are 2 to 200 characters with at most 8 terms and 50 results.
- **Error hygiene.** Errors carry a stable code and a short fixed message. Server filesystem paths are never echoed.
- **No secrets in scope.** The wiki must contain no credentials (see `SCHEMA.md`); credential files on the host are outside the served root.

### Frontend (`dashboard/plugin.js`)

- No `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval` or `new Function`. Markdown is parsed into React elements, so wiki text is always escaped.
- Link allow-list: only `http`, `https` and `mailto` URLs become anchors, and external anchors use `rel="noopener noreferrer"`. `javascript:` and `data:` URLs render as plain text. Markdown images are never fetched; they render as a text placeholder.
- No external assets: no CDN script, web font, remote stylesheet or remote image. Everything runs from `window.__HERMES_PLUGIN_SDK__`.
- The only browser storage used is a list of already-opened page paths in `localStorage` for the "unread" counters.

These properties are enforced by tests (`tests/test_api.py` and `tests/plugin.test.js`), including a scan of `plugin.js` for forbidden constructs.

## Known limitations and operator responsibilities

- **No authentication of its own.** The plugin inherits whatever protects the Hermes dashboard. Anyone who can reach the dashboard can read the entire wiki, so **do not put secrets or sensitive personal data in `wiki/`, `raw/` or `SCHEMA.md`**. Store references (file paths) instead.
- **Content trust.** Wiki pages are written by LLM agents. A compromised or manipulated agent could write misleading text or links. The plugin cannot execute that text, but readers should treat it as unreviewed unless it has been checked against its cited raw sources. Review diffs before relying on new claims.
- **Per-request scan.** Each request re-reads the wiki, which is simple and always fresh but costs time proportional to wiki size. This is fine for hundreds of pages. A very large or adversarially large wiki could slow the dashboard process; the 1 MB per-file cap bounds single-file cost, not the total.
- **Symlinks.** Symlinks that stay inside the wiki are followed. Do not place links to sensitive files anywhere under `wiki/` or `raw/`, even though escapes are blocked.
- **Dependencies.** The backend uses only `fastapi` and the Python standard library; the frontend uses only the Hermes SDK. Keep Hermes and `fastapi` up to date.

## Hardening checklist for operators

1. Keep the dashboard bound to a trusted network or behind its own authentication.
2. Keep the repository free of credentials; run a secret scan before sharing it.
3. Make sure the plugin directory and `raw/` are not writable by the dashboard's service account if you want the immutability of raw sources enforced by the OS and not only by convention.
4. Run `python3 -m pytest tests -q` and `node --test tests/plugin.test.js` after any change to `dashboard/`.
