#!/usr/bin/env node
/* Render the public page in three languages from one template + three dictionaries.
 *
 * Why a build step for a page that deliberately has no build step: RU and EN
 * used to share one URL and swap strings at runtime from localStorage, so a
 * crawler that does not execute JavaScript only ever saw the Russian copy.
 * Rendering the dictionary INTO the markup gives each language its own URL,
 * its own <title>/description/og: pair and its own <html lang> — served as
 * static HTML, with no runtime language switching left in app.js at all.
 *
 *   site/src/index.template.html   structure, with {{PLACEHOLDERS}}
 *   site/src/i18n/{en,ru,ro}.json  the copy, one file per language
 *        ->  site/index.html       (en, canonical /)
 *            site/ru/index.html    (ru, canonical /ru)
 *            site/ro/index.html    (ro, canonical /ro)
 *
 * The output is a pure function of those four inputs: building twice produces
 * byte-identical files (no timestamps, no ordering by hash iteration), which is
 * what lets --check compare a fresh render against what is committed.
 *
 * Usage: node tools/build-site.mjs [--check]
 *   --check  verify only, exit 1 on drift (no writes)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const SITE_DIR = join(REPO, 'site');
export const SRC_DIR = join(SITE_DIR, 'src');
export const I18N_DIR = join(SRC_DIR, 'i18n');
export const TEMPLATE = join(SRC_DIR, 'index.template.html');

export const ORIGIN = 'https://consentkit.ecomconsult.net';

/* EN is the default language and owns the root URL; ru/ro live one directory
   down. `dir` is '' for the root so join() below yields site/index.html. */
export const LANGS = [
  { code: 'en', dir: '', label: 'EN', ogLocale: 'en_US' },
  { code: 'ru', dir: 'ru', label: 'RU', ogLocale: 'ru_RU' },
  { code: 'ro', dir: 'ro', label: 'RO', ogLocale: 'ro_RO' }
];

export const DEFAULT_LANG = 'en';

/* site/vercel.json sets cleanUrls:true and trailingSlash:false, so Vercel
   serves site/ru/index.html at /ru and redirects /ru/ -> /ru. Canonical,
   hreflang, the sitemap and the switcher links must all use the form Vercel
   actually serves, or every page would advertise a URL that 308s. */
export function pageUrl(dir) {
  return dir ? ORIGIN + '/' + dir : ORIGIN + '/';
}

export function pagePath(dir) {
  return dir ? '/' + dir : '/';
}

/* ------------------------------------------------------------- law pages */

/* SPEC V1.11 §3: each dictionary carries a `pages` array, and every entry
   renders one article under site/<lang>/law/<slug>/ (EN at site/law/<slug>/).
 *
 * The slug is per-language — /ru/law/cookie-moldova and /en/law/cookie-moldova
 * may differ — so the three translations of one article are tied together by
 * an explicit `id`, never by their position in the array. Matching by index
 * across three hand-edited JSON files is how /ru/law/<gdpr>'s hreflang ends up
 * pointing at the Moldova article the first time someone reorders one file. */
export function readPages(code) {
  const pages = readDict(code).pages;
  return Array.isArray(pages) ? pages : [];
}

/* The path Vercel serves, with cleanUrls:true and trailingSlash:false — the
   same discipline pageUrl() follows for the home pages, so canonical, hreflang,
   the sitemap and the in-page links all name the URL that answers 200 rather
   than one that 308s. */
export function lawPath(dir, slug) {
  return (dir ? '/' + dir : '') + '/law/' + slug;
}

export function lawUrl(dir, slug) {
  return ORIGIN + lawPath(dir, slug);
}

/* Every language's version of one article, keyed by language code. A page id
   the other dictionaries do not carry is a hard error: a law page that can only
   advertise one hreflang alternate is worse than no law page, because the
   other two languages silently 404 for anyone who follows the switcher. */
export function pageSiblings(id) {
  const out = {};
  for (const l of LANGS) {
    const entry = readPages(l.code).find((p) => p.id === id);
    if (!entry) throw new Error(`site/src/i18n/${l.code}.json has no page with id "${id}"`);
    if (!entry.slug) throw new Error(`page "${id}" in ${l.code}.json has no slug`);
    out[l.code] = entry;
  }
  return out;
}

/* ---------------------------------------------------------------- escaping */

/* Attribute values (title, description, og:*) go inside double quotes. The
   copy legitimately contains <script src>, quotes and ampersands — see the
   heroLine2 / feat1Text strings — so every one of those must be entity-encoded
   or the tag ends early and the rest of the sentence becomes markup. */
export function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* Element text content. Same reasoning, minus the quote handling. */
export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* The dictionary is inlined as JSON inside a <script> block, and several
   strings contain the literal text "<script src>". A raw JSON.stringify would
   therefore end the block at the first "</script" the browser's *HTML* parser
   sees — it does not know or care that the sequence sits inside a JS string.
   Escaping "<" as < is invisible to JSON.parse and to the eventual string
   value, and removes the sequence from the HTML parser's view entirely.
   U+2028/U+2029 are valid JSON but were line terminators in older JS parsers.
   Mirrors escapeForInlineScript() in tools/build-inline.mjs. */
export function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/* ------------------------------------------------------------------ inputs */

export function readDict(code) {
  return JSON.parse(readFileSync(join(I18N_DIR, code + '.json'), 'utf8'));
}

export function readTemplate() {
  return readFileSync(TEMPLATE, 'utf8');
}

/* ------------------------------------------------------------------ render */

/* Three links, not buttons: each language is a real URL now, so the switcher
   has to be crawlable and work without JavaScript. The current language is
   marked aria-current and still rendered as a link to its own page, which
   keeps the control group visually identical to the old button row. */
function langSwitch(current, paths) {
  const rows = LANGS.map((l) => {
    const on = l.code === current;
    const href = paths ? paths[l.code] : pagePath(l.dir);
    return '        <a class="lang-btn" href="' + escapeAttr(href) + '"' +
      ' hreflang="' + l.code + '" lang="' + l.code + '"' +
      (on ? ' aria-current="page"' : '') +
      ' aria-pressed="' + (on ? 'true' : 'false') + '">' + l.label + '</a>';
  });
  return '      <div class="lang-switch" role="group" aria-label="' +
    escapeAttr(readDict(current).pageLanguage) + '">\n' +
    rows.join('\n') + '\n      </div>';
}

/* Every page advertises all three languages plus x-default, and x-default is
   EN — the root URL, which is what a visitor with an unmatched language gets. */
function hreflangBlock(urls) {
  const lines = LANGS.map((l) =>
    '<link rel="alternate" hreflang="' + l.code + '" href="' +
    escapeAttr(urls ? urls[l.code] : pageUrl(l.dir)) + '">');
  const xDefault = DEFAULT_LANG;
  lines.push('<link rel="alternate" hreflang="x-default" href="' +
    escapeAttr(urls ? urls[xDefault] : pageUrl(LANGS.find((l) => l.code === xDefault).dir)) + '">');
  return lines.join('\n');
}

function ogLocaleAlt(current) {
  return LANGS.filter((l) => l.code !== current)
    .map((l) => '<meta property="og:locale:alternate" content="' + l.ogLocale + '">')
    .join('\n');
}

/* Substitute every data-i18n / data-i18n-aria-label element in the template.
 *
 * A regex rather than a DOM parser because the repository has zero
 * dependencies and the template is ours: the attribute is always written in
 * the same shape, and a key the dictionary does not carry is a hard error
 * rather than a silent passthrough, so a typo cannot ship as Russian text on
 * the English page. */
function applyDict(html, dict, lang) {
  let out = html;

  // <tag ... data-i18n="key" ...>OLD TEXT</tag>  ->  translated text
  out = out.replace(
    /(<([a-zA-Z][\w-]*)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>)([\s\S]*?)(<\/\2>)/g,
    (m, open, tag, key, _old, close) => {
      if (!Object.prototype.hasOwnProperty.call(dict, key)) {
        throw new Error(`site/src/i18n/${lang}.json has no key "${key}" (data-i18n)`);
      }
      const v = dict[key];
      if (typeof v !== 'string') {
        throw new Error(`key "${key}" in ${lang}.json is not a string`);
      }
      return open + escapeHtml(v) + close;
    }
  );

  // data-i18n-aria-label="key" -> aria-label="translated"
  out = out.replace(/aria-label="[^"]*"(\s+data-i18n-aria-label="([^"]+)")/g, (m, attr, key) => {
    if (!Object.prototype.hasOwnProperty.call(dict, key)) {
      throw new Error(`site/src/i18n/${lang}.json has no key "${key}" (data-i18n-aria-label)`);
    }
    return 'aria-label="' + escapeAttr(dict[key]) + '"' + attr;
  });

  /* data-i18n-alt="key" -> alt="translated". A separate branch because <img>
     is a void element: the data-i18n rule above needs a closing tag to find
     the text node it replaces, and an <img> has none. SPEC V1.11 §3 asks for
     the four step screenshots to carry alt copy in each language. */
  out = out.replace(/alt="[^"]*"(\s+data-i18n-alt="([^"]+)")/g, (m, attr, key) => {
    if (!Object.prototype.hasOwnProperty.call(dict, key)) {
      throw new Error(`site/src/i18n/${lang}.json has no key "${key}" (data-i18n-alt)`);
    }
    return 'alt="' + escapeAttr(dict[key]) + '"' + attr;
  });

  // data-i18n-placeholder="key" -> placeholder="translated". Same reason as
  // the alt branch: <input> is void, so data-i18n cannot reach it.
  out = out.replace(/placeholder="[^"]*"(\s+data-i18n-placeholder="([^"]+)")/g, (m, attr, key) => {
    if (!Object.prototype.hasOwnProperty.call(dict, key)) {
      throw new Error(`site/src/i18n/${lang}.json has no key "${key}" (data-i18n-placeholder)`);
    }
    return 'placeholder="' + escapeAttr(dict[key]) + '"' + attr;
  });

  return out;
}

/* What site/app.js is given at runtime.
 *
 * `pages` is the four law articles — several kilobytes of prose that the build
 * renders into their own HTML files and that app.js never reads. Inlining it
 * into every home page would ship the whole «Правила» section three times over
 * inside a <script> block nobody parses. Strip it at the boundary, once. */
export function runtimeDict(dict) {
  const out = {};
  for (const [k, v] of Object.entries(dict)) {
    if (k === 'pages') continue;
    out[k] = v;
  }
  return out;
}

/* ------------------------------------------------------------- FAQ / JSON-LD */

/* SPEC V1.11 §3: «каждый ответ получает свой якорь и микроразметку FAQPage».
 *
 * The anchor is derived from the question's position, not from its text: the
 * three languages ask the same questions in three alphabets, and a URL that
 * reads #vopros-3 in Russian and #question-3 in English is two anchors for one
 * answer. A stable q1..qN is the same fragment on all three pages, so a link
 * pasted from /ru still lands on the right answer on /. */
export function faqAnchor(i) {
  return 'q' + (i + 1);
}

/* The FAQPage block Google reads. Built from the SAME dictionary array the
   visible <details> list is rendered from — one source, so an answer cannot be
   edited on screen and stay stale in the markup a crawler sees, which is the
   failure mode structured data is notorious for.

   jsonForScript, not JSON.stringify: the RU blocking answer contains the
   literal text «<script src>» and type="text/plain". A raw stringify ends the
   ld+json block at that "<", truncating the page — and renderPage's own
   opener/closer count would (correctly) throw on the way out. */
export function faqJsonLd(dict) {
  const items = Array.isArray(dict.faq) ? dict.faq : [];
  if (!items.length) return '';
  const data = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(([q, a]) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a }
    }))
  };
  return '<script type="application/ld+json">' + jsonForScript(data) + '</script>';
}

/* ------------------------------------------------------ markdown-lite bodies */

/* The article bodies live in the dictionaries as arrays of short markup lines,
   because JSON has no multi-line string and a 600-word article written as one
   escaped blob is unreviewable in a diff.
 *
 * Deliberately four constructs and no more — "## " heading, "- " list item,
 * "> " callout, and anything else a paragraph. Inline formatting is limited to
 * [text](href) links. Everything is escaped first and the small set of tags is
 * re-introduced after, so a stray "<" in the copy can never open an element:
 * the renderer's vocabulary is fixed by this function, not by what an author
 * happens to type into the JSON. */
export function renderBody(lines, lang) {
  if (!Array.isArray(lines)) throw new Error(`page body in ${lang}.json is not an array`);

  const inline = (s) => escapeHtml(s).replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (m, text, href) => '<a href="' + escapeAttr(href) + '">' + text + '</a>');

  const out = [];
  let list = null;

  const closeList = () => {
    if (list) { out.push('        <ul>\n' + list.join('\n') + '\n        </ul>'); list = null; }
  };

  for (const raw of lines) {
    const line = String(raw);
    if (line.startsWith('- ')) {
      (list = list || []).push('          <li>' + inline(line.slice(2)) + '</li>');
      continue;
    }
    closeList();
    if (!line.trim()) continue;
    if (line.startsWith('## ')) {
      out.push('        <h2>' + inline(line.slice(3)) + '</h2>');
    } else if (line.startsWith('> ')) {
      out.push('        <p class="law-note">' + inline(line.slice(2)) + '</p>');
    } else {
      out.push('        <p>' + inline(line) + '</p>');
    }
  }
  closeList();
  return out.join('\n');
}

/* Word count, for the 400–700 word budget SPEC V1.11 §3 sets per article. The
   markup prefixes and link syntax are stripped first so "## " and "](/law/x)"
   do not inflate the count the test asserts on. */
export function bodyWords(lines) {
  return (Array.isArray(lines) ? lines : [])
    .map((l) => String(l)
      .replace(/^(##\s|-\s|>\s)/, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'))
    .join(' ')
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w))
    .length;
}

/* --------------------------------------------------------------- law pages */

/* The «Правила» hub — the nav item and the footer group point here, and it
   lists the four articles in the current language. */
export function lawIndexPath(dir) {
  return (dir ? '/' + dir : '') + '/law';
}

export function lawIndexUrl(dir) {
  return ORIGIN + lawIndexPath(dir);
}

/* The header and footer are sliced out of index.template.html rather than
   copied into a second template: two copies of a header is two places to
   change a nav item, and the copy that is not the home page's is the one that
   silently drifts. The markers are ordinary HTML comments in the template, so
   the home page is unaffected by their presence. */
function slice(template, marker) {
  const open = '<!--' + marker + ':start-->';
  const close = '<!--' + marker + ':end-->';
  const a = template.indexOf(open);
  const b = template.indexOf(close);
  if (a < 0 || b < 0) {
    throw new Error(`site/src/index.template.html has no ${open} … ${close} block`);
  }
  return template.slice(a + open.length, b);
}

export function renderLawPage(template, lang, page) {
  const entry = LANGS.find((l) => l.code === lang);
  if (!entry) throw new Error(`unknown language ${lang}`);
  const dict = readDict(lang);
  const sib = pageSiblings(page.id);

  const urls = {};
  const paths = {};
  for (const l of LANGS) {
    urls[l.code] = lawUrl(l.dir, sib[l.code].slug);
    paths[l.code] = lawPath(l.dir, sib[l.code].slug);
  }

  const head = applyDict(slice(template, 'HEADER'), dict, lang)
    .replace('{{LANG_SWITCH}}', langSwitch(lang, paths))
    .split('{{LAW_HOME}}').join(escapeAttr(lawIndexPath(entry.dir)));
  const foot = applyDict(slice(template, 'FOOTER'), dict, lang)
    .split('{{LAW_HOME}}').join(escapeAttr(lawIndexPath(entry.dir)));
  const form = applyDict(slice(template, 'CHECKFORM'), dict, lang);

  /* A nav item on the home page is an in-page #anchor; from /law/<slug> the
     same href has to travel back to the home page first, or «Тарифы» scrolls
     the article to a section it does not have. */
  const nav = head.replace(/href="#([a-z-]+)"/g, (m, id) =>
    'href="' + escapeAttr(pagePath(entry.dir)) + '#' + id + '"');

  const body = renderBody(page.body, lang);

  const html = [
    '<!DOCTYPE html>',
    '<html lang="' + escapeAttr(dict.htmlLang) + '" data-theme="light">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>' + escapeAttr(page.title) + '</title>',
    '<meta name="description" content="' + escapeAttr(page.description) + '">',
    '<meta name="robots" content="index, follow">',
    '<link rel="canonical" href="' + escapeAttr(urls[lang]) + '">',
    hreflangBlock(urls),
    '<meta property="og:type" content="article">',
    '<meta property="og:site_name" content="ConsentKit">',
    '<meta property="og:url" content="' + escapeAttr(urls[lang]) + '">',
    '<meta property="og:title" content="' + escapeAttr(page.title) + '">',
    '<meta property="og:description" content="' + escapeAttr(page.description) + '">',
    '<meta property="og:image" content="' + ORIGIN + '/og.png">',
    '<meta property="og:locale" content="' + entry.ogLocale + '">',
    ogLocaleAlt(lang),
    '<meta name="twitter:card" content="summary_large_image">',
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
    '<link rel="stylesheet" href="/styles.css">',
    '</head>',
    '<body>',
    '',
    '<a class="skip" href="#main">' + escapeHtml(dict.skip) + '</a>',
    nav,
    '',
    '<main id="main" class="law">',
    '  <article class="wrap wrap--narrow law-article">',
    '    <p class="law-crumb"><a href="' + escapeAttr(lawIndexPath(entry.dir)) + '">' +
      escapeHtml(dict.navLaw) + '</a></p>',
    '    <h1>' + escapeHtml(page.title) + '</h1>',
    '    <p class="law-dated">' + escapeHtml(dict.lawDated) + '</p>',
    '    <div class="law-body">',
    body,
    '    </div>',
    '  </article>',
    '',
    '  <section class="band law-check">',
    '    <div class="wrap wrap--narrow">',
    form,
    '    </div>',
    '  </section>',
    '</main>',
    '',
    foot,
    '',
    '<script>window.__CK_SITE_I18N=' + jsonForScript(runtimeDict(dict)) + ';</script>',
    '<script src="/app.js"></script>',
    '</body>',
    '</html>',
    ''
  ].join('\n');

  const left = html.match(/\{\{[A-Z_]+\}\}/);
  if (left) throw new Error(`unsubstituted placeholder ${left[0]} in ${lang}/law/${page.slug}`);

  return html;
}

/* The hub page: one list of the four articles, in the current language. */
export function renderLawIndex(template, lang) {
  const entry = LANGS.find((l) => l.code === lang);
  const dict = readDict(lang);
  const pages = readPages(lang);

  const urls = {};
  const paths = {};
  for (const l of LANGS) {
    urls[l.code] = lawIndexUrl(l.dir);
    paths[l.code] = lawIndexPath(l.dir);
  }

  const head = applyDict(slice(template, 'HEADER'), dict, lang)
    .replace('{{LANG_SWITCH}}', langSwitch(lang, paths))
    .split('{{LAW_HOME}}').join(escapeAttr(lawIndexPath(entry.dir)));
  const foot = applyDict(slice(template, 'FOOTER'), dict, lang)
    .split('{{LAW_HOME}}').join(escapeAttr(lawIndexPath(entry.dir)));
  const form = applyDict(slice(template, 'CHECKFORM'), dict, lang);
  const nav = head.replace(/href="#([a-z-]+)"/g, (m, id) =>
    'href="' + escapeAttr(pagePath(entry.dir)) + '#' + id + '"');

  const cards = pages.map((p) =>
    '        <article class="card">\n' +
    '          <h2><a href="' + escapeAttr(lawPath(entry.dir, p.slug)) + '">' +
      escapeHtml(p.title) + '</a></h2>\n' +
    '          <p>' + escapeHtml(p.description) + '</p>\n' +
    '        </article>').join('\n');

  const html = [
    '<!DOCTYPE html>',
    '<html lang="' + escapeAttr(dict.htmlLang) + '" data-theme="light">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>' + escapeAttr(dict.lawIndexTitle) + '</title>',
    '<meta name="description" content="' + escapeAttr(dict.lawIndexDesc) + '">',
    '<meta name="robots" content="index, follow">',
    '<link rel="canonical" href="' + escapeAttr(urls[lang]) + '">',
    hreflangBlock(urls),
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="ConsentKit">',
    '<meta property="og:url" content="' + escapeAttr(urls[lang]) + '">',
    '<meta property="og:title" content="' + escapeAttr(dict.lawIndexTitle) + '">',
    '<meta property="og:description" content="' + escapeAttr(dict.lawIndexDesc) + '">',
    '<meta property="og:image" content="' + ORIGIN + '/og.png">',
    '<meta property="og:locale" content="' + entry.ogLocale + '">',
    ogLocaleAlt(lang),
    '<meta name="twitter:card" content="summary_large_image">',
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
    '<link rel="stylesheet" href="/styles.css">',
    '</head>',
    '<body>',
    '',
    '<a class="skip" href="#main">' + escapeHtml(dict.skip) + '</a>',
    nav,
    '',
    '<main id="main" class="law">',
    '  <section>',
    '    <div class="wrap wrap--narrow">',
    '      <h1>' + escapeHtml(dict.lawIndexTitle) + '</h1>',
    '      <p class="section-lede">' + escapeHtml(dict.lawIndexLede) + '</p>',
    '      <p class="law-dated">' + escapeHtml(dict.lawDated) + '</p>',
    '      <div class="cards law-list">',
    cards,
    '      </div>',
    '    </div>',
    '  </section>',
    '',
    '  <section class="band law-check">',
    '    <div class="wrap wrap--narrow">',
    form,
    '    </div>',
    '  </section>',
    '</main>',
    '',
    foot,
    '',
    '<script>window.__CK_SITE_I18N=' + jsonForScript(runtimeDict(dict)) + ';</script>',
    '<script src="/app.js"></script>',
    '</body>',
    '</html>',
    ''
  ].join('\n');

  const left = html.match(/\{\{[A-Z_]+\}\}/);
  if (left) throw new Error(`unsubstituted placeholder ${left[0]} in ${lang}/law`);

  return html;
}

export function renderPage(template, lang) {
  const entry = LANGS.find((l) => l.code === lang);
  if (!entry) throw new Error(`unknown language ${lang}`);
  const dict = readDict(lang);

  let html = applyDict(template, dict, lang);

  const i18nScript =
    '<script>window.__CK_SITE_I18N=' + jsonForScript(runtimeDict(dict)) + ';</script>';

  const map = {
    LANG: escapeAttr(dict.htmlLang),
    DOC_TITLE: escapeAttr(dict.docTitle),
    DOC_DESC: escapeAttr(dict.docDesc),
    CANONICAL: escapeAttr(pageUrl(entry.dir)),
    HREFLANG: hreflangBlock(),
    OG_LOCALE: entry.ogLocale,
    OG_LOCALE_ALT: ogLocaleAlt(lang),
    LANG_SWITCH: langSwitch(lang),
    LAW_HOME: escapeAttr(lawIndexPath(entry.dir)),
    JSON_LD: faqJsonLd(dict),
    I18N_SCRIPT: i18nScript
  };

  for (const [key, value] of Object.entries(map)) {
    html = html.split('{{' + key + '}}').join(value);
  }

  const left = html.match(/\{\{[A-Z_]+\}\}/);
  if (left) throw new Error(`unsubstituted placeholder ${left[0]} in the ${lang} page`);

  // Belt and braces, exactly like build-inline.mjs: an unescaped "</script"
  // inside the inlined dictionary would truncate the page silently.
  const closers = (html.match(/<\/script\s*>/gi) || []).length;
  const openers = (html.match(/<script\b/gi) || []).length;
  if (closers !== openers) {
    throw new Error(`internal: ${openers} <script> vs ${closers} </script> in the ${lang} page — ` +
      'the inlined dictionary probably broke out of its block');
  }

  return html;
}

/* ----------------------------------------------------------------- sitemap */

export function renderSitemap() {
  const block = (loc, alts, priority) => [
    '  <url>',
    '    <loc>' + loc + '</loc>',
    ...LANGS.map((a) =>
      '    <xhtml:link rel="alternate" hreflang="' + a.code + '" href="' + alts[a.code] + '"/>'),
    '    <xhtml:link rel="alternate" hreflang="x-default" href="' + alts[DEFAULT_LANG] + '"/>',
    '    <changefreq>monthly</changefreq>',
    '    <priority>' + priority + '</priority>',
    '  </url>'
  ].join('\n');

  const homeAlts = Object.fromEntries(LANGS.map((l) => [l.code, pageUrl(l.dir)]));
  const urls = LANGS.map((l) =>
    block(pageUrl(l.dir), homeAlts, l.code === DEFAULT_LANG ? '1.0' : '0.9'));

  // The «Правила» hub, then one entry per article per language. Same alternate
  // set the pages themselves advertise, resolved through the id so a reordered
  // dictionary cannot cross-link two different articles.
  const lawAlts = Object.fromEntries(LANGS.map((l) => [l.code, lawIndexUrl(l.dir)]));
  for (const l of LANGS) urls.push(block(lawIndexUrl(l.dir), lawAlts, '0.6'));

  for (const p of readPages(DEFAULT_LANG)) {
    const sib = pageSiblings(p.id);
    const alts = Object.fromEntries(LANGS.map((l) => [l.code, lawUrl(l.dir, sib[l.code].slug)]));
    for (const l of LANGS) urls.push(block(lawUrl(l.dir, sib[l.code].slug), alts, '0.7'));
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    '        xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    '</urlset>',
    ''
  ].join('\n');
}

/* ------------------------------------------------------------------ output */

/* What the build owns. Anything here is generated: edit the template or the
   dictionaries instead. */
export function outputs() {
  const files = LANGS.map((l) => ({
    path: l.dir ? join(SITE_DIR, l.dir, 'index.html') : join(SITE_DIR, 'index.html'),
    label: l.dir ? `site/${l.dir}/index.html` : 'site/index.html',
    lang: l.code
  }));
  return files;
}

/* The «Правила» hub and the four articles, per language: site/law/<slug>/ for
   EN at the root, site/<lang>/law/<slug>/ for ru and ro. A directory with an
   index.html rather than a flat <slug>.html, so Vercel's cleanUrls serves the
   article at /law/<slug> — the URL canonical and hreflang advertise. */
export function lawOutputs() {
  const files = [];
  for (const l of LANGS) {
    const base = l.dir ? join(SITE_DIR, l.dir, 'law') : join(SITE_DIR, 'law');
    const label = (l.dir ? `site/${l.dir}/law` : 'site/law');
    files.push({ path: join(base, 'index.html'), label: `${label}/index.html`, lang: l.code, page: null });
    for (const p of readPages(l.code)) {
      files.push({
        path: join(base, p.slug, 'index.html'),
        label: `${label}/${p.slug}/index.html`,
        lang: l.code,
        page: p
      });
    }
  }
  return files;
}

export function buildAll() {
  const template = readTemplate();
  const out = outputs().map((f) => ({ ...f, content: renderPage(template, f.lang) }));
  for (const f of lawOutputs()) {
    out.push({
      ...f,
      content: f.page ? renderLawPage(template, f.lang, f.page) : renderLawIndex(template, f.lang)
    });
  }
  out.push({
    path: join(SITE_DIR, 'sitemap.xml'),
    label: 'site/sitemap.xml',
    lang: null,
    content: renderSitemap()
  });
  return out;
}

function main() {
  const check = process.argv.includes('--check');
  let drift = 0;

  for (const f of buildAll()) {
    const have = existsSync(f.path) ? readFileSync(f.path, 'utf8') : null;
    if (have === f.content) {
      console.log(`  ok    ${f.label}`);
      continue;
    }
    drift++;
    if (check) {
      console.error(`  DRIFT ${f.label}${have === null ? ' (missing)' : ''}`);
    } else {
      mkdirSync(dirname(f.path), { recursive: true });
      writeFileSync(f.path, f.content, 'utf8');
      console.log(`  write ${f.label}`);
    }
  }

  if (check && drift) {
    console.error(`\n${drift} file(s) out of date — run: node tools/build-site.mjs`);
    process.exit(1);
  }
  console.log(check ? '\nsite/ is in sync with site/src/.' : '\nsite/ rebuilt.');
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
