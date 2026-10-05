"""Packaging checks: plugin metadata matches TASK.md and stays consistent across files."""

import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

REQUIRED_FILES = [
    "SCHEMA.md", "README.md", "LICENSE", "SECURITY.md", "after-install.md", "package.json",
    "plugin.yaml", "dashboard/manifest.json", "dashboard/api.py", "dashboard/plugin.js",
    "tests/test_api.py",
]


def _yaml_scalar(text: str, key: str) -> str:
    match = re.search(rf"^\s*{re.escape(key)}:\s*(.+?)\s*$", text, re.M)
    assert match, f"{key} missing"
    return match.group(1).strip("\"'")


def test_every_deliverable_exists_and_is_not_empty():
    for rel in REQUIRED_FILES:
        assert (REPO / rel).is_file() and (REPO / rel).stat().st_size > 0, rel


def test_manifest_declares_the_tab_entry_and_api():
    manifest = json.loads((REPO / "dashboard" / "manifest.json").read_text(encoding="utf-8"))

    assert manifest["name"] == "llm-wiki"
    assert manifest["tab"] == {"path": "/llm-wiki", "position": "after:openviking"}
    assert manifest["entry"] == f"plugin.js?v={manifest['version']}"
    assert manifest["api"] == "api.py" and manifest["has_api"] is True
    assert manifest["icon"] == "BookOpen" and manifest["label"] == "LLM Wiki"
    assert manifest["css"] is None
    assert (REPO / "dashboard" / manifest["api"]).is_file()


def test_plugin_yaml_registers_the_dashboard_tab():
    text = (REPO / "plugin.yaml").read_text(encoding="utf-8")
    dashboard = text.split("dashboard:", 1)[1]

    assert _yaml_scalar(text, "name") == "llm-wiki"
    assert _yaml_scalar(dashboard, "path") == "/llm-wiki"
    assert _yaml_scalar(dashboard, "label") == "LLM Wiki"
    assert _yaml_scalar(dashboard, "icon") == "BookOpen"
    assert _yaml_scalar(dashboard, "position") == "after:openviking"
    assert _yaml_scalar(text, "license") == "MIT"


def test_versions_agree_across_plugin_manifest_and_package():
    manifest = json.loads((REPO / "dashboard" / "manifest.json").read_text(encoding="utf-8"))
    package = json.loads((REPO / "package.json").read_text(encoding="utf-8"))
    yaml_version = _yaml_scalar((REPO / "plugin.yaml").read_text(encoding="utf-8"), "version")

    assert manifest["version"] == package["version"] == yaml_version


def test_plugin_registers_under_the_manifest_name_using_the_hermes_sdk():
    manifest = json.loads((REPO / "dashboard" / "manifest.json").read_text(encoding="utf-8"))
    source = (REPO / "dashboard" / "plugin.js").read_text(encoding="utf-8")

    assert f'registry.register("{manifest["name"]}"' in source
    assert "__HERMES_PLUGIN_SDK__" in source and "fetchJSON" in source


def test_plugin_source_has_no_external_assets_or_unsafe_dom_apis():
    source = re.sub(r"/\*.*?\*/", "", (REPO / "dashboard" / "plugin.js").read_text(encoding="utf-8"), flags=re.S)

    for forbidden in ("innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "unpkg", "cdnjs",
                      "googleapis", "jsdelivr", "@import"):
        assert forbidden not in source, forbidden
    assert not re.search(r"https?://[A-Za-z0-9]", source)


def test_api_has_no_write_or_process_primitives():
    source = (REPO / "dashboard" / "api.py").read_text(encoding="utf-8")

    for forbidden in (".write_text", ".write_bytes", ".unlink", ".rename", ".mkdir", "shutil", "subprocess",
                      "os.system", "import requests", "import httpx", "urllib.request", "@router.post",
                      "@router.put", "@router.delete", "@router.patch"):
        assert forbidden not in source, forbidden
    assert not re.search(r"(?<![\w.])open\(", source)
    assert re.search(r"^router = APIRouter\(tags=\[\"llm-wiki\"\]\)", source, re.M)


def test_package_json_scripts_run_both_suites():
    package = json.loads((REPO / "package.json").read_text(encoding="utf-8"))

    assert "pytest" in package["scripts"]["test:py"]
    assert "node --test" in package["scripts"]["test:js"]
    assert package["license"] == "MIT" and package.get("private") is True
    assert "repository" in package


def test_license_is_mit():
    text = (REPO / "LICENSE").read_text(encoding="utf-8")

    assert text.startswith("MIT License") and "Permission is hereby granted" in text
