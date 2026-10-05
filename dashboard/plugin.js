/**
 * LLM Wiki — Hermes dashboard plugin (read-only).
 * Index, markdown reader with clickable [[wikilinks]] and backlinks, force-directed graph, activity log,
 * raw-source inspector, schema viewer and live full-text search.
 * All data comes from /api/plugins/llm-wiki/*. No external assets, no innerHTML: every string reaches the DOM
 * as a React text child, and the markdown renderer builds elements instead of HTML.
 */
(function () {
  "use strict";

  const root = typeof window !== "undefined" ? window : {};

  // ─── pure helpers (no DOM, exported for Node tests) ───────────────
  const SAFE_URL = /^(https?:\/\/|mailto:)/i;
  const FENCE_OPEN = /^\s*(```|~~~)\s*([^`\s]*).*$/;
  const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
  const HRULE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
  const QUOTE = /^\s{0,3}>/;
  const LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
  const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
  const INLINE_SRC = [
    "(`+)(?!`)([^\\n]*?[^`\\n])\\1(?!`)",                           // 1,2 code span
    "\\[\\[([^\\[\\]\\n]+?)\\]\\]",                                  // 3 wikilink
    "(!?)\\[([^\\]\\n]*)\\]\\(([^)\\s]+)(?:\\s+\"[^\"]*\")?\\)",    // 4 bang, 5 text, 6 url
    "\\*\\*([^\\n]+?)\\*\\*",                                        // 7 strong
    "\\*([^\\s*](?:[^*\\n]*[^\\s*])?)\\*",                           // 8 emphasis
    "\\\\([\\\\`*\\[\\]|#_])",                                        // 9 backslash escape
  ].join("|");

  function indentOf(line) {
    return line.match(/^\s*/)[0].replace(/\t/g, "    ").length;
  }

  function dedent(lines) {
    const filled = lines.filter((l) => l.trim());
    const min = filled.length ? Math.min.apply(null, filled.map(indentOf)) : 0;
    return lines.map((l) => (l.trim() ? l.slice(Math.min(min, l.match(/^\s*/)[0].length)) : ""));
  }

  function splitCells(line) {
    let text = line.trim();
    if (text.startsWith("|")) text = text.slice(1);
    const cells = [];
    let cur = "";
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "\\" && text[i + 1] === "|") { cur += "|"; i++; }
      else if (text[i] === "|") { cells.push(cur.trim()); cur = ""; }
      else cur += text[i];
    }
    if (cur.trim() || cells.length === 0 || !/\|\s*$/.test(line)) cells.push(cur.trim());
    return cells;
  }

  function isBlockStart(lines, i) {
    const line = lines[i];
    return FENCE_OPEN.test(line) || HEADING.test(line) || HRULE.test(line) || QUOTE.test(line) ||
      LIST_ITEM.test(line) || (line.includes("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) &&
        lines[i + 1].includes("-"));
  }

  function parseList(lines, start) {
    const first = LIST_ITEM.exec(lines[start]);
    const base = indentOf(first[1]);
    const ordered = /^\d/.test(first[2]);
    const items = [];
    let i = start;
    while (i < lines.length) {
      const m = LIST_ITEM.exec(lines[i]);
      if (!m || indentOf(m[1]) !== base || /^\d/.test(m[2]) !== ordered) break;
      const own = [m[3]];
      const child = [];
      i++;
      while (i < lines.length) {
        const ln = lines[i];
        if (!ln.trim()) {
          let j = i + 1;
          while (j < lines.length && !lines[j].trim()) j++;
          if (j < lines.length && indentOf(lines[j]) > base) { child.push(""); i++; continue; }
          break;
        }
        if (indentOf(ln) > base) { child.push(ln); i++; continue; }
        if (!child.length && !LIST_ITEM.test(ln) && !isBlockStart(lines, i)) { own.push(ln.trim()); i++; continue; }
        break;
      }
      items.push({ inline: own.join(" "), children: parseLines(dedent(child)) });
      let j = i;
      while (j < lines.length && !lines[j].trim()) j++;
      const next = j > i && j < lines.length ? LIST_ITEM.exec(lines[j]) : null;
      if (next && indentOf(next[1]) === base && /^\d/.test(next[2]) === ordered) i = j;
    }
    return { block: { t: "list", ordered, start: ordered ? parseInt(first[2], 10) : 1, items }, next: i };
  }

  function parseTable(lines, start) {
    const header = splitCells(lines[start]);
    const align = splitCells(lines[start + 1]).map((c) =>
      c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : c.startsWith(":") ? "left" : null);
    const rows = [];
    let i = start + 2;
    while (i < lines.length && lines[i].trim() && lines[i].includes("|")) rows.push(splitCells(lines[i++]));
    return { block: { t: "table", header, align, rows }, next: i };
  }

  function parseLines(lines) {
    const blocks = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      const fence = FENCE_OPEN.exec(line);
      if (fence) {
        const close = fence[1] === "`" + "``" ? /^\s*`{3,}\s*$/ : /^\s*~{3,}\s*$/;
        const body = [];
        i++;
        while (i < lines.length && !close.test(lines[i])) body.push(lines[i++]);
        i++;
        blocks.push({ t: "code", lang: fence[2], text: body.join("\n") });
        continue;
      }
      const heading = HEADING.exec(line);
      if (heading) { blocks.push({ t: "h", level: heading[1].length, text: heading[2] }); i++; continue; }
      if (HRULE.test(line)) { blocks.push({ t: "hr" }); i++; continue; }
      if (QUOTE.test(line)) {
        const inner = [];
        while (i < lines.length && QUOTE.test(lines[i])) inner.push(lines[i++].replace(/^\s{0,3}>\s?/, ""));
        blocks.push({ t: "quote", children: parseLines(inner) });
        continue;
      }
      if (line.includes("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].includes("-")) {
        const r = parseTable(lines, i);
        blocks.push(r.block);
        i = r.next;
        continue;
      }
      if (LIST_ITEM.test(line)) {
        const r = parseList(lines, i);
        blocks.push(r.block);
        i = r.next;
        continue;
      }
      const para = [line.trim()];
      i++;
      while (i < lines.length && lines[i].trim() && !isBlockStart(lines, i)) para.push(lines[i++].trim());
      blocks.push({ t: "p", text: para.join(" ") });
    }
    return blocks;
  }

  function parseBlocks(src) {
    return parseLines(String(src == null ? "" : src).replace(/\r\n?/g, "\n").split("\n"));
  }

  function parseWikiTarget(inner) {
    const bar = inner.indexOf("|");
    const left = bar >= 0 ? inner.slice(0, bar) : inner;
    const alias = bar >= 0 ? inner.slice(bar + 1).trim() : "";
    const hash = left.indexOf("#");
    return {
      target: (hash >= 0 ? left.slice(0, hash) : left).trim(),
      anchor: hash >= 0 ? left.slice(hash + 1).trim() : "",
      alias,
    };
  }

  function tokenizeInline(text) {
    const re = new RegExp(INLINE_SRC, "g");
    const out = [];
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push({ t: "text", v: text.slice(last, m.index) });
      if (m[2] !== undefined) out.push({ t: "code", v: m[2] });
      else if (m[3] !== undefined) out.push(Object.assign({ t: "wiki" }, parseWikiTarget(m[3])));
      else if (m[5] !== undefined) out.push({ t: "link", image: m[4] === "!", text: m[5], url: m[6] });
      else if (m[7] !== undefined) out.push({ t: "strong", v: m[7] });
      else if (m[8] !== undefined) out.push({ t: "em", v: m[8] });
      else out.push({ t: "text", v: m[9] });
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ t: "text", v: text.slice(last) });
    return out;
  }

  function linkKey(target) {
    return String(target).trim().toLowerCase().replace(/\.md$/, "");
  }

  function linkMap(links) {
    const map = {};
    (links || []).forEach((l) => { map[linkKey(l.target)] = l; });
    return map;
  }

  function highlightParts(text, terms) {
    const needles = (terms || []).filter(Boolean).map((t) => t.toLowerCase());
    if (!needles.length) return [{ text, hit: false }];
    const lower = text.toLowerCase();
    const marks = new Array(text.length).fill(false);
    needles.forEach((n) => {
      for (let at = lower.indexOf(n); at >= 0; at = lower.indexOf(n, at + n.length)) {
        for (let k = at; k < at + n.length; k++) marks[k] = true;
      }
    });
    const parts = [];
    for (let i = 0; i < text.length;) {
      let j = i;
      while (j < text.length && marks[j] === marks[i]) j++;
      parts.push({ text: text.slice(i, j), hit: marks[i] });
      i = j;
    }
    return parts;
  }

  const GROUP_COLORS = {
    obsidian: "#a78bfa", openviking: "#38bdf8", synthesis: "#fbbf24", operations: "#34d399",
    overview: "#f472b6", source: "#94a3b8",
  };
  const FALLBACK_COLORS = ["#fb923c", "#2dd4bf", "#c084fc", "#f87171", "#a3e635"];

  function groupColor(group) {
    const key = String(group || "").toLowerCase();
    if (GROUP_COLORS[key]) return GROUP_COLORS[key];
    let sum = 0;
    for (let i = 0; i < key.length; i++) sum = (sum * 31 + key.charCodeAt(i)) >>> 0;
    return FALLBACK_COLORS[sum % FALLBACK_COLORS.length];
  }

  function hashString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  // Force-directed layout: pairwise repulsion, edge springs, centre gravity and per-group cohesion.
  function initSim(nodes, edges, w, h) {
    const groups = Array.from(new Set(nodes.map((n) => n.group))).sort();
    const radius = Math.min(w, h) * 0.32;
    const list = nodes.map((n) => {
      const hh = hashString(n.id);
      const angle = (groups.indexOf(n.group) / Math.max(groups.length, 1)) * Math.PI * 2 + ((hh % 100) / 100) * 0.9;
      const dist = radius * (0.6 + ((hh >>> 8) % 40) / 100);
      return {
        id: n.id, title: n.title, group: n.group, words: n.words, degree: n.degree,
        x: w / 2 + Math.cos(angle) * dist, y: h / 2 + Math.sin(angle) * dist, vx: 0, vy: 0,
        r: 6 + Math.min(10, Math.sqrt(n.degree || 0) * 2.2), fixed: false,
      };
    });
    const byId = new Map(list.map((n) => [n.id, n]));
    const links = edges.filter((e) => byId.has(e.source) && byId.has(e.target))
      .map((e) => ({ a: byId.get(e.source), b: byId.get(e.target) }));
    return { w, h, nodes: list, byId, links };
  }

  function stepSim(sim, alpha) {
    const { nodes, links, w, h } = sim;
    const centroids = {};
    nodes.forEach((n) => {
      const c = centroids[n.group] || (centroids[n.group] = { x: 0, y: 0, k: 0 });
      c.x += n.x; c.y += n.y; c.k += 1;
    });
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) { dx = (i % 2 ? 1 : -1) * 0.5; dy = (j % 2 ? 1 : -1) * 0.5; d2 = 1; }
        const d = Math.sqrt(d2);
        const f = (3200 / d2) * alpha;
        a.vx += (dx / d) * f; a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
      }
    }
    links.forEach(({ a, b }) => {
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - 95) * 0.03 * alpha;
      a.vx += (dx / d) * f; a.vy += (dy / d) * f;
      b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
    });
    nodes.forEach((n) => {
      const c = centroids[n.group];
      n.vx += ((w / 2 - n.x) * 0.012 + (c.x / c.k - n.x) * 0.02) * alpha;
      n.vy += ((h / 2 - n.y) * 0.012 + (c.y / c.k - n.y) * 0.02) * alpha;
      if (n.fixed) { n.vx = 0; n.vy = 0; return; }
      n.vx *= 0.82; n.vy *= 0.82;
      n.x = Math.min(Math.max(n.x + n.vx, n.r + 6), w - n.r - 6);
      n.y = Math.min(Math.max(n.y + n.vy, n.r + 6), h - n.r - 18);
    });
  }

  function runSim(nodes, edges, w, h, iterations) {
    const sim = initSim(nodes, edges, w, h);
    for (let k = 0; k < iterations; k++) stepSim(sim, Math.max(0.02, 1 - k / iterations));
    return sim;
  }

  function fmtDate(iso) {
    return typeof iso === "string" && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : "";
  }

  function fmtBytes(n) {
    if (!(n >= 0)) return "";
    return n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(1) + " KB" : (n / 1048576).toFixed(1) + " MB";
  }

  function fmtNumber(n) {
    return typeof n === "number" ? n.toLocaleString("en-US") : "—";
  }

  // Markdown renderer factory: `h` is React.createElement (or a stub in tests).
  function makeRenderer(h) {
    const TASK = /^\[( |x|X)\]\s+/;

    function renderInline(text, ctx, keyBase) {
      return tokenizeInline(text).map((tk, n) => {
        const key = keyBase + "." + n;
        if (tk.t === "text") return tk.v;
        if (tk.t === "code") return h("code", { key, className: "lw-code" }, tk.v);
        if (tk.t === "strong") return h("strong", { key }, renderInline(tk.v, ctx, key));
        if (tk.t === "em") return h("em", { key }, renderInline(tk.v, ctx, key));
        if (tk.t === "link") {
          if (tk.image) return h("span", { key, className: "lw-muted" }, "[image: " + (tk.text || "omitted") + "]");
          if (!SAFE_URL.test(tk.url)) return h("span", { key }, renderInline(tk.text, ctx, key));
          return h("a", { key, href: tk.url, target: "_blank", rel: "noopener noreferrer", className: "lw-ext" },
            renderInline(tk.text, ctx, key));
        }
        const hit = (ctx.links || {})[linkKey(tk.target)];
        const label = tk.alias || tk.target;
        if (hit && hit.kind !== "missing" && ctx.open) {
          return h("a", {
            key, href: "#", className: "lw-wl", title: hit.title || tk.target,
            onClick: (e) => { e.preventDefault(); ctx.open(hit); },
          }, label);
        }
        return h("span", { key, className: "lw-wl missing", title: "No such page" }, label);
      });
    }

    function renderBlocks(blocks, ctx, keyBase) {
      return blocks.map((b, n) => {
        const key = keyBase + "." + n;
        switch (b.t) {
          case "h":
            return h("h" + Math.min(b.level + 1, 6), { key, className: "lw-h" + b.level }, renderInline(b.text, ctx, key));
          case "p":
            return h("p", { key }, renderInline(b.text, ctx, key));
          case "hr":
            return h("hr", { key });
          case "code":
            return h("pre", { key, className: "lw-pre" },
              b.lang ? h("span", { className: "lw-lang" }, b.lang) : null, h("code", null, b.text));
          case "quote":
            return h("blockquote", { key }, renderBlocks(b.children, ctx, key));
          case "list":
            return h(b.ordered ? "ol" : "ul", { key, start: b.ordered && b.start !== 1 ? b.start : undefined },
              b.items.map((it, k) => {
                const task = TASK.exec(it.inline);
                const text = task ? it.inline.slice(task[0].length) : it.inline;
                return h("li", { key: key + "." + k },
                  task ? h("span", { className: "lw-task" }, task[1] === " " ? "☐ " : "☑ ") : null,
                  renderInline(text, ctx, key + "." + k), renderBlocks(it.children, ctx, key + "." + k));
              }));
          case "table":
            return h("div", { key, className: "lw-tablewrap" }, h("table", null,
              h("thead", null, h("tr", null, b.header.map((c, k) =>
                h("th", { key: k, style: b.align[k] ? { textAlign: b.align[k] } : undefined },
                  renderInline(c, ctx, key + ".h" + k))))),
              h("tbody", null, b.rows.map((row, r) => h("tr", { key: r }, b.header.map((_, k) =>
                h("td", { key: k, style: b.align[k] ? { textAlign: b.align[k] } : undefined },
                  renderInline(row[k] || "", ctx, key + "." + r + "." + k))))))));
          default:
            return null;
        }
      });
    }

    return { renderInline, renderBlocks };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      parseBlocks, tokenizeInline, parseWikiTarget, splitCells, linkKey, linkMap, highlightParts, groupColor,
      initSim, stepSim, runSim, fmtDate, fmtBytes, makeRenderer,
    };
  }

  const registry = root.__HERMES_PLUGINS__;
  const sdk = root.__HERMES_PLUGIN_SDK__;
  if (!registry || !registry.register || !sdk) return;

  // ─── Hermes SDK glue ──────────────────────────────────────────────
  const { React, fetchJSON } = sdk;
  const { useState, useEffect, useMemo, useRef, useCallback } = React;
  const h = React.createElement;
  const R = makeRenderer(h);

  const BASE = "/api/plugins/llm-wiki";
  const VISITED_KEY = "llm-wiki:visited:v1";
  const SEARCH_DELAY_MS = 250;
  const MIN_QUERY = 2;
  const GRAPH_W = 900;
  const GRAPH_H = 560;
  const SIM_FRAMES = 260;
  const NAV = [["index", "Index"], ["log", "Log"], ["graph", "Graph"], ["sources", "Sources"], ["schema", "Schema"]];

  function get(path, params) {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return fetchJSON(BASE + path + q);
  }

  function errMsg(e) {
    const m = String((e && e.message) || e);
    const i = m.indexOf("{");
    if (i >= 0) {
      try {
        const d = JSON.parse(m.slice(i)).detail;
        if (d && d.message) return d.message;
      } catch (_) { /* fall through to the raw message */ }
    }
    return m.slice(0, 300);
  }

  function useLoad(fn, deps) {
    const [state, setState] = useState({ data: null, error: null, loading: !!fn });
    useEffect(() => {
      if (!fn) { setState({ data: null, error: null, loading: false }); return undefined; }
      let dead = false;
      setState({ data: null, error: null, loading: true });
      fn().then((data) => { if (!dead) setState({ data, error: null, loading: false }); })
        .catch((e) => { if (!dead) setState({ data: null, error: errMsg(e), loading: false }); });
      return () => { dead = true; };
    }, deps); // eslint-disable-line react-hooks/exhaustive-deps
    return state;
  }

  function loadVisited() {
    try { return new Set(JSON.parse(root.localStorage.getItem(VISITED_KEY) || "[]")); } catch (_) { return new Set(); }
  }

  function saveVisited(set) {
    try { root.localStorage.setItem(VISITED_KEY, JSON.stringify(Array.from(set))); } catch (_) { /* storage unavailable */ }
  }

  const CSS = `
.lw{--s:rgba(255,255,255,.04);--b:rgba(255,255,255,.1);--t:#e5e5e5;--d:rgba(255,255,255,.55);--a:#60a5fa;--ok:#a8e619;--bad:#ff4d6d;--warn:#f59e0b;
  color:var(--t);font-size:13px;display:flex;flex-direction:column;gap:12px;min-width:0}
.lw *{box-sizing:border-box}
.lw-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.lw-head h2{margin:0;font-size:18px;font-weight:700;flex:1;min-width:140px}
.lw button,.lw input{font:inherit;color:var(--t);background:var(--s);border:1px solid var(--b);border-radius:6px;padding:6px 10px;min-height:34px}
.lw button{cursor:pointer}.lw button:hover:not(:disabled){background:rgba(255,255,255,.09)}
.lw button:disabled{opacity:.45;cursor:default}
.lw button.on{background:rgba(96,165,250,.18);border-color:var(--a);color:var(--a)}
.lw-muted{color:var(--d)}.lw-err{color:var(--bad);padding:8px 0;overflow-wrap:anywhere}
.lw-stats{display:flex;gap:6px;flex-wrap:wrap}
.lw-stat{background:var(--s);border:1px solid var(--b);border-radius:8px;padding:6px 10px;min-width:0}
.lw-stat .k{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--d)}
.lw-stat .v{font-size:16px;font-weight:700}
.lw-stat.warn .v{color:var(--warn)}
.lw-layout{display:flex;gap:12px;align-items:flex-start;min-width:0}
.lw-side{flex:0 0 280px;display:flex;flex-direction:column;gap:10px;min-width:0;position:sticky;top:8px;max-height:calc(100vh - 24px);overflow:auto}
.lw-main{flex:1;min-width:0;background:var(--s);border:1px solid var(--b);border-radius:8px;padding:16px 18px}
.lw-nav{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.lw-nav button{padding:6px 4px;text-align:center}
.lw-search{width:100%}
.lw-hits{border:1px solid var(--b);border-radius:8px;overflow:hidden}
.lw-hit{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid var(--b);border-radius:0;background:none;padding:8px 10px;min-height:0}
.lw-hit:last-child{border-bottom:0}
.lw-hit .t{font-weight:600;overflow-wrap:anywhere}
.lw-hit .sn{font-size:11px;color:var(--d);margin-top:3px;overflow-wrap:anywhere}
.lw-hit mark{background:rgba(245,158,11,.35);color:inherit;border-radius:2px}
.lw-tree{display:flex;flex-direction:column;gap:2px}
.lw-cat{display:flex;align-items:center;gap:6px;width:100%;text-align:left;border:0;background:none;padding:5px 6px;min-height:0;font-weight:600}
.lw-cat .n{margin-left:auto;font-size:11px;color:var(--d);font-weight:400}
.lw-cat .n b{color:var(--a)}
.lw-leaf{display:block;width:100%;text-align:left;border:0;background:none;padding:4px 6px 4px 26px;min-height:0;overflow-wrap:anywhere}
.lw-leaf.cur{background:rgba(96,165,250,.14);color:var(--a)}
.lw-leaf.unread{font-weight:600}
.lw-dot{display:inline-block;width:9px;height:9px;border-radius:50%;flex:none}
.lw-crumbs{display:flex;gap:4px;align-items:center;flex-wrap:wrap;font-size:12px;color:var(--d);margin-bottom:8px}
.lw-crumbs button{border:0;background:none;padding:0 2px;min-height:0;color:var(--a)}
.lw-title{margin:0 0 6px;font-size:26px;line-height:1.2;overflow-wrap:anywhere}
.lw-meta{display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:11px;color:var(--d);margin-bottom:6px}
.lw-chip{border:1px solid var(--b);border-radius:999px;padding:1px 8px;display:inline-flex;gap:5px;align-items:center}
.lw-summary{color:var(--d);font-style:italic;margin:6px 0 14px}
.lw-md{line-height:1.65;font-size:14px;overflow-wrap:anywhere}
.lw-md h2,.lw-md h3,.lw-md h4,.lw-md h5,.lw-md h6{margin:1.4em 0 .5em;line-height:1.25}
.lw-md h2{font-size:21px;border-bottom:1px solid var(--b);padding-bottom:4px}.lw-md h3{font-size:17px}.lw-md h4{font-size:15px}
.lw-md p{margin:.6em 0}.lw-md ul,.lw-md ol{margin:.5em 0;padding-left:1.5em}.lw-md li{margin:.2em 0}
.lw-md blockquote{margin:.8em 0;padding:2px 14px;border-left:3px solid var(--a);color:var(--d);background:rgba(96,165,250,.06)}
.lw-md hr{border:0;border-top:1px solid var(--b);margin:1.2em 0}
.lw-code{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;background:rgba(255,255,255,.08);border-radius:4px;padding:1px 5px}
.lw-pre{position:relative;margin:.8em 0;padding:12px;background:rgba(0,0,0,.35);border:1px solid var(--b);border-radius:6px;overflow:auto;
  font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre}
.lw-pre code{font:inherit}
.lw-lang{position:absolute;top:3px;right:8px;font-size:10px;color:var(--d);text-transform:uppercase}
.lw-tablewrap{overflow:auto;margin:.8em 0}
.lw-md table{border-collapse:collapse;min-width:60%;font-size:13px}
.lw-md th,.lw-md td{border:1px solid var(--b);padding:5px 10px;text-align:left;vertical-align:top}
.lw-md th{background:rgba(255,255,255,.06)}
.lw-wl{color:var(--a);text-decoration:none;border-bottom:1px dotted var(--a);cursor:pointer}
.lw-wl:hover{background:rgba(96,165,250,.15)}
.lw-wl.missing{color:var(--bad);border-bottom:1px dotted var(--bad);cursor:help}
.lw-ext{color:var(--a)}
.lw-refs{margin-top:22px;border-top:1px solid var(--b);padding-top:12px;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}
.lw-refs h3{margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--d)}
.lw-ref{display:flex;gap:6px;align-items:center;width:100%;text-align:left;border:0;background:none;padding:4px 2px;min-height:0;color:var(--a)}
.lw-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px}
.lw-card{display:block;text-align:left;width:100%;border:1px solid var(--b);border-radius:8px;padding:10px 12px;min-height:0}
.lw-card .t{font-weight:600}.lw-card .sm{font-size:12px;color:var(--d);margin-top:3px}
.lw-section{margin:0 0 18px}
.lw-section h3{margin:0 0 8px;font-size:15px;display:flex;gap:8px;align-items:center}
.lw-timeline{position:relative;margin:0;padding-left:22px}
.lw-timeline:before{content:"";position:absolute;left:6px;top:4px;bottom:4px;width:2px;background:var(--b)}
.lw-ev{position:relative;margin-bottom:16px}
.lw-ev:before{content:"";position:absolute;left:-21px;top:5px;width:10px;height:10px;border-radius:50%;background:var(--c,var(--a));border:2px solid #0b0f14}
.lw-ev .d{font-size:11px;color:var(--d)}
.lw-ev .t{font-weight:700;font-size:15px;margin:2px 0}
.lw-badge{font-size:10px;text-transform:uppercase;letter-spacing:.05em;border-radius:4px;padding:1px 6px;background:var(--c,var(--a));color:#0b0f14;font-weight:700;margin-right:6px}
.lw-filters{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.lw-graphbox{border:1px solid var(--b);border-radius:8px;background:rgba(0,0,0,.25);overflow:hidden}
.lw-graphbox svg{display:block;width:100%;height:auto;touch-action:none}
.lw-node{cursor:pointer}.lw-node:focus{outline:none}.lw-node:focus circle{stroke:#fff;stroke-width:2}
.lw-split{display:flex;gap:12px;align-items:flex-start;min-width:0}
.lw-split>.lw-listpane{flex:0 0 320px;display:flex;flex-direction:column;gap:6px;min-width:0}
.lw-split>.lw-detail{flex:1;min-width:0}
.lw-kv{display:grid;grid-template-columns:max-content 1fr;gap:3px 12px;font-size:12px;margin:8px 0 14px}
.lw-kv dt{color:var(--d)}.lw-kv dd{margin:0;overflow-wrap:anywhere}
@media (max-width:900px){
  .lw-layout,.lw-split{flex-direction:column}
  .lw-side,.lw-split>.lw-listpane{flex:none;width:100%;position:static;max-height:none}
  .lw-main{padding:12px;width:100%}
  .lw input{font-size:16px}
}`;

  // ─── small components ─────────────────────────────────────────────
  function Markdown({ text, links, open }) {
    const ctx = useMemo(() => ({ links: linkMap(links), open }), [links, open]);
    const blocks = useMemo(() => parseBlocks(text), [text]);
    return h("div", { className: "lw-md" }, R.renderBlocks(blocks, ctx, "md"));
  }

  function Dot({ group }) {
    return h("span", { className: "lw-dot", style: { background: groupColor(group) } });
  }

  function Chip({ group, children }) {
    return h("span", { className: "lw-chip" }, group ? h(Dot, { group }) : null, children);
  }

  function Status({ state }) {
    if (state.error) return h("div", { className: "lw-err" }, state.error);
    if (state.loading) return h("div", { className: "lw-muted" }, "Loading…");
    return null;
  }

  function Stats({ status }) {
    const d = status.data;
    if (!d) return status.error ? h("div", { className: "lw-err" }, "Status unavailable: " + status.error) : null;
    const items = [
      ["Articles", fmtNumber(d.articles)], ["Words", fmtNumber(d.words)], ["Sources", fmtNumber(d.sources)],
      ["Categories", fmtNumber(Object.keys(d.categories || {}).length)], ["Log entries", fmtNumber(d.log_entries)],
      ["Last log", d.last_log_date || "—"], ["Updated", fmtDate(d.last_update) || "—"],
    ];
    return h("div", { className: "lw-stats" },
      items.map(([k, v]) => h("div", { className: "lw-stat", key: k }, h("div", { className: "k" }, k), h("div", { className: "v" }, v))),
      d.orphans && d.orphans.length
        ? h("div", { className: "lw-stat warn", title: d.orphans.join(", ") },
          h("div", { className: "k" }, "Orphans"), h("div", { className: "v" }, d.orphans.length))
        : null);
  }

  // ─── sidebar ──────────────────────────────────────────────────────
  function SearchBox({ onOpen }) {
    const [q, setQ] = useState("");
    const [dq, setDq] = useState("");
    useEffect(() => {
      const timer = setTimeout(() => setDq(q.trim()), SEARCH_DELAY_MS);
      return () => clearTimeout(timer);
    }, [q]);
    const active = dq.length >= MIN_QUERY;
    const res = useLoad(active ? () => get("/search", { q: dq }) : null, [dq]);
    const terms = dq.split(/\s+/).filter(Boolean);
    const pick = (r) => { setQ(""); onOpen(r); };
    return h("div", null,
      h("input", {
        className: "lw-search", type: "search", value: q, placeholder: "Search wiki and sources…",
        "aria-label": "Search wiki", onChange: (e) => setQ(e.target.value),
        onKeyDown: (e) => { if (e.key === "Escape") setQ(""); },
      }),
      active ? h("div", { className: "lw-hits", style: { marginTop: 8 } },
        h(Status, { state: res }),
        res.data && !res.data.results.length ? h("div", { className: "lw-muted", style: { padding: 8 } }, "No matches") : null,
        res.data ? res.data.results.map((r) => h("button", { key: r.path, className: "lw-hit", onClick: () => pick(r) },
          h("div", { className: "t" }, h(Dot, { group: r.category }), " ", r.title,
            r.scope === "raw" ? h("span", { className: "lw-muted" }, " · source") : null),
          h("div", { className: "sn" }, highlightParts(r.snippet, terms).map((p, i) =>
            p.hit ? h("mark", { key: i }, p.text) : p.text)))) : null) : null);
  }

  function CategoryTree({ index, visited, current, onOpen }) {
    const [closed, setClosed] = useState({});
    if (!index) return null;
    return h("div", { className: "lw-tree" }, index.categories.map((cat) => {
      const linked = cat.pages.filter((p) => p.path);
      const unread = linked.filter((p) => !visited.has(p.path)).length;
      const isClosed = !!closed[cat.name];
      return h("div", { key: cat.name },
        h("button", {
          className: "lw-cat", "aria-expanded": !isClosed,
          onClick: () => setClosed(Object.assign({}, closed, { [cat.name]: !isClosed })),
        }, isClosed ? "▸" : "▾", " ", cat.name,
        h("span", { className: "n", title: "unread / total" }, h("b", null, unread), "/" + linked.length)),
        isClosed ? null : linked.map((p) => h("button", {
          key: p.path, onClick: () => onOpen(p),
          className: "lw-leaf" + (current === p.path ? " cur" : "") + (visited.has(p.path) ? "" : " unread"),
        }, p.title)));
    }));
  }

  function Sidebar({ view, index, visited, current, go, openLink }) {
    return h("aside", { className: "lw-side" },
      h("div", { className: "lw-nav" }, NAV.map(([k, label]) =>
        h("button", { key: k, className: view === k ? "on" : "", onClick: () => go({ view: k }) }, label))),
      h(SearchBox, { onOpen: openLink }),
      h(CategoryTree, { index: index.data, visited, current, onOpen: openLink }));
  }

  // ─── views ────────────────────────────────────────────────────────
  function IndexView({ index, cat, go, openLink }) {
    if (!index.data) return h(Status, { state: index });
    const shown = cat ? index.data.categories.filter((c) => c.name.toLowerCase() === cat.toLowerCase()) : index.data.categories;
    return h("div", null,
      h("h1", { className: "lw-title" }, cat || index.data.title),
      cat ? h("button", { onClick: () => go({ view: "index" }) }, "← All categories") : null,
      index.data.unlisted.length ? h("div", { className: "lw-err" }, "Not in index: " + index.data.unlisted.join(", ")) : null,
      shown.map((c) => h("section", { className: "lw-section", key: c.name },
        h("h3", null, h(Dot, { group: c.name }), c.name, h("span", { className: "lw-muted" }, "(" + c.pages.length + ")")),
        h("div", { className: "lw-cards" }, c.pages.map((p) => h("button", {
          key: p.title, className: "lw-card", disabled: !p.path, onClick: () => openLink(p),
        }, h("div", { className: "t" }, p.title), h("div", { className: "sm" }, p.summary || "")))))));
  }

  function PageView({ path, go, openLink, onLoaded }) {
    const page = useLoad(() => get("/page", { path }), [path]);
    useEffect(() => { if (page.data) onLoaded(page.data.path); }, [page.data]); // eslint-disable-line react-hooks/exhaustive-deps
    if (!page.data) return h(Status, { state: page });
    const d = page.data;
    const tags = Array.isArray(d.meta.tags) ? d.meta.tags : [];
    const refs = (title, items, empty) => h("div", null, h("h3", null, title + " (" + items.length + ")"),
      items.length ? items.map((it) => h("button", { key: it.path, className: "lw-ref", onClick: () => openLink(it) },
        h(Dot, { group: it.category }), it.title)) : h("div", { className: "lw-muted" }, empty));
    const outgoing = d.links.filter((l) => l.kind !== "missing")
      .map((l) => ({ path: l.path, title: l.title, category: l.kind === "source" ? "source" : "", kind: l.kind }));
    const broken = d.links.filter((l) => l.kind === "missing");
    return h("article", null,
      h("div", { className: "lw-crumbs" },
        h("button", { onClick: () => go({ view: "index" }) }, "Wiki"), "›",
        h("button", { onClick: () => go({ view: "index", cat: d.category }) }, d.category), "›", h("span", null, d.title)),
      h("h1", { className: "lw-title" }, d.title),
      h("div", { className: "lw-meta" },
        h(Chip, { group: d.category }, d.category),
        h("span", null, fmtNumber(d.words) + " words"),
        d.meta.date ? h("span", null, "revised " + d.meta.date) : null,
        h("span", null, "file modified " + fmtDate(d.modified)),
        tags.map((t) => h("span", { className: "lw-chip", key: t }, "#" + t))),
      d.meta.summary ? h("div", { className: "lw-summary" }, d.meta.summary) : null,
      h(Markdown, { text: d.body, links: d.links, open: openLink }),
      h("div", { className: "lw-refs" },
        refs("Linked references", d.backlinks, "No other page links here."),
        refs("Links to", outgoing, "No outgoing links."),
        broken.length ? h("div", null, h("h3", null, "Broken links (" + broken.length + ")"),
          broken.map((l) => h("div", { key: l.target, className: "lw-err" }, l.target))) : null));
  }

  const TYPE_COLORS = { ingest: "#60a5fa", query: "#a78bfa", lint: "#fbbf24", schema: "#34d399", release: "#f472b6" };

  function LogView({ openLink }) {
    const log = useLoad(() => get("/log"), []);
    const [type, setType] = useState("all");
    if (!log.data) return h(Status, { state: log });
    const types = Array.from(new Set(log.data.entries.map((e) => e.type)));
    const entries = log.data.entries.filter((e) => type === "all" || e.type === type).slice().reverse();
    return h("div", null,
      h("h1", { className: "lw-title" }, "Activity log"),
      h("div", { className: "lw-muted", style: { marginBottom: 10 } }, log.data.count + " entries, newest first"),
      h("div", { className: "lw-filters" }, ["all"].concat(types).map((t) =>
        h("button", { key: t, className: type === t ? "on" : "", onClick: () => setType(t) }, t))),
      h("ol", { className: "lw-timeline", style: { listStyle: "none" } }, entries.map((e) =>
        h("li", { className: "lw-ev", key: e.date + e.title, style: { "--c": TYPE_COLORS[e.type] || "#94a3b8" } },
          h("div", { className: "d" }, e.date),
          h("div", { className: "t" }, h("span", { className: "lw-badge" }, e.type), e.title),
          h(Markdown, { text: e.body, links: e.links, open: openLink })))));
  }

  function GraphView({ openLink }) {
    const graph = useLoad(() => get("/graph"), []);
    const svgRef = useRef(null);
    const simRef = useRef(null);
    const alphaRef = useRef(0);
    const frameRef = useRef(0);
    const dragRef = useRef(null);
    const [, setFrame] = useState(0);
    const [hover, setHover] = useState(null);
    const [hidden, setHidden] = useState({});

    const run = useCallback(() => {
      cancelAnimationFrame(frameRef.current);
      const loop = () => {
        const sim = simRef.current;
        if (!sim || alphaRef.current <= 0.02) return;
        stepSim(sim, alphaRef.current);
        alphaRef.current *= 1 - 4 / SIM_FRAMES;
        setFrame((f) => f + 1);
        frameRef.current = requestAnimationFrame(loop);
      };
      frameRef.current = requestAnimationFrame(loop);
    }, []);

    useEffect(() => {
      if (!graph.data) return undefined;
      const still = root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (still) {
        simRef.current = runSim(graph.data.nodes, graph.data.edges, GRAPH_W, GRAPH_H, SIM_FRAMES);
        setFrame((f) => f + 1);
        return undefined;
      }
      simRef.current = initSim(graph.data.nodes, graph.data.edges, GRAPH_W, GRAPH_H);
      alphaRef.current = 1;
      run();
      return () => cancelAnimationFrame(frameRef.current);
    }, [graph.data, run]);

    if (!graph.data) return h(Status, { state: graph });
    const sim = simRef.current;
    if (!sim) return null;
    const neighbours = new Set();
    if (hover) {
      neighbours.add(hover);
      sim.links.forEach(({ a, b }) => { if (a.id === hover) neighbours.add(b.id); if (b.id === hover) neighbours.add(a.id); });
    }
    const dim = (id) => hover && !neighbours.has(id);
    const toSvg = (e) => {
      const r = svgRef.current.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * GRAPH_W, y: ((e.clientY - r.top) / r.height) * GRAPH_H };
    };
    const open = (n) => openLink({ kind: n.group === "source" ? "source" : "page", path: n.id });
    const onDown = (node) => (e) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = { node, moved: 0, start: toSvg(e) };
      node.fixed = true;
    };
    const onMove = (e) => {
      const d = dragRef.current;
      if (!d) return;
      const p = toSvg(e);
      d.moved = Math.max(d.moved, Math.hypot(p.x - d.start.x, p.y - d.start.y));
      if (d.moved > 4) {
        d.node.x = Math.min(Math.max(p.x, 10), GRAPH_W - 10);
        d.node.y = Math.min(Math.max(p.y, 10), GRAPH_H - 10);
        alphaRef.current = Math.max(alphaRef.current, 0.35);
        run();
      }
    };
    const onUp = () => {
      const d = dragRef.current;
      dragRef.current = null;
      if (!d) return;
      d.node.fixed = false;
      if (d.moved <= 4) open(d.node);
    };
    const visible = (n) => !hidden[n.group];

    return h("div", null,
      h("h1", { className: "lw-title" }, "Graph"),
      h("div", { className: "lw-muted", style: { marginBottom: 10 } },
        sim.nodes.length + " pages and sources, " + sim.links.length + " links. Hover to highlight, drag to move, click to open."),
      h("div", { className: "lw-filters" }, graph.data.groups.map((g) => h("button", {
        key: g, className: hidden[g] ? "" : "on", onClick: () => setHidden(Object.assign({}, hidden, { [g]: !hidden[g] })),
      }, h(Dot, { group: g }), " ", g))),
      h("div", { className: "lw-graphbox" }, h("svg", {
        ref: svgRef, viewBox: "0 0 " + GRAPH_W + " " + GRAPH_H, role: "group", "aria-label": "Wiki link graph",
        onPointerMove: onMove, onPointerUp: onUp, onPointerCancel: onUp,
      },
      sim.links.filter(({ a, b }) => visible(a) && visible(b)).map(({ a, b }, i) => {
        const on = hover && (a.id === hover || b.id === hover);
        return h("line", {
          key: i, x1: a.x, y1: a.y, x2: b.x, y2: b.y,
          stroke: on ? "#fff" : "#94a3b8", strokeOpacity: on ? 0.9 : dim(a.id) && dim(b.id) ? 0.05 : 0.28, strokeWidth: on ? 1.8 : 1,
        });
      }),
      sim.nodes.filter(visible).map((n) => h("g", {
        key: n.id, className: "lw-node", transform: "translate(" + n.x + "," + n.y + ")", tabIndex: 0, role: "link",
        "aria-label": n.title + ", " + n.group, opacity: dim(n.id) ? 0.25 : 1,
        onPointerDown: onDown(n), onPointerEnter: () => setHover(n.id), onPointerLeave: () => setHover(null),
        onFocus: () => setHover(n.id), onBlur: () => setHover(null),
        onKeyDown: (e) => { if (e.key === "Enter") open(n); },
      },
      h("title", null, n.title + " — " + n.group + ", " + n.words + " words, " + n.degree + " links"),
      h("circle", { r: n.r, fill: groupColor(n.group), stroke: "#0b0f14", strokeWidth: 1.5 }),
      h("text", { y: n.r + 12, textAnchor: "middle", fontSize: 11, fill: "#e5e5e5", style: { pointerEvents: "none" } },
        n.title.length > 24 ? n.title.slice(0, 23) + "…" : n.title))))));
  }

  function SourcesView({ name, go, openLink, onLoaded }) {
    const list = useLoad(() => get("/sources"), []);
    const detail = useLoad(name ? () => get("/source", { name }) : null, [name]);
    const [raw, setRaw] = useState(false);
    useEffect(() => { if (detail.data) onLoaded("raw/" + detail.data.name); }, [detail.data]); // eslint-disable-line react-hooks/exhaustive-deps
    const d = detail.data;
    return h("div", null,
      h("h1", { className: "lw-title" }, "Raw sources"),
      h("div", { className: "lw-muted", style: { marginBottom: 10 } }, "Immutable ground-truth documents. The wiki cites them; it never edits them."),
      h(Status, { state: list }),
      list.data ? h("div", { className: "lw-split" },
        h("div", { className: "lw-listpane" }, list.data.sources.map((s) => h("button", {
          key: s.name, className: "lw-card" + (s.name === name ? " on" : ""), onClick: () => go({ view: "sources", name: s.name }),
        }, h("div", { className: "t" }, s.title), h("div", { className: "sm" }, s.name + " · " + fmtNumber(s.words) + " words · " + fmtBytes(s.bytes))))),
        h("div", { className: "lw-detail" },
          !name ? h("div", { className: "lw-muted" }, "Select a source to inspect it.") : null,
          name ? h(Status, { state: detail }) : null,
          d ? h("div", null,
            h("h2", { style: { marginTop: 0 } }, d.title),
            h("dl", { className: "lw-kv" }, Object.keys(d.meta).map((k) => [
              h("dt", { key: k + "k" }, k),
              h("dd", { key: k + "v" }, SAFE_URL.test(String(d.meta[k]))
                ? h("a", { className: "lw-ext", href: String(d.meta[k]), target: "_blank", rel: "noopener noreferrer" }, String(d.meta[k]))
                : String(d.meta[k])),
            ]), h("dt", { key: "wk" }, "words"), h("dd", { key: "wv" }, fmtNumber(d.words))),
            h("div", { className: "lw-filters" },
              h("button", { className: raw ? "" : "on", onClick: () => setRaw(false) }, "Rendered"),
              h("button", { className: raw ? "on" : "", onClick: () => setRaw(true) }, "Raw text")),
            raw ? h("pre", { className: "lw-pre", style: { whiteSpace: "pre-wrap" } }, d.body)
              : h(Markdown, { text: d.body, links: [], open: openLink }),
            h("div", { className: "lw-refs" }, h("div", null, h("h3", null, "Cited by (" + d.cited_by.length + ")"),
              d.cited_by.length ? d.cited_by.map((p) => h("button", { key: p.path, className: "lw-ref", onClick: () => openLink(p) },
                h(Dot, { group: p.category }), p.title)) : h("div", { className: "lw-muted" }, "No page cites this source yet.")))) : null)) : null);
  }

  function SchemaView({ openLink }) {
    const schema = useLoad(() => get("/schema"), []);
    if (!schema.data) return h(Status, { state: schema });
    return h("div", null,
      h("h1", { className: "lw-title" }, "Schema"),
      h("div", { className: "lw-muted", style: { marginBottom: 10 } }, "Conventions for agents that maintain this wiki · " + fmtNumber(schema.data.words) + " words"),
      h(Markdown, { text: schema.data.body, links: [], open: openLink }));
  }

  // ─── root ─────────────────────────────────────────────────────────
  function LlmWikiPlugin() {
    const [stack, setStack] = useState([{ view: "index" }]);
    const [pos, setPos] = useState(0);
    const [tick, setTick] = useState(0);
    const [visited, setVisited] = useState(loadVisited);
    const index = useLoad(() => get("/index"), [tick]);
    const status = useLoad(() => get("/status"), [tick]);
    const here = stack[pos];

    const go = useCallback((target) => {
      setStack((s) => s.slice(0, pos + 1).concat([target]));
      setPos((p) => p + 1);
    }, [pos]);
    const openLink = useCallback((link) => {
      if (!link || !link.path) return;
      if (link.kind === "source" || link.path.startsWith("raw/")) go({ view: "sources", name: link.path.replace(/^raw\//, "") });
      else go({ view: "page", path: link.path });
    }, [go]);
    const markVisited = useCallback((path) => {
      setVisited((prev) => {
        if (prev.has(path)) return prev;
        const next = new Set(prev);
        next.add(path);
        saveVisited(next);
        return next;
      });
    }, []);

    let body;
    if (here.view === "page") body = h(PageView, { key: here.path, path: here.path, go, openLink, onLoaded: markVisited });
    else if (here.view === "log") body = h(LogView, { openLink });
    else if (here.view === "graph") body = h(GraphView, { openLink });
    else if (here.view === "sources") body = h(SourcesView, { name: here.name, go, openLink, onLoaded: markVisited });
    else if (here.view === "schema") body = h(SchemaView, { openLink });
    else body = h(IndexView, { index, cat: here.cat, go, openLink });

    return h("div", { className: "lw" },
      h("style", null, CSS),
      h("div", { className: "lw-head" },
        h("h2", null, "LLM Wiki"), h("span", { className: "lw-muted" }, "read-only"),
        h("button", { disabled: pos === 0, onClick: () => setPos(pos - 1), "aria-label": "Back" }, "←"),
        h("button", { disabled: pos >= stack.length - 1, onClick: () => setPos(pos + 1), "aria-label": "Forward" }, "→"),
        h("button", { onClick: () => setTick((t) => t + 1) }, "↻ Refresh")),
      h(Stats, { status }),
      h("div", { className: "lw-layout" },
        h(Sidebar, { view: here.view, index, visited, current: here.view === "page" ? here.path : null, go, openLink }),
        h("div", { className: "lw-main", role: "region", "aria-label": "Wiki content" }, body)));
  }

  registry.register("llm-wiki", LlmWikiPlugin);
})();
