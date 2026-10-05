"""LLM Wiki plugin API: strictly read-only access to a local markdown wiki.

Security model
- Nothing here writes, renames or deletes. Only ``GET`` routes exist and the only file operations are reads.
- The only readable locations are ``<root>/wiki/**/*.md``, ``<root>/raw/*.md`` and ``<root>/SCHEMA.md``.
- Every client-supplied path goes through ``_clean_relpath`` (control characters, backslashes, absolute paths,
  ``.``/``..``/hidden segments, repeated percent-decoding) and then ``_resolve_md``, which calls
  ``Path.resolve()`` and requires the result to stay inside the layer's base directory. That also rejects
  symlinks that point outside it.
- Errors carry a stable ``code`` and a short message; server paths are never echoed back.

The root defaults to the plugin directory (the parent of ``dashboard/``). ``LLM_WIKI_ROOT`` overrides it.
"""

import os
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
from urllib.parse import unquote

from fastapi import APIRouter, HTTPException, Query

router = APIRouter(tags=["llm-wiki"])

MAX_FILE_BYTES = 1_000_000
MAX_PATH_LEN = 256
MIN_QUERY_LEN = 2
MAX_QUERY_LEN = 200
MAX_TERMS = 8
SEARCH_LIMIT = 50
SNIPPET_RADIUS = 80
MAX_DECODE_ROUNDS = 3
SPECIAL_PAGES = frozenset({"index.md", "log.md"})
SOURCE_GROUP = "source"

_BAD_CHARS = re.compile(r"[\x00-\x1f\x7f\\]")
_FRONTMATTER = re.compile(r"\A---\r?\n(.*?)\r?\n---[ \t]*(?:\r?\n|\Z)", re.S)
_FENCE = re.compile(r"^[ \t]*(```|~~~)")
_INLINE_CODE = re.compile(r"(?<!`)(`+)(?!`)[^\n]*?(?<!`)\1(?!`)")
_WIKILINK = re.compile(r"\[\[([^\[\]\n]+?)\]\]")
_HEADING_1 = re.compile(r"^#\s+(.+?)\s*$", re.M)
_INDEX_ITEM = re.compile(r"^\s*[-*]\s+\[\[([^\]]+)\]\](?:\s*(?:—|–|-|:)\s*(.*))?\s*$")
_LOG_HEADING = re.compile(r"^##\s+\[(\d{4}-\d{2}-\d{2})\]\s+([A-Za-z][\w-]*)\s*\|\s*(.+?)\s*$")


# ─── errors ─────────────────────────────────────────────────────────
def _fail(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


# ─── locations ──────────────────────────────────────────────────────
def _root() -> Path:
    explicit = os.environ.get("LLM_WIKI_ROOT", "").strip()
    return (Path(explicit) if explicit else Path(__file__).parent.parent).resolve()


def _wiki_dir() -> Path:
    return (_root() / "wiki").resolve()


def _raw_dir() -> Path:
    return (_root() / "raw").resolve()


# ─── path safety ────────────────────────────────────────────────────
def _clean_relpath(value: str) -> str:
    """Validate a client-supplied relative path and return its fully percent-decoded form."""
    if not value or len(value) > MAX_PATH_LEN or _BAD_CHARS.search(value):
        raise _fail(400, "bad_path", "Invalid path.")
    decoded = value
    for _ in range(MAX_DECODE_ROUNDS):
        step = unquote(decoded)
        if step == decoded:
            break
        decoded = step
    else:
        if unquote(decoded) != decoded:
            raise _fail(400, "bad_path", "Invalid path.")
    if _BAD_CHARS.search(decoded) or decoded.startswith("/") or ":" in decoded:
        raise _fail(400, "bad_path", "Invalid path.")
    for segment in decoded.split("/"):
        if segment in ("", ".", "..") or segment.startswith("."):
            raise _fail(400, "bad_path", "Invalid path.")
    return decoded


def _resolve_md(base: Path, value: str) -> Path:
    """Resolve ``value`` to an existing markdown file strictly inside ``base``."""
    clean = _clean_relpath(value)
    if not clean.endswith(".md"):
        clean += ".md"
    candidate = (base / clean).resolve()
    if not candidate.is_relative_to(base):
        raise _fail(400, "bad_path", "Invalid path.")
    if not candidate.is_file():
        raise _fail(404, "not_found", "No such document.")
    return candidate


def _read(path: Path) -> str:
    if path.stat().st_size > MAX_FILE_BYTES:
        raise _fail(413, "too_large", "Document is too large.")
    return path.read_text(encoding="utf-8", errors="replace")


# ─── markdown parsing ───────────────────────────────────────────────
def _unquote_scalar(text: str) -> str:
    text = text.strip()
    if len(text) >= 2 and text[0] == text[-1] and text[0] in "\"'":
        return text[1:-1]
    return text


def _parse_value(text: str) -> Any:
    if text.startswith("[") and text.endswith("]"):
        return [_unquote_scalar(item) for item in text[1:-1].split(",") if item.strip()]
    return _unquote_scalar(text)


def _split_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    """Parse single-line scalars and inline lists; return (meta, body)."""
    match = _FRONTMATTER.match(text)
    if not match:
        return {}, text
    meta: dict[str, Any] = {}
    for line in match.group(1).splitlines():
        key, sep, value = line.partition(":")
        key = key.strip()
        if not sep or not key or line[:1] in (" ", "\t", "#"):
            continue
        meta[key] = _parse_value(value.strip())
    return meta, text[match.end():]


def _toggle_fence(fence: Optional[str], marker: str) -> Optional[str]:
    if fence is None:
        return marker
    return None if fence == marker else fence


def _strip_code(text: str) -> str:
    """Drop fenced blocks and inline code so wikilink syntax shown as code is not a link."""
    kept: list[str] = []
    fence: Optional[str] = None
    for line in text.splitlines():
        marker = _FENCE.match(line)
        if marker:
            fence = _toggle_fence(fence, marker.group(1))
            continue
        if fence is None:
            kept.append(_INLINE_CODE.sub("", line))
    return "\n".join(kept)


def _extract_links(body: str) -> tuple[tuple[str, str, str], ...]:
    """Return (target, alias, anchor) for every wikilink outside code, in order."""
    found = []
    for inner in _WIKILINK.findall(_strip_code(body)):
        target, _, alias = inner.replace("\\|", "|").partition("|")
        target, _, anchor = target.partition("#")
        if target.strip():
            found.append((target.strip().rstrip("\\"), alias.strip(), anchor.strip()))
    return tuple(found)


def _iso(timestamp: float) -> str:
    return datetime.fromtimestamp(timestamp, timezone.utc).isoformat(timespec="seconds")


# ─── corpus ─────────────────────────────────────────────────────────
@dataclass(frozen=True)
class Page:
    scope: str  # "wiki" or "raw"
    path: str  # wiki: relative to wiki/; raw: "raw/<name>.md"
    title: str
    category: str
    meta: dict[str, Any]
    body: str
    words: int
    size: int
    modified: str
    links: tuple[tuple[str, str, str], ...]

    @property
    def special(self) -> bool:
        return self.scope == "wiki" and self.path in SPECIAL_PAGES

    @property
    def group(self) -> str:
        return SOURCE_GROUP if self.scope == "raw" else self.category


@dataclass(frozen=True)
class Corpus:
    pages: tuple[Page, ...]
    sources: tuple[Page, ...]
    keys: dict[str, Page]

    def by_path(self, path: str) -> Optional[Page]:
        return next((p for p in self.pages + self.sources if p.path == path), None)

    def resolve(self, target: str) -> Optional[Page]:
        return self.keys.get(target.strip().removesuffix(".md").casefold())

    @property
    def articles(self) -> tuple[Page, ...]:
        return tuple(p for p in self.pages if not p.special)


def _iter_markdown(base: Path, recursive: bool):
    if not base.is_dir():
        return
    for path in sorted(base.rglob("*.md") if recursive else base.glob("*.md")):
        rel = path.relative_to(base)
        if any(part.startswith(".") for part in rel.parts):
            continue
        resolved = path.resolve()
        if resolved.is_relative_to(base) and resolved.is_file() and resolved.stat().st_size <= MAX_FILE_BYTES:
            yield rel.as_posix(), resolved


def _make_page(scope: str, rel: str, resolved: Path) -> Page:
    meta, body = _split_frontmatter(resolved.read_text(encoding="utf-8", errors="replace"))
    heading = _HEADING_1.search(body)
    stem = rel.rsplit("/", 1)[-1].removesuffix(".md")
    if scope == "raw":
        path, category = f"raw/{rel}", SOURCE_GROUP
    else:
        path = rel
        category = str(meta.get("category") or (rel.split("/")[0] if "/" in rel else "overview"))
    stat = resolved.stat()
    return Page(
        scope=scope,
        path=path,
        title=str(meta.get("title") or (heading.group(1) if heading else stem)),
        category=category,
        meta=meta,
        body=body,
        words=len(body.split()),
        size=stat.st_size,
        modified=_iso(stat.st_mtime),
        links=_extract_links(body),
    )


def _build_keys(pages: tuple[Page, ...], sources: tuple[Page, ...]) -> dict[str, Page]:
    keys: dict[str, Page] = {}
    for page in pages:
        keys.setdefault(page.title.casefold(), page)
    for page in pages:
        keys.setdefault(page.path.removesuffix(".md").casefold(), page)
        keys.setdefault(page.path.rsplit("/", 1)[-1].removesuffix(".md").casefold(), page)
    for page in sources:
        keys.setdefault(page.path.removesuffix(".md").casefold(), page)
    return keys


def _load_corpus() -> Corpus:
    pages = tuple(_make_page("wiki", rel, res) for rel, res in _iter_markdown(_wiki_dir(), True))
    sources = tuple(_make_page("raw", rel, res) for rel, res in _iter_markdown(_raw_dir(), False))
    return Corpus(pages, sources, _build_keys(pages, sources))


def _link_kind(hit: Optional[Page]) -> str:
    if hit is None:
        return "missing"
    return "source" if hit.scope == "raw" else "page"


def _resolve_links(corpus: Corpus, page: Page) -> list[dict[str, Any]]:
    seen: set[str] = set()
    out = []
    for target, alias, anchor in page.links:
        hit = corpus.resolve(target)
        ident = hit.path if hit else "?" + target.casefold()
        if ident in seen:
            continue
        seen.add(ident)
        out.append({
            "target": target,
            "alias": alias or None,
            "anchor": anchor or None,
            "kind": _link_kind(hit),
            "path": hit.path if hit else None,
            "title": hit.title if hit else None,
        })
    return out


def _inbound(corpus: Corpus) -> dict[str, list[Page]]:
    """Map each target path to the non-special wiki pages that link to it (self-links excluded)."""
    inbound: dict[str, list[Page]] = {}
    for page in corpus.articles:
        for link in _resolve_links(corpus, page):
            if link["path"] and link["path"] != page.path:
                inbound.setdefault(link["path"], []).append(page)
    return inbound


def _brief(page: Page) -> dict[str, Any]:
    return {"path": page.path, "title": page.title, "category": page.group}


def _by_title(pages: list[Page]) -> list[dict[str, Any]]:
    return sorted((_brief(p) for p in pages), key=lambda b: b["title"].casefold())


# ─── log parsing ────────────────────────────────────────────────────
def _parse_log(corpus: Corpus) -> list[dict[str, Any]]:
    page = next((p for p in corpus.pages if p.path == "log.md"), None)
    if page is None:
        return []
    entries: list[dict[str, Any]] = []
    current: Optional[dict[str, Any]] = None
    fence: Optional[str] = None
    for line in page.body.splitlines():
        marker = _FENCE.match(line)
        if marker:
            fence = _toggle_fence(fence, marker.group(1))
        heading = None if (fence or marker) else _LOG_HEADING.match(line)
        if heading:
            current = {"date": heading.group(1), "type": heading.group(2).lower(),
                       "title": heading.group(3), "lines": []}
            entries.append(current)
        elif line.startswith("## ") and not fence:
            current = None
        elif current is not None:
            current["lines"].append(line)
    for entry in entries:
        body = "\n".join(entry.pop("lines")).strip()
        scratch = Page("wiki", "log.md", "", "", {}, body, 0, 0, "", _extract_links(body))
        entry["body"] = body
        entry["links"] = [lk for lk in _resolve_links(corpus, scratch) if lk["kind"] != "missing"]
    return entries


# ─── routes ─────────────────────────────────────────────────────────
@router.get("/status")
def status() -> dict[str, Any]:
    corpus = _load_corpus()
    articles = corpus.articles
    inbound = _inbound(corpus)
    categories: dict[str, int] = {}
    for page in articles:
        categories[page.category] = categories.get(page.category, 0) + 1
    log_dates = [e["date"] for e in _parse_log(corpus)]
    stamps = [p.modified for p in corpus.pages + corpus.sources]
    return {
        "articles": len(articles),
        "pages": len(corpus.pages),
        "words": sum(p.words for p in articles),
        "sources": len(corpus.sources),
        "categories": dict(sorted(categories.items())),
        "orphans": sorted(p.path for p in articles if p.path not in inbound),
        "log_entries": len(log_dates),
        "last_log_date": log_dates[-1] if log_dates else None,
        "last_update": max(stamps) if stamps else None,
    }


@router.get("/index")
def index() -> dict[str, Any]:
    corpus = _load_corpus()
    page = next((p for p in corpus.pages if p.path == "index.md"), None)
    if page is None:
        raise _fail(404, "not_found", "The wiki has no index.md.")
    categories: list[dict[str, Any]] = []
    listed: set[str] = set()
    for line in page.body.splitlines():
        if line.startswith("## "):
            categories.append({"name": line[3:].strip(), "pages": []})
            continue
        item = _INDEX_ITEM.match(line)
        if not item or not categories:
            continue
        target = item.group(1).replace("\\|", "|").partition("|")[0].partition("#")[0]
        hit = corpus.resolve(target)
        if hit:
            listed.add(hit.path)
        categories[-1]["pages"].append({
            "title": hit.title if hit else target.strip(),
            "path": hit.path if hit else None,
            "kind": _link_kind(hit),
            "summary": (item.group(2) or "").strip() or (str(hit.meta.get("summary", "")) if hit else ""),
        })
    unlisted = sorted(p.path for p in corpus.pages if p.path not in listed and p.path != "index.md")
    return {"title": page.title, "categories": categories, "unlisted": unlisted}


@router.get("/page")
def read_page(path: str = Query(..., max_length=MAX_PATH_LEN)) -> dict[str, Any]:
    base = _wiki_dir()
    resolved = _resolve_md(base, path)
    _read(resolved)
    corpus = _load_corpus()
    page = corpus.by_path(resolved.relative_to(base).as_posix())
    if page is None or page.scope != "wiki":
        raise _fail(404, "not_found", "No such document.")
    return {
        **_brief(page),
        "meta": page.meta,
        "body": page.body,
        "words": page.words,
        "modified": page.modified,
        "links": _resolve_links(corpus, page),
        "backlinks": _by_title(_inbound(corpus).get(page.path, [])),
    }


@router.get("/log")
def log() -> dict[str, Any]:
    entries = _parse_log(_load_corpus())
    return {"count": len(entries), "entries": entries}


@router.get("/sources")
def sources() -> dict[str, Any]:
    items = [{
        "name": p.path.removeprefix("raw/"),
        "path": p.path,
        "title": p.title,
        "source": p.meta.get("source", ""),
        "retrieved": p.meta.get("retrieved", ""),
        "words": p.words,
        "bytes": p.size,
        "modified": p.modified,
    } for p in _load_corpus().sources]
    return {"count": len(items), "sources": items}


@router.get("/source")
def read_source(name: str = Query(..., max_length=MAX_PATH_LEN)) -> dict[str, Any]:
    base = _raw_dir()
    if "/" in _clean_relpath(name):
        raise _fail(400, "bad_path", "Invalid path.")
    resolved = _resolve_md(base, name)
    _read(resolved)
    corpus = _load_corpus()
    page = corpus.by_path(f"raw/{resolved.relative_to(base).as_posix()}")
    if page is None:
        raise _fail(404, "not_found", "No such document.")
    return {
        "name": page.path.removeprefix("raw/"),
        "title": page.title,
        "meta": page.meta,
        "body": page.body,
        "words": page.words,
        "modified": page.modified,
        "cited_by": _by_title(_inbound(corpus).get(page.path, [])),
    }


# ─── search ─────────────────────────────────────────────────────────
def _snippet(text: str, terms: list[str]) -> str:
    flat = " ".join(text.split())
    lowered = flat.casefold()
    hits = [i for i in (lowered.find(t) for t in terms) if i >= 0]
    start = max(min(hits, default=0) - SNIPPET_RADIUS, 0)
    end = start + 2 * SNIPPET_RADIUS
    return ("…" if start else "") + flat[start:end] + ("…" if end < len(flat) else "")


def _score(page: Page, terms: list[str]) -> Optional[tuple[int, int]]:
    tag_list = page.meta.get("tags")
    tags = " ".join(str(t) for t in tag_list).casefold() if isinstance(tag_list, list) else ""
    title, body = page.title.casefold(), page.body.casefold()
    if not all(t in title or t in tags or t in body for t in terms):
        return None
    occurrences = sum(body.count(t) for t in terms)
    score = sum((10 if t in title else 0) + (4 if t in tags else 0) for t in terms) + min(occurrences, 10)
    return score, occurrences


@router.get("/search")
def search(q: str = Query(..., max_length=MAX_QUERY_LEN)) -> dict[str, Any]:
    query = q.strip()
    if len(query) < MIN_QUERY_LEN or _BAD_CHARS.search(query):
        raise _fail(400, "bad_query", f"Query must be at least {MIN_QUERY_LEN} characters.")
    terms = query.casefold().split()[:MAX_TERMS]
    corpus = _load_corpus()
    results = []
    for page in corpus.pages + corpus.sources:
        scored = _score(page, terms)
        if scored:
            results.append({**_brief(page), "scope": page.scope, "score": scored[0], "matches": scored[1],
                            "snippet": _snippet(page.body, terms)})
    results.sort(key=lambda r: (-r["score"], r["path"]))
    return {"q": query, "count": len(results), "results": results[:SEARCH_LIMIT]}


# ─── graph and schema ───────────────────────────────────────────────
@router.get("/graph")
def graph() -> dict[str, Any]:
    """Nodes: non-special wiki pages plus raw sources. Edges: resolved wikilinks, directed, deduplicated."""
    corpus = _load_corpus()
    members = {p.path: p for p in corpus.articles + corpus.sources}
    edges: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for page in corpus.articles:
        for link in _resolve_links(corpus, page):
            pair = (page.path, link["path"])
            if link["path"] in members and link["path"] != page.path and pair not in seen:
                seen.add(pair)
                edges.append({"source": pair[0], "target": pair[1]})
    degree: dict[str, int] = {}
    for edge in edges:
        for end in (edge["source"], edge["target"]):
            degree[end] = degree.get(end, 0) + 1
    nodes = [{"id": p.path, "title": p.title, "group": p.group, "words": p.words, "degree": degree.get(p.path, 0)}
             for p in members.values()]
    return {"nodes": nodes, "edges": edges, "groups": sorted({n["group"] for n in nodes})}


@router.get("/schema")
def schema() -> dict[str, Any]:
    root = _root()
    path = (root / "SCHEMA.md").resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise _fail(404, "not_found", "SCHEMA.md not found.")
    text = _read(path)
    return {"path": "SCHEMA.md", "body": text, "words": len(text.split()), "modified": _iso(path.stat().st_mtime)}
