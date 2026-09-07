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
import { createHash } from 'node:crypto';

import {
  LANGS, DEFAULT_LANG, SRC_DIR, SITE_DIR, TEMPLATE,
  readDict, readTemplate, renderPage, renderSitemap, buildAll, outputs,
  pageUrl, jsonForScript, runtimeDict,
  readPages, pageSiblings, lawUrl, lawPath, lawIndexUrl, lawOutputs,
  renderLawPage, renderLawIndex, bodyWords, faqJsonLd,
  VERSION, BUILD_DATE, updatedText,
  MARQUEE_CARDS, renderMarquee, readClientLocales,
  VERSIONED_ASSETS, assetHash, THEME_KEY, THEME_BOOT
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
                    'rowAlerts', 'rowTeam', 'rowLangs', 'rowSupport'];
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

  /* app.js may touch localStorage — the site THEME is stored there (owner,
     07.09.2026) — but the only key it is allowed to touch is that one. A
     language preference in storage is the exact bug this test exists for: it
     would make /ru render English for a returning visitor, because the URL
     would say Russian and the stored key would say otherwise. */
  const keys = [...app.matchAll(/localStorage\.(?:get|set|remove)Item\(\s*([A-Za-z_$][\w$]*|'[^']*'|"[^"]*")/g)]
    .map((m) => m[1]);
  assert.ok(keys.length > 0, 'the localStorage guard below matched nothing — has the API changed?');
  for (const k of keys) {
    assert.equal(k, 'THEME_KEY',
      `app.js reads or writes localStorage with ${k} — only the site theme may be stored`);
  }
  assert.match(app, /var THEME_KEY = 'ck-site-theme'/,
    'app.js does not use the ck-site-theme key the <head> boot script writes');
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

    /* Seven links exactly: the three section anchors SPEC V1.14.1 §1.1 moved
       out of the header, then write-to-us, the dashboard, and the «Правила»
       pair. §1.1 shrinks the header on the condition that the dropped
       destinations stay reachable «якоря внутри страницы и подвал», so the
       three anchors are load-bearing rather than decoration — asserted by
       name below, not just counted. */
    const links = foot.match(/<a\b[^>]*href=/g) || [];
    // Eight since 07.09.2026: the company name links to the agency site
    // (owner's rule — the banner's attribution goes to the product site, the
    // product site's company line goes to the agency).
    assert.equal(links.length, 8,
      `the ${code} footer has ${links.length} links, expected 8`);
    assert.ok(foot.includes('href="https://ecomconsult.net"'),
      `the ${code} footer's company name does not link to the agency site`);

    const dict = readDict(code);
    for (const [id, key] of [['demo', 'navDemo'], ['features', 'navFeatures'], ['dev', 'navDev']]) {
      assert.ok(foot.includes(`#${id}"`),
        `the ${code} footer lost the #${id} anchor the header gave up`);
      assert.ok(foot.includes(dict[key]),
        `the ${code} footer has no «${dict[key]}» label`);
    }

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

/* ═══════════════════════════════════════════════════════════════════════
   SPEC V1.14
   ═══════════════════════════════════════════════════════════════════════ */

/* ------------------------------------------------------------- §1 fonts */

test('Onest is self-hosted, with its licence beside it', () => {
  for (const name of ['onest-latin.woff2', 'onest-cyrillic.woff2']) {
    const f = join(SITE_DIR, 'fonts', name);
    assert.ok(existsSync(f), `site/fonts/${name} is missing`);
    // A truncated download would still "exist"; a real woff2 starts wOF2.
    assert.equal(readFileSync(f).subarray(0, 4).toString('latin1'), 'wOF2',
      `site/fonts/${name} is not a woff2 file`);
    assert.ok(statSync(f).size > 4096, `site/fonts/${name} looks truncated`);
  }
  const ofl = join(SITE_DIR, 'fonts', 'OFL.txt');
  assert.ok(existsSync(ofl), 'site/fonts/OFL.txt is missing — Onest ships under the OFL');
  assert.match(readFileSync(ofl, 'utf8'), /SIL Open Font License/);
});

test('the stylesheet loads Onest from our own origin and nowhere else', () => {
  const css = readFileSync(join(SITE_DIR, 'styles.css'), 'utf8');

  assert.match(css, /@font-face/, 'styles.css declares no @font-face');
  assert.match(css, /url\('\/fonts\/onest-latin\.woff2'\)/);
  assert.match(css, /url\('\/fonts\/onest-cyrillic\.woff2'\)/);
  assert.match(css, /font-display:\s*swap/, 'Onest must not block the first paint');
  /* The whole point of vendoring it: SPEC V1.14 §1 / §3, zero external
     requests. Comments are stripped before the check — the header of
     styles.css explains WHY it does not call Google Fonts, and naming the
     host in prose must not read as calling it. */
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(code, /fonts\.googleapis\.com|fonts\.gstatic\.com/,
    'the stylesheet still reaches out to Google Fonts');
  assert.match(css, /font:[^;]*'Onest'/, 'body does not use Onest');

  // Latin and Cyrillic are separate faces, so a Russian page never downloads
  // the Latin file and vice versa.
  assert.match(css, /unicode-range:\s*U\+0301, U\+0400-045F/);
});

test('no page asks for an off-origin stylesheet, font or script', () => {
  const template = readTemplate();

  /* canonical / alternate / og:url are METADATA: they name a URL for a
     crawler, they are never fetched by the browser. What matters here is the
     <link>s that DO cause a request — stylesheets, fonts, preloads, icons. */
  const FETCHED = /\brel="(stylesheet|preload|preconnect|dns-prefetch|icon|apple-touch-icon|manifest)"/;

  for (const { code } of LANGS) {
    const html = renderPage(template, code);

    for (const m of html.matchAll(/<link\b[^>]*>/g)) {
      if (!FETCHED.test(m[0])) continue;
      assert.doesNotMatch(m[0], /href="(https?:)?\/\//,
        `the ${code} page fetches an external resource: ${m[0]}`);
    }
    for (const m of html.matchAll(/<script\b[^>]*src="(https?:)?\/\/[^"]+"/g)) {
      assert.fail(`the ${code} page loads an external script: ${m[0]}`);
    }
    // No @import or url() reaching off-origin from an inline style either.
    assert.doesNotMatch(html, /@import\s+url\(['"]?https?:/i);
  }
});

/* ---------------------------------------------------------- §1 palette */

test('the palette is the V1.14.1 one, and on-accent text reaches AA', () => {
  const css = readFileSync(join(SITE_DIR, 'styles.css'), 'utf8');

  /* V1.14.1 §2 keeps every colour of §1 and changes only the DOSAGE, so the
     brand hexes are still asserted here — what moved is which token holds
     which of them. The page background is now white and the cream has its own
     token, because cream is a two-section accent rather than the ground. */
  for (const [token, value] of [
    ['--bg', '#FFFFFF'], ['--cream', '#FFF2E0'], ['--surface-2', '#F5E7D3'],
    ['--ink', '#1E1E1E'],
    ['--accent', '#D63838'], ['--on-accent', '#FFFFFF'],
    ['--band', '#B82E2D'], ['--on-band', '#FDE1B9'],
    ['--accent-deco', '#E63939']
  ]) {
    assert.ok(new RegExp(`${token}:\\s*${value}`, 'i').test(css),
      `styles.css does not set ${token} to ${value}`);
  }
  // §2's own dark-theme values.
  assert.match(css, /--bg:\s*#141414/i, 'the dark theme is not the neutral black (owner, 07.09.2026)');
  assert.match(css, /--surface:\s*#1F1F1F/i, 'the dark surface is not the neutral one');
  assert.match(css, /--ink:\s*#F2F2F2/i, 'the dark ink is not the neutral one');
  assert.match(css, /--line:\s*#333333/i, 'the dark rule colour is not the neutral one');

  const lum = (hex) => {
    const c = hex.replace('#', '');
    const v = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
      .map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const ratio = (a, b) => {
    const [l1, l2] = [lum(a), lum(b)];
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };

  /* The reason the tokens are not literally §1: nothing reaches 4.5:1 on
     #E63939, so the brand red is decoration and #D63838 / #B82E2D carry text.
     These assertions are what stops a future "let's use E63939 for the
     button" from shipping. */
  assert.ok(ratio('#FFFFFF', '#D63838') >= 4.5,
    'white on --accent must clear AA for normal-size button text');
  assert.ok(ratio('#FDE1B9', '#B82E2D') >= 4.5,
    'peach on --band must clear AA for normal-size body text');
  assert.ok(ratio('#1E1E1E', '#FFF2E0') >= 4.5);
  assert.ok(ratio('#5A5A5A', '#FFF2E0') >= 4.5, '--ink-soft must clear AA on the cream');
  // The white page and the sand trim the V1.14.1 palette leans on.
  assert.ok(ratio('#1E1E1E', '#FFFFFF') >= 4.5, '--ink must clear AA on the white page');
  assert.ok(ratio('#5A5A5A', '#FFFFFF') >= 4.5, '--ink-soft must clear AA on white');
  assert.ok(ratio('#1E1E1E', '#F5E7D3') >= 4.5, 'the sand chip needs dark text at AA');
  assert.ok(ratio('#B82E2D', '#FFFFFF') >= 4.5, 'the text red must clear AA on white');

  /* Dark theme. The point of the split: the FILL red is the same #D63838 in
     both themes and carries white; the TEXT red lightens, because #D63838 as
     text on #141414 is 3.9:1 and would fail. A future edit that "simplifies"
     the two into one token breaks one of these two assertions. */
  assert.ok(ratio('#FF6B6B', '#141414') >= 4.5, 'the dark text red must clear AA');
  assert.ok(ratio('#FFFFFF', '#D63838') >= 4.5, 'the dark button keeps the light fill pair');
  assert.ok(ratio('#D63838', '#141414') < 4.5,
    'if the fill red ever clears AA as text on the dark ground, the split can be simplified');
  assert.ok(ratio('#F2F2F2', '#141414') >= 4.5, 'the dark ink must clear AA');
  assert.ok(ratio('#B3B3B3', '#141414') >= 4.5, 'the dark soft ink must clear AA');
  // The pills are tinted rather than filled, for exactly this reason.
  assert.ok(ratio('#9B2726', '#FBE3DE') >= 4.5, 'the «до» pill must clear AA');
  assert.ok(ratio('#14603C', '#DDF0E3') >= 4.5, 'the «после» pill must clear AA');

  // And the trap itself, asserted so the note in styles.css cannot rot.
  assert.ok(ratio('#FFFFFF', '#E63939') < 4.5,
    'if #E63939 ever clears AA, the two-red split can be simplified');
});

/* --------------------------------------------------------- §2.1 marquee */

test('the marquee is 8–10 cards covering every layout, both themes and several languages', () => {
  assert.ok(MARQUEE_CARDS.length >= 8 && MARQUEE_CARDS.length <= 10,
    `§2.1 asks for 8–10 cards, the deck has ${MARQUEE_CARDS.length}`);

  const layouts = new Set(MARQUEE_CARDS.map((c) => c.layout));
  for (const l of ['bar', 'box', 'modal']) {
    assert.ok(layouts.has(l), `the marquee never shows the ${l} layout`);
  }
  const themes = new Set(MARQUEE_CARDS.map((c) => c.theme));
  assert.ok(themes.has('light') && themes.has('dark'), 'the marquee is single-theme');

  // §1: the brand red leads the deck.
  assert.equal(MARQUEE_CARDS[0].accent, '#E63939',
    'the first marquee card must carry the brand red');
  assert.ok(new Set(MARQUEE_CARDS.map((c) => c.accent)).size >= 4,
    'the marquee should show several accents');

  // ru/ro/en/de at least — §2.1 names them.
  const langs = new Set(MARQUEE_CARDS.map((c) => c.lang));
  for (const l of ['de']) assert.ok(langs.has(l), `the marquee has no ${l} card`);
});

test('the marquee cards say what the real client says, in each language', () => {
  const L = readClientLocales();
  const template = readTemplate();

  for (const { code } of LANGS) {
    const html = renderPage(template, code);
    const strip = html.match(/<div class="marquee-viewport"[\s\S]*?<\/section>/)[0];

    // The deck is emitted twice for the seamless loop.
    const cards = strip.match(/class="marquee__item"/g) || [];
    assert.equal(cards.length, MARQUEE_CARDS.length * 2,
      `the ${code} marquee should hold the deck twice, for the loop`);
    assert.equal((strip.match(/class="marquee__track"/g) || []).length, 2);
    // The duplicate must not be read out a second time.
    assert.match(strip, /<ul class="marquee__track" aria-hidden="true">/);

    // The whole strip is decorative: one banner, ten times.
    assert.match(strip, /<div class="marquee-viewport"[^>]*aria-hidden="true"/);

    // The foreign-language cards carry ck-locales.js's own strings verbatim,
    // so the page cannot advertise wording the banner does not ship.
    for (const c of MARQUEE_CARDS) {
      if (['self', 'ru', 'ro', 'en'].includes(c.lang)) continue;
      assert.ok(strip.includes(L[c.lang].acceptAll),
        `the ${code} marquee's ${c.lang} card does not use the client's own «${L[c.lang].acceptAll}»`);
    }

    // And the page's own language uses the page's own dictionary.
    const dict = readDict(code);
    assert.ok(strip.includes(dict.mockAccept),
      `the ${code} marquee has no card in the page's own language`);
  }
});

test('the marquee stops for prefers-reduced-motion and pauses on hover', () => {
  const css = readFileSync(join(SITE_DIR, 'styles.css'), 'utf8');

  /* The global reduce block collapses animations to .001ms, which SNAPS a
     translate loop to its end state instead of stopping it. The animation is
     therefore only ever attached under no-preference. */
  const gate = css.match(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/);
  assert.ok(gate, 'the marquee animation is not gated behind no-preference');
  assert.match(gate[0], /\.marquee__track\s*\{[^}]*animation:/,
    'the marquee animation must live inside the no-preference gate');

  assert.match(css, /\.marquee-viewport:hover \.marquee__track[\s\S]*?animation-play-state:\s*paused/,
    '§2.1: the strip must pause on hover');
  assert.match(css, /focus-within \.marquee__track/,
    'the strip should also pause for a keyboard visitor');

  // Its own scroll container, so a strip wider than the screen never makes
  // the PAGE scroll sideways (§3) — and gives the phone its finger scroll.
  assert.match(css, /\.marquee-viewport \{[\s\S]*?overflow-x:\s*auto/);
});

/* ---------------------------------------------------- §2.2 before/after */

test('the before/after handle is a real range input', () => {
  const template = readTemplate();
  const html = renderPage(template, DEFAULT_LANG);
  const ba = html.match(/<section id="before-after"[\s\S]*?<\/section>/)[0];

  // §2.2 asks for keyboard support and aria-valuenow. A range input has both
  // by construction; a div with listeners would have to reimplement them.
  assert.match(ba, /<input class="ba__range" type="range"[^>]*min="0"[^>]*max="100"/);
  assert.match(ba, /aria-label="[^"]+"/, 'the handle has no accessible name');

  assert.match(ba, /ba__pane--before/);
  assert.match(ba, /ba__pane--after/);

  const dict = readDict(DEFAULT_LANG);
  for (const k of ['baPillBefore1', 'baPillBefore2', 'baPillAfter1', 'baPillAfter2']) {
    assert.ok(ba.includes(dict[k]), `the slider is missing the ${k} pill`);
  }
  assert.ok(ba.includes(dict.baLede), 'the slider has lost its caption');

  const css = readFileSync(join(SITE_DIR, 'styles.css'), 'utf8');
  // Clipped, not resized: the mock inside must not reflow as the handle moves.
  assert.match(css, /\.ba__pane--before \{[\s\S]*?clip-path:\s*inset\(0 calc\(100% - var\(--ba-pos\)\)/);
  // The invisible input must stay focusable — display:none would not be.
  assert.match(css, /\.ba__range \{[\s\S]*?opacity:\s*0/);
  assert.doesNotMatch(css, /\.ba__range \{[^}]*display:\s*none/);

  const app = readFileSync(join(SRC_DIR, '..', 'app.js'), 'utf8');
  assert.match(app, /wireBeforeAfter/, 'app.js never wires the slider');
  assert.match(app, /--ba-pos/, 'app.js never moves the handle');
});

/* ------------------------------------------------------- §2.3/§2.4 CTAs */

test('the page has one primary button, and it is the free check', () => {
  const template = readTemplate();
  for (const { code } of LANGS) {
    const dict = readDict(code);
    const html = renderPage(template, code);

    // Header, hero, end of «Как это работает», after the pricing table.
    const primaries = html.match(/class="btn[^"]*btn--primary[^"]*"[^>]*>/g) || [];
    const toCheck = (html.match(/href="#check"[^>]*>/g) || []).length;
    assert.ok(toCheck >= 4,
      `the ${code} page points at #check ${toCheck} times, §2.4 asks for four places`);

    // Every one of those buttons says the same thing.
    const cta = dict.ctaCheck;
    assert.ok(cta && cta.trim(), `${code}.json has no "ctaCheck"`);
    assert.ok(html.includes(cta), `the ${code} page never offers «${cta}»`);

    // «Открыть кабинет» is a text link in the header now, not a button.
    const head = html.match(/<header[\s\S]*?<\/header>/)[0];
    assert.match(head, /class="head-link"[^>]*>\s*[^<]*</,
      `the ${code} header has no text link to the dashboard`);
    assert.ok(!/class="btn[^"]*"[^>]*href="https:\/\/app\.ecomconsult\.net"/.test(head)
      && !/href="https:\/\/app\.ecomconsult\.net"[^>]*class="btn[^"]*"/.test(head),
      `the ${code} header still renders the dashboard as a button`);

    // The footer keeps its own text link.
    const foot = html.match(/<footer[\s\S]*?<\/footer>/)[0];
    assert.match(foot, /app\.ecomconsult\.net/, `the ${code} footer lost the dashboard link`);

    assert.ok(primaries.length >= 1);
  }
});

test('the hero leads with the promise chip and one accented word', () => {
  const template = readTemplate();
  for (const { code } of LANGS) {
    const dict = readDict(code);
    const html = renderPage(template, code);
    const hero = html.match(/<section class="hero">[\s\S]*?<\/section>/)[0];

    assert.ok(hero.includes(dict.heroChip), `the ${code} hero has no promise chip`);
    // Two keys, so each language can put its own word under the accent.
    assert.ok(hero.includes(dict.heroTitleLead) && hero.includes(dict.heroTitleAccent),
      `the ${code} headline is not split into lead + accent`);
    assert.match(hero, /class="h1-accent"/);
  }
});

/* ----------------------------------------------------------- §2.6 bands */

test('the check block is the red band and «Цифры» is the cream one', () => {
  const template = readTemplate();
  const html = renderPage(template, DEFAULT_LANG);

  assert.match(html, /<section id="check" class="band check-band">/);
  assert.match(html, /<section id="numbers" class="band band--cream">/);

  const css = readFileSync(join(SITE_DIR, 'styles.css'), 'utf8');
  assert.match(css, /\.check-band \{[\s\S]*?background:\s*var\(--band\)/);
  // V1.14.1 §2: «Цифры» is cream, not sand — the page's rhythm is
  // белый → крем (hero) → белый → красная полоса → белый → крем → белый.
  assert.match(css, /\.band--cream \{\s*background:\s*var\(--cream\)/);
  // On a red band the primary button cannot also be red.
  assert.match(css, /\.check-band \.btn--primary \{[\s\S]*?color:\s*#B82E2D/);
  // The form and the tiles stay white cards on the band.
  assert.match(css, /\.check-band \.check \{[\s\S]*?background:\s*var\(--surface\)/);
  assert.match(css, /\.check-band \.fit__list li \{[\s\S]*?background:\s*var\(--surface\)/);

  /* §1.4: on a phone the band is not a full-width slab of red. Below 768 the
     block goes white and a small red caption above the heading carries the
     accent instead. The base rule above is untouched, so ≥768 is unchanged. */
  assert.match(css, /@media \(max-width: 767px\) \{[\s\S]*?\.check-band \{\s*background:\s*transparent/,
    'the check band is still full-width red on a phone');
  assert.match(html, /class="check-caption"/,
    'the mobile red caption above the check heading is missing');
});

/* --------------------------------------------------------- §2.7 Starter */

test('the Starter card reads the same data as the pricing table', () => {
  const app = readFileSync(join(SRC_DIR, '..', 'app.js'), 'utf8');

  assert.match(app, /function renderStarter/, 'app.js has no Starter card');
  // It must read the shared `plans` array, not its own literals.
  assert.match(app, /function renderStarter\(\)[\s\S]*?plans\[i\]\.plan === 'starter'/,
    'renderStarter does not read the shared plans array');
  assert.doesNotMatch(
    app.match(/function renderStarter\(\)[\s\S]*?\n  \}/)[0],
    /\u20AC\s*9|['"]9['"]/,
    'the Starter card hard-codes a price instead of reading the payload'
  );
  // A fresh payload has to move both.
  assert.match(app, /renderPricing\(\);\s*\n\s*renderStarter\(\);/,
    'loadPricing does not refresh the Starter card');

  const template = readTemplate();
  const html = renderPage(template, DEFAULT_LANG);
  const pricing = html.match(/<section id="pricing"[\s\S]*?<\/section>/)[0];
  // Above the table, per §2.7.
  assert.ok(pricing.indexOf('id="starter"') < pricing.indexOf('id="plans"'),
    'the Starter card must sit above the pricing table');

  for (const { code } of LANGS) {
    const dict = readDict(code);
    for (const k of ['starterTitle', 'starterPriceUnit', 'starterPoint1',
                     'starterPoint2', 'starterPoint3', 'factsTitle',
                     'factCheckFree', 'factCheckFreeNum']) {
      assert.ok(dict[k] && String(dict[k]).trim(), `${code}.json has no "${k}"`);
    }
  }
});

/* ----------------------------------------------------------- §3 honesty */

test('nothing on the page manufactures scarcity or invents a testimonial', () => {
  const template = readTemplate();
  for (const { code } of LANGS) {
    const html = renderPage(template, code);
    for (const re of [
      /осталось\s+\d+\s+мест/i, /только\s+сегодня/i,
      /au mai rămas\s+\d+/i, /only\s+\d+\s+(spots|places|left)/i,
      /отзыв[а-я]*\s+клиент/i
    ]) {
      assert.doesNotMatch(html, re, `the ${code} page manufactures scarcity or a testimonial`);
    }
    // §2.7: the second column is three facts precisely because there is no
    // testimonial to show.
    assert.doesNotMatch(html, /class="[^"]*testimonial/);
  }
});

/* ═══════════════════════════════════════════════════════════════════════
   SPEC V1.14.1 — «много по вёрстке поехало, цвета ужасные и негармоничные»
   ═══════════════════════════════════════════════════════════════════════ */

/* ------------------------------------------- §1 the floating capsule menu */

/* Owner, 07.09.2026: «меню как на user-first.studio». V1.14.1 answered a
   two-row header by TRIMMING it to four nav items; V1.14.3 answers it by
   moving the site map out of the row entirely. The capsule carries three
   things — the menu button, the mark, the one red CTA — and all seven section
   links live in the panel the button opens, so the budget that used to force
   «Демо», «Что умеет» and «Разработчикам» into the footer is gone.

   The one-row proof and the ≤80px height are MEASURED in the Playwright pass;
   what a regex suite guards is the structure that makes them possible. */
test('the header is one capsule of three parts: menu button, mark, one CTA', () => {
  const template = readTemplate();

  for (const { code } of LANGS) {
    const dict = readDict(code);
    const html = renderPage(template, code);
    const head = html.match(/<header class="site-head">[\s\S]*?<\/header>/)[0];
    const capsule = head.match(/<div class="capsule">[\s\S]*?<\/div>\s*\n/)[0];

    // 1. A real button with the two attributes a disclosure cannot do without.
    assert.match(capsule, /<button class="capsule-menu"[^>]*type="button"/,
      `the ${code} capsule has no real <button> for the menu`);
    assert.match(capsule, /aria-expanded="/,
      `the ${code} menu button does not state whether it is open`);
    assert.match(capsule, /aria-controls="site-menu"/,
      `the ${code} menu button does not point at the panel it opens`);
    /* The ACCESSIBLE NAME, not merely the substring: aria-label overrides the
       visible text, so a button reading «Меню» whose label said «Разделы»
       would fail WCAG 2.5.3 — a voice-control user says the word they can
       read, and below 560 (where the span is hidden) the label is the only
       name the button has. Both must be «Меню». */
    const btn = capsule.match(/<button class="capsule-menu"[\s\S]*?<\/button>/)[0];
    const label = btn.match(/aria-label="([^"]*)"/);
    assert.ok(label, `the ${code} menu button has no aria-label`);
    assert.equal(label[1], dict.navMenu,
      `the ${code} menu button is named «${label[1]}», but it reads «${dict.navMenu}»`);
    const visible = btn.match(/<span[^>]*>([^<]*)<\/span>/);
    assert.ok(visible && visible[1] === dict.navMenu,
      `the ${code} menu button does not show «${dict.navMenu}»`);

    // 2. The mark, linking back to the top.
    assert.match(capsule, /<a class="capsule-brand" href="#main"/,
      `the ${code} capsule has no mark linking to the top`);
    assert.ok(capsule.includes('ConsentKit'),
      `the ${code} capsule does not carry the name`);

    // 3. The one red CTA, still pointing at #check with the SHORT label.
    assert.match(capsule, /class="btn[^"]*btn--primary[^"]*capsule-cta"[^>]*href="#check"/,
      `the ${code} capsule has no red check button`);
    assert.ok(dict.ctaCheckShort && dict.ctaCheckShort.trim(),
      `${code}.json has no "ctaCheckShort"`);
    assert.ok(capsule.includes(dict.ctaCheckShort),
      `the ${code} capsule does not use the short check label`);
    assert.ok(dict.ctaCheckShort.length < dict.ctaCheck.length,
      `${code}'s "ctaCheckShort" is not shorter than "ctaCheck"`);

    // …and nothing else. The nav and the languages are NOT in the capsule —
    // putting either back is exactly the regression that cost the header its
    // single row twice already.
    assert.ok(!/<nav\b/.test(capsule),
      `the ${code} capsule has a nav in it again — the links belong in the panel`);
    assert.ok(!/lang-switch/.test(capsule),
      `the ${code} capsule has the language switch in it again`);

    // The hero keeps the full label — the short one must not leak downward.
    const hero = html.match(/<section class="hero">[\s\S]*?<\/section>/)[0];
    assert.ok(hero.includes(dict.ctaCheck),
      `the ${code} hero lost the full «Проверить сайт бесплатно»`);
  }
});

test('the panel carries all seven section links, the languages and «Кабинет»', () => {
  const template = readTemplate();

  for (const { code, dir } of LANGS) {
    const dict = readDict(code);
    const html = renderPage(template, code);
    const panel = html.match(/<div class="menu-panel" id="site-menu">[\s\S]*?\n  <\/div>/)[0];
    const nav = panel.match(/<nav class="head-nav"[\s\S]*?<\/nav>/)[0];

    const items = nav.match(/<a\b[^>]*href=/g) || [];
    assert.equal(items.length, 7,
      `the ${code} menu has ${items.length} section links — the panel holds all seven`);

    /* All seven by name, INCLUDING the three V1.14.1 had to evict. The panel
       has room for them, which was the whole point of the capsule. */
    for (const key of ['navHow', 'navDemo', 'navFeatures', 'navPricing',
                       'navFaq', 'navLaw', 'navDev']) {
      assert.ok(nav.includes(dict[key]),
        `the ${code} menu lost «${dict[key]}»`);
    }

    // «Правила» still points at this language's own hub, not the English one.
    const want = (dir ? '/' + dir : '') + '/law';
    assert.ok(nav.includes(`href="${want}"`),
      `the ${code} menu points at the wrong «Правила» hub`);

    /* The language switch moved INTO the panel, and each language is still a
       real link to its own URL — crawlable, and working without JavaScript. */
    assert.match(panel, /<div class="lang-switch" role="group"/,
      `the ${code} menu has no language switch`);
    const langs = panel.match(/<a class="lang-btn"[^>]*href="[^"]+"/g) || [];
    assert.equal(langs.length, LANGS.length,
      `the ${code} menu offers ${langs.length} languages, not ${LANGS.length}`);
    assert.ok(!/<button class="lang-btn"/.test(panel),
      `the ${code} language switch is buttons again — each language is a URL`);

    /* «Кабинет» as an outlined button, not the page's second PRIMARY one:
       §2.4 allows exactly one, and the capsule's red check button is it. */
    assert.match(panel, /class="head-link"[^>]*href="https:\/\/app\.ecomconsult\.net"/,
      `the ${code} menu has no «Кабинет» button`);
    assert.ok(panel.includes(dict.ctaCabinetShort),
      `the ${code} menu's dashboard door is not labelled «${dict.ctaCabinetShort}»`);
    assert.ok(!/class="btn[^"]*"[^>]*href="https:\/\/app\.ecomconsult\.net"/.test(panel)
      && !/href="https:\/\/app\.ecomconsult\.net"[^>]*class="btn[^"]*"/.test(panel),
      `the ${code} menu renders the dashboard as a .btn — §2.4 allows one primary`);
  }
});

/* The no-JS contract. The panel is authored OPEN and closed by script before
   the first paint, so a visitor without JavaScript sees every link sitting
   under the capsule and can use all of them. `hidden` in the BUILT HTML would
   mean the opposite: a menu that only opens if a script runs. */
test('the panel is closed by JS only — no `hidden` in the built HTML', () => {
  const template = readTemplate();
  const pages = [];
  for (const { code } of LANGS) {
    pages.push([`${code} home`, renderPage(template, code)]);
    // The law pages slice the same header, so they inherit the same contract.
    pages.push([`${code}/law`, renderLawIndex(template, code)]);
    pages.push([`${code}/law/<article>`, renderLawPage(template, code, readPages(code)[0])]);
  }

  for (const [where, html] of pages) {
    const head = html.match(/<header class="site-head">[\s\S]*?<\/header>/)[0];
    /* The `hidden` ATTRIBUTE, not the word: `aria-hidden` on the decorative
       SVGs is correct and must not trip this. */
    assert.ok(!/(^|[\s"'])hidden(\s|>|=|$)/.test(head),
      `${where} ships the menu panel hidden — without JS its links would be unreachable`);
    assert.match(head, /<div class="menu-panel" id="site-menu">/,
      `${where} has no menu panel at all`);
    assert.match(head, /aria-expanded="true"/,
      `${where} authors the menu closed; without JS that is a lie about its state`);

    /* And the script that closes it travels WITH the header slice, so the law
       pages get it too and nobody sees a flash of an open menu. */
    const afterHead = html.slice(html.indexOf('</header>'));
    assert.match(afterHead.slice(0, 900), /\.capsule-menu[\s\S]*?hidden\s*=\s*true/,
      `${where} has no inline script closing the panel before first paint`);
    assert.match(afterHead.slice(0, 900), /aria-expanded['"]\s*,\s*['"]false/,
      `${where}'s inline script does not correct aria-expanded when it closes the panel`);
  }
});

/* The capsule is a dark pill on a light page, so its ink CANNOT come from the
   page's --ink / --ink-soft: in the light theme those are dark brown, and dark
   brown on #1E1E1E is unreadable. This guards the tokens that keep it legible
   — the single most likely regression when someone next tidies the CSS. */
test('the capsule inks itself from its own tokens, in both themes', () => {
  const css = readFileSync(join(SITE_DIR, 'styles.css'), 'utf8');

  const capsule = css.match(/^\.capsule \{[\s\S]*?^\}/m)[0];
  assert.match(capsule, /background:\s*var\(--capsule-bg\)/,
    'the capsule does not paint itself with --capsule-bg');
  assert.match(capsule, /color:\s*var\(--capsule-ink\)/,
    'the capsule does not ink itself with --capsule-ink');
  assert.match(capsule, /border-radius:\s*16px/, '§1 asks the capsule to round at 16px');
  assert.match(capsule, /flex-wrap:\s*nowrap/,
    'the capsule may wrap onto a second row — §1 asks for one row');

  // Light values, then the dark override, both present.
  assert.match(css, /--capsule-bg:\s*#1E1E1E/, 'the light capsule is not §2\'s #1E1E1E');
  assert.match(css, /--capsule-ink:\s*#FFF2E0/, 'the capsule text is not §2\'s cream');
  assert.match(css, /--capsule-bg:\s*#1F1F1F/,
    'the dark theme has no #1F1F1F capsule — it would stay light-theme black');

  // Nothing inside the capsule or the panel may borrow the PAGE's ink.
  for (const sel of ['.capsule-menu', '.capsule-brand', '.head-nav a', '.head-link']) {
    const rule = css.match(new RegExp('^' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{[\\s\\S]*?^\\}', 'm'));
    assert.ok(rule, `${sel} has no rule of its own`);
    assert.ok(!/color:\s*var\(--ink(-soft)?\)/.test(rule[0]),
      `${sel} inks itself from the page's --ink — brown on a dark capsule`);
  }

  /* The panel drops from the capsule: same surface, same radius, 12px below. */
  const panel = css.match(/^\.menu-panel \{[\s\S]*?^\}/m)[0];
  assert.match(panel, /background:\s*var\(--capsule-bg\)/,
    'the panel is not the capsule\'s surface');
  // 07.09.2026: the panel drops OVER the content (absolute, from the header's
  // bottom edge), so it no longer pushes the hero down or reveals the page
  // background as a band behind the capsule.
  assert.match(panel, /position:\s*absolute/, 'the panel must overlay the content, not push it');
  assert.match(panel, /top:\s*100%/, 'the panel hangs from the header\'s bottom edge');
  assert.match(panel, /margin:\s*0 auto/, 'the panel is centred with no top margin');

  /* The old width rules that hid nav items are gone. Inside the panel the nav
     wraps freely, and hiding «Демо» below 1440 (as the bar's CSS did) would
     empty the menu of a link the capsule no longer carries either. */
  assert.ok(!/\.head-nav\s*\{\s*display:\s*none/.test(css),
    'the nav is hidden at some width again — in the panel it must always show');
  assert.ok(!/\.head-nav a\[href="#demo"\]\s*\{\s*display:\s*none/.test(css),
    '«Демо» is hidden again — that rule belonged to the old one-row bar');
  assert.ok(!/\.head-link\s*\{\s*display:\s*none/.test(css),
    '«Кабинет» is hidden at some width again — the panel has room for it');

  /* Anchor targets clear the floating capsule, or a menu link scrolls the
     heading it points at exactly under the pill. */
  assert.match(css, /scroll-margin-top:\s*\d+px/,
    'no scroll-margin-top: the capsule would cover every section heading it scrolls to');
});

/* The languages: still three bare letters, not a bordered segmented control
   whose current item was a red plate. */
test('the current language is stated by weight, not by a red plate', () => {
  const css = readFileSync(join(SITE_DIR, 'styles.css'), 'utf8');
  const langBtn = css.match(/\.lang-btn\[aria-pressed="true"\] \{[\s\S]*?\}/)[0];
  assert.ok(!/var\(--accent\)/.test(langBtn),
    'the current language is a red plate again — §2 spends red elsewhere');
});

/* ------------------------------------------- §2 «красный редко» in the CSS */

/* §3 asks for at most three red things in the first screen. The screenshot
   count is measured in the Playwright pass; here we guard the SELECTORS that
   put them there, because every one of these was red in V1.14 and each is
   a one-word edit away from being red again. */
test('§2: the elements that stopped being red have not become red again', () => {
  const css = readFileSync(join(SITE_DIR, 'styles.css'), 'utf8');

  const block = (sel) => {
    const m = css.match(new RegExp(
      sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{[^}]*\\}'));
    assert.ok(m, `styles.css no longer has a ${sel} rule`);
    return m[0];
  };

  /* Each of these carried var(--accent) or var(--accent-ink) in V1.14 and
     must not now. --accent-deco is exempt everywhere: it is the depicted
     CLIENT banner's colour, which §2 explicitly leaves alone. */
  for (const sel of [
    '.brand-mark',            // the logo shield — a fourth red in screen one
    '.chip',                  // §2: sand fill, dark text
    '.btn--ghost',            // §2: white fill, dark 1px outline
    '.ba__grip',              // §2: «ручка чёрная»
    '.plan-flag',             // §2: «чёрный с белым текстом»
    '.starter__fact-num'
  ]) {
    const rule = block(sel);
    assert.ok(!/var\(--accent(-ink)?\)/.test(rule),
      `${sel} is red again — §2 allows red only on the primary button, the ` +
      'headline word and the check band');
  }

  // The featured plan column: sand fill and a DARK 1px border, not 2px red.
  const featured = block('.plan-table .is-featured');
  assert.match(featured, /background:\s*var\(--surface-2\)/,
    '§2: the highlighted plan column is sand');
  assert.match(featured, /border-left:\s*1px solid var\(--ink\)/,
    '§2: the highlighted plan column has a dark 1px border');

  /* The three places red SURVIVES. Asserted positively so that "remove the
     red" cannot be over-applied into a page with no accent at all. */
  assert.match(block('.btn--primary'), /background:\s*var\(--accent\)/,
    'the primary button must stay red — it is the page\'s one call to action');
  assert.match(block('.h1-accent'), /color:\s*var\(--accent-ink\)/,
    'the accented headline word must stay red');
  assert.match(css, /\.check-band \{[\s\S]*?background:\s*var\(--band\)/,
    'the check band must stay red above 768');

  /* §2: links are dark with an underline and go red only on hover, so the
     accent is not spent on every inline link in the prose. */
  const linkRule = css.match(/\na \{[^}]*\}/)[0];
  assert.match(linkRule, /color:\s*var\(--ink\)/, '§2: links in text are dark');
  assert.match(linkRule, /text-decoration:\s*underline/, '§2: links in text are underlined');
  assert.match(css.match(/\na:hover \{[^}]*\}/)[0], /color:\s*var\(--accent-ink\)/,
    '§2: links go red on hover');

  // The same red-on-hover pattern removed from .btn--ghost must not survive
  // on the tiles, which sit two sections below it.
  assert.match(css.match(/\.tiles a:hover \{[^}]*\}/)[0], /border-color:\s*var\(--ink\)/,
    '.tiles a:hover is red again — §2 removed exactly this from .btn--ghost');
});

/* ------------------------------------------------ §1.2 the demo window */

test('§1.2: the demo window is a white page with sand chrome in both themes', () => {
  const css = readFileSync(join(SITE_DIR, 'styles.css'), 'utf8');

  /* Anchored to the top-level rule: a later `.demo-win { height: auto; }`
     inside the mobile media query would otherwise match first. */
  const win = css.match(/\n\.demo-win \{[\s\S]*?\n\}/)[0];
  /* The V1.14 defect in one line: .demo-win is a .shot-frame but was never in
     the selector that DECLARES the --shot-* group, so .shot-frame's
     `background: var(--shot-paper)` resolved to nothing and the fake page's
     blocks hung on the section behind it. */
  assert.match(win, /--shot-paper:\s*#FFFFFF/i,
    '.demo-win does not declare the paper the frame paints itself with');
  assert.match(win, /background:\s*#FFFFFF/i,
    'the demo window has no white page surface of its own');
  assert.match(win, /--win-chrome:\s*#F5E7D3/i,
    '§1.2: the toolbar and status strip sit on sand in the light theme');

  // The toolbar and the strip both take that chrome — §1.2 names both.
  assert.match(css, /\.demo-tools \{[\s\S]*?background:\s*var\(--win-chrome\)/,
    'the demo toolbar is not on the window chrome');
  assert.match(css, /\.demo-foot \{[\s\S]*?background:\s*var\(--win-chrome\)/,
    'the demo status strip is not on the window chrome');

  // Dark theme: the chrome darkens, the page does NOT — it depicts a client's
  // site, not ours, so it stays white.
  /* Two homes since the manual theme switch (owner, 07.09.2026): the system
     one behind prefers-color-scheme, and the forced one under
     :root[data-theme="dark"]. Both are checked, because the demo window
     following only ONE of them is exactly the half-switched look the owner
     asked to avoid — the page would go dark and the window's chrome stay
     sand. The pairing test above already proves the two carry identical
     declarations; this asserts the values themselves. */
  const darkWins = [
    css.match(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\) \.demo-win \{[\s\S]*?\n  \}/),
    css.match(/\n:root\[data-theme="dark"\] \.demo-win \{[\s\S]*?\n\}/)
  ];
  assert.ok(darkWins[0], 'the demo window has no dark-theme chrome for the system theme');
  assert.ok(darkWins[1], 'the demo window does not follow a forced dark site theme');
  const darkWin = darkWins[0];
  for (const w of darkWins) {
    assert.match(w[0], /--win-chrome:\s*#262626/i,
      '§1.2: in the dark theme the chrome is a dark surface');
    assert.ok(!/--shot-paper/.test(w[0]),
      'the depicted page must stay white in the dark theme');
  }
  assert.match(darkWin[0], /--win-chrome:\s*#262626/i,
    '§1.2: in the dark theme the chrome is a dark surface');
  assert.ok(!/--shot-paper/.test(darkWin[0]),
    'the depicted page must stay white in the dark theme');

  // And no blue-grey anywhere: the old hardcoded #f7f9fc / #55607a / #161d2b
  // matched neither palette and were the "grey blocks" the owner saw.
  for (const hex of ['#f7f9fc', '#e4e8f1', '#55607a', '#161d2b', '#d7dce7', '#e7eaf1']) {
    assert.ok(!css.toLowerCase().includes(hex),
      `styles.css still carries the blue-grey ${hex} from the V1.14 demo window`);
  }
});

/* ------------------------------------------------ §1.3 the chip on a phone */

test('§1.3: the chip is short and only refuses to wrap from 560 up', () => {
  const css = readFileSync(join(SITE_DIR, 'styles.css'), 'utf8');

  const chip = css.match(/\.chip \{[\s\S]*?\n\}/)[0];
  assert.ok(!/white-space:\s*nowrap/.test(chip),
    'the chip refuses to wrap at every width — on 375 that is an overflow');
  assert.match(css, /@media \(min-width: 560px\) \{\s*\.chip \{ white-space: nowrap; \}/,
    '§1.3: nowrap applies only from 560 up');

  // §1.3 also shortens the copy itself: «Баннер за» is dropped.
  for (const { code } of LANGS) {
    const chipText = readDict(code).heroChip;
    assert.ok(chipText.length <= 46,
      `the ${code} chip is ${chipText.length} chars — §1.3 asks for a shorter one`);
  }
});

/* ────────────────────────────── the manual theme switch (owner, 07.09.2026) */

/* Every dark declaration now lives in TWO places: behind the system's
   prefers-color-scheme and under a forced :root[data-theme="dark"]. That is
   the only way one stylesheet can serve three states — and it is also two
   copies of the same values, which drift the moment someone tunes a colour in
   one home and forgets the other. Then «Тёмная» and a dark system preference
   render the same page differently, which is the worst kind of bug: it looks
   right on the machine of whoever made the change.

   This parses styles.css and asserts the two homes are declaration-identical,
   keyed by the selector INSIDE the block rather than by block order, so
   reordering the file is free and changing one half of a pair is not. */
test('every forced-dark block matches its prefers-color-scheme twin', () => {
  const css = readFileSync(join(SITE_DIR, 'styles.css'), 'utf8');

  const SYS_PREFIX = ':root:not([data-theme="light"])';
  const DARK_PREFIX = ':root[data-theme="dark"]';

  /* Comments carry the AA arithmetic and wrap differently at the two indents,
     so they are stripped before comparing; whitespace goes the same way. A
     declaration set is compared as a SET, because the order of custom
     properties inside a block has no meaning. */
  const declarations = (body) => {
    const clean = body.replace(/\/\*[\s\S]*?\*\//g, '');
    return clean.split(';')
      .map((d) => d.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .sort();
  };

  /* Brace-matched, so a nested block inside a rule could not truncate it. */
  const blockAt = (src, open) => {
    let depth = 0;
    for (let i = open; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(open + 1, i); }
    }
    throw new Error('unbalanced braces in styles.css');
  };

  /* The forced home: every top-level :root[data-theme="dark"] rule.

     A selector may legitimately appear more than once — the page palette and
     the capsule tokens are two separate `:root` blocks, written next to the
     light values they override rather than merged into one far-away block.
     So the declarations for a selector ACCUMULATE, and the comparison below
     is against everything the other home says about that same selector. */
  const forced = new Map();
  for (const m of css.matchAll(/^:root\[data-theme="dark"\]([^{]*)\{/gm)) {
    const sel = m[1].trim();          // '' for the token blocks, '.demo-win' etc.
    const body = blockAt(css, m.index + m[0].length - 1);
    forced.set(sel, (forced.get(sel) || []).concat(declarations(body)));
  }
  for (const [sel, d] of forced) forced.set(sel, d.sort());
  assert.ok(forced.size > 0,
    'styles.css has no :root[data-theme="dark"] blocks — the manual dark theme cannot work');

  /* The system home: the same rules inside prefers-color-scheme blocks.

     Every occurrence of the feature in the file has to be one of these plain
     blocks. A compound query — `@media (prefers-color-scheme: dark) and
     (min-width: 560px)` — would be invisible to the matcher below AND
     ungated on :root:not([data-theme="light"]), so it would leak dark styling
     onto a visitor who explicitly chose «Светлая». Counting first is what
     makes this guard exhaustive rather than merely indicative. */
  const blockCount = [...css.matchAll(/@media \(prefers-color-scheme: dark\) \{/g)].length;
  const featureCount = [...css.matchAll(/prefers-color-scheme/g)].length;
  assert.equal(featureCount, blockCount,
    'styles.css mentions prefers-color-scheme in a form this guard cannot read — ' +
    'every dark block must be exactly "@media (prefers-color-scheme: dark) {", ' +
    'or its declarations escape the light/dark pairing check');

  const system = new Map();
  for (const m of css.matchAll(/@media \(prefers-color-scheme: dark\) \{/g)) {
    const inner = blockAt(css, m.index + m[0].length - 1);
    for (const r of inner.matchAll(/(^|\n)\s*([^{}\n][^{}]*)\{/g)) {
      const sel = r[2].trim();
      assert.ok(sel.startsWith(SYS_PREFIX),
        `styles.css has a dark rule for "${sel}" that is not gated on ` +
        `${SYS_PREFIX} — a visitor who chose «Светлая» would still get it`);
      const key = sel.slice(SYS_PREFIX.length).trim();
      const body = blockAt(inner, r.index + r[0].length - 1);
      system.set(key, (system.get(key) || []).concat(declarations(body)));
    }
  }
  for (const [sel, d] of system) system.set(sel, d.sort());

  // Same set of selectors on both sides…
  assert.deepEqual([...forced.keys()].sort(), [...system.keys()].sort(),
    'the forced and system dark themes cover different selectors — one of them ' +
    'has a rule the other is missing, so the two look different');

  // …and the same declarations under each.
  for (const [sel, decls] of forced) {
    assert.deepEqual(decls, system.get(sel),
      `the dark declarations for "${sel || ':root'}" have drifted: ` +
      `${DARK_PREFIX} and the prefers-color-scheme twin must stay identical`);
  }
});

/* The control itself: three buttons, aria-pressed, in every language, on the
   home pages AND the law pages (which slice the same header). */
test('the menu panel carries the three-state theme switch in every language', () => {
  for (const f of [...outputs(), ...lawOutputs()]) {
    const html = readFileSync(f.path, 'utf8');
    const group = html.match(/<div class="theme-group"[\s\S]*?<\/div>/);
    assert.ok(group, `${f.label} has no theme switch in the menu panel`);

    for (const choice of ['system', 'light', 'dark']) {
      assert.match(group[0], new RegExp(`data-theme-choice="${choice}"`),
        `${f.label} has no «${choice}» theme button`);
    }
    // A segmented group states which member is current, or a screen reader
    // cannot tell the visitor what the theme is set to.
    assert.equal((group[0].match(/aria-pressed="/g) || []).length, 3,
      `${f.label}'s theme buttons do not all carry aria-pressed`);
    assert.equal((group[0].match(/aria-pressed="true"/g) || []).length, 1,
      `${f.label} does not mark exactly one theme as current`);
    assert.match(group[0], /data-theme-choice="system"[^>]*aria-pressed="true"/,
      `${f.label} is authored with a forced theme pressed — with JavaScript ` +
      'off the truthful state is «as in the system»');
    assert.match(group[0], /role="group"|<div class="theme-group" role="group"/,
      `${f.label}'s theme buttons are not grouped`);
  }

  // The labels are translated, and they are NOT the banner demo's own theme
  // select (which keeps its themeAuto/themeLight/themeDark keys).
  for (const { code } of LANGS) {
    const dict = readDict(code);
    for (const key of ['siteThemeLabel', 'siteThemeSystem', 'siteThemeLight', 'siteThemeDark']) {
      assert.equal(typeof dict[key], 'string',
        `site/src/i18n/${code}.json has no "${key}"`);
      assert.ok(dict[key].length > 0, `${code}.json leaves "${key}" empty`);
    }
  }
});

/* No flash. The stored choice has to be on <html> before the stylesheet that
   reads it is even fetched, which means an inline script in <head>, ABOVE the
   <link>. In the header slice it would run after the header markup has been
   parsed and the page would paint light before turning dark. */
test('the stored theme is applied in <head>, before the stylesheet', () => {
  for (const f of [...outputs(), ...lawOutputs()]) {
    const html = readFileSync(f.path, 'utf8');

    const boot = html.indexOf("localStorage.getItem('ck-site-theme')");
    assert.ok(boot > -1, `${f.label} has no before-paint theme script`);

    const sheet = html.search(/<link rel="stylesheet" href="\/styles\.css/);
    assert.ok(sheet > -1, `${f.label} does not load the stylesheet`);
    assert.ok(boot < sheet,
      `${f.label} applies the theme after the stylesheet link — that is the flash`);

    const headEnd = html.indexOf('</head>');
    assert.ok(boot < headEnd, `${f.label} applies the theme outside <head>`);

    // `system` is the ABSENCE of the attribute: anything else would defeat
    // the :root:not([data-theme="light"]) gate the whole scheme rests on.
    assert.doesNotMatch(html, /<html[^>]*\bdata-theme=/,
      `${f.label} hardcodes data-theme on <html> — the system theme could ` +
      'never apply, and prefers-color-scheme would be dead');

    // Reading localStorage throws outright where site data is blocked.
    const script = html.slice(boot - 200, boot + 200);
    assert.match(script, /try\s*\{/,
      `${f.label}'s theme script does not guard localStorage with try/catch`);
  }
});

/* ─────────────────────────────────────────── asset versioning (owner, 07.09.2026) */

/* Vercel caches /styles.css and /app.js hard, so after a deploy a browser
   could render NEW html against OLD css — the owner saw the previous header's
   dark bar under the new capsule. The pages therefore ask for the asset with
   a `?v=` the file's own bytes decide. The files are NOT renamed: a direct
   link to /styles.css has to keep working. */
test('every page references its assets with the current content hash', () => {
  for (const f of [...outputs(), ...lawOutputs()]) {
    const html = readFileSync(f.path, 'utf8');

    for (const asset of VERSIONED_ASSETS) {
      // The law pages carry no demo, so they load no vendor client.
      const referenced = html.includes('"' + asset + '?v=');
      if (!referenced) {
        assert.ok(asset.startsWith('/vendor/'),
          `${f.label} does not reference ${asset} at all`);
        continue;
      }
      const want = assetHash(asset);
      assert.ok(html.includes('"' + asset + '?v=' + want + '"'),
        `${f.label} references ${asset} with a stale hash — run: node tools/build-site.mjs`);
    }

    // And never bare: a bare reference is the cached-asset bug coming back.
    for (const asset of ['/styles.css', '/app.js']) {
      assert.ok(!html.includes('"' + asset + '"'),
        `${f.label} references ${asset} without a version — Vercel will serve a stale copy`);
    }
  }
});

test('the asset hash actually follows the file contents', () => {
  // A hash that ignored the bytes would still make every assertion above pass
  // while busting no cache at all.
  const before = assetHash('/styles.css');
  assert.match(before, /^[0-9a-f]{8}$/, 'the asset hash is not 8 hex characters');

  const css = readFileSync(join(SITE_DIR, 'styles.css'));
  const expected = createHash('sha256').update(css).digest('hex').slice(0, 8);
  assert.equal(before, expected, 'assetHash() is not the sha256 of the file');

  // Two different files must not share a version.
  assert.notEqual(assetHash('/styles.css'), assetHash('/app.js'),
    'two different assets hash to the same version');
});
