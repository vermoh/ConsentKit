/* The three rendered pages must be exactly what site/src/ says they are.
 *
 * site/index.html, site/ru/index.html and site/ro/index.html are GENERATED from
 * site/src/index.template.html plus site/src/i18n/{en,ru,ro}.json. Nothing else
 * notices when someone edits a rendered page by hand: the edit survives until
 * the next build silently reverts it, and in the meantime one language says
 * something the other two do not. Same guard, and same reasoning, as
 * test/site-vendor.test.mjs.
 *
 * Fix a failure with: node tools/build-site.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  LANGS, DEFAULT_LANG, SRC_DIR, TEMPLATE,
  readDict, readTemplate, renderPage, renderSitemap, buildAll, outputs,
  pageUrl, jsonForScript
} from '../tools/build-site.mjs';

/* ------------------------------------------------------------ the outputs */

for (const f of buildAll()) {
  test(`${f.label} is in sync with site/src/`, () => {
    assert.ok(existsSync(f.path), `${f.label} is missing — run: node tools/build-site.mjs`);
    assert.equal(
      readFileSync(f.path, 'utf8'), f.content,
      `${f.label} is stale or hand-edited — run: node tools/build-site.mjs`
    );
  });
}

/* ------------------------------------------------------------ determinism */

test('the build is reproducible (rendering twice is byte-identical)', () => {
  // A build that embeds a timestamp, a hash-ordered object or a Date would pass
  // --check on the machine that wrote the files and fail on every other one.
  const a = buildAll();
  const b = buildAll();
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    assert.equal(a[i].label, b[i].label);
    assert.equal(a[i].content, b[i].content, `${a[i].label} differs between two builds`);
  }
});

/* -------------------------------------------------------- key completeness */

/* Every key the template asks for exists in all three dictionaries. A missing
   key would otherwise leave the template's own placeholder text — Russian — on
   the English and Romanian pages. (renderPage throws on a missing key, so this
   also documents the contract rather than only enforcing it.) */
test('every data-i18n key in the template exists in all three dictionaries', () => {
  const template = readTemplate();
  const keys = new Set();
  for (const m of template.matchAll(/\bdata-i18n="([^"]+)"/g)) keys.add(m[1]);
  for (const m of template.matchAll(/\bdata-i18n-aria-label="([^"]+)"/g)) keys.add(m[1]);

  assert.ok(keys.size > 20, `only ${keys.size} keys found in the template — did the parse break?`);

  for (const { code } of LANGS) {
    const dict = readDict(code);
    for (const key of keys) {
      assert.ok(Object.prototype.hasOwnProperty.call(dict, key),
        `site/src/i18n/${code}.json is missing "${key}", which the template uses`);
      assert.equal(typeof dict[key], 'string',
        `"${key}" in ${code}.json must be a string`);
    }
  }
});

test('the three dictionaries carry exactly the same keys', () => {
  // Plural forms are the trap: en has no grammatical "Few", but it must still
  // carry unitDayFew (same text as Many) or this parity check is a special-case
  // table instead of an invariant.
  const [base, ...rest] = LANGS.map((l) => ({ code: l.code, dict: readDict(l.code) }));
  const baseKeys = Object.keys(base.dict).sort();

  for (const other of rest) {
    const otherKeys = Object.keys(other.dict).sort();
    assert.deepEqual(otherKeys, baseKeys,
      `site/src/i18n/${other.code}.json and ${base.code}.json have different key sets`);
    for (const k of baseKeys) {
      assert.equal(typeof other.dict[k], typeof base.dict[k],
        `"${k}" has a different type in ${other.code}.json than in ${base.code}.json`);
    }
  }
});

test('the FAQ is the same shape in all three languages', () => {
  const shape = readDict(DEFAULT_LANG).faq;
  assert.ok(Array.isArray(shape) && shape.length > 0, 'faq must be a non-empty array');
  for (const { code } of LANGS) {
    const faq = readDict(code).faq;
    assert.ok(Array.isArray(faq), `faq in ${code}.json is not an array`);
    assert.equal(faq.length, shape.length,
      `faq in ${code}.json has ${faq.length} entries, ${DEFAULT_LANG}.json has ${shape.length}`);
    for (const qa of faq) {
      assert.ok(Array.isArray(qa) && qa.length === 2 &&
        typeof qa[0] === 'string' && typeof qa[1] === 'string',
        `every faq entry in ${code}.json must be a [question, answer] pair of strings`);
    }
  }
});

/* -------------------------------------------------------------- no dead keys */

/* A key nobody reads is copy someone has to translate three times for nothing.
   Two consumers, and both have to be scanned: the template's data-i18n
   attributes, and site/app.js — which reads roughly half the dictionary
   (the pricing labels, the plural units, the FAQ, the demo strings) by name
   through t()/plural()/fill(). The build itself consumes the head keys. */
test('no dictionary key is unused', () => {
  const template = readTemplate();
  const app = readFileSync(join(SRC_DIR, '..', 'app.js'), 'utf8');

  // Consumed by tools/build-site.mjs when it renders <html lang>/<title>/meta.
  const BUILD_KEYS = ['htmlLang', 'docTitle', 'docDesc', 'pageLanguage'];

  const used = new Set(BUILD_KEYS);
  for (const m of template.matchAll(/\bdata-i18n="([^"]+)"/g)) used.add(m[1]);
  for (const m of template.matchAll(/\bdata-i18n-aria-label="([^"]+)"/g)) used.add(m[1]);

  const dict = readDict(DEFAULT_LANG);
  const unused = [];

  const quoted = (s) => new RegExp(`['"\`]${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`).test(app);

  for (const key of Object.keys(dict)) {
    if (used.has(key)) continue;
    // A literal 'key' / "key" anywhere in app.js counts as a read: t('rowSites'),
    // fill('sitesUpTo', n), PLAN_ROWS entries and so on.
    if (quoted(key)) continue;
    // Read as a property rather than through t(): I18N.faq.
    if (new RegExp(`I18N\\.${key}\\b`).test(app)) continue;
    // plural() composes its key from a base plus One/Few/Many, so the suffixed
    // names never appear as literals — the base does.
    const base = key.replace(/(One|Few|Many)$/, '');
    if (base !== key && quoted(base)) continue;
    // The plan cards compose keys the other way round, from a prefix plus a
    // capitalised plan id: t('plan' + cap(plan)), t('support' + cap(plan)),
    // t('plan' + cap(plan) + 'Note'). Accept the key when app.js contains both
    // the literal prefix and the plan id it is joined with.
    const composed = key.match(/^([a-z]+)([A-Z][a-z]+)(Note)?$/);
    if (composed) {
      const [, prefix, Plan] = composed;
      const plan = Plan.charAt(0).toLowerCase() + Plan.slice(1);
      if (quoted(prefix) && quoted(plan)) continue;
    }
    unused.push(key);
  }

  assert.deepEqual(unused, [],
    `these keys are in the dictionaries but read by nothing: ${unused.join(', ')} — ` +
    'remove them from site/src/i18n/*.json, or use them');
});

/* ------------------------------------------------------------------- SEO */

test('each page carries its own canonical, lang and og:locale', () => {
  const template = readTemplate();
  for (const l of LANGS) {
    const html = renderPage(template, l.code);
    assert.match(html, new RegExp(`<html lang="${l.code}"`),
      `the ${l.code} page does not declare lang="${l.code}"`);
    assert.match(html,
      new RegExp(`<link rel="canonical" href="${pageUrl(l.dir).replace(/\//g, '\\/')}">`),
      `the ${l.code} page has the wrong canonical`);
    assert.match(html, new RegExp(`<meta property="og:locale" content="${l.ogLocale}">`));
  }
});

test('every page lists every language as an hreflang alternate, plus x-default', () => {
  const template = readTemplate();
  const xDefault = pageUrl(LANGS.find((l) => l.code === DEFAULT_LANG).dir);

  for (const l of LANGS) {
    const html = renderPage(template, l.code);
    for (const other of LANGS) {
      assert.ok(
        html.includes(`<link rel="alternate" hreflang="${other.code}" href="${pageUrl(other.dir)}">`),
        `the ${l.code} page is missing the ${other.code} hreflang alternate`);
    }
    assert.ok(html.includes(`<link rel="alternate" hreflang="x-default" href="${xDefault}">`),
      `the ${l.code} page is missing x-default`);
  }
});

test('the sitemap lists all three pages', () => {
  const xml = renderSitemap();
  for (const l of LANGS) {
    assert.ok(xml.includes(`<loc>${pageUrl(l.dir)}</loc>`),
      `sitemap.xml does not list the ${l.code} page`);
  }
  assert.equal((xml.match(/<loc>/g) || []).length, LANGS.length,
    'sitemap.xml lists a different number of URLs than there are languages');
});

test('the language switcher links to all three pages on every page', () => {
  const template = readTemplate();
  for (const l of LANGS) {
    const html = renderPage(template, l.code);
    for (const other of LANGS) {
      const href = other.dir ? '/' + other.dir : '/';
      assert.match(html, new RegExp(`<a class="lang-btn" href="${href.replace(/\//g, '\\/')}"`),
        `the ${l.code} page's switcher does not link to ${href}`);
    }
    // The switcher must be plain links, not the old JS-driven buttons.
    assert.doesNotMatch(html, /<button[^>]*class="lang-btn"/,
      `the ${l.code} page still renders the switcher as buttons`);
  }
});

/* --------------------------------------------------------- asset paths */

test('assets are referenced absolutely, so /ru and /ro resolve them', () => {
  // A relative "vendor/ck-core.js" on /ru would resolve to /ru/vendor/ck-core.js
  // and 404 — the demo would silently vanish on two pages out of three.
  const template = readTemplate();
  for (const l of LANGS) {
    const html = renderPage(template, l.code);
    for (const m of html.matchAll(/<script src="([^"]+)"/g)) {
      assert.ok(m[1].startsWith('/') || /^https?:/.test(m[1]),
        `the ${l.code} page loads "${m[1]}" relatively — it must start with /`);
    }
    for (const m of html.matchAll(/<link[^>]+href="([^"]+)"[^>]*>/g)) {
      const href = m[1];
      if (/^https?:/.test(href) || href.startsWith('#')) continue;
      assert.ok(href.startsWith('/'),
        `the ${l.code} page links "${href}" relatively — it must start with /`);
    }
  }
});

/* ------------------------------------------------------- inline dictionary */

test('the inlined dictionary cannot break out of its script block', () => {
  // Several strings legitimately contain the text "<script src>"; a raw
  // JSON.stringify would end the block there and truncate the page.
  const template = readTemplate();
  for (const l of LANGS) {
    const html = renderPage(template, l.code);
    const opens = (html.match(/<script\b/gi) || []).length;
    const closes = (html.match(/<\/script\s*>/gi) || []).length;
    assert.equal(closes, opens,
      `the ${l.code} page has ${opens} <script> and ${closes} </script> — ` +
      'the inlined dictionary escaped its block');
  }
});

test('jsonForScript escapes angle brackets but still parses as the same value', () => {
  const value = { a: '</script><img onerror=alert(1)>', b: 'plain' };
  const out = jsonForScript(value);
  assert.doesNotMatch(out, /<\/script/i);
  assert.doesNotMatch(out, /</);
  assert.deepEqual(JSON.parse(out), value, 'escaping changed the parsed value');
});

test('the rendered page inlines the dictionary of its own language', () => {
  const template = readTemplate();
  for (const l of LANGS) {
    const html = renderPage(template, l.code);
    const m = html.match(/window\.__CK_SITE_I18N=(\{[\s\S]*?\});<\/script>/);
    assert.ok(m, `the ${l.code} page does not inline a dictionary`);
    const parsed = JSON.parse(m[1].replace(/\\u003c/g, '<').replace(/\\u003e/g, '>'));
    assert.deepEqual(parsed, readDict(l.code),
      `the ${l.code} page inlines a dictionary that is not ${l.code}.json`);
  }
});

/* --------------------------------------------------------------- app.js */

test('app.js no longer switches language at runtime', () => {
  // The whole point of the build: language is a URL, not a stored preference.
  const app = readFileSync(join(SRC_DIR, '..', 'app.js'), 'utf8');
  assert.doesNotMatch(app, /ck_site_lang/, 'app.js still stores a language preference');
  assert.doesNotMatch(app, /navigator\.language/,
    'app.js still guesses the language from the browser');
  assert.doesNotMatch(app, /localStorage/,
    'app.js still touches localStorage for the page language');
});

test('the template is the only place page structure is authored', () => {
  assert.ok(existsSync(TEMPLATE), 'site/src/index.template.html is missing');
  for (const f of outputs()) {
    const html = readFileSync(f.path, 'utf8');
    assert.doesNotMatch(html, /\{\{[A-Z_]+\}\}/,
      `${f.label} still contains an unsubstituted {{PLACEHOLDER}}`);
  }
});
