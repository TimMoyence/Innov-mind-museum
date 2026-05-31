#!/usr/bin/env node
// render-artifact.mjs — markdown / JSON → self-contained HTML artifact.
//
// Implements CLAUDE.md § Output format: one file, no dependencies, inline CSS,
// inline SVG, light mode, two accent colors, print-friendly (@media print).
// Zero npm dependencies on purpose — the doctrine's "no dependencies" ethos
// applies to the produced file, and a zero-install tool dodges the repo's
// pnpm workspace `file:`-package gotcha entirely.
//
// Usage:
//   node scripts/render-artifact.mjs <input.md|input.json> [--out file.html] [--title "…"]
//   node scripts/render-artifact.mjs <a> <b> <c> --out report.html [--title "…"]   # bundle w/ TOC
//
// Single input, no --out  → writes <input>.html next to the source, prints the path.
// Multiple inputs         → one bundled HTML with a table of contents (needs --out).
//
// Roadmap mode (--mode roadmap | frontmatter `kind: roadmap` | filename *roadmap*):
//   status pills, per-lane progress bars, a go/no-go dashboard, and clickable
//   status filters (vanilla inline JS). The generic renderer is untouched when off.
//
// Supported sources: markdown (STORY.md, spec.md, design.md, tasks.md, lessons),
// JSON with a `findings[]` array (code-review / security / verify), lesson JSON
// (`trigger`/`whatWorked`/…), and any other JSON (pretty tree fallback).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Roadmap mode — module-level flags
// When active, status tokens (✅/🔴/🟧/🧑‍🔧/⬜ + GFM checkboxes) become colored
// pills, H2 lanes get a progress bar, and a go/no-go dashboard is prepended.
// Stays off by default so the generic doctrine renderer is untouched.
// ─────────────────────────────────────────────────────────────────────────────
let RM = false; // roadmap mode active for the current source
let RM_SECTIONS = {}; // slug(H2 title) → { done, partial, open, ops, todo, total }

// ─────────────────────────────────────────────────────────────────────────────
// HTML escaping
// ─────────────────────────────────────────────────────────────────────────────
const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// ─────────────────────────────────────────────────────────────────────────────
// Minimal GFM-subset markdown → HTML
// Covers: ATX headings, fenced code, inline code/bold/italic/links, pipe tables,
// blockquotes, ordered/unordered lists (one nesting level), horizontal rules,
// paragraphs. Everything is HTML-escaped before formatting (no injection).
// ─────────────────────────────────────────────────────────────────────────────
function inline(text) {
  const codes = [];
  // protect inline code spans before escaping
  text = text.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `C${codes.length - 1}`;
  });
  text = esc(text);
  // links — both halves are already entity-safe post-escape, but esc() does NOT
  // neutralize the URL scheme: a `[x](javascript:…)` / `data:` link would stay
  // clickable in the shared artifact. Allowlist safe schemes, else neutralize to '#'.
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => {
    const safe = /^(https?:|mailto:|#|\/|\.\/|\.\.\/)/i.test(u) ? u : '#';
    return `<a href="${safe}">${t}</a>`;
  });
  // bold then italic
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  text = text.replace(/(^|[^A-Za-z0-9_])_([^_\n]+)_(?![A-Za-z0-9_])/g, '$1<em>$2</em>');
  // restore code spans (escaped)
  text = text.replace(/C(\d+)/g, (_, i) => `<code>${esc(codes[+i])}</code>`);
  return text;
}

function splitFrontmatter(md) {
  if (!md.startsWith('---\n')) return { fm: null, body: md };
  const end = md.indexOf('\n---', 4);
  if (end === -1) return { fm: null, body: md };
  const raw = md.slice(4, end);
  const body = md.slice(end + 4).replace(/^\n/, '');
  const fm = {};
  let key = null;
  for (const line of raw.split('\n')) {
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    const item = line.match(/^\s*-\s+(.*)$/);
    if (kv) {
      key = kv[1];
      fm[key] = kv[2] === '' ? [] : kv[2];
    } else if (item && key && Array.isArray(fm[key])) {
      fm[key].push(item[1]);
    }
  }
  return { fm, body };
}

function renderMarkdown(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;

  const isTableSep = (s) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(s);
  const cells = (s) =>
    s.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());

  while (i < lines.length) {
    const line = lines[i];

    // fenced code
    if (/^\s*```/.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
      i++; // closing fence
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    // blank
    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }
    // heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const lvl = h[1].length;
      const rawH = h[2].replace(/\s+#+\s*$/, '');
      const bar = RM && lvl === 2 ? rmProgressBar(rawH) : '';
      out.push(`<h${lvl}>${inline(rawH)}</h${lvl}>${bar}`);
      i++;
      continue;
    }
    // horizontal rule
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }
    // table
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && !/^\s*$/.test(lines[i])) {
        rows.push(cells(lines[i]));
        i++;
      }
      let t = '<table><thead><tr>';
      for (const c of head) t += `<th>${inline(c)}</th>`;
      t += '</tr></thead><tbody>';
      for (const r of rows) {
        const rowStatus = RM ? detectStatus(r.join(' ')) : '';
        t += rowStatus ? `<tr data-rm-status="${rowStatus}">` : '<tr>';
        for (let j = 0; j < head.length; j++) {
          const cell = r[j] ?? '';
          t += `<td>${RM ? rmText(cell).html : inline(cell)}</td>`;
        }
        t += '</tr>';
      }
      t += '</tbody></table>';
      out.push(t);
      continue;
    }
    // blockquote
    if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${renderMarkdown(buf.join('\n'))}</blockquote>`);
      continue;
    }
    // lists (ordered / unordered, one nesting level via 2-space indent)
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const tag = ordered ? 'ol' : 'ul';
      let html = `<${tag}>`;
      let openNested = null;
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        const m = lines[i].match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
        const indent = m[1].length;
        const content = m[3];
        // checkbox support
        const cb = content.match(/^\[([ xX])\]\s+(.*)$/);
        let text, liAttr = '';
        if (RM) {
          const r = rmText(content);
          text = r.html;
          if (r.status) liAttr = ` data-rm-status="${r.status}"`;
        } else {
          text = cb
            ? `<span class="cb">${cb[1].trim() ? '☑' : '☐'}</span> ${inline(cb[2])}`
            : inline(content);
        }
        if (indent >= 2) {
          if (!openNested) {
            html = html.replace(/<\/li>$/, '');
            html += `<${tag === 'ol' ? 'ol' : 'ul'}>`;
            openNested = tag;
          }
          html += `<li${liAttr}>${text}</li>`;
        } else {
          if (openNested) {
            html += `</${openNested}></li>`;
            openNested = null;
          }
          html += `<li${liAttr}>${text}</li>`;
        }
        i++;
      }
      if (openNested) html += `</${openNested}></li>`;
      html += `</${tag}>`;
      out.push(html);
      continue;
    }
    // paragraph
    const buf = [];
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^\s*```/.test(lines[i]) &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*([-*+]|\d+\.)\s+/.test(lines[i]) &&
      !/^\s*>/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    out.push(`<p>${inline(buf.join(' '))}</p>`);
  }
  return out.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON renderers
// ─────────────────────────────────────────────────────────────────────────────
const sevClass = (s) =>
  ({ CRITICAL: 'crit', HIGH: 'high', MEDIUM: 'med', LOW: 'low' })[String(s).toUpperCase()] || 'low';

function renderFindings(obj) {
  let h = '';
  const verdict = obj.verdict || obj.status;
  if (verdict) {
    const vc = /approv|pass|ok/i.test(verdict) ? 'ok' : /block|fail|reject|crit/i.test(verdict) ? 'bad' : 'warn';
    h += `<p class="verdict ${vc}">${esc(verdict)}</p>`;
  }
  if (obj.scoresOnFiveAxes) {
    const s = obj.scoresOnFiveAxes;
    h += '<table><thead><tr><th>Axe</th><th class="num">Score</th></tr></thead><tbody>';
    for (const [k, v] of Object.entries(s)) {
      if (typeof v === 'number') h += `<tr><td>${esc(k)}</td><td class="num">${v}</td></tr>`;
    }
    h += '</tbody></table>';
  }
  const findings = Array.isArray(obj.findings) ? obj.findings : [];
  h += `<p class="muted">${findings.length} finding${findings.length === 1 ? '' : 's'}</p>`;
  for (const f of findings) {
    const loc = [f.file, f.line].filter((x) => x != null).join(':');
    h += '<div class="finding">';
    h += '<div class="finding-head">';
    if (f.severity) h += `<span class="sev ${sevClass(f.severity)}">${esc(f.severity)}</span>`;
    if (f.axis) h += `<span class="axis">${esc(f.axis)}</span>`;
    if (loc) h += `<code class="loc">${esc(loc)}</code>`;
    h += '</div>';
    if (f.title) h += `<p class="finding-title">${esc(f.title)}</p>`;
    if (f.description) h += `<p>${esc(f.description)}</p>`;
    if (f.suggestion) h += `<p class="suggestion"><strong>Suggestion —</strong> ${esc(f.suggestion)}</p>`;
    h += '</div>';
  }
  return h;
}

function renderLesson(obj) {
  let h = '';
  const meta = ['runId', 'mode', 'pipeline', 'completedAt', 'costUSD', 'correctiveLoops']
    .filter((k) => obj[k] != null)
    .map((k) => `<span><b>${esc(k)}</b> ${esc(obj[k])}</span>`)
    .join('');
  if (meta) h += `<div class="kv">${meta}</div>`;
  if (Array.isArray(obj.tags) && obj.tags.length)
    h += `<p>${obj.tags.map((t) => `<span class="chip">${esc(t)}</span>`).join(' ')}</p>`;
  const section = (title, val) => {
    if (val == null || (Array.isArray(val) && val.length === 0)) return;
    h += `<h2>${esc(title)}</h2>`;
    if (Array.isArray(val)) {
      h += '<ul>';
      for (const it of val) {
        if (it && typeof it === 'object' && 'text' in it)
          h += `<li><span class="cb">${it.done ? '☑' : '☐'}</span> ${esc(it.text)}</li>`;
        else h += `<li>${esc(it)}</li>`;
      }
      h += '</ul>';
    } else {
      // section body is a markdown fragment lifted from STORY.md (may hold
      // bullet lines) → render as markdown so `- …` becomes a real list
      h += renderMarkdown(String(val));
    }
  };
  section('Trigger', obj.trigger);
  section('What worked', obj.whatWorked);
  section('What failed', obj.whatFailed);
  section('Surprises', obj.surprises);
  section('Action items', obj.actionItems);
  return h;
}

function renderGenericJson(obj) {
  const walk = (v) => {
    if (v === null) return '<span class="muted">null</span>';
    if (Array.isArray(v)) {
      if (v.length === 0) return '<span class="muted">[]</span>';
      return `<ul>${v.map((x) => `<li>${walk(x)}</li>`).join('')}</ul>`;
    }
    if (typeof v === 'object') {
      return `<dl>${Object.entries(v)
        .map(([k, val]) => `<dt>${esc(k)}</dt><dd>${walk(val)}</dd>`)
        .join('')}</dl>`;
    }
    return esc(v);
  };
  return walk(obj);
}

function renderJson(obj) {
  if (Array.isArray(obj.findings)) return renderFindings(obj);
  if ('trigger' in obj || 'whatWorked' in obj || 'whatFailed' in obj) return renderLesson(obj);
  return renderGenericJson(obj);
}

// ─────────────────────────────────────────────────────────────────────────────
// Roadmap status detection + rendering
// One status per line, picked from the FIRST primary token found. 🧑‍🔧 is an
// orthogonal "ops" flag: alone it means ops-only, combined (✅🧑‍🔧) it keeps the
// primary status but is still rendered with an OPS tail pill.
// ─────────────────────────────────────────────────────────────────────────────
const RM_STATUS = {
  done: { label: 'DONE', cls: 'done' },
  open: { label: 'OPEN', cls: 'open' },
  partial: { label: 'PARTIAL', cls: 'partial' },
  ops: { label: 'OPS', cls: 'ops' },
  todo: { label: 'TODO', cls: 'todo' },
};
const RM_OPS = '🧑‍🔧';
// All status emoji, for stripping from the rendered text (VS16 tolerated).
const RM_EMOJI_RE = /(?:🧑‍🔧|✅|❌|🔴|🟧|🔀|⬜|⚠️|⚠)/gu;

// Primary status of a free-text fragment (table cell / list item) or null.
function detectStatus(text) {
  for (const ch of text) {
    if (ch === '✅') return 'done';
    if (ch === '❌' || ch === '🔴') return 'open';
    if (ch === '🟧' || ch === '🔀' || ch === '⚠') return 'partial';
    if (ch === '⬜') return 'todo';
  }
  // GFM checkbox fallback ([x] done / [ ] todo) at the item head.
  const cb = text.match(/^\s*\[([ xX])\]/);
  if (cb) return cb[1].trim() ? 'done' : 'todo';
  // ops-only line (🧑‍🔧 with no primary token)
  if (text.includes(RM_OPS)) return 'ops';
  return null;
}

const rmPill = (status) => {
  const s = RM_STATUS[status];
  return s ? `<span class="rm-pill ${s.cls}">${s.label}</span>` : '';
};

// Render a roadmap cell/item: strip status emoji, prepend a pill, keep inline fmt.
// `ops` tail (🧑‍🔧 alongside a primary status) becomes a small OPS pill too.
function rmText(raw) {
  const status = detectStatus(raw);
  const hasOps = raw.includes(RM_OPS) && status !== 'ops';
  const body = raw.replace(RM_EMOJI_RE, '').replace(/^\s*\[[ xX]\]\s*/, '').trim();
  const pills =
    (status ? rmPill(status) : '') + (hasOps ? `<span class="rm-pill ops">OPS</span>` : '');
  return { status: status || '', html: `${pills}${pills ? ' ' : ''}${inline(body)}` };
}

const rmSlug = (s) => slug(String(s).replace(RM_EMOJI_RE, '').trim());

// Progress bar HTML for an H2 lane, from precomputed RM_SECTIONS tallies.
function rmProgressBar(title) {
  const st = RM_SECTIONS[rmSlug(title)];
  if (!st || !st.total) return '';
  const pct = Math.round((st.done / st.total) * 100);
  const seg = (n, cls) => (n ? `<span class="seg ${cls}" style="flex:${n}"></span>` : '');
  const legend = [
    st.done && `${st.done} done`,
    st.partial && `${st.partial} partial`,
    st.open && `${st.open} open`,
    st.ops && `${st.ops} ops`,
    st.todo && `${st.todo} todo`,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    `<div class="rm-prog"><div class="rm-bar">` +
    seg(st.done, 'done') +
    seg(st.partial, 'partial') +
    seg(st.open, 'open') +
    seg(st.ops, 'ops') +
    seg(st.todo, 'todo') +
    `</div><div class="rm-prog-meta"><b>${pct}%</b> · ${legend}</div></div>`
  );
}

// Walk the markdown once to tally statuses per H2 section + globally.
function computeRoadmapStats(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const sections = {};
  const global = { done: 0, partial: 0, open: 0, ops: 0, todo: 0, total: 0 };
  let cur = null;
  let inCode = false;
  const bump = (status) => {
    if (!status) return;
    global[status] = (global[status] || 0) + 1;
    global.total++;
    if (cur) {
      cur[status] = (cur[status] || 0) + 1;
      cur.total++;
    }
  };
  for (let k = 0; k < lines.length; k++) {
    const line = lines[k];
    if (/^\s*```/.test(line)) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    const h = line.match(/^(#{2})\s+(.*)$/);
    if (h) {
      const key = rmSlug(h[2].replace(/\s+#+\s*$/, ''));
      cur = sections[key] = { done: 0, partial: 0, open: 0, ops: 0, todo: 0, total: 0 };
      continue;
    }
    // list item
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      bump(detectStatus(line.replace(/^\s*([-*+]|\d+\.)\s+/, '')));
      continue;
    }
    // table data row (skip header/separator): a row whose cells carry a token
    if (line.includes('|') && !/^\s*\|?\s*:?-{2,}/.test(line)) {
      bump(detectStatus(line));
    }
  }
  RM_SECTIONS = sections;
  return global;
}

// The go/no-go dashboard, prepended above the roadmap body.
// A curated façade summarises many shipped items per line, so the line-computed
// `global` undercounts. Frontmatter `stats: done=.. partial=.. open=.. ops=.. todo=..`
// supplies the authoritative verified tally for the headline bar; `blockers: …`
// is the real launch signal (shown prominently, not a %).
function rmDashboard(global, fm) {
  let g = global;
  if (fm && fm.stats) {
    const parsed = { done: 0, partial: 0, open: 0, ops: 0, todo: 0, total: 0 };
    for (const m of String(fm.stats).matchAll(/(done|partial|open|ops|todo)\s*=\s*(\d+)/gi))
      parsed[m[1].toLowerCase()] = +m[2];
    parsed.total = parsed.done + parsed.partial + parsed.open + parsed.ops + parsed.todo;
    if (parsed.total) g = parsed;
  }
  const pct = g.total ? Math.round((g.done / g.total) * 100) : 0;
  const seg = (n, cls) => (n ? `<span class="seg ${cls}" style="flex:${n}"></span>` : '');
  const gng = fm && fm.gonogo ? String(fm.gonogo).toUpperCase() : '';
  const gngCls = /NO.?GO/.test(gng) ? 'bad' : /RISK/.test(gng) ? 'warn' : 'ok';
  const stat = (n, cls, label) => `<span class="rm-stat ${cls}"><b>${n || 0}</b> ${label}</span>`;
  const chips = [
    ['all', 'Tout'],
    ['done', 'Done'],
    ['partial', 'Partial'],
    ['open', 'Open'],
    ['ops', 'Ops'],
    ['todo', 'Todo'],
  ]
    .map(
      ([f, l], idx) =>
        `<button class="rm-chip${idx === 0 ? ' active' : ''}" data-rm-filter="${f}">${l}</button>`,
    )
    .join('');
  return (
    `<section class="rm-dash">` +
    (gng ? `<div class="rm-gng ${gngCls}">${esc(gng.replace(/_/g, ' '))}</div>` : '') +
    (fm && fm.blockers ? `<div class="rm-blockers">🚩 Blockers launch — ${esc(fm.blockers)}</div>` : '') +
    (fm && fm.asof ? `<div class="rm-asof">État vérifié-code · ${esc(fm.asof)}</div>` : '') +
    `<div class="rm-bar big">` +
    seg(g.done, 'done') +
    seg(g.partial, 'partial') +
    seg(g.open, 'open') +
    seg(g.ops, 'ops') +
    seg(g.todo, 'todo') +
    `</div>` +
    `<div class="rm-dash-pct">${pct}% <span>livré · vérifié-code (toutes lanes, ${g.total} items)</span></div>` +
    `<div class="rm-stats">` +
    stat(g.done, 'done', 'done') +
    stat(g.partial, 'partial', 'partial') +
    stat(g.open, 'open', 'open') +
    stat(g.ops, 'ops', 'ops') +
    stat(g.todo, 'todo', 'todo') +
    `</div>` +
    `<div class="rm-filters">${chips}</div>` +
    `</section>`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dispatch one source file → { title, html }
// ─────────────────────────────────────────────────────────────────────────────
function renderSource(path, opts = {}) {
  const raw = readFileSync(path, 'utf8');
  const name = basename(path);
  if (extname(path).toLowerCase() === '.json') {
    let obj;
    try {
      obj = JSON.parse(raw);
    } catch (e) {
      return { title: name, html: `<pre><code>${esc(raw)}</code></pre>` };
    }
    return { title: obj.runId ? `${name} — ${obj.runId}` : name, html: renderJson(obj) };
  }
  const { fm, body } = splitFrontmatter(raw);
  // Roadmap mode: forced (--mode roadmap), declared (frontmatter kind: roadmap),
  // or inferred from the filename. Off → untouched generic doctrine render.
  RM =
    opts.mode === 'roadmap' ||
    (fm && String(fm.kind || '').toLowerCase() === 'roadmap') ||
    /roadmap/i.test(name);
  let html = '';
  if (RM) {
    const global = computeRoadmapStats(body);
    html += rmDashboard(global, fm || {});
    html += renderMarkdown(body);
    RM = false; // reset so a bundle's later (non-roadmap) sources render generically
    return { title: name, html, roadmap: true };
  }
  if (fm) {
    const items = Object.entries(fm)
      .map(([k, v]) => `<span><b>${esc(k)}</b> ${esc(Array.isArray(v) ? v.join(', ') : v)}</span>`)
      .join('');
    html += `<div class="kv">${items}</div>`;
  }
  html += renderMarkdown(body);
  return { title: name, html };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared style + shell — single source of the doctrine's visual language
// ─────────────────────────────────────────────────────────────────────────────
const STYLE = `
:root{--ink:#1f2933;--muted:#5a6672;--faint:#8a94a0;--bg:#fff;--panel:#f6f7f9;
--border:#e3e6ea;--accent:#3b5b7a;--accent2:#b06a3c}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-size:16px;line-height:1.6;
font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.wrap{max-width:820px;margin:0 auto;padding:56px 32px 96px}
header.doc{border-bottom:2px solid var(--accent);padding-bottom:24px;margin-bottom:36px}
.eyebrow{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--accent2);
font-weight:600;margin:0 0 10px}
h1{font-size:30px;line-height:1.2;margin:0 0 12px;font-weight:700;letter-spacing:-.01em}
.meta{margin-top:18px;font-size:13px;color:var(--faint);display:flex;flex-wrap:wrap;gap:6px 20px}
h2{font-size:21px;margin:48px 0 8px;font-weight:700;letter-spacing:-.01em}
h3{font-size:16px;margin:28px 0 6px;font-weight:650}
h4,h5,h6{margin:22px 0 6px}
p{margin:12px 0}
a{color:var(--accent)}
hr{border:0;border-top:1px solid var(--border);margin:32px 0}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.86em;
background:var(--panel);border:1px solid var(--border);border-radius:4px;padding:1px 5px}
pre{background:var(--panel);border:1px solid var(--border);border-radius:6px;padding:16px 18px;
overflow:auto;font-size:13.5px;line-height:1.5}
pre code{background:none;border:0;padding:0}
table{width:100%;border-collapse:collapse;margin:18px 0;font-size:14px}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--border);vertical-align:top}
th{font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);
border-bottom:2px solid var(--border)}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
blockquote{margin:16px 0;padding:2px 18px;border-left:3px solid var(--border);color:var(--muted)}
ul,ol{margin:12px 0;padding-left:22px}
li{margin:6px 0}
.cb{color:var(--accent);font-weight:700}
.kv{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:13px;color:var(--muted);
background:var(--panel);border:1px solid var(--border);border-radius:6px;padding:12px 16px;margin:0 0 8px}
.kv b{color:var(--ink);font-weight:600;margin-right:4px}
.chip{display:inline-block;font-size:12px;background:#e7eef5;color:var(--accent);
border-radius:20px;padding:2px 10px;margin:2px 0}
.muted{color:var(--muted)}
.verdict{display:inline-block;font-weight:700;font-size:13px;letter-spacing:.04em;
padding:4px 12px;border-radius:6px}
.verdict.ok{background:#e7eef5;color:var(--accent)}
.verdict.warn{background:#f3ece5;color:var(--accent2)}
.verdict.bad{background:#f6e7e3;color:#9a3412}
.finding{border:1px solid var(--border);border-radius:6px;padding:14px 16px;margin:12px 0}
.finding-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;margin-bottom:6px}
.finding-title{font-weight:600;margin:4px 0}
.suggestion{color:var(--muted)}
.sev{font-size:11px;font-weight:700;letter-spacing:.03em;padding:2px 8px;border-radius:4px}
.sev.crit{background:#f6e7e3;color:#9a3412}
.sev.high{background:#f3ece5;color:var(--accent2)}
.sev.med{background:#eef1f4;color:var(--accent)}
.sev.low{background:#eceff1;color:var(--muted)}
.axis{font-size:12px;color:var(--muted)}
.loc{font-size:12px}
dl{margin:8px 0;padding-left:14px;border-left:1px solid var(--border)}
dt{font-weight:600;font-size:13px;color:var(--accent);margin-top:8px}
dd{margin:2px 0 2px 8px}
nav.toc{background:var(--panel);border:1px solid var(--border);border-radius:6px;padding:14px 20px;margin:0 0 36px}
nav.toc strong{display:block;font-size:12px;letter-spacing:.08em;text-transform:uppercase;
color:var(--muted);margin-bottom:8px}
nav.toc a{display:block;padding:2px 0}
section.artifact{padding-top:8px}
section.artifact+section.artifact{margin-top:24px;border-top:1px solid var(--border)}
footer.doc{margin-top:56px;padding-top:18px;border-top:1px solid var(--border);
font-size:13px;color:var(--faint)}
/* ── roadmap mode ─────────────────────────────────────────────── */
:root{--rm-done:#2f7d4f;--rm-partial:#b06a3c;--rm-open:#b0413c;--rm-ops:#3b5b7a;--rm-todo:#9aa4b0}
.rm-pill{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.05em;
line-height:1.4;padding:1px 7px;border-radius:20px;vertical-align:1px;margin-right:2px;color:#fff}
.rm-pill.done{background:var(--rm-done)}.rm-pill.partial{background:var(--rm-partial)}
.rm-pill.open{background:var(--rm-open)}.rm-pill.ops{background:var(--rm-ops)}
.rm-pill.todo{background:#eceff1;color:var(--rm-todo);box-shadow:inset 0 0 0 1px var(--border)}
.rm-bar{display:flex;height:8px;border-radius:5px;overflow:hidden;background:var(--panel);
box-shadow:inset 0 0 0 1px var(--border);margin:8px 0 4px}
.rm-bar.big{height:14px;margin:14px 0 6px}
.rm-bar .seg.done{background:var(--rm-done)}.rm-bar .seg.partial{background:var(--rm-partial)}
.rm-bar .seg.open{background:var(--rm-open)}.rm-bar .seg.ops{background:var(--rm-ops)}
.rm-bar .seg.todo{background:#d6dbe0}
.rm-prog{margin:6px 0 10px}.rm-prog-meta{font-size:12px;color:var(--muted)}
.rm-prog-meta b{color:var(--ink)}
.rm-dash{background:var(--panel);border:1px solid var(--border);border-radius:10px;
padding:22px 24px;margin:0 0 32px}
.rm-gng{display:inline-block;font-weight:800;font-size:13px;letter-spacing:.08em;
padding:5px 14px;border-radius:6px;margin-bottom:10px}
.rm-gng.ok{background:#e3f0e8;color:var(--rm-done)}
.rm-gng.warn{background:#f3ece5;color:var(--rm-partial)}
.rm-gng.bad{background:#f6e7e3;color:var(--rm-open)}
.rm-blockers{font-size:14px;font-weight:600;color:var(--rm-open);margin:4px 0 8px}
.rm-asof{font-size:12px;color:var(--faint);margin-bottom:6px}
.rm-dash-pct{font-size:15px;font-weight:600;margin:2px 0 14px}
.rm-dash-pct span{color:var(--muted);font-weight:400;font-size:13px}
.rm-stats{display:flex;flex-wrap:wrap;gap:8px 10px;margin-bottom:16px}
.rm-stat{font-size:12.5px;color:var(--muted);padding:3px 11px;border-radius:20px;
background:#fff;box-shadow:inset 0 0 0 1px var(--border)}
.rm-stat b{color:var(--ink);font-weight:700}
.rm-stat.done b{color:var(--rm-done)}.rm-stat.partial b{color:var(--rm-partial)}
.rm-stat.open b{color:var(--rm-open)}.rm-stat.ops b{color:var(--rm-ops)}
.rm-filters{display:flex;flex-wrap:wrap;gap:6px}
.rm-chip{font:inherit;font-size:12px;cursor:pointer;border:1px solid var(--border);
background:#fff;color:var(--muted);border-radius:20px;padding:4px 13px;transition:.12s}
.rm-chip:hover{border-color:var(--accent);color:var(--accent)}
.rm-chip.active{background:var(--accent);color:#fff;border-color:var(--accent)}
[data-rm-status]{scroll-margin-top:12px}
@media print{
html,body{background:#fff;color:#000;font-size:11pt}
.wrap{max-width:none;padding:0}
a{color:#000;text-decoration:none}
.kv,.chip,code,pre,.verdict,.sev,.finding,nav.toc{background:transparent!important}
.finding,.kv,nav.toc,pre{border-color:#999}
h1,h2,h3{page-break-after:avoid}
h2,h3,table,pre,.finding,section.artifact{page-break-inside:avoid}
header.doc{page-break-after:avoid}
.rm-filters{display:none}
.rm-dash{background:transparent!important;border-color:#999}
.rm-pill,.rm-bar .seg,.rm-gng{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.rm-dash,.rm-prog,.rm-stat{page-break-inside:avoid}
@page{margin:18mm 16mm}
}`;

// Minimal self-contained filter for roadmap mode (no deps): status chips toggle
// visibility of [data-rm-status] rows/items. Inert when no such elements exist.
const FILTER_JS = `<script>
(function(){
  var chips=document.querySelectorAll('[data-rm-filter]');
  if(!chips.length)return;
  var items=document.querySelectorAll('[data-rm-status]');
  chips.forEach(function(c){c.addEventListener('click',function(){
    var f=c.getAttribute('data-rm-filter');
    chips.forEach(function(x){x.classList.remove('active')});c.classList.add('active');
    items.forEach(function(it){it.style.display=(f==='all'||it.getAttribute('data-rm-status')===f)?'':'none'});
  })});
})();
</script>`;

function shell({ title, eyebrow, metaItems, bodyHtml, roadmap }) {
  const meta = (metaItems || []).map((m) => `<span>${esc(m)}</span>`).join('');
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${STYLE}</style></head>
<body><div class="wrap">
<header class="doc">
<p class="eyebrow">${esc(eyebrow || 'Artifact')}</p>
<h1>${esc(title)}</h1>
${meta ? `<div class="meta">${meta}</div>` : ''}
</header>
${bodyHtml}
<footer class="doc">Généré par <code>scripts/render-artifact.mjs</code> — fichier HTML autonome, CSS inline, imprimable, sans dépendance externe. CLAUDE.md § Output format.</footer>
</div>${roadmap ? FILTER_JS : ''}</body></html>
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const inputs = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') opts.out = argv[++i];
    else if (a === '--title') opts.title = argv[++i];
    else if (a === '--eyebrow') opts.eyebrow = argv[++i];
    else if (a === '--mode') opts.mode = argv[++i];
    else if (a === '--quiet') opts.quiet = true;
    else if (a.startsWith('--')) throw new Error(`unknown flag: ${a}`);
    else inputs.push(a);
  }
  return { inputs, opts };
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function main() {
  const { inputs: requested, opts } = parseArgs(process.argv.slice(2));
  if (requested.length === 0) {
    console.error('usage: render-artifact.mjs <input...> [--out file.html] [--title "…"]');
    process.exit(2);
  }
  // Fail-open: skip missing inputs (a /team run may lack spec/review on pure-doc skips).
  const inputs = requested.filter((p) => {
    if (existsSync(p)) return true;
    console.error(`render-artifact: skipping missing input ${p}`);
    return false;
  });
  if (inputs.length === 0) {
    console.error('render-artifact: no existing inputs, nothing to render');
    process.exit(0);
  }

  let html, outPath;
  if (inputs.length === 1) {
    const r = renderSource(inputs[0], { mode: opts.mode });
    html = shell({
      title: opts.title || r.title,
      eyebrow: opts.eyebrow || (r.roadmap ? 'Roadmap' : undefined),
      metaItems: [basename(inputs[0])],
      bodyHtml: r.html,
      roadmap: r.roadmap,
    });
    outPath = opts.out ? resolve(opts.out) : resolve(inputs[0].replace(/\.(md|json)$/i, '') + '.html');
  } else {
    // bundle with TOC
    const parts = inputs.map((p) => {
      const r = renderSource(p, { mode: opts.mode });
      r.id = slug(r.title);
      return r;
    });
    const toc =
      `<nav class="toc"><strong>Sommaire</strong>` +
      parts.map((p) => `<a href="#${p.id}">${esc(p.title)}</a>`).join('') +
      `</nav>`;
    const sections = parts
      .map((p) => `<section class="artifact" id="${p.id}"><h2>${esc(p.title)}</h2>${p.html}</section>`)
      .join('\n');
    html = shell({
      title: opts.title || 'Rapport groupé',
      eyebrow: opts.eyebrow || 'Bundle',
      metaItems: [`${parts.length} artefacts`],
      bodyHtml: toc + sections,
      roadmap: parts.some((p) => p.roadmap),
    });
    outPath = resolve(opts.out || join('artifacts', 'bundle.html'));
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html, 'utf8');
  if (!opts.quiet) console.log(outPath);
}

main();
