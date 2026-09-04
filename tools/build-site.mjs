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
function langSwitch(current) {
  const rows = LANGS.map((l) => {
    const on = l.code === current;
    return '        <a class="lang-btn" href="' + escapeAttr(pagePath(l.dir)) + '"' +
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
function hreflangBlock() {
  const lines = LANGS.map((l) =>
    '<link rel="alternate" hreflang="' + l.code + '" href="' + escapeAttr(pageUrl(l.dir)) + '">');
  lines.push('<link rel="alternate" hreflang="x-default" href="' +
    escapeAttr(pageUrl(LANGS.find((l) => l.code === DEFAULT_LANG).dir)) + '">');
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

  return out;
}

export function renderPage(template, lang) {
  const entry = LANGS.find((l) => l.code === lang);
  if (!entry) throw new Error(`unknown language ${lang}`);
  const dict = readDict(lang);

  let html = applyDict(template, dict, lang);

  const i18nScript =
    '<script>window.__CK_SITE_I18N=' + jsonForScript(dict) + ';</script>';

  const map = {
    LANG: escapeAttr(dict.htmlLang),
    DOC_TITLE: escapeAttr(dict.docTitle),
    DOC_DESC: escapeAttr(dict.docDesc),
    CANONICAL: escapeAttr(pageUrl(entry.dir)),
    HREFLANG: hreflangBlock(),
    OG_LOCALE: entry.ogLocale,
    OG_LOCALE_ALT: ogLocaleAlt(lang),
    LANG_SWITCH: langSwitch(lang),
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
  const urls = LANGS.map((l) => {
    const alts = LANGS.map((a) =>
      '    <xhtml:link rel="alternate" hreflang="' + a.code + '" href="' + pageUrl(a.dir) + '"/>')
      .concat('    <xhtml:link rel="alternate" hreflang="x-default" href="' +
        pageUrl(LANGS.find((x) => x.code === DEFAULT_LANG).dir) + '"/>');
    return [
      '  <url>',
      '    <loc>' + pageUrl(l.dir) + '</loc>',
      ...alts,
      '    <changefreq>monthly</changefreq>',
      '    <priority>' + (l.code === DEFAULT_LANG ? '1.0' : '0.9') + '</priority>',
      '  </url>'
    ].join('\n');
  });
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

export function buildAll() {
  const template = readTemplate();
  const out = outputs().map((f) => ({ ...f, content: renderPage(template, f.lang) }));
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
