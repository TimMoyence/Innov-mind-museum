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
// Supported sources: markdown (STORY.md, spec.md, design.md, tasks.md, lessons),
// JSON with a `findings[]` array (code-review / security / verify), lesson JSON
// (`trigger`/`whatWorked`/…), and any other JSON (pretty tree fallback).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';

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
    return `\uE000C${codes.length - 1}\uE000`;
  });
  text = esc(text);
  // links — both halves are already entity-safe post-escape
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${u}">${t}</a>`);
  // bold then italic
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  text = text.replace(/(^|[^A-Za-z0-9_])_([^_\n]+)_(?![A-Za-z0-9_])/g, '$1<em>$2</em>');
  // restore code spans (escaped)
  text = text.replace(/\uE000C(\d+)\uE000/g, (_, i) => `<code>${esc(codes[+i])}</code>`);
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
      out.push(`<h${lvl}>${inline(h[2].replace(/\s+#+\s*$/, ''))}</h${lvl}>`);
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
        t += '<tr>';
        for (let j = 0; j < head.length; j++) t += `<td>${inline(r[j] ?? '')}</td>`;
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
        const text = cb
          ? `<span class="cb">${cb[1].trim() ? '☑' : '☐'}</span> ${inline(cb[2])}`
          : inline(content);
        if (indent >= 2) {
          if (!openNested) {
            html = html.replace(/<\/li>$/, '');
            html += `<${tag === 'ol' ? 'ol' : 'ul'}>`;
            openNested = tag;
          }
          html += `<li>${text}</li>`;
        } else {
          if (openNested) {
            html += `</${openNested}></li>`;
            openNested = null;
          }
          html += `<li>${text}</li>`;
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
// Dispatch one source file → { title, html }
// ─────────────────────────────────────────────────────────────────────────────
function renderSource(path) {
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
  let html = '';
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
@media print{
html,body{background:#fff;color:#000;font-size:11pt}
.wrap{max-width:none;padding:0}
a{color:#000;text-decoration:none}
.kv,.chip,code,pre,.verdict,.sev,.finding,nav.toc{background:transparent!important}
.finding,.kv,nav.toc,pre{border-color:#999}
h1,h2,h3{page-break-after:avoid}
h2,h3,table,pre,.finding,section.artifact{page-break-inside:avoid}
header.doc{page-break-after:avoid}
@page{margin:18mm 16mm}
}`;

function shell({ title, eyebrow, metaItems, bodyHtml }) {
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
</div></body></html>
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
    const { title, html: body } = renderSource(inputs[0]);
    html = shell({
      title: opts.title || title,
      eyebrow: opts.eyebrow,
      metaItems: [basename(inputs[0])],
      bodyHtml: body,
    });
    outPath = opts.out ? resolve(opts.out) : resolve(inputs[0].replace(/\.(md|json)$/i, '') + '.html');
  } else {
    // bundle with TOC
    const parts = inputs.map((p) => {
      const r = renderSource(p);
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
    });
    outPath = resolve(opts.out || join('artifacts', 'bundle.html'));
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html, 'utf8');
  if (!opts.quiet) console.log(outPath);
}

main();
