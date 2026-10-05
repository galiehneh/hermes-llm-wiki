"""Tests for the LLM Wiki dashboard API (dashboard/api.py).

Most tests run against a small fixture wiki whose counts are known by construction, so assertions are exact.
A second group runs against the real repository to catch drift between pages, index, log and links.
"""

import importlib.util
import re
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

REPO = Path(__file__).resolve().parent.parent
BASE = "/api/plugins/llm-wiki"

ALPHA_BODY = "Alpha links to [[Beta Page]] and [[raw/src-a]]. Zebra here. `[[Not A Link]]`\n"
BETA_BODY = "Beta links back to [[Alpha Page|the alpha]] and [[alpha/one#Section]] and itself [[Beta Page]].\n"
ORPHAN_BODY = "Lonely page with a fenced block.\n\n```\n[[Fenced Ghost]]\n```\n"

FIXTURE_FILES = {
    "SCHEMA.md": "# Fixture schema\n\nRules go here.\n",
    "raw/src-a.md": (
        "---\ntitle: Source A\nsource: https://example.test/a\nretrieved: 2026-01-01\nimmutable: true\n---\n"
        "Raw ground truth with the token rawonlyword inside.\n"
    ),
    "wiki/index.md": (
        "---\ntitle: Index\ntags: [index, catalog]\ncategory: overview\ndate: 2026-01-01\nsources: []\n"
        "summary: Catalog.\n---\n# Index\n\n## Alpha\n\n- [[Alpha Page]] — The alpha summary.\n\n"
        "## Beta\n\n- [[Beta Page]] — Beta summary.\n- [[Ghost Page]] — Does not exist.\n"
    ),
    "wiki/log.md": (
        "---\ntitle: Log\ntags: [log, chronology]\ncategory: operations\ndate: 2026-01-02\nsources: []\n"
        "summary: Log.\n---\n# Log\n\nIntro mentioning `## [2000-01-01] fake | not an entry`.\n\n"
        "## [2026-01-01] ingest | First thing\n\n- Created [[Alpha Page]].\n- Mentions [[Ghost Page]].\n\n"
        "## [2026-01-02] lint | Second thing\n\n- All good.\n\n## Not a log heading\n\nignored text\n"
    ),
    "wiki/alpha/one.md": (
        "---\ntitle: Alpha Page\ntags: [alpha, demo]\ncategory: alpha\ndate: 2026-01-02\n"
        "sources: [raw/src-a.md]\nsummary: Alpha summary.\n---\n" + ALPHA_BODY
    ),
    "wiki/beta/two.md": (
        "---\ntitle: Beta Page\ntags: [beta]\ncategory: beta\ndate: 2026-01-03\nsources: []\n"
        "summary: Beta summary.\n---\n" + BETA_BODY
    ),
    "wiki/orphan.md": "---\ntitle: Orphan Page\ncategory: overview\n---\n" + ORPHAN_BODY,
}


@pytest.fixture(scope="session")
def api_module():
    """Load api.py by file path without registering it in sys.modules, like a plugin loader may."""
    spec = importlib.util.spec_from_file_location("llm_wiki_api_under_test", REPO / "dashboard" / "api.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _client(api_module) -> TestClient:
    app = FastAPI()
    app.include_router(api_module.router, prefix=BASE)
    return TestClient(app)


@pytest.fixture
def fixture_root(tmp_path):
    for rel, text in FIXTURE_FILES.items():
        target = tmp_path / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")
    (tmp_path / "secret.md").write_text("TOPSECRET outside the wiki\n", encoding="utf-8")
    return tmp_path


@pytest.fixture
def client(api_module, fixture_root, monkeypatch):
    monkeypatch.setenv("LLM_WIKI_ROOT", str(fixture_root))
    return _client(api_module)


@pytest.fixture
def repo_client(api_module, monkeypatch):
    monkeypatch.setenv("LLM_WIKI_ROOT", str(REPO))
    return _client(api_module)


def get(client, endpoint, /, **params):
    return client.get(BASE + endpoint, params=params)


# ─── status ─────────────────────────────────────────────────────────
def test_status_reports_exact_page_and_word_counts(client):
    data = get(client, "/status").json()

    assert data["articles"] == 3  # alpha, beta, orphan (index and log are special files)
    assert data["pages"] == 5
    assert data["words"] == 12 + 13 + 10  # body words only, frontmatter excluded
    assert data["sources"] == 1
    assert data["categories"] == {"alpha": 1, "beta": 1, "overview": 1}
    assert data["orphans"] == ["orphan.md"]
    assert data["log_entries"] == 2
    assert data["last_log_date"] == "2026-01-02"
    assert re.match(r"\d{4}-\d{2}-\d{2}T", data["last_update"])


def test_status_on_empty_root_is_zeroed_not_an_error(api_module, tmp_path, monkeypatch):
    monkeypatch.setenv("LLM_WIKI_ROOT", str(tmp_path))
    data = get(_client(api_module), "/status").json()

    assert (data["articles"], data["pages"], data["words"], data["sources"]) == (0, 0, 0, 0)
    assert data["last_update"] is None and data["last_log_date"] is None


# ─── path traversal ─────────────────────────────────────────────────
TRAVERSAL = [
    "../../etc/passwd",
    "../secret",
    "../secret.md",
    "%2e%2e/%2e%2e/etc/passwd",
    "%2e%2e%2f%2e%2e%2fetc%2fpasswd",
    "..%2f..%2fetc%2fpasswd",
    "%252e%252e/%252e%252e/etc/passwd",
    "%25252e%25252e/secret",
    "....//....//etc/passwd",
    "..%5c..%5csecret",
    "..\\..\\etc\\passwd",
    "/etc/passwd",
    "//etc/passwd",
    "alpha/../../secret",
    "alpha/../one",
    "./alpha/one",
    "alpha//one",
    "alpha/one/",
    ".hidden",
    "alpha/.hidden/x",
    "%00",
    "alpha/one%00.md",
    "C:/Windows/win.ini",
    "x" * 300,
]


@pytest.mark.parametrize("payload", TRAVERSAL)
@pytest.mark.parametrize("endpoint,param", [("/page", "path"), ("/source", "name")])
def test_traversal_is_rejected_and_leaks_nothing(client, endpoint, param, payload):
    response = client.get(f"{BASE}{endpoint}?{param}={payload}")

    assert response.status_code in (400, 403, 404, 422)
    assert "TOPSECRET" not in response.text
    assert "root:" not in response.text


def test_traversal_error_does_not_echo_server_paths(client, fixture_root):
    response = get(client, "/page", path="../../etc/passwd")

    assert response.status_code == 400
    assert str(fixture_root) not in response.text
    assert response.json()["detail"]["code"] == "bad_path"


def test_source_name_with_subdirectory_is_rejected(client):
    assert get(client, "/source", name="sub/src-a.md").status_code == 400


def test_symlink_escaping_the_wiki_is_not_served_or_indexed(client, fixture_root):
    link = fixture_root / "wiki" / "leak.md"
    try:
        link.symlink_to(fixture_root / "secret.md")
    except OSError:
        pytest.skip("symlinks unavailable")

    assert get(client, "/page", path="leak.md").status_code == 400
    assert get(client, "/search", q="TOPSECRET").json()["count"] == 0
    assert get(client, "/status").json()["pages"] == 5


def test_legitimate_paths_still_work_with_and_without_extension(client):
    assert get(client, "/page", path="alpha/one.md").status_code == 200
    assert get(client, "/page", path="alpha/one").status_code == 200
    assert get(client, "/page", path="alpha%2Fone.md").status_code == 200


def test_missing_page_is_404(client):
    assert get(client, "/page", path="alpha/nope.md").status_code == 404
    assert get(client, "/source", name="nope.md").status_code == 404


def test_api_is_read_only(api_module, client):
    methods = {m for route in api_module.router.routes for m in route.methods}

    assert methods == {"GET"}
    for verb in (client.post, client.put, client.delete, client.patch):
        assert verb(f"{BASE}/page", params={"path": "alpha/one.md"}).status_code == 405


# ─── page, links and backlinks ──────────────────────────────────────
def test_page_returns_content_frontmatter_links_and_backlinks(client):
    data = get(client, "/page", path="alpha/one.md").json()

    assert data["title"] == "Alpha Page"
    assert data["category"] == "alpha"
    assert data["path"] == "alpha/one.md"
    assert data["meta"]["tags"] == ["alpha", "demo"]
    assert data["meta"]["sources"] == ["raw/src-a.md"]
    assert data["meta"]["date"] == "2026-01-02"
    assert data["body"] == ALPHA_BODY
    assert data["words"] == 12
    forward = {(link["target"], link["kind"], link["path"]) for link in data["links"]}
    assert forward == {("Beta Page", "page", "beta/two.md"), ("raw/src-a", "source", "raw/src-a.md")}
    assert [b["path"] for b in data["backlinks"]] == ["beta/two.md"]


def test_links_in_code_spans_and_fences_are_ignored(client):
    alpha = get(client, "/page", path="alpha/one.md").json()
    orphan = get(client, "/page", path="orphan.md").json()

    assert all(link["target"] != "Not A Link" for link in alpha["links"])
    assert orphan["links"] == []


def test_alias_anchor_and_stem_links_resolve_and_dedupe(client):
    data = get(client, "/page", path="beta/two.md").json()
    by_path = {link["path"]: link for link in data["links"]}

    assert set(by_path) == {"alpha/one.md", "beta/two.md"}  # alias and stem+anchor collapse to one link
    assert by_path["alpha/one.md"]["alias"] == "the alpha"
    assert [b["path"] for b in data["backlinks"]] == ["alpha/one.md"]  # the self link is not a backlink


def test_backlinks_from_special_pages_are_excluded(client):
    data = get(client, "/page", path="alpha/one.md").json()

    assert "index.md" not in {b["path"] for b in data["backlinks"]}
    assert "log.md" not in {b["path"] for b in data["backlinks"]}


def test_unresolved_wikilinks_are_reported_as_missing(client):
    data = get(client, "/page", path="log.md").json()

    ghost = next(link for link in data["links"] if link["target"] == "Ghost Page")
    assert ghost["kind"] == "missing" and ghost["path"] is None


# ─── index ──────────────────────────────────────────────────────────
def test_index_is_parsed_into_categories_with_resolved_pages(client):
    data = get(client, "/index").json()

    assert [c["name"] for c in data["categories"]] == ["Alpha", "Beta"]
    alpha = data["categories"][0]["pages"][0]
    assert (alpha["title"], alpha["path"], alpha["summary"]) == ("Alpha Page", "alpha/one.md", "The alpha summary.")
    ghost = data["categories"][1]["pages"][1]
    assert (ghost["title"], ghost["kind"], ghost["path"]) == ("Ghost Page", "missing", None)
    assert data["unlisted"] == ["log.md", "orphan.md"]


def test_index_missing_is_404(api_module, tmp_path, monkeypatch):
    monkeypatch.setenv("LLM_WIKI_ROOT", str(tmp_path))

    assert get(_client(api_module), "/index").status_code == 404


# ─── search ─────────────────────────────────────────────────────────
def test_search_finds_keyword_with_snippet(client):
    data = get(client, "/search", q="zebra").json()

    assert data["count"] == 1
    hit = data["results"][0]
    assert hit["path"] == "alpha/one.md" and hit["scope"] == "wiki"
    assert "Zebra" in hit["snippet"]


def test_search_covers_raw_sources(client):
    hit = get(client, "/search", q="rawonlyword").json()["results"][0]

    assert (hit["scope"], hit["path"]) == ("raw", "raw/src-a.md")


def test_search_ranks_title_matches_first_and_requires_all_terms(client):
    ranked = get(client, "/search", q="alpha").json()["results"]
    both = get(client, "/search", q="alpha zebra").json()["results"]
    none = get(client, "/search", q="zebra nonexistentterm").json()

    assert ranked[0]["path"] == "alpha/one.md"
    assert [r["path"] for r in both] == ["alpha/one.md"]
    assert none["count"] == 0


def test_search_is_case_insensitive_and_matches_tags(client):
    assert get(client, "/search", q="ZEBRA").json()["count"] == 1
    assert "alpha/one.md" in {r["path"] for r in get(client, "/search", q="demo").json()["results"]}


@pytest.mark.parametrize("query", ["", " ", "a", "x\x00y"])
def test_search_rejects_short_or_control_queries(client, query):
    assert get(client, "/search", q=query).status_code == 400


def test_search_rejects_overlong_query(client):
    assert get(client, "/search", q="a" * 500).status_code == 422


# ─── graph ──────────────────────────────────────────────────────────
def test_graph_has_valid_nodes_and_deduplicated_edges(client):
    data = get(client, "/graph").json()
    ids = [n["id"] for n in data["nodes"]]
    edges = [(e["source"], e["target"]) for e in data["edges"]]

    assert sorted(ids) == ["alpha/one.md", "beta/two.md", "orphan.md", "raw/src-a.md"]
    assert len(ids) == len(set(ids))
    assert set(edges) == {
        ("alpha/one.md", "beta/two.md"),
        ("alpha/one.md", "raw/src-a.md"),
        ("beta/two.md", "alpha/one.md"),  # mutual link: a cycle is legal and must not break anything
    }
    assert len(edges) == len(set(edges))
    assert all(s != t and s in ids and t in ids for s, t in edges)
    assert data["groups"] == ["alpha", "beta", "overview", "source"]


def test_graph_nodes_carry_group_words_and_degree(client):
    nodes = {n["id"]: n for n in get(client, "/graph").json()["nodes"]}

    assert nodes["alpha/one.md"]["group"] == "alpha" and nodes["alpha/one.md"]["words"] == 12
    assert nodes["raw/src-a.md"]["group"] == "source"
    assert nodes["alpha/one.md"]["degree"] == 3 and nodes["orphan.md"]["degree"] == 0


def test_graph_excludes_special_pages(client):
    ids = {n["id"] for n in get(client, "/graph").json()["nodes"]}

    assert "index.md" not in ids and "log.md" not in ids


def test_graph_survives_many_mutual_links(api_module, tmp_path, monkeypatch):
    names = [f"Page {i}" for i in range(30)]
    (tmp_path / "wiki").mkdir()
    for i, name in enumerate(names):
        links = " ".join(f"[[{other}]]" for other in names)
        (tmp_path / "wiki" / f"p{i}.md").write_text(f"---\ntitle: {name}\n---\n{links}\n", encoding="utf-8")
    monkeypatch.setenv("LLM_WIKI_ROOT", str(tmp_path))

    data = get(_client(api_module), "/graph").json()

    assert len(data["nodes"]) == 30 and len(data["edges"]) == 30 * 29


# ─── log ────────────────────────────────────────────────────────────
def test_log_entries_are_parsed_in_file_order(client):
    data = get(client, "/log").json()

    assert data["count"] == 2
    first, second = data["entries"]
    assert (first["date"], first["type"], first["title"]) == ("2026-01-01", "ingest", "First thing")
    assert first["body"] == "- Created [[Alpha Page]].\n- Mentions [[Ghost Page]]."
    assert [link["path"] for link in first["links"]] == ["alpha/one.md"]  # unresolved links are dropped
    assert (second["date"], second["type"], second["title"], second["body"]) == (
        "2026-01-02", "lint", "Second thing", "- All good.")


def test_log_ignores_headings_inside_code_and_non_entry_headings(client):
    titles = [e["title"] for e in get(client, "/log").json()["entries"]]

    assert titles == ["First thing", "Second thing"]


def test_log_missing_gives_empty_list(api_module, tmp_path, monkeypatch):
    monkeypatch.setenv("LLM_WIKI_ROOT", str(tmp_path))

    assert get(_client(api_module), "/log").json() == {"count": 0, "entries": []}


# ─── sources and schema ─────────────────────────────────────────────
def test_sources_lists_raw_documents_with_metadata(client):
    data = get(client, "/sources").json()

    assert data["count"] == 1
    item = data["sources"][0]
    assert (item["name"], item["path"], item["title"]) == ("src-a.md", "raw/src-a.md", "Source A")
    assert item["source"] == "https://example.test/a" and item["retrieved"] == "2026-01-01"
    assert item["words"] == 8 and item["bytes"] > 0


def test_source_returns_body_and_citing_pages(client):
    data = get(client, "/source", name="src-a").json()

    assert data["title"] == "Source A"
    assert data["meta"]["immutable"] == "true"
    assert data["body"].startswith("Raw ground truth")
    assert [c["path"] for c in data["cited_by"]] == ["alpha/one.md"]


def test_schema_returns_schema_markdown(client):
    data = get(client, "/schema").json()

    assert data["path"] == "SCHEMA.md" and data["body"].startswith("# Fixture schema")


def test_schema_missing_is_404(api_module, tmp_path, monkeypatch):
    monkeypatch.setenv("LLM_WIKI_ROOT", str(tmp_path))

    assert get(_client(api_module), "/schema").status_code == 404


# ─── parsing units ──────────────────────────────────────────────────
def test_frontmatter_parser_handles_lists_quotes_and_missing_block(api_module):
    meta, body = api_module._split_frontmatter(
        '---\ntitle: "Quoted: title"\ntags: [a, "b c", d]\nsummary: has: colons\n---\nBody\n')

    assert meta == {"title": "Quoted: title", "tags": ["a", "b c", "d"], "summary": "has: colons"}
    assert body == "Body\n"
    assert api_module._split_frontmatter("No frontmatter\n") == ({}, "No frontmatter\n")


def test_frontmatter_parser_handles_crlf(api_module):
    meta, body = api_module._split_frontmatter("---\r\ntitle: T\r\n---\r\nBody\r\n")

    assert meta == {"title": "T"} and body == "Body\r\n"


def test_extract_links_skips_code_and_parses_alias_anchor_and_table_pipes(api_module):
    text = (
        "[[A]] [[B|alias]] [[C#Sec]] [[D#Sec|alias]] `[[Inline]]` ``[[Double `tick`]]``\n"
        "```python\n[[Fenced]]\n```\n~~~\n[[Tilde]]\n~~~\n| cell [[E\\|alias]] |\n[[ ]]\n"
    )

    assert api_module._extract_links(text) == (
        ("A", "", ""), ("B", "alias", ""), ("C", "", "Sec"), ("D", "alias", "Sec"), ("E", "alias", ""))


@pytest.mark.parametrize("value", ["a/b", "page", "page.md", "a%2Fb", "Obsidian Notes/x"])
def test_clean_relpath_accepts_ordinary_paths(api_module, value):
    assert api_module._clean_relpath(value)


@pytest.mark.parametrize("value", ["", "..", "a/..", "%2e%2e", "%252e%252e", "a\\b", "/a", "a//b", "a\x00",
                                   ".git/config", "a:b"])
def test_clean_relpath_rejects_dangerous_paths(api_module, value):
    with pytest.raises(Exception) as caught:
        api_module._clean_relpath(value)

    assert getattr(caught.value, "status_code", None) == 400


# ─── the real repository ────────────────────────────────────────────
REQUIRED_FRONTMATTER = ("title", "tags", "category", "date", "sources", "summary")
EXPECTED_PAGES = {
    "overview.md", "index.md", "log.md",
    "obsidian/architecture.md", "obsidian/workflows.md", "obsidian/hermes-integration.md",
    "openviking/architecture.md", "openviking/viking-protocol.md", "openviking/multi-agent-topology.md",
    "synthesis/compounding-knowledge.md", "synthesis/memory-layering.md", "synthesis/llm-wiki-operations.md",
}
EXPECTED_RAW = {
    "karpathy-llm-wiki-gist.md", "obsidian-architecture.md", "openviking-architecture.md",
    "hermes-agent-integration.md",
}


def test_repo_has_every_required_page_and_source(repo_client):
    pages = {p.relative_to(REPO / "wiki").as_posix() for p in (REPO / "wiki").rglob("*.md")}
    sources = get(repo_client, "/sources").json()["sources"]

    assert EXPECTED_PAGES <= pages
    assert EXPECTED_RAW <= {s["name"] for s in sources}
    assert (REPO / "SCHEMA.md").is_file()


def test_repo_status_matches_files_on_disk(repo_client):
    data = get(repo_client, "/status").json()
    on_disk = [p for p in (REPO / "wiki").rglob("*.md") if p.name not in ("index.md", "log.md")]

    assert data["articles"] == len(on_disk) >= 10
    assert data["pages"] == len(on_disk) + 2
    assert data["sources"] == len(list((REPO / "raw").glob("*.md")))
    assert data["words"] > 5000
    assert set(data["categories"]) == {"obsidian", "openviking", "synthesis", "operations", "overview"}


def test_every_repo_page_has_complete_frontmatter(api_module):
    for path in (REPO / "wiki").rglob("*.md"):
        meta, _ = api_module._split_frontmatter(path.read_text(encoding="utf-8"))
        missing = [k for k in REQUIRED_FRONTMATTER if k not in meta or meta[k] in ("", None)]
        allowed_empty = {"sources"} if path.name in ("index.md", "log.md") else set()
        assert set(missing) <= allowed_empty, f"{path}: missing {missing}"
        assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", meta["date"]), path


def test_repo_has_no_broken_wikilinks_orphans_or_index_drift(api_module, repo_client):
    corpus = api_module._load_corpus()
    broken = [(p.path, link["target"]) for p in corpus.pages for link in api_module._resolve_links(corpus, p)
              if link["kind"] == "missing"]

    assert broken == []
    assert get(repo_client, "/status").json()["orphans"] == []
    assert get(repo_client, "/index").json()["unlisted"] == []


def test_repo_index_has_the_required_categories(repo_client):
    names = [c["name"] for c in get(repo_client, "/index").json()["categories"]]

    assert names == ["Overview", "Obsidian", "OpenViking", "Synthesis", "Operations", "Sources"]
    assert all(c["pages"] for c in get(repo_client, "/index").json()["categories"])


def test_repo_log_parses_every_entry_heading(repo_client):
    headings = re.findall(r"^## \[(\d{4}-\d{2}-\d{2})\] ([a-z]+) \| (.+)$",
                          (REPO / "wiki" / "log.md").read_text(encoding="utf-8"), re.M)
    entries = get(repo_client, "/log").json()["entries"]

    assert len(headings) >= 5
    assert [(e["date"], e["type"], e["title"]) for e in entries] == headings


def test_repo_graph_is_connected_enough_and_valid(repo_client):
    data = get(repo_client, "/graph").json()
    ids = {n["id"] for n in data["nodes"]}
    edges = [(e["source"], e["target"]) for e in data["edges"]]

    assert len(ids) >= 14  # articles + raw sources
    assert len(edges) == len(set(edges)) and all(s != t and s in ids and t in ids for s, t in edges)
    assert all(n["degree"] > 0 for n in data["nodes"])
    assert {"obsidian", "openviking", "synthesis", "source"} <= set(data["groups"])


def test_repo_search_finds_known_facts(repo_client):
    ollama = get(repo_client, "/search", q="ollama all-minilm").json()["results"]
    viking = get(repo_client, "/search", q="viking:// abstract overview").json()["results"]

    assert "openviking/architecture.md" in {r["path"] for r in ollama}
    assert "openviking/viking-protocol.md" in {r["path"] for r in viking}


def test_repo_page_exposes_backlinks_and_forward_links(repo_client):
    data = get(repo_client, "/page", path="synthesis/memory-layering.md").json()

    assert data["title"] == "Memory Layering"
    assert {"OpenViking Architecture", "Obsidian Architecture"} <= {lk["title"] for lk in data["links"]}
    assert "Overview" in {b["title"] for b in data["backlinks"]}


def test_repo_contains_no_credentials():
    pattern = re.compile(r"(?i)(api[_-]?key|token|password|secret)\s*[:=]\s*[\"']?[A-Za-z0-9_\-]{16,}")
    files = list((REPO / "wiki").rglob("*.md")) + list((REPO / "raw").glob("*.md")) + [REPO / "SCHEMA.md"]

    offenders = [str(f) for f in files if pattern.search(f.read_text(encoding="utf-8"))]
    assert offenders == []


def test_raw_sources_have_required_frontmatter(api_module):
    for path in (REPO / "raw").glob("*.md"):
        meta, _ = api_module._split_frontmatter(path.read_text(encoding="utf-8"))
        assert {"title", "source", "author", "retrieved", "immutable"} <= set(meta), path
        assert meta["immutable"] == "true"
