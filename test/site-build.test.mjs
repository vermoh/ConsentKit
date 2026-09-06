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
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  LANGS, DEFAULT_LANG, SRC_DIR, SITE_DIR, TEMPLATE,
  readDict, readTemplate, renderPage, renderSitemap, buildAll, outputs,
  pageUrl, jsonForScript, runtimeDict,
  readPages, pageSiblings, lawUrl, lawPath, lawIndexUrl, lawOutputs,
  renderLawPage, bodyWords, faqJsonLd,
  VERSION, BUILD_DATE, updatedText
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
  // <img alt> and <input placeholder> are void elements, so they carry their
  // own attributes rather than data-i18n — see applyDict(). A scanner that
  // does not know about them reports their keys as dead copy.
  for (const m of template.matchAll(/\bdata-i18n-alt="([^"]+)"/g)) keys.add(m[1]);
  for (const m of template.matchAll(/\bdata-i18n-placeholder="([^"]+)"/g)) keys.add(m[1]);

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

  // Consumed by tools/build-site.mjs, never by the template or app.js: the head
  // keys it renders <html lang>/<title>/meta from, and the V1.11 law-page set —
  // `pages` (the four articles), the hub's own title/description/lede, and the
  // dated note stamped at the top of every article.
  // `statsUpdated` and `statsMonths` join them for V1.13's version tile: the
  // build composes «обновлено 6 сентября 2026» from the pattern and the month
  // names and renders it into {{BUILD_DATE}}, so neither key is ever read at
  // runtime and neither appears in the template as a data-i18n attribute.
  const BUILD_KEYS = ['htmlLang', 'docTitle', 'docDesc', 'pageLanguage',
                      'pages', 'lawIndexTitle', 'lawIndexDesc', 'lawIndexLede', 'lawDated',
                      'statsUpdated', 'statsMonths'];

  const used = new Set(BUILD_KEYS);
  for (const m of template.matchAll(/\bdata-i18n="([^"]+)"/g)) used.add(m[1]);
  for (const m of template.matchAll(/\bdata-i18n-aria-label="([^"]+)"/g)) used.add(m[1]);
  for (const m of template.matchAll(/\bdata-i18n-alt="([^"]+)"/g)) used.add(m[1]);
  for (const m of template.matchAll(/\bdata-i18n-placeholder="([^"]+)"/g)) used.add(m[1]);

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

/* ----------------------------------------------------- the pricing table */

/* P3-8 replaced four plan cards with one «feature × plan» comparison table,
   rendered by site/app.js from the same descriptors the cards used. The parity
   test above only proves the three dictionaries agree with each other — it
   would stay green if all three lost the caption at once. These name the keys
   the table cannot be drawn without. */
test('the pricing table has its labels in all three dictionaries', () => {
  const TABLE_KEYS = [
    'priceTableCaption',  // <caption>, and the scroll region's aria-label
    'priceScrollHint',    // the visible "scrolls sideways" line under it
    'rowPlan',            // the corner cell, heading the column of row labels
    'rowPrice',           // the price row's <th scope="row">
    'rowCta',             // the button row's <th scope="row">
    'recommended'         // the flag in the featured column's header
  ];
  for (const { code } of LANGS) {
    const dict = readDict(code);
    for (const key of TABLE_KEYS) {
      assert.ok(Object.prototype.hasOwnProperty.call(dict, key),
        `site/src/i18n/${code}.json is missing "${key}", which the pricing table needs`);
      assert.ok(dict[key].trim().length > 0,
        `"${key}" in ${code}.json is empty`);
    }
  }
});

/* The seven feature rows and the four plans still have a label each: the table
   reads them by the same composed keys the cards did, so dropping one would
   render an empty <th> rather than throw. */
test('every pricing row and plan still has a label in all three dictionaries', () => {
  const ROW_KEYS = ['rowSites', 'rowBranding', 'rowScans', 'rowLog',
                    'rowAlerts', 'rowLangs', 'rowSupport'];
  const PLANS = ['Free', 'Starter', 'Business', 'Agency'];

  for (const { code } of LANGS) {
    const dict = readDict(code);
    for (const key of ROW_KEYS) {
      assert.ok(dict[key] && dict[key].trim(), `${code}.json has no "${key}"`);
    }
    for (const Plan of PLANS) {
      // The column header draws all three: name, note and CTA.
      for (const key of [`plan${Plan}`, `plan${Plan}Note`]) {
        assert.ok(dict[key] && dict[key].trim(), `${code}.json has no "${key}"`);
      }
      assert.ok(dict[`support${Plan}`] && dict[`support${Plan}`].trim(),
        `${code}.json has no "support${Plan}"`);
    }
    for (const key of ['planCtaFree', 'planCtaPaid', 'planCtaAgency']) {
      assert.ok(dict[key] && dict[key].trim(), `${code}.json has no "${key}"`);
    }
  }
});

/* The accessibility contract from the audit fix, asserted against app.js
   itself: the section is a real table, not a grid of divs wearing table roles.
   A rewrite that drops <caption> or scope would otherwise pass every other
   test in this file, because none of them execute the renderer. */
test('the pricing renderer builds a real table with a caption and scoped headers', () => {
  const app = readFileSync(join(SRC_DIR, '..', 'app.js'), 'utf8');

  assert.match(app, /el\('table'/, 'app.js no longer creates a <table> for the plans');
  assert.match(app, /el\('caption'/, 'the pricing table has lost its <caption>');
  assert.match(app, /\.scope = 'col'/, 'the plan columns have no <th scope="col">');
  assert.match(app, /\.scope = 'row'/, 'the feature rows have no <th scope="row">');

  // The old card renderer must be gone, not merely unused: two renderers means
  // the next edit lands in whichever one the author happens to open.
  assert.doesNotMatch(app, /el\('article', 'plan'/,
    'app.js still contains the old per-plan card renderer');

  // The wrapper is what keeps the page from scrolling sideways on a phone, and
  // tabIndex is what makes that scroll reachable without a mouse.
  assert.match(app, /plan-scroll/, 'the table has no scrollable wrapper');
  assert.match(app, /tabIndex\s*=\s*0/, 'the scroll wrapper is not keyboard-focusable');
});

/* P3-9: the client's floating re-open button is fixed at the bottom-left of the
   viewport and used to sit on top of a pricing card — now on the table's label
   column and its leftmost CTA.

   The fix has to live in site/app.js, and this test exists mostly to say why:
   ck-ui.js mounts into the shadow root of #ck-root, and a rule in
   site/styles.css cannot cross that boundary. An earlier attempt at
   `body .ck-fab { left:auto }` in the stylesheet parsed, shipped, and did
   nothing at all — the computed style stayed left:16px. So assert on the
   mechanism that actually reaches the button, and assert that the stylesheet
   is NOT where anyone tries again. */
test('the floating button is moved off the pricing column, from inside the shadow root', () => {
  const app = readFileSync(join(SRC_DIR, '..', 'app.js'), 'utf8');
  const css = readFileSync(join(SRC_DIR, '..', 'styles.css'), 'utf8');

  assert.match(app, /getElementById\('ck-root'\)/,
    'app.js does not look up the client\'s shadow host');
  assert.match(app, /\.shadowRoot/,
    'app.js does not reach into the shadow root, so it cannot restyle .ck-fab');
  assert.match(app, /\.ck-fab\.ck-fab\{[^}]*left:\s*auto/,
    'the injected rule does not release .ck-fab from the left edge');
  assert.match(app, /\.ck-fab\.ck-fab\{[^}]*right:/,
    'the injected rule gives .ck-fab no right anchor to replace the left one');

  // The dead-CSS trap, closed: styles.css cannot reach a shadow root, so a
  // .ck-fab rule there is a fix that looks applied and is not.
  assert.doesNotMatch(css, /\.ck-fab/,
    'site/styles.css tries to style .ck-fab — page CSS cannot cross the ' +
    '#ck-root shadow boundary, so that rule does nothing; move it to app.js');

  // Clearance at rest is the other half, and that one IS page CSS.
  assert.match(css, /#pricing \.wrap\s*\{[^}]*padding-bottom:/,
    'the pricing section has no bottom clearance for the floating button');
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

test('the sitemap lists every page the build writes', () => {
  const xml = renderSitemap();
  for (const l of LANGS) {
    assert.ok(xml.includes(`<loc>${pageUrl(l.dir)}</loc>`),
      `sitemap.xml does not list the ${l.code} page`);
    assert.ok(xml.includes(`<loc>${lawIndexUrl(l.dir)}</loc>`),
      `sitemap.xml does not list the ${l.code} «Правила» hub`);
    for (const p of readPages(l.code)) {
      assert.ok(xml.includes(`<loc>${lawUrl(l.dir, p.slug)}</loc>`),
        `sitemap.xml does not list ${l.code}/law/${p.slug}`);
    }
  }
  // Computed, not the literal 3 it used to be: the home page, the hub and one
  // article entry per page per language. A hard-coded count would have to be
  // edited every time an article is added, and the edit is what gets forgotten.
  const expected = LANGS.length * (1 + 1 + readPages(DEFAULT_LANG).length);
  assert.equal((xml.match(/<loc>/g) || []).length, expected,
    `sitemap.xml lists a different number of URLs than the build writes pages`);
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

/* ------------------------------------------------ «How it works» steps */

/* SPEC V1.7 §2: the section is four steps, in the order the dashboard walks
   through — banner line, «Verify», scan, adjust — and the same order in all
   three languages. Counting <li> alone would pass a page whose numbers read
   1-2-3-3, so assert the visible numbering too, and that every step actually
   carries its own dictionary strings rather than the template's Russian
   fallback. */
test('«How it works» renders four numbered steps in every language', () => {
  const template = readTemplate();

  for (const { code } of LANGS) {
    const html = renderPage(template, code);
    const section = html.match(/<ol class="steps[^"]*">([\s\S]*?)<\/ol>/);
    assert.ok(section, `the ${code} page has no <ol class="steps"> list`);
    const list = section[1];

    const items = [...list.matchAll(/<li>[\s\S]*?<\/li>/g)];
    assert.equal(items.length, 4,
      `the ${code} page renders ${items.length} steps, not 4`);

    assert.deepEqual(
      [...list.matchAll(/class="step-n"[^>]*>(\d+)</g)].map((m) => m[1]),
      ['1', '2', '3', '4'],
      `the ${code} page's steps are not numbered 1-2-3-4`);

    const dict = readDict(code);
    for (let n = 1; n <= 4; n++) {
      for (const key of [`how${n}Title`, `how${n}Text`]) {
        assert.ok(dict[key] && dict[key].trim(),
          `site/src/i18n/${code}.json has no "${key}"`);
        assert.ok(list.includes(dict[key].replace(/</g, '&lt;').replace(/>/g, '&gt;')) ||
                  list.includes(dict[key]),
          `the ${code} page's step ${n} does not carry "${key}" from ${code}.json`);
      }
    }
  }
});

/* The vocabulary at the top of SPEC V1.7: everything the visitor is asked to
   paste is «строка баннера», never «сниппет» — the dashboard, the onboarding
   mail and this page have to say the same word or the instructions stop
   matching the screen. The rendered page is the right thing to grep: it covers
   both the markup and the dictionary inlined into it (jsonForScript escapes
   angle brackets only, so Cyrillic passes through as-is). */
test('the Russian page never says «сниппет»', () => {
  const html = renderPage(readTemplate(), 'ru');
  assert.doesNotMatch(html, /сниппет/i,
    'the RU page still says «сниппет» — the agreed word is «строка баннера» ' +
    '(and for a vendor\'s own code, «код установки»)');
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

/* The runtime dictionary is the file MINUS `pages`. app.js never reads the
   article bodies — the build renders them into their own HTML files — and
   inlining several kilobytes of prose into all three home pages, inside a
   <script> block nobody parses, is pure weight. This test states that choice
   so a future "why is the dictionary not identical?" has an answer. */
test('the rendered page inlines the dictionary of its own language, without the articles', () => {
  const template = readTemplate();
  for (const l of LANGS) {
    const html = renderPage(template, l.code);
    const m = html.match(/window\.__CK_SITE_I18N=(\{[\s\S]*?\});<\/script>/);
    assert.ok(m, `the ${l.code} page does not inline a dictionary`);
    const parsed = JSON.parse(m[1].replace(/\\u003c/g, '<').replace(/\\u003e/g, '>'));

    assert.equal(parsed.pages, undefined,
      `the ${l.code} page inlines the law articles into its runtime dictionary`);
    assert.deepEqual(parsed, runtimeDict(readDict(l.code)),
      `the ${l.code} page inlines a dictionary that is not ${l.code}.json`);
    // Everything else survives the strip — the FAQ and the pricing labels are
    // read from this object at runtime.
    assert.ok(Array.isArray(parsed.faq) && parsed.faq.length > 0,
      `the ${l.code} page's runtime dictionary lost its FAQ`);
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

/* ═══════════════════════════════════════════════════════════════════════
   SPEC V1.11 — «Правила» pages, the check form, the numbers, the images
   ═══════════════════════════════════════════════════════════════════════ */

/* ------------------------------------------------------------ law pages */

test('every language carries the same four articles, matched by id', () => {
  // Id parity rather than index parity: the slugs differ per language by
  // design, so position in the array is not identity. Reordering one file must
  // not repoint another language's hreflang at a different article.
  const ids = readPages(DEFAULT_LANG).map((p) => p.id);
  assert.equal(ids.length, 4, `${DEFAULT_LANG}.json declares ${ids.length} law pages, not 4`);
  assert.equal(new Set(ids).size, ids.length, 'two law pages share an id');

  for (const { code } of LANGS) {
    const pages = readPages(code);
    assert.deepEqual(new Set(pages.map((p) => p.id)), new Set(ids),
      `site/src/i18n/${code}.json declares a different set of law page ids`);
    const slugs = pages.map((p) => p.slug);
    assert.equal(new Set(slugs).size, slugs.length, `${code}.json has two pages on one slug`);
    for (const p of pages) {
      assert.match(p.slug, /^[a-z0-9-]+$/,
        `slug "${p.slug}" in ${code}.json is not a lowercase ascii slug`);
      for (const key of ['title', 'description']) {
        assert.ok(p[key] && p[key].trim(), `page "${p.id}" in ${code}.json has no ${key}`);
      }
      assert.ok(Array.isArray(p.body) && p.body.length > 0,
        `page "${p.id}" in ${code}.json has no body`);
    }
  }
});

test('the law pages exist on disk in all three languages', () => {
  for (const { code, dir } of LANGS) {
    for (const p of readPages(code)) {
      const path = join(SITE_DIR, dir, 'law', p.slug, 'index.html');
      assert.ok(existsSync(path),
        `${code}/law/${p.slug}/index.html is missing — run: node tools/build-site.mjs`);
    }
    assert.ok(existsSync(join(SITE_DIR, dir, 'law', 'index.html')),
      `the ${code} «Правила» hub is missing`);
  }
  // 3 hubs + 3 languages x 4 articles.
  assert.equal(lawOutputs().length, LANGS.length * (1 + 4));
});

test('every law page advertises all three languages, pointing at the same article', () => {
  const template = readTemplate();
  for (const p of readPages(DEFAULT_LANG)) {
    const sib = pageSiblings(p.id);
    for (const l of LANGS) {
      const html = renderLawPage(template, l.code, sib[l.code]);

      assert.match(html, new RegExp(`<html lang="${l.code}"`),
        `${l.code}/law/${sib[l.code].slug} does not declare its language`);
      assert.ok(html.includes(`<link rel="canonical" href="${lawUrl(l.dir, sib[l.code].slug)}">`),
        `${l.code}/law/${sib[l.code].slug} has the wrong canonical`);

      // The alternates must name each language's OWN slug for THIS article —
      // the failure this guards against is subtle and silent: three valid-
      // looking hreflang lines pointing at three unrelated articles.
      for (const other of LANGS) {
        const href = lawUrl(other.dir, sib[other.code].slug);
        assert.ok(html.includes(`<link rel="alternate" hreflang="${other.code}" href="${href}">`),
          `${l.code}/law/${sib[l.code].slug} is missing the ${other.code} alternate (${href})`);
      }
      const xDefault = lawUrl(LANGS.find((x) => x.code === DEFAULT_LANG).dir, sib[DEFAULT_LANG].slug);
      assert.ok(html.includes(`<link rel="alternate" hreflang="x-default" href="${xDefault}">`),
        `${l.code}/law/${sib[l.code].slug} is missing x-default`);

      // The switcher travels to the same article, not back to the home page.
      for (const other of LANGS) {
        assert.ok(html.includes(`href="${lawPath(other.dir, sib[other.code].slug)}"`),
          `the switcher on ${l.code}/law/${sib[l.code].slug} does not link to the ${other.code} version`);
      }
    }
  }
});

test('every law page carries the site header, the footer and one check form', () => {
  const template = readTemplate();
  for (const { code } of LANGS) {
    for (const p of readPages(code)) {
      const html = renderLawPage(template, code, p);
      const where = `${code}/law/${p.slug}`;
      assert.match(html, /<header class="site-head">/, `${where} has no site header`);
      assert.match(html, /<footer class="site-foot">/, `${where} has no site footer`);
      assert.equal((html.match(/<form[^>]*\bdata-check-form\b/g) || []).length, 1,
        `${where} does not carry exactly one check form`);
      assert.match(html, /<title>[^<]+<\/title>/, `${where} has no title`);
      assert.match(html, /<meta name="description" content="[^"]+">/,
        `${where} has no meta description`);

      // A nav item on an article cannot be a bare #anchor: the article has no
      // #pricing section, so the link has to travel to the home page first.
      const nav = html.match(/<nav class="head-nav"[\s\S]*?<\/nav>/)[0];
      assert.doesNotMatch(nav, /href="#/,
        `${where}'s nav still uses in-page anchors, which do not exist on an article`);
    }
  }
});

test('each article is 400–700 words and dated, without promising full compliance', () => {
  for (const { code } of LANGS) {
    for (const p of readPages(code)) {
      const n = bodyWords(p.body);
      assert.ok(n >= 400 && n <= 700,
        `${code}/law/${p.slug} is ${n} words — SPEC V1.11 §3 asks for 400–700`);

      // Every article carries the «по состоянию на сентябрь 2026» qualifier,
      // in its own language, as a callout rather than buried in a paragraph.
      const callouts = p.body.filter((l) => String(l).startsWith('> '));
      assert.ok(callouts.length >= 1, `${code}/law/${p.slug} has no dated qualifier callout`);
      assert.ok(/2026/.test(callouts.join(' ')),
        `${code}/law/${p.slug}'s qualifier does not say which date it is correct as of`);
    }
  }
  // The one claim the copy must never make, in any language. A visitor who
  // reads «полное соответствие» on a page selling a banner has been promised
  // something no tool can deliver.
  const BANNED = [/полн\w*\s+соответстви/i, /full\s+compliance/i, /conformitate\s+deplină/i];
  for (const { code } of LANGS) {
    for (const p of readPages(code)) {
      const text = p.body.join(' ');
      for (const re of BANNED) {
        // Present only where it is explicitly disclaimed («не обеспечивает …»).
        for (const m of text.match(new RegExp(re.source, 'gi')) || []) {
          const at = text.indexOf(m);
          const around = text.slice(Math.max(0, at - 90), at + m.length + 20);
          assert.match(around, /не |not |nu |никогда|никакой|niciun|no tool|«|"/i,
            `${code}/law/${p.slug} promises "${m}" without disclaiming it`);
        }
      }
    }
  }
});

/* ------------------------------------------------------------ check form */

test('the check form is authored once and reused, with a honeypot', () => {
  const template = readTemplate();

  // One authored copy, sliced by the build. Two would drift.
  // The attribute on a <form> tag, not the word: the explanatory comment
  // above the block names it too.
  assert.equal((template.match(/<form[^>]*\bdata-check-form\b/g) || []).length, 1,
    'the check form is authored more than once in the template');
  assert.match(template, /<!--CHECKFORM:start-->[\s\S]*<!--CHECKFORM:end-->/,
    'the check form is not delimited for the law pages to reuse');

  const form = template.match(/<!--CHECKFORM:start-->([\s\S]*?)<!--CHECKFORM:end-->/)[1];

  for (const name of ['domain', 'email', 'agree', 'hp']) {
    assert.match(form, new RegExp(`name="${name}"`), `the form has no ${name} field`);
  }
  // The honeypot's three properties, each of which does a different job.
  assert.match(form, /name="hp"[^>]*tabindex="-1"/,
    'the honeypot is reachable by keyboard');
  assert.match(form, /name="hp"[^>]*autocomplete="off"/,
    'the honeypot may be filled by a password manager');
  assert.match(form, /aria-live="polite"/, 'the form has no live region for its states');

  // An id inside the template would be duplicated across the five instances.
  assert.doesNotMatch(form, /\sid="/,
    'the check form carries an id — it is cloned five times, so ids must be stamped per instance');

  // Off-screen, not display:none — a bot that reads computed styles skips
  // hidden fields.
  const css = readFileSync(join(SITE_DIR, 'styles.css'), 'utf8');
  const hp = css.match(/\.check__hp\s*\{[^}]*\}/);
  assert.ok(hp, 'styles.css does not position the honeypot off-screen');
  assert.doesNotMatch(hp[0], /display:\s*none/,
    'the honeypot uses display:none, which well-behaved bots skip');
  assert.match(hp[0], /position:\s*absolute/, 'the honeypot is not taken out of the flow');
});

test('the check is a two-step flow: scan first, e-mail only after a result', () => {
  const app = readFileSync(join(SITE_DIR, 'app.js'), 'utf8');

  assert.match(app, /\/v1\/public\/site-check/, 'app.js does not call the site-check endpoint');
  assert.match(app, /method:\s*'POST'/, 'the check is not sent as a POST');

  // SPEC V1.13 §2.2 — step 1 posts the domain WITHOUT an e-mail. The address
  // is asked for later, by its own request, once there is a result to send.
  const step1 = app.slice(app.indexOf('function submitCheck'), app.indexOf('function submitEmail'));
  for (const field of ['domain', 'lang', 'agree', 'hp']) {
    assert.match(step1, new RegExp(`${field}:`), `the first request has no ${field}`);
  }
  assert.doesNotMatch(step1, /\bemail:/,
    'the first request still carries an e-mail — SPEC V1.13 §2.2 asks for it only after the scan');

  // Step 2: poll the status every 5s, give up after 10 minutes.
  assert.match(app, /POLL_MS\s*=\s*5000/, 'the status is not polled every 5 seconds');
  assert.match(app, /POLL_MAX_MS\s*=\s*10 \* 60 \* 1000/, 'the poll has no 10-minute cap');
  assert.match(app, /function pollCheck/, 'there is no status poll at all');
  for (const st of ['done', 'error']) {
    assert.match(app, new RegExp(`'${st}'`), `the poll does not handle status "${st}"`);
  }
  assert.match(app, /hasEmail/, 'the poll ignores hasEmail, so it would ask for an address twice');
  assert.match(app, /teaser/, 'the poll never reads the teaser numbers');

  // Step 3: the e-mail goes to its own endpoint, with its own three answers.
  assert.match(app, /\/email/, 'there is no e-mail endpoint call');
  assert.match(app, /'checkMailQueued'/, 'nothing is said after the address is accepted');
  assert.match(app, /409/, 'app.js does not branch on 409 check_mailed');
  assert.match(app, /'checkMailed'/, 'app.js never shows the «already sent» state');
  assert.match(app, /'checkMailLimit'/, 'app.js never shows the e-mail rate limit');

  // The states of step 1, each with its own message.
  for (const [status, key] of [[200, 'checkRecent'], [429, 'checkLimit'], [400, 'checkInvalid']]) {
    assert.match(app, new RegExp(`${status}`), `app.js does not branch on ${status}`);
    assert.match(app, new RegExp(`'${key}'`), `app.js never shows the ${key} state`);
  }
  // SPEC V1.13 §1 — a 200 is two different answers: 'recent' (poll the existing
  // check) and 'registered' (already a customer; no checkId, nothing to poll).
  assert.match(app, /'registered'/, 'app.js does not tell the two kinds of 200 apart');
  assert.match(app, /'checkRegistered'/, 'app.js never shows the «already connected» state');
  assert.match(app, /'checkScanError'/, 'app.js has no state for a scan that failed');
  assert.match(app, /'checkError'/, 'app.js has no network-error state');
});

test('the check form has all its copy in all three dictionaries', () => {
  const KEYS = ['checkTitle', 'checkLede', 'checkDomainLabel', 'checkDomainPlaceholder',
                'checkEmailLabel', 'checkEmailPlaceholder', 'checkAgree', 'checkSubmit',
                'checkNote', 'checkRunning', 'checkRunningNote', 'checkDone', 'checkAskEmail',
                'checkEmailSubmit', 'checkMailQueued', 'checkRecent', 'checkRecentMailed',
                'checkLimit', 'checkMailLimit', 'checkMailed', 'checkScanError', 'checkError',
                'checkInvalid', 'checkNeedDomain', 'checkNeedEmail', 'checkNeedAgree',
                'checkSending', 'checkRegistered'];
  for (const { code } of LANGS) {
    const dict = readDict(code);
    for (const key of KEYS) {
      assert.ok(dict[key] && dict[key].trim(), `${code}.json has no "${key}"`);
    }
    // «Проверяем <домен>…» names the site being scanned, and the teaser
    // carries all three numbers SPEC V1.13 §2.2 asks it to report.
    assert.ok(dict.checkRunning.includes('{domain}'),
      `"checkRunning" in ${code}.json does not interpolate {domain}`);
    for (const token of ['{services}', '{before}', '{cookies}']) {
      assert.ok(dict.checkDone.includes(token),
        `"checkDone" in ${code}.json does not interpolate ${token}`);
    }
  }
});

/* ----------------------------------------------------------- the numbers */

test('the numbers block hides the counts while there are too few sites', () => {
  const app = readFileSync(join(SITE_DIR, 'app.js'), 'utf8');

  assert.match(app, /\/v1\/public\/stats/, 'app.js does not read the stats endpoint');
  assert.match(app, /STATS_MIN_SITES\s*=\s*10/,
    'the «show nothing under ten sites» threshold is not 10');
  assert.match(app, /stats\.sites\s*>=\s*STATS_MIN_SITES/,
    'the counts are drawn without checking the threshold');
  // A static fallback, so a failed request never leaves an empty block or zeros.
  assert.match(app, /STATS_FALLBACK/, 'the numbers block has no static fallback');
  assert.match(app, /languages:\s*34/, 'the fallback does not carry the language count');

  for (const { code } of LANGS) {
    const dict = readDict(code);
    for (const key of ['statsTitle', 'statsSites', 'statsConsents', 'statsLanguages',
                       'statsVersion', 'statsUpdated']) {
      assert.ok(dict[key] && dict[key].trim(), `${code}.json has no "${key}"`);
    }
    for (const token of ['{day}', '{month}', '{year}']) {
      assert.ok(dict.statsUpdated.includes(token),
        `"statsUpdated" in ${code}.json does not interpolate ${token}`);
    }
    assert.ok(Array.isArray(dict.statsMonths) && dict.statsMonths.length === 12,
      `${code}.json needs twelve month names for the «обновлено …» line`);
  }
});

/* The version tile — SPEC V1.13 §2.5 and owner remark 3.
 *
 * Both values are the BUILD's, not the runtime's: a version the page fetched
 * could disagree with the script it is describing, and a date computed in the
 * browser would read differently for every visitor. The guard below is really
 * about determinism — see the BUILD_DATE comment in tools/build-site.mjs — so
 * it checks that what lands in the markup is package.json's own version and a
 * date the dictionary formatted, in all three languages. */
test('the fourth tile carries the package version and the build date', () => {
  const template = readTemplate();
  const version = JSON.parse(readFileSync(join(SRC_DIR, '..', '..', 'package.json'), 'utf8')).version;

  assert.equal(VERSION, version, 'build-site.mjs does not read package.json’s version');

  for (const { code } of LANGS) {
    const html = renderPage(template, code);
    const dict = readDict(code);

    assert.ok(html.includes(`<dt class="stat__num">${version}</dt>`),
      `the ${code} page does not show the package version in the fourth tile`);
    assert.ok(html.includes(dict.statsVersion),
      `the ${code} page has no «версия баннера» caption`);

    const want = updatedText(dict, BUILD_DATE);
    assert.ok(html.includes(want),
      `the ${code} page does not carry the build date («${want}»)`);

    // The month must be the dictionary's own name, not a number: RU needs the
    // genitive («сентября»), which no date formatter would produce.
    const month = dict.statsMonths[parseInt(BUILD_DATE.slice(5, 7), 10) - 1];
    assert.ok(want.includes(month),
      `the ${code} «обновлено …» line does not use the dictionary's month name`);
  }

  // Nothing computes either value in the browser.
  const app = readFileSync(join(SITE_DIR, 'app.js'), 'utf8');
  assert.doesNotMatch(app, /statsUpdated|statsMonths/,
    'app.js reads the build-time date keys — the tile must be rendered by the build');
});

/* -------------------------------------------------------------- the FAQ */

test('the FAQ has the five V1.11 questions and valid FAQPage markup', () => {
  const template = readTemplate();

  for (const { code } of LANGS) {
    const dict = readDict(code);
    assert.ok(dict.faq.length >= 11,
      `${code}.json has ${dict.faq.length} FAQ entries — V1.11 adds five to the six existing`);
    assert.ok(dict.priceCheaper && dict.priceCheaper.trim(),
      `${code}.json has no «Дешевле одного письма от юриста» line`);

    const html = renderPage(template, code);
    const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    assert.ok(m, `the ${code} page has no FAQPage block`);

    // The block is escaped for the HTML parser but must still parse as JSON:
    // the RU blocking answer contains the literal text «<script src>».
    const json = JSON.parse(m[1].replace(/\\u003c/g, '<').replace(/\\u003e/g, '>'));
    assert.equal(json['@type'], 'FAQPage');
    assert.equal(json.mainEntity.length, dict.faq.length,
      `the ${code} FAQPage block and the visible list have different lengths`);
    json.mainEntity.forEach((q, i) => {
      assert.equal(q['@type'], 'Question');
      assert.equal(q.name, dict.faq[i][0], `FAQPage question ${i + 1} is not the visible question`);
      assert.equal(q.acceptedAnswer.text, dict.faq[i][1],
        `FAQPage answer ${i + 1} is not the visible answer`);
    });
    assert.doesNotMatch(m[1], /<\/script/i, 'the FAQPage block can break out of its <script>');
  }
});

test('every FAQ answer gets its own anchor', () => {
  const app = readFileSync(join(SITE_DIR, 'app.js'), 'utf8');
  // Positional ids, so one fragment works on all three language pages.
  assert.match(app, /d\.id\s*=\s*'q'\s*\+\s*\(i \+ 1\)/,
    'the FAQ renderer no longer gives each answer an anchor');
  assert.match(app, /openFaqFromHash/,
    'arriving on #q7 would land on a collapsed <details>');
});

/* -------------------------------------------------------- step screenshots */

test('the four steps are one-size inline illustrations, not screenshots', () => {
  // SPEC V1.13 §2.5 — the four mismatched screenshots are replaced by four
  // illustrations of ONE size. Inline SVG rather than files: the shapes are a
  // handful of rectangles, and only inline SVG can paint the site's own custom
  // properties, so the same markup is right in the light and the dark theme.
  const template = readTemplate();

  assert.doesNotMatch(template, /img\/steps\//,
    'the template still references the deleted step screenshots');
  assert.ok(!existsSync(join(SITE_DIR, 'img', 'steps')),
    'site/img/steps/ still exists — SPEC V1.13 §2.5 deletes it');

  const arts = template.match(/<svg class="step-art"[\s\S]*?<\/svg>/g) || [];
  assert.equal(arts.length, 4, `the section has ${arts.length} illustrations, not 4`);

  for (const [i, art] of arts.entries()) {
    // One size for all four, and 4:3 as the spec asks.
    assert.match(art, /viewBox="0 0 320 240"/,
      `illustration ${i + 1} is not on the shared 4:3 viewBox`);
    // Decorative: the <h3> and <p> beside it carry the meaning, so a screen
    // reader must not be read four wordless diagrams.
    assert.match(art, /aria-hidden="true"/, `illustration ${i + 1} is not hidden from assistive tech`);
    // «крупные элементы без мелкого текста» — no glyphs at all inside the art.
    assert.doesNotMatch(art, /<text\b/, `illustration ${i + 1} contains text`);
    // Theme-aware by construction: every fill is a class the stylesheet maps
    // to a token, never a literal colour baked into the markup.
    assert.doesNotMatch(art, /fill="#/, `illustration ${i + 1} hard-codes a colour`);
  }

  // The classes the illustrations use must all be styled, or a shape would
  // fall back to black-on-black in the dark theme.
  const css = readFileSync(join(SITE_DIR, 'styles.css'), 'utf8');
  assert.match(css, /\.step-art\s*\{[^}]*aspect-ratio:\s*4\s*\/\s*3/,
    'styles.css does not hold the illustrations to one 4:3 box');
  const classes = new Set();
  for (const m of template.matchAll(/class="(art-[a-z-]+(?:\s+art-[a-z-]+)*)"/g)) {
    for (const c of m[1].split(/\s+/)) classes.add(c);
  }
  assert.ok(classes.size >= 8, `only ${classes.size} art classes found — did the parse break?`);
  for (const c of classes) {
    assert.ok(css.includes('.' + c), `styles.css has no rule for .${c}`);
  }
});

test('images cannot widen the page on a phone', () => {
  // The step screenshots are 1200px wide inside a column that narrows to 375.
  // Without this rule they set the page's minimum width and the whole layout
  // scrolls sideways — the one assertion the playwright run also checks live.
  const css = readFileSync(join(SITE_DIR, 'styles.css'), 'utf8');
  assert.match(css, /(^|\s)img\s*\{[^}]*max-width:\s*100%/,
    'styles.css has no img{max-width:100%} rule');
});

/* ------------------------------------------------------------- navigation */

/* Owner remark 4: the footer stops repeating «Для разработчиков».
 *
 * The links it dropped — GitHub, npm, the installation guide — are the entire
 * content of the #dev section one screen up, so a visitor met them twice and
 * the footer read as a worse copy of a real section. What the footer keeps is
 * what only it can offer: who we are, how to write to us, the dashboard, and
 * the «Правила» group. The #dev section must still carry all three, which is
 * the half of this that is easy to break by deleting one link too many. */
test('the footer carries no developer links, and #dev still does', () => {
  const template = readTemplate();

  for (const { code } of LANGS) {
    const html = renderPage(template, code);
    const foot = html.match(/<footer[\s\S]*?<\/footer>/)[0];

    for (const url of ['github.com', 'npmjs.com', 'INSTALL.ru.md']) {
      assert.ok(!foot.includes(url),
        `the ${code} footer still links to ${url} — #dev already does`);
    }

    assert.ok(foot.includes('mailto:info@ecomconsult.net'),
      `the ${code} footer has no «Написать нам» address`);
    assert.ok(foot.includes(readDict(code).footWrite),
      `the ${code} footer has no «Написать нам» label`);
    assert.ok(foot.includes('app.ecomconsult.net'),
      `the ${code} footer has no «Кабинет» link`);
    assert.ok(foot.includes('E-COM CONSULT PLUS'),
      `the ${code} footer has no company line`);

    // Four links exactly: write to us, dashboard, and the «Правила» pair.
    const links = foot.match(/<a\b[^>]*href=/g) || [];
    assert.equal(links.length, 4,
      `the ${code} footer has ${links.length} links, expected 4`);

    const dev = html.match(/<section id="dev"[\s\S]*?<\/section>/)[0];
    for (const url of ['github.com/vermoh/ConsentKit', 'npmjs.com', 'INSTALL.ru.md']) {
      assert.ok(dev.includes(url),
        `#dev on the ${code} page lost its ${url} link`);
    }
  }
});

test('«Правила» is in the nav and the footer, on every page', () => {
  const template = readTemplate();
  for (const { code, dir } of LANGS) {
    const dict = readDict(code);
    assert.ok(dict.navLaw && dict.navLaw.trim(), `${code}.json has no "navLaw"`);

    const html = renderPage(template, code);
    const nav = html.match(/<nav class="head-nav"[\s\S]*?<\/nav>/)[0];
    assert.ok(nav.includes(dict.navLaw), `the ${code} page's nav has no «Правила» item`);

    const foot = html.match(/<footer[\s\S]*?<\/footer>/)[0];
    assert.ok(foot.includes(`/law`), `the ${code} page's footer has no «Правила» group`);

    // The hub link is the language's own hub, not the English one.
    const want = (dir ? '/' + dir : '') + '/law';
    assert.ok(nav.includes(`href="${want}"`),
      `the ${code} page's nav points at the wrong «Правила» hub`);
  }
});
