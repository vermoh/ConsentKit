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
 *   src/ck-locales.js              de/fr/it/es strings for the banner marquee
 *        ->  site/index.html       (en, canonical /)
 *            site/ru/index.html    (ru, canonical /ru)
 *            site/ro/index.html    (ro, canonical /ro)
 *
 * The output is a pure function of those inputs: building twice produces
 * byte-identical files (no timestamps, no ordering by hash iteration), which is
 * what lets --check compare a fresh render against what is committed.
 *
 * Usage: node tools/build-site.mjs [--check]
 *   --check  verify only, exit 1 on drift (no writes)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { createHash } from 'node:crypto';

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

/* ---------------------------------------------------------- theme, before paint */

/* Owner, 07.09.2026: a manual «Тема» switch, three states, remembered.
 *
 * The stored choice has to reach <html> BEFORE the first paint, or a visitor
 * who chose «Тёмная» gets a white flash on every navigation while the
 * stylesheet resolves against a system preference that is about to be
 * overridden. That rules out app.js — and it also rules out the header slice's
 * own inline script, which runs only after ~70 lines of header markup have
 * been parsed. So this goes in <head>, immediately before the stylesheet link:
 * the attribute is on the element before any rule that reads it is fetched.
 *
 * `system` is the absence of the attribute, not a third value: with no
 * data-theme at all the CSS falls through to prefers-color-scheme, which is
 * exactly what «Как в системе» means. Wrapped in try/catch because reading
 * localStorage throws outright in a browser set to block site data, and a
 * theme preference is never worth a blank page. */
export const THEME_KEY = 'ck-site-theme';

export const THEME_BOOT =
  '<script>' +
  '(function(){try{' +
  "var t=localStorage.getItem('" + THEME_KEY + "');" +
  "if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);" +
  '}catch(e){}})();' +
  '</script>';

/* ------------------------------------------------------- dataLayer, first */

/* SPEC-V1.26 §2: `window.dataLayer` must be declared by the FIRST statement of
 * the FIRST script on the page — before the vendor client, before the theme
 * boot, before anything.
 *
 * WHY IT CANNOT LIVE IN analytics.js. ck-core.js pushes its Consent Mode
 * default at PARSE TIME, and it loads five scripts earlier than analytics.js.
 * The core does `global.dataLayer = global.dataLayer || []` defensively, so
 * nothing is lost either way — but then the array's identity is created by
 * whichever script happens to run first, and GTM's own snippet relies on the
 * array existing before it is read. Declaring it here makes the order a
 * property of the document rather than of the load sequence.
 *
 * It is one array literal and no behaviour: nothing is sent anywhere by
 * declaring it, which is precisely why it is safe to have before consent. */
export const DATALAYER_BOOT =
  '<script>window.dataLayer = window.dataLayer || [];</script>';

/* ------------------------------------------------------- asset versioning */

/* The pages used to reference /styles.css and /app.js bare, and Vercel caches
 * both hard. After a deploy that meant NEW HTML could render against OLD CSS —
 * the owner saw the previous header's dark bar under the new capsule. A query
 * string the file's own content decides fixes it without renaming anything:
 * /styles.css keeps working for anyone who links it directly, and the URL the
 * PAGES ask for changes exactly when the bytes change.
 *
 * Eight characters of sha256: enough that two builds of the same file never
 * collide in practice, short enough to stay readable in view-source. */
export const VERSIONED_ASSETS = [
  '/styles.css',
  '/app.js',
  '/analytics.js',
  '/vendor/ck-core.js',
  '/vendor/ck-locales.js',
  '/vendor/ck-ui-branding.js',
  '/vendor/ck-ui.js',
  '/vendor/ck-debug.js'
];

export function assetHash(urlPath) {
  const file = join(SITE_DIR, urlPath.replace(/^\//, ''));
  return createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 8);
}

/* Applied to the FINISHED html of every page, as the last step before the
   leftover-placeholder check: one pass catches the template's own references
   and the ones the two law renderers build by hand, so a new page cannot
   forget to version its assets. */
export function versionAssets(html) {
  const known = new Set(VERSIONED_ASSETS);
  return html.replace(
    /\b(href|src)="(\/(?:styles\.css|app\.js|analytics\.js|vendor\/[a-z0-9-]+\.js))"/g,
    (m, attr, path) => {
      if (!known.has(path)) return m;
      return attr + '="' + path + '?v=' + assetHash(path) + '"';
    }
  );
}

/* ------------------------------------------------- version and build date */

/* SPEC V1.13 §2.5 / owner remark 3: the fourth «Цифры» tile shows the banner
   version and the date it was built. Both are resolved HERE, at build time,
   and rendered into the markup — never fetched or computed by app.js, so a
   crawler and a visitor with JavaScript off see the same two values as
   everyone else, and the tile is filled before app.js has run. */
export const VERSION = JSON.parse(
  readFileSync(join(REPO, 'package.json'), 'utf8')
).version;

/* The build date, as YYYY-MM-DD.
 *
 * `new Date()` on its own would break the guarantee this file opens with — the
 * output is a pure function of its inputs — in the one way that matters most:
 * test/site-build.test.mjs compares the COMMITTED pages against a fresh
 * render, so a page built today would start failing `npm test` tomorrow, on
 * every machine, with nothing changed. CK_BUILD_DATE keeps that door open for
 * a deliberate rebuild (`CK_BUILD_DATE=2026-10-01 node tools/build-site.mjs`)
 * while the committed default keeps the render reproducible in between. */
export const BUILD_DATE = (() => {
  const env = process.env.CK_BUILD_DATE;
  if (env && /^\d{4}-\d{2}-\d{2}$/.test(env)) return env;
  if (env) throw new Error(`CK_BUILD_DATE must be YYYY-MM-DD, got "${env}"`);
  /* The default used to be a literal here, and it stayed at 2026-09-06 through
     two releases while the version tile above it moved on — the site said
     «0.5.19, обновлено 6 сентября» for a build made on the 8th. The one date
     that IS maintained per release is the README's size table, whose heading
     («ConsentKit 0.5.19, rebuilt 2026-09-08») test/readme-sizes.test.mjs
     forces to be re-measured on every version bump. So the build reads it
     from there, and insists the line names the CURRENT version: a README
     still describing the previous release is a release routine with a step
     missing, which should fail the build rather than ship a stale date. */
  const readme = readFileSync(join(REPO, 'README.md'), 'utf8');
  const m = new RegExp(
    'ConsentKit ' + VERSION.replace(/\./g, '\\.') + ', rebuilt (\\d{4}-\\d{2}-\\d{2})'
  ).exec(readme);
  if (!m) {
    throw new Error(
      `README.md has no "ConsentKit ${VERSION}, rebuilt YYYY-MM-DD" size-table line — re-measure the size tables for this version first`
    );
  }
  return m[1];
})();

/* The «N сервисов в базе с готовыми описаниями» tile. The catalogue lives in
   the private server repository (src/domain/services/cards/*), which this
   build cannot import; the number arrives through site/src/stats.json, written
   by the server's `npm run gen:site-stats` from the catalogue itself and
   guarded there by a parity test. Hand-editing the JSON is the same mistake as
   the literal «64» this replaces — the tile then counts a release that has
   already passed. */
export const SITE_STATS = (() => {
  const raw = JSON.parse(readFileSync(join(REPO, 'site', 'src', 'stats.json'), 'utf8'));
  if (!Number.isInteger(raw.services) || raw.services <= 0) {
    throw new Error('site/src/stats.json: "services" must be a positive integer');
  }
  return raw;
})();

/* «обновлено 6 сентября 2026» — from the dictionary's own pattern and its own
   month names. The names are the ones the «работаем с …» line already needed,
   which in Russian are genitive («сентября»), exactly the form a date reads in;
   the ORDER is in the pattern, so English can say «updated September 6, 2026»
   without the build knowing anything about English. */
export function updatedText(dict, iso = BUILD_DATE) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`bad build date "${iso}"`);
  const months = dict.statsMonths;
  if (!Array.isArray(months) || months.length !== 12) {
    throw new Error('statsMonths must carry twelve names');
  }
  if (typeof dict.statsUpdated !== 'string') {
    throw new Error('the dictionary has no "statsUpdated" pattern');
  }
  return dict.statsUpdated
    .split('{day}').join(String(parseInt(m[3], 10)))
    .split('{month}').join(months[parseInt(m[2], 10) - 1])
    .split('{year}').join(m[1]);
}

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
    /* data-lang is the analytics hook (SPEC-V1.26 §2, ck_lang_switch). The
       event needs the language this link LEADS to, and reading it off the
       label would mean matching on visible text; hreflang already carries it
       but is metadata a crawler reads, so it stays untouched and the hook is
       its own attribute. `lang_from` comes from <html lang> at click time. */
    return '        <a class="lang-btn" href="' + escapeAttr(href) + '"' +
      ' data-lang="' + l.code + '"' +
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
     the article to a section it does not have.

     SPEC V1.14.1 §1.1 moved «Демо», «Что умеет» and «Разработчикам» out of
     the header and into the FOOTER, where they are authored as the same bare
     anchors — so the footer needs the same rewrite the nav has always had. */
  const homeAnchors = (html) => html.replace(/href="#([a-z-]+)"/g, (m, id) =>
    'href="' + escapeAttr(pagePath(entry.dir)) + '#' + id + '"');
  const nav = homeAnchors(head);
  const footNav = homeAnchors(foot);

  const body = renderBody(page.body, lang);

  const html = [
    '<!DOCTYPE html>',
    '<html lang="' + escapeAttr(dict.htmlLang) + '">',
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
    DATALAYER_BOOT,
    THEME_BOOT,
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
    footNav,
    '',
    '<script>window.__CK_SITE_I18N=' + jsonForScript(runtimeDict(dict)) + ';</script>',
    '<script src="/app.js"></script>',
    '<script src="/analytics.js"></script>',
    '</body>',
    '</html>',
    ''
  ].join('\n');

  const versioned = versionAssets(html);

  const left = versioned.match(/\{\{[A-Z_]+\}\}/);
  if (left) throw new Error(`unsubstituted placeholder ${left[0]} in ${lang}/law/${page.slug}`);

  return versioned;
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
  /* Same rewrite as the article pages, header and footer alike — see the
     comment in renderLawPage. */
  const homeAnchors = (html) => html.replace(/href="#([a-z-]+)"/g, (m, id) =>
    'href="' + escapeAttr(pagePath(entry.dir)) + '#' + id + '"');
  const nav = homeAnchors(head);
  const footNav = homeAnchors(foot);

  const cards = pages.map((p) =>
    '        <article class="card">\n' +
    '          <h2><a href="' + escapeAttr(lawPath(entry.dir, p.slug)) + '">' +
      escapeHtml(p.title) + '</a></h2>\n' +
    '          <p>' + escapeHtml(p.description) + '</p>\n' +
    '        </article>').join('\n');

  const html = [
    '<!DOCTYPE html>',
    '<html lang="' + escapeAttr(dict.htmlLang) + '">',
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
    DATALAYER_BOOT,
    THEME_BOOT,
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
    footNav,
    '',
    '<script>window.__CK_SITE_I18N=' + jsonForScript(runtimeDict(dict)) + ';</script>',
    '<script src="/app.js"></script>',
    '<script src="/analytics.js"></script>',
    '</body>',
    '</html>',
    ''
  ].join('\n');

  const versioned = versionAssets(html);

  const left = versioned.match(/\{\{[A-Z_]+\}\}/);
  if (left) throw new Error(`unsubstituted placeholder ${left[0]} in ${lang}/law`);

  return versioned;
}

/* ------------------------------------------------------- banner marquee */

/* SPEC V1.14 §2.1: a horizontal strip of 8-10 STATIC replicas of the consent
 * banner — bar / box / modal, light and dark, in several languages and several
 * accents — so the visitor sees at a glance that the banner adapts, without a
 * single screenshot.
 *
 * Rendered here rather than authored in the template for two reasons:
 *
 *  1. de/fr/it/es come from src/ck-locales.js, which the dictionaries know
 *     nothing about. Reading the real client's own locale pack means the
 *     cards say exactly what the shipped banner says in those languages —
 *     they cannot drift into invented copy.
 *  2. applyDict()'s data-i18n regex matches up to the first closing tag of the
 *     SAME name, so ten nested translated <div>s would mis-slice silently.
 *     Baking the strings in at build time keeps that machinery out of it.
 */

/* ck-locales.js is a browser IIFE that publishes window.__ckLocales and
   no-ops under Node (`typeof window === 'undefined'` returns early). Running
   it in a vm context with a fake `window` is a read-only import: nothing is
   executed beyond building the dictionary object. */
let localesCache = null;
export function readClientLocales() {
  if (localesCache) return localesCache;
  const src = readFileSync(join(REPO, 'src', 'ck-locales.js'), 'utf8');
  const win = {};
  runInContext(src, createContext({ window: win }));
  if (!win.__ckLocales) throw new Error('src/ck-locales.js did not publish __ckLocales');
  localesCache = win.__ckLocales;
  return localesCache;
}

/* The card deck. Ten cards: every layout twice, both themes, seven languages,
   five accents. `lang` is either one of our three dictionary languages (the
   strings come from the page's own dictionary, so a Russian visitor reads
   Russian on the Russian cards) or a client locale code, in which case the
   strings come from ck-locales.js verbatim.

   Accents: #E63939 leads — SPEC V1.14 §1 puts the brand red first — followed
   by the four other demo swatches, so the strip matches the colours the demo
   below actually offers. */
export const MARQUEE_CARDS = [
  { layout: 'box',   theme: 'light', lang: 'self', accent: '#E63939' },
  { layout: 'bar',   theme: 'dark',  lang: 'de',   accent: '#127C56' },
  { layout: 'modal', theme: 'light', lang: 'fr',   accent: '#6B3FCB' },
  { layout: 'bar',   theme: 'light', lang: 'self', accent: '#2B50D8' },
  { layout: 'box',   theme: 'dark',  lang: 'it',   accent: '#C2570C' },
  { layout: 'modal', theme: 'dark',  lang: 'es',   accent: '#E63939' },
  { layout: 'bar',   theme: 'light', lang: 'ro',   accent: '#127C56' },
  { layout: 'box',   theme: 'light', lang: 'en',   accent: '#6B3FCB' },
  { layout: 'modal', theme: 'light', lang: 'ru',   accent: '#2B50D8' },
  { layout: 'bar',   theme: 'dark',  lang: 'self', accent: '#E63939' }
];

/* The four strings one card needs, resolved from whichever source owns them. */
export function cardStrings(card, dict, lang) {
  // 'self' = the language of the page being built; otherwise a named language.
  const code = card.lang === 'self' ? lang : card.lang;

  // One of our own three: the page dictionary already carries the replica copy.
  if (['ru', 'ro', 'en'].includes(code)) {
    const d = code === lang ? dict : readDict(code);
    return {
      code,
      title: d.mockTitle,
      text: d.mockText,
      accept: d.mockAccept,
      reject: d.mockReject,
      settings: d.mockSettings
    };
  }

  // A client locale: the real banner's own words in that language.
  const L = readClientLocales()[code];
  if (!L) throw new Error(`src/ck-locales.js has no locale "${code}" (marquee)`);
  return {
    code,
    title: L.bannerTitle,
    text: L.bannerText,
    accept: L.acceptAll,
    reject: L.rejectAll,
    settings: L.customize
  };
}

/* One card. The markup mirrors the hero replica's .shot-* component exactly,
   so both are styled by one block of CSS; the layout modifier only moves the
   banner within the frame. Inert by construction: aria-hidden on the strip,
   and every control is a <span>, so the tab order gains nothing and a screen
   reader hears the section's own heading instead of ten banners. */
export function renderMarqueeCard(card, dict, lang) {
  const s = cardStrings(card, dict, lang);
  const cls = ['shot', 'shot--' + card.layout, card.theme === 'dark' ? 'shot--dark' : ''].
    filter(Boolean).join(' ');
  // The accent is a literal from MARQUEE_CARDS above, never from the copy, but
  // it still goes through escapeAttr so the style attribute cannot be broken.
  const style = '--shot-accent: ' + escapeAttr(card.accent) + ';';

  return [
    '        <li class="marquee__item">',
    '          <div class="' + cls + '" style="' + style + '" lang="' + escapeAttr(s.code) + '">',
    '            <div class="shot-frame">',
    '              <div class="shot-bar"><span></span><span></span><span></span></div>',
    '              <div class="shot-page">',
    '                <span class="shot-line shot-line--title"></span>',
    '                <span class="shot-line"></span>',
    '                <span class="shot-line shot-line--short"></span>',
    '                <span class="shot-line"></span>',
    '              </div>',
    '              <div class="shot-banner">',
    '                <p class="shot-banner__title">' + escapeHtml(s.title) + '</p>',
    '                <p class="shot-banner__text">' + escapeHtml(s.text) + '</p>',
    '                <div class="shot-banner__actions">',
    '                  <span class="shot-btn shot-btn--accept">' + escapeHtml(s.accept) + '</span>',
    '                  <span class="shot-btn shot-btn--reject">' + escapeHtml(s.reject) + '</span>',
    '                  <span class="shot-btn shot-btn--settings">' + escapeHtml(s.settings) + '</span>',
    '                </div>',
    '              </div>',
    '            </div>',
    '          </div>',
    '        </li>'
  ].join('\n');
}

/* The whole strip. The deck is emitted TWICE inside one track: the animation
   translates the track by -50%, so as the first copy leaves the viewport the
   second is exactly where the first began and the loop is seamless. The
   duplicate is aria-hidden as well as being inside an aria-hidden strip —
   belt and braces, since it is literally the same ten cards again. */
export function renderMarquee(dict, lang) {
  const deck = MARQUEE_CARDS.map((c) => renderMarqueeCard(c, dict, lang)).join('\n');
  return [
    '      <div class="marquee" data-marquee>',
    '        <ul class="marquee__track">',
    deck,
    '        </ul>',
    '        <ul class="marquee__track" aria-hidden="true">',
    deck,
    '        </ul>',
    '      </div>'
  ].join('\n');
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
    DATALAYER_BOOT,
    THEME_BOOT,
    LAW_HOME: escapeAttr(lawIndexPath(entry.dir)),
    VERSION: escapeHtml(VERSION),
    SERVICES: String(SITE_STATS.services),
    BUILD_DATE: escapeHtml(updatedText(dict)),
    JSON_LD: faqJsonLd(dict),
    MARQUEE: renderMarquee(dict, lang),
    I18N_SCRIPT: i18nScript
  };

  for (const [key, value] of Object.entries(map)) {
    html = html.split('{{' + key + '}}').join(value);
  }

  html = versionAssets(html);

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
