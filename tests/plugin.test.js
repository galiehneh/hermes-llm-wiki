"use strict";

// Unit tests for the pure logic in dashboard/plugin.js: markdown parser, wikilink tokenizer, renderer and
// force layout. Run with `node --test tests/` (see package.json). No DOM or React is needed.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const REPO = path.resolve(__dirname, "..");
const PLUGIN_PATH = path.join(REPO, "dashboard", "plugin.js");
const plugin = require(PLUGIN_PATH);

const stubH = (type, props, ...children) => ({ type, props: props || {}, children });

function walk(node, visit) {
  if (Array.isArray(node)) { node.forEach((n) => walk(n, visit)); return; }
  if (node && typeof node === "object") {
    visit(node);
    walk(node.children, visit);
  }
}

function render(markdown, links, open) {
  const { renderBlocks } = plugin.makeRenderer(stubH);
  return renderBlocks(plugin.parseBlocks(markdown), { links: plugin.linkMap(links), open }, "t");
}

function textOf(node) {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOf).join("");
  return node && node.children ? textOf(node.children) : "";
}

// ─── block parser ───────────────────────────────────────────────────
test("parses headings, paragraphs and horizontal rules", () => {
  const blocks = plugin.parseBlocks("# Title\n\nFirst line\nsecond line\n\n---\n\n### Sub heading ###\n");

  assert.deepEqual(blocks.map((b) => b.t), ["h", "p", "hr", "h"]);
  assert.equal(blocks[0].level, 1);
  assert.equal(blocks[1].text, "First line second line");
  assert.deepEqual([blocks[3].level, blocks[3].text], [3, "Sub heading"]);
});

test("fenced code keeps its content verbatim, including wikilinks and markdown", () => {
  const blocks = plugin.parseBlocks("```python\nx = [[1]]  # **not bold**\n\n# not a heading\n```\n\n~~~\ntilde\n~~~\n");

  assert.equal(blocks.length, 2);
  assert.deepEqual([blocks[0].t, blocks[0].lang], ["code", "python"]);
  assert.equal(blocks[0].text, "x = [[1]]  # **not bold**\n\n# not a heading");
  assert.equal(blocks[1].text, "tilde");
});

test("unterminated fence does not hang and consumes the rest", () => {
  const blocks = plugin.parseBlocks("```\nnever closed\nstill code");

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].text, "never closed\nstill code");
});

test("parses GitHub tables with alignment and escaped pipes", () => {
  const blocks = plugin.parseBlocks("| A | B | C |\n|:--|:-:|--:|\n| 1 | `x \\| y` | 3 |\n| 4 | 5 | 6 |\n\nafter");
  const table = blocks[0];

  assert.equal(table.t, "table");
  assert.deepEqual(table.header, ["A", "B", "C"]);
  assert.deepEqual(table.align, ["left", "center", "right"]);
  assert.deepEqual(table.rows[0], ["1", "`x | y`", "3"]);
  assert.equal(table.rows.length, 2);
  assert.equal(blocks[1].t, "p");
});

test("table without outer pipes and a pipe in a normal paragraph", () => {
  const table = plugin.parseBlocks("a | b\n--- | ---\n1 | 2\n")[0];
  const para = plugin.parseBlocks("this | is not a table\n")[0];

  assert.deepEqual(table.rows, [["1", "2"]]);
  assert.equal(para.t, "p");
});

test("parses unordered, ordered and nested lists", () => {
  const blocks = plugin.parseBlocks("- one\n- two\n  - nested a\n  - nested b\n- three\n\n3. start three\n4. next\n");
  const [ul, ol] = blocks;

  assert.equal(ul.ordered, false);
  assert.deepEqual(ul.items.map((i) => i.inline), ["one", "two", "three"]);
  assert.equal(ul.items[1].children[0].t, "list");
  assert.deepEqual(ul.items[1].children[0].items.map((i) => i.inline), ["nested a", "nested b"]);
  assert.deepEqual([ol.ordered, ol.start, ol.items.length], [true, 3, 2]);
});

test("list items may contain continuation lines and blank-separated siblings", () => {
  const ul = plugin.parseBlocks("- first line\n  continues here\n\n- second\n")[0];

  assert.equal(ul.items.length, 2);
  assert.equal(ul.items[0].children[0].text, "continues here");
});

test("parses blockquotes recursively", () => {
  const quote = plugin.parseBlocks("> **Keep:** things\n>\n> - item\n")[0];

  assert.equal(quote.t, "quote");
  assert.deepEqual(quote.children.map((c) => c.t), ["p", "list"]);
});

test("empty and non-string input yields no blocks", () => {
  assert.deepEqual(plugin.parseBlocks(""), []);
  assert.deepEqual(plugin.parseBlocks(null), []);
  assert.deepEqual(plugin.parseBlocks("\r\n\r\n"), []);
});

test("CRLF line endings parse like LF", () => {
  assert.deepEqual(plugin.parseBlocks("# T\r\n\r\n- a\r\n- b\r\n"), plugin.parseBlocks("# T\n\n- a\n- b\n"));
});

// ─── inline tokenizer ───────────────────────────────────────────────
test("tokenizes wikilinks with alias and anchor", () => {
  const tokens = plugin.tokenizeInline("see [[Page One]], [[Two|the second]] and [[Three#Sec|alias]].");
  const wikis = tokens.filter((t) => t.t === "wiki");

  assert.deepEqual(wikis.map((t) => [t.target, t.alias, t.anchor]),
    [["Page One", "", ""], ["Two", "the second", ""], ["Three", "alias", "Sec"]]);
});

test("code spans protect wikilinks and emphasis markers", () => {
  const tokens = plugin.tokenizeInline("use `[[Not A Link]]` and ``a `tick` b`` then **bold** and *it*");

  assert.equal(tokens.filter((t) => t.t === "wiki").length, 0);
  assert.deepEqual(tokens.filter((t) => t.t === "code").map((t) => t.v), ["[[Not A Link]]", "a `tick` b"]);
  assert.deepEqual([tokens.some((t) => t.t === "strong"), tokens.some((t) => t.t === "em")], [true, true]);
});

test("links, images and escapes", () => {
  const tokens = plugin.tokenizeInline("[site](https://example.com) ![pic](https://x/y.png) \\*literal\\*");

  assert.deepEqual(tokens.filter((t) => t.t === "link").map((t) => [t.image, t.url]),
    [[false, "https://example.com"], [true, "https://x/y.png"]]);
  assert.ok(tokens.some((t) => t.t === "text" && t.v === "*"));
  assert.ok(!tokens.some((t) => t.t === "em"));
});

test("multiplication and snake_case are not emphasis", () => {
  const tokens = plugin.tokenizeInline("5 * 3 * 2 and snake_case_name and a*b");

  assert.ok(tokens.every((t) => t.t === "text"));
});

test("link key normalisation ignores case and the .md suffix", () => {
  assert.equal(plugin.linkKey("  Raw/Foo.MD "), "raw/foo.md".replace(/\.md$/, ""));
  assert.equal(plugin.linkKey("Memory Layering"), "memory layering");
});

// ─── renderer safety ────────────────────────────────────────────────
test("wikilinks render as clickable anchors that open the resolved page", () => {
  const opened = [];
  const links = [{ target: "Memory Layering", kind: "page", path: "synthesis/memory-layering.md", title: "Memory Layering" }];
  const tree = render("See [[Memory Layering]] and [[Ghost]].", links, (l) => opened.push(l.path));
  const anchors = [];
  const missing = [];
  walk(tree, (n) => {
    if (n.type === "a") anchors.push(n);
    if (n.props && /missing/.test(n.props.className || "")) missing.push(n);
  });

  assert.equal(anchors.length, 1);
  let prevented = false;
  anchors[0].props.onClick({ preventDefault() { prevented = true; } });
  assert.deepEqual([opened, prevented], [["synthesis/memory-layering.md"], true]);
  assert.equal(missing.length, 1);
  assert.equal(textOf(missing[0]), "Ghost");
  assert.equal(missing[0].props.onClick, undefined);
});

test("source links open as sources and aliases are displayed", () => {
  const opened = [];
  const links = [{ target: "raw/x", kind: "source", path: "raw/x.md", title: "X" }];
  const tree = render("[[raw/x|the source]]", links, (l) => opened.push(l));
  let anchor;
  walk(tree, (n) => { if (n.type === "a") anchor = n; });

  assert.equal(textOf(anchor), "the source");
  anchor.props.onClick({ preventDefault() {} });
  assert.equal(opened[0].kind, "source");
});

test("never emits innerHTML and only allows http, https and mailto hrefs", () => {
  const md = "[ok](https://example.com) [mail](mailto:a@b.c) [bad](javascript:alert(1)) [data](data:text/html,x)\n\n" +
    "<script>alert(1)</script> <img src=x onerror=alert(1)> ![remote](https://evil.example/p.png)";
  const tree = render(md, [], () => {});
  const hrefs = [];
  const tags = new Set();
  walk(tree, (n) => {
    tags.add(n.type);
    assert.ok(!("dangerouslySetInnerHTML" in n.props));
    if (n.props.href !== undefined) hrefs.push(n.props.href);
  });

  assert.deepEqual(hrefs, ["https://example.com", "mailto:a@b.c"]);
  assert.ok(!tags.has("script") && !tags.has("img") && !tags.has("iframe"));
  assert.match(textOf(tree), /<script>alert\(1\)<\/script>/);  // shown as text, never executed
  assert.match(textOf(tree), /\[image: remote\]/);
});

test("external anchors carry rel noopener noreferrer", () => {
  const tree = render("[x](https://example.com)", [], () => {});
  let anchor;
  walk(tree, (n) => { if (n.type === "a") anchor = n; });

  assert.equal(anchor.props.rel, "noopener noreferrer");
  assert.equal(anchor.props.target, "_blank");
});

test("renders every block type to the expected elements", () => {
  const md = "# H\n\npara **b** *i* `c`\n\n> q\n\n- a\n- [x] done\n\n1. one\n\n| h |\n|---|\n| c |\n\n```js\ncode\n```\n\n---\n";
  const tags = [];
  walk(render(md, [], () => {}), (n) => tags.push(n.type));

  for (const tag of ["h2", "p", "strong", "em", "code", "blockquote", "ul", "li", "ol", "table", "thead", "tbody", "th", "td", "pre", "hr"]) {
    assert.ok(tags.includes(tag), "missing " + tag);
  }
});

// ─── helpers ────────────────────────────────────────────────────────
test("highlightParts marks all matches case-insensitively and reassembles the text", () => {
  const parts = plugin.highlightParts("Ollama runs ollama models", ["ollama"]);

  assert.equal(parts.map((p) => p.text).join(""), "Ollama runs ollama models");
  assert.deepEqual(parts.filter((p) => p.hit).map((p) => p.text), ["Ollama", "ollama"]);
  assert.deepEqual(plugin.highlightParts("plain", []), [{ text: "plain", hit: false }]);
});

test("formatters", () => {
  assert.equal(plugin.fmtDate("2026-10-05T09:43:08+00:00"), "2026-10-05");
  assert.equal(plugin.fmtDate(null), "");
  assert.equal(plugin.fmtBytes(512), "512 B");
  assert.equal(plugin.fmtBytes(2048), "2.0 KB");
});

test("group colours are stable and distinct for the known categories", () => {
  const groups = ["obsidian", "openviking", "synthesis", "operations", "overview", "source"];
  const colours = groups.map(plugin.groupColor);

  assert.equal(new Set(colours).size, groups.length);
  assert.equal(plugin.groupColor("custom"), plugin.groupColor("custom"));
  assert.match(plugin.groupColor("anything"), /^#[0-9a-f]{6}$/);
});

// ─── force layout ───────────────────────────────────────────────────
function clusters() {
  const nodes = [];
  const edges = [];
  for (const g of ["a", "b"]) {
    for (let i = 0; i < 5; i++) nodes.push({ id: g + i, title: g + i, group: g, words: 10, degree: 4 });
    for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) edges.push({ source: g + i, target: g + j });
  }
  edges.push({ source: "a0", target: "b0" });
  return { nodes, edges };
}

const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);

test("layout stays finite, in bounds and non-overlapping", () => {
  const { nodes, edges } = clusters();
  const sim = plugin.runSim(nodes, edges, 900, 560, 260);

  for (const n of sim.nodes) {
    assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y));
    assert.ok(n.x >= 0 && n.x <= 900 && n.y >= 0 && n.y <= 560);
  }
  for (let i = 0; i < sim.nodes.length; i++) {
    for (let j = i + 1; j < sim.nodes.length; j++) assert.ok(dist(sim.nodes[i], sim.nodes[j]) > 8);
  }
});

test("layout pulls clusters together and keeps them apart", () => {
  const { nodes, edges } = clusters();
  const sim = plugin.runSim(nodes, edges, 900, 560, 260);
  const mean = (pairs) => pairs.reduce((s, [p, q]) => s + dist(p, q), 0) / pairs.length;
  const inside = [];
  const across = [];
  for (let i = 0; i < sim.nodes.length; i++) {
    for (let j = i + 1; j < sim.nodes.length; j++) {
      (sim.nodes[i].group === sim.nodes[j].group ? inside : across).push([sim.nodes[i], sim.nodes[j]]);
    }
  }

  assert.ok(mean(inside) < mean(across));
});

test("layout is deterministic and survives degenerate inputs", () => {
  const { nodes, edges } = clusters();
  const a = plugin.runSim(nodes, edges, 900, 560, 100).nodes.map((n) => [n.x, n.y]);
  const b = plugin.runSim(nodes, edges, 900, 560, 100).nodes.map((n) => [n.x, n.y]);

  assert.deepEqual(a, b);
  assert.equal(plugin.runSim([], [], 900, 560, 10).nodes.length, 0);
  const one = plugin.runSim([{ id: "x", title: "x", group: "g", words: 1, degree: 0 }], [{ source: "x", target: "ghost" }], 900, 560, 10);
  assert.equal(one.links.length, 0);
  const same = plugin.runSim([1, 2, 3].map((i) => ({ id: "n" + i, title: "n", group: "g", words: 1, degree: 0 })), [], 900, 560, 50);
  assert.ok(same.nodes.every((n) => Number.isFinite(n.x)));
});

test("a fixed node does not move", () => {
  const { nodes, edges } = clusters();
  const sim = plugin.initSim(nodes, edges, 900, 560);
  sim.nodes[0].fixed = true;
  const before = [sim.nodes[0].x, sim.nodes[0].y];
  for (let k = 0; k < 50; k++) plugin.stepSim(sim, 1);

  assert.deepEqual([sim.nodes[0].x, sim.nodes[0].y], before);
});

// ─── whole plugin ───────────────────────────────────────────────────
test("registers a root component named llm-wiki through the Hermes SDK", () => {
  const registered = {};
  const noop = () => undefined;
  const sandbox = {
    window: {
      __HERMES_PLUGINS__: { register: (name, comp) => { registered[name] = comp; } },
      __HERMES_PLUGIN_SDK__: {
        React: { createElement: stubH, useState: noop, useEffect: noop, useMemo: noop, useRef: noop, useCallback: noop },
        fetchJSON: noop,
      },
    },
  };
  vm.runInNewContext(fs.readFileSync(PLUGIN_PATH, "utf8"), sandbox, { filename: "plugin.js" });

  assert.deepEqual(Object.keys(registered), ["llm-wiki"]);
  assert.equal(typeof registered["llm-wiki"], "function");
});

test("does nothing, and does not throw, when the Hermes SDK is absent", () => {
  assert.doesNotThrow(() => vm.runInNewContext(fs.readFileSync(PLUGIN_PATH, "utf8"), { window: {} }));
});

test("plugin source has no external assets and no innerHTML", () => {
  const code = fs.readFileSync(PLUGIN_PATH, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/.test(code));
  assert.ok(!/@import|<link|<script|[{,]\s*src\s*:|\bsrc\s*=\s*["']|url\(\s*["']?https?:/.test(code));
  const src = code;
  const urls = (src.match(/https?:\/\/[^\s"'`)]*/g) || []).filter((u) => !/^https?:\/\/$/.test(u));
  assert.deepEqual(urls, []);
});

// ─── the real wiki, seen through the JS parser ──────────────────────
function listMarkdown(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listMarkdown(path.join(dir, e.name)) : e.name.endsWith(".md") ? [path.join(dir, e.name)] : []);
}

function frontmatterTitle(text) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  const t = m && /^title:\s*(.+)$/m.exec(m[1]);
  return t ? t[1].trim() : null;
}

function stripFrontmatter(text) {
  return text.replace(/^---\n[\s\S]*?\n---\n/, "");
}

function collectWikiTargets(blocks, out) {
  const inline = (text) => plugin.tokenizeInline(text).forEach((t) => t.t === "wiki" && out.push(t.target));
  for (const b of blocks) {
    if (b.t === "h" || b.t === "p") inline(b.text);
    else if (b.t === "quote") collectWikiTargets(b.children, out);
    else if (b.t === "list") {
      for (const it of b.items) { inline(it.inline); collectWikiTargets(it.children, out); }
    } else if (b.t === "table") [b.header].concat(b.rows).forEach((row) => row.forEach(inline));
  }
}

test("every wikilink the JS parser finds in the real wiki resolves to a page or raw source", () => {
  const files = listMarkdown(path.join(REPO, "wiki"));
  const known = new Set();
  for (const f of files) {
    const rel = path.relative(path.join(REPO, "wiki"), f).replace(/\\/g, "/").replace(/\.md$/, "");
    known.add(plugin.linkKey(frontmatterTitle(fs.readFileSync(f, "utf8"))));
    known.add(plugin.linkKey(rel));
    known.add(plugin.linkKey(rel.split("/").pop()));
  }
  for (const f of fs.readdirSync(path.join(REPO, "raw"))) known.add(plugin.linkKey("raw/" + f));

  let total = 0;
  for (const f of files) {
    const targets = [];
    collectWikiTargets(plugin.parseBlocks(stripFrontmatter(fs.readFileSync(f, "utf8"))), targets);
    total += targets.length;
    for (const t of targets) assert.ok(known.has(plugin.linkKey(t)), `${path.basename(f)}: unresolved [[${t}]]`);
  }
  assert.ok(total > 100);
});

test("every real wiki and raw page renders without throwing and without raw markdown leaking", () => {
  const files = listMarkdown(path.join(REPO, "wiki")).concat(listMarkdown(path.join(REPO, "raw")), [path.join(REPO, "SCHEMA.md")]);

  for (const f of files) {
    const body = stripFrontmatter(fs.readFileSync(f, "utf8"));
    const tree = render(body, [], () => {});
    const text = textOf(tree);
    assert.ok(text.length > 100, f);
    assert.ok(!/\*\*\w/.test(text.replace(/`[^`]*`/g, "")), `${path.basename(f)} leaks bold markers`);
    walk(tree, (n) => assert.ok(!("dangerouslySetInnerHTML" in n.props)));
  }
});
