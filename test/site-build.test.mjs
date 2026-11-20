/* The three rendered pages must be exactly what site/src/ says they are.
 *
 * site/index.html (ro), site/ru/index.html and site/en/index.html are GENERATED from
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
  LANGS, DEFAULT_LANG, SRC_DIR, SITE_DIR, TEMPLATE, ROOT_BYPASS, staleOutputs,
  readDict, readTemplate, renderPage, renderSitemap, buildAll, outputs,
  pageUrl, jsonForScript, runtimeDict,
  readPages, pageSiblings, lawUrl, lawPath, lawIndexUrl, lawOutputs,
  renderLawPage, renderLawIndex, bodyWords, faqJsonLd,
  VERSION, BUILD_DATE, updatedText,
  SITE_STATS, pluralForm, trustServicesText,
  MARQUEE_CARDS, renderMarquee, readClientLocales,
  VERSIONED_ASSETS, assetHash, THEME_META, THEME_BOOT, THEME_KEY, THEME_COLORS
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

/* Owner, 23.09.2026: the root flipped from EN to RO, which orphaned site/ro/
   and the four English slug directories under site/law/. The build removes
   generated output it no longer emits; a leftover would keep deploying and
   answering 200 at a URL nothing links to (and /ro/* is a 301 anyway). */
test('no generated page is left behind that the build no longer emits', () => {
  assert.deepEqual(staleOutputs().map((s) => s.label), [],
    'stale generated output — run: node tools/build-site.mjs');
});

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
  // SPEC V1.24 §5 replaced the hero's skeleton replica with a real screenshot,
  // and with it went the last data-i18n on `mockText` and `mockSettings`. Both
  // keys are still read — by renderMarquee() in build-site.mjs, which composes
  // every marquee card from d.mockTitle/mockText/mockAccept/mockReject/
  // mockSettings, and the marquee test below now asserts both of them reach
  // the page. This scanner only reads the template and app.js, so a
  // build-consumed key belongs in this list, exactly like the head keys above.
  const BUILD_KEYS = ['htmlLang', 'docTitle', 'docDesc', 'pageLanguage',
                      'pages', 'lawIndexTitle', 'lawIndexDesc', 'lawIndexLede', 'lawDated',
                      'statsUpdated', 'statsMonths',
                      /* The marquee's own-language replica cards (renderMarqueeCard in
                         build-site.mjs) read all five mock* keys. Until 08.09.2026 the
                         before/after slider's template used three of them too, which is
                         why only two were listed here; the slider is gone. */
                      'mockTitle', 'mockText', 'mockAccept', 'mockReject', 'mockSettings',
                      /* SPEC V1.30 §3.2: the trust line's services item is
                         rendered by the build (trustServicesText) in the page
                         language's plural form, so its three forms are read
                         there and never by the template or app.js. The
                         consents and sites forms ARE read by app.js through
                         plural(n, 'trustConsents' / 'trustSites'). */
                      'trustServicesOne', 'trustServicesFew', 'trustServicesMany',
                      /* SPEC V1.30.3 §3: the four data cards are drawn by the
                         build (renderFigures), which reads these four. */
                      'trustLanguages', 'figReadiness', 'figAccept', 'figExample'];

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

/* Owner 20.11.2026: the page has exactly one red filled button — the free
   check. The highlighted Starter column used to get a btn--primary «Открыть
   кабинет»; now every plan's CTA is the same outline button. Asserted on the
   ctaLink() body itself, since no test executes the renderer. */
test('the pricing renderer emits no red filled button, the featured column included', () => {
  const app = readFileSync(join(SRC_DIR, '..', 'app.js'), 'utf8');
  const body = app.match(/function ctaLink\(d\) \{[\s\S]*?\n  \}\n/);
  assert.ok(body, 'app.js has no ctaLink(d) — the pricing CTA moved, move this test with it');
  assert.doesNotMatch(body[0], /btn--primary/,
    'the pricing CTA can still be btn--primary — the free check is the only red filled button');
  assert.match(body[0], /el\('a', 'btn btn--sm btn--ghost'\)/,
    'every pricing CTA should be the outline btn--ghost');
  // And nowhere else in the pricing renderer either.
  const render = app.match(/function renderPricing\(\) \{[\s\S]*?\n  \}\n/);
  assert.ok(render, 'app.js has no renderPricing()');
  assert.doesNotMatch(render[0], /btn--primary/, 'renderPricing() draws a red filled button');
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
      /* The root carries ?lang=ro so the root's language redirects in
         site/vercel.json (all `missing: lang`) let an explicit choice through. */
      const href = other.dir ? '/' + other.dir : '/' + ROOT_BYPASS;
      const esc = href.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
      assert.match(html, new RegExp(`<a class="lang-btn" href="${esc}"`),
        `the ${l.code} page's switcher does not link to ${href}`);
    }
    // The switcher must be plain links, not the old JS-driven buttons.
    assert.doesNotMatch(html, /<button[^>]*class="lang-btn"/,
      `the ${l.code} page still renders the switcher as buttons`);
  }
});

/* Owner, 23.09.2026: / is Romanian and detects the visitor's language; the
   old /ro URLs are 301s. Pinned here because vercel.json is hand-edited and a
   detection rule without `missing: lang` would trap a visitor who picks
   Romanian in the switcher on the page they are trying to leave. */
test('site/vercel.json: /ro is a 301 to the root, and only / detects language', () => {
  const cfg = JSON.parse(readFileSync(join(SITE_DIR, 'vercel.json'), 'utf8'));
  const rules = cfg.redirects || [];
  const find = (src) => rules.filter((r) => r.source === src);

  assert.deepEqual(find('/ro').map((r) => [r.destination, r.statusCode]), [['/', 301]]);
  assert.deepEqual(find('/ro/:path*').map((r) => [r.destination, r.statusCode]), [['/:path*', 301]]);

  const detect = rules.filter((r) => (r.has || []).some((h) => h.key === 'ck-lang' || h.key === 'accept-language'));
  assert.equal(detect.length, 4, 'expected two cookie rules and two Accept-Language rules');
  for (const r of detect) {
    assert.equal(r.source, '/', `a language rule matches ${r.source} — deep links must stay put`);
    assert.equal(r.permanent, false, 'language detection must not be a permanent redirect');
    assert.ok((r.missing || []).some((m) => m.type === 'query' && m.key === 'lang'),
      `the rule to ${r.destination} can not be bypassed with ?lang=`);
    assert.ok(['/ru', '/en'].includes(r.destination), `unexpected destination ${r.destination}`);
    const header = (r.has || []).find((h) => h.key === 'accept-language');
    if (header) {
      assert.ok(header.value.startsWith('^'), 'the Accept-Language regex must be anchored');
      assert.ok((r.missing || []).some((m) => m.type === 'cookie' && m.key === 'ck-lang'),
        'Accept-Language may only decide when there is no ck-lang cookie');
    }
  }
  // Cookie rules come first, so a remembered choice beats the browser.
  const firstHeader = rules.findIndex((r) => (r.has || []).some((h) => h.key === 'accept-language'));
  const lastCookie = rules.map((r) => (r.has || []).some((h) => h.key === 'ck-lang')).lastIndexOf(true);
  assert.ok(lastCookie < firstHeader, 'the ck-lang rules must precede the Accept-Language rules');

  // The regexes do what the comment says (anchored, first language wins).
  const re = (dest) => new RegExp(detect.find((r) => r.destination === dest &&
    r.has.some((h) => h.key === 'accept-language')).has[0].value);
  assert.ok(re('/ru').test('ru-RU,ru;q=0.9,en-US;q=0.8'));
  assert.ok(re('/ru').test('ru'));
  assert.ok(!re('/ru').test('ro-RO,ru;q=0.9'), 'a Romanian-first browser must stay on /');
  assert.ok(re('/en').test('en-US,en;q=0.9'));
  assert.ok(!re('/en').test('ro,en;q=0.8'));
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

/* ------------------------------------------------------ «Что умеет» cards */

/* Ten feature cards. .cards is `repeat(auto-fit, minmax(290px, 1fr))` with a
   20px gap inside 1072px of content, so three columns fit (3×290 + 2×20 = 910)
   and four do not (1220) — which makes ten cards a 3+3+3+1, the tenth alone on
   the last row. That orphan is deliberate and not left flush left: a scoped
   `#features .cards > .card:last-child:nth-child(3n+1) { grid-column: 2 }` in
   site/styles.css centres it, above 930px only, so the rule cannot invent a
   second column on the phone-width single-column grid.

   Counting the cards alone would pass a section whose tenth card carries the
   template's Russian fallback on the EN and RO pages, so assert that each one
   actually renders its own dictionary strings — the same reasoning as the
   «How it works» test above. */
/* UPDATED for SPEC V1.24 §1 — this used to count the ten `.card` articles the
   section held before the rewrite. The section is now six `.pcard` product
   cards (each with a screenshot) plus a four-card «И ещё» row, so the old
   count of ten and the old `feat1..feat10` sweep describe a layout that no
   longer exists. Everything else the test cared about is kept and tightened:
   every feature card still has to carry its OWN dictionary strings rather than
   the template's Russian fallback, in all three languages. The card structure
   itself (pill, h3, img) is asserted in test/site-product.test.mjs. */
test('«What it does» renders six product cards and four more, in every language', () => {
  const template = readTemplate();

  // The six keys the product cards carry, in the order §1 lists them, and the
  // four the «И ещё» row keeps. feat4 is gone: §1 folds «34 языка» into feat7.
  const PCARD_TEXT = ['feat10', 'feat2', 'feat3', 'feat7', 'pcard5', 'feat6'];
  const MORE = ['feat1', 'feat5', 'feat8', 'feat9'];

  for (const { code } of LANGS) {
    const html = renderPage(template, code);
    const section = html.match(/<section id="features">([\s\S]*?)\n  <\/section>/);
    assert.ok(section, `the ${code} page has no <section id="features">`);

    const pcards = [...section[1].matchAll(/<article class="pcard [^"]*">[\s\S]*?<\/article>/g)];
    assert.equal(pcards.length, 6,
      `the ${code} page renders ${pcards.length} product cards, not 6`);
    const more = [...section[1].matchAll(/<article class="feat">[\s\S]*?<\/article>/g)];
    assert.equal(more.length, 4,
      `the ${code} page's «И ещё» row has ${more.length} cards, not 4`);

    const dict = readDict(code);
    for (const base of [...PCARD_TEXT, ...MORE]) {
      for (const key of [`${base}Title`, `${base}Text`]) {
        assert.ok(dict[key] && dict[key].trim(),
          `site/src/i18n/${code}.json has no "${key}"`);
        assert.ok(section[1].includes(dict[key].replace(/</g, '&lt;').replace(/>/g, '&gt;')) ||
                  section[1].includes(dict[key]),
          `the ${code} «Что умеет» does not carry "${key}" from ${code}.json`);
      }
    }

    // feat4 was folded into feat7 — its keys must be gone, not merely unused.
    for (const key of ['feat4Title', 'feat4Text']) {
      assert.ok(!Object.prototype.hasOwnProperty.call(dict, key),
        `${code}.json still carries "${key}" — §1 folds it into feat7`);
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

  /* app.js stores no LANGUAGE (history: one theme key from 07.09.2026,
     none while the site was dark-only from 14.09.2026, one theme key again
     from SPEC V1.30.3 — asserted below).

     A language preference in storage is the exact bug this test exists for: it
     would make /ru render English for a returning visitor, because the URL
     would say Russian and the stored key would say otherwise. */
  /* UPDATED for SPEC V1.30.3 §1 — the theme toggle is back (dark by
     default, light by the visitor's choice), so app.js may write exactly ONE
     key again: the theme, through the THEME_KEY constant, which must be
     'ck-site-theme' and nothing else. It never READS storage — the head's
     boot script applies the stored choice before the first paint. */
  const keys = [...app.matchAll(/localStorage\.(?:get|set|remove)Item\(\s*([A-Za-z_$][\w$]*|'[^']*'|"[^"]*")/g)]
    .map((m) => m[1]);
  assert.deepEqual(keys, ['THEME_KEY'],
    `app.js touches localStorage with ${keys.join(', ')} — only the theme choice may be stored`);
  assert.match(app, /var THEME_KEY = 'ck-site-theme';/, 'app.js stores the theme under another key');
  assert.doesNotMatch(app, /localStorage\.getItem/, 'app.js reads storage — the boot script does that');
  assert.match(app, /try \{ window\.localStorage\.setItem\(THEME_KEY, next\); \} catch/,
    'the theme write is not wrapped in try/catch');
});

test("the demo banner runs language: 'page'", () => {
  /* SPEC V1.25 §1 — this site is the case the mode was added for: /ru/ and
     /ro/ are real pages carrying `<html lang>`, and before 0.5.21 a visitor
     with a Russian browser got a Russian banner on the Romanian page.

     Asserted against the source as it reads rather than against a literal
     `language: 'page'`, because demoConfig() deliberately keeps two values
     apart: the MODE goes to the client, while the branding line and the cookie
     table follow the page's resolved language. Collapsing them would put an
     English attribution under a Romanian banner — the same inconsistency on
     one screen that the 'auto' branch existed to avoid. */
  const app = readFileSync(join(SRC_DIR, '..', 'app.js'), 'utf8');
  assert.match(app, /\(l === 'auto'\) \? 'page'/,
    "the demo's default banner language is no longer 'page'");
  assert.match(app, /language: effective/,
    'the mode must be what reaches the client config');
  assert.match(app, /brandingFor\(resolved\)/,
    "branding must follow the resolved page language, never the literal 'page'");
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

/* UPDATED for SPEC V1.30 §3.2 — the four «Цифры» tiles became one trust
   line under the first screen's button. What this test protected moves with
   it unchanged: the live counts stay hidden until they have earned their
   place (sites from ten, consents from four figures), a static fallback means
   a failed request never leaves zeros, and the build-rendered part is true on
   day one. */
/* UPDATED for SPEC V1.30.2 §4.5 — the line left the first screen and became
   the band of big numbers before «Что умеет» (#figures, still id="trust"),
   four values: consents, services, languages, the 36 readiness points. The
   site count lost its own slot; its threshold is kept as the gate on the
   consents figure («прятать, пока мало сайтов»), and the trustSites* forms
   left the dictionaries with the slot. */
test('the trust line hides the counts while there are too few sites', () => {
  const app = readFileSync(join(SITE_DIR, 'app.js'), 'utf8');

  assert.match(app, /\/v1\/public\/stats/, 'app.js does not read the stats endpoint');
  assert.match(app, /STATS_MIN_SITES\s*=\s*10/,
    'the «show nothing under ten sites» threshold is not 10');
  assert.match(app, /stats\.sites\s*>=\s*STATS_MIN_SITES/,
    'the site count is drawn without checking the threshold');
  assert.match(app, /STATS_MIN_CONSENTS\s*=\s*1000/,
    'the consents count no longer waits for four figures');
  assert.match(app, /stats\.consents\s*>=\s*STATS_MIN_CONSENTS/,
    'the consents count is drawn without checking its threshold');
  // Both thresholds guard the one live figure, in the same condition.
  assert.match(app, /stats\.consents\s*>=\s*STATS_MIN_CONSENTS &&\s*isNum\(stats\.sites\) && stats\.sites\s*>=\s*STATS_MIN_SITES\)/,
    'the consents figure does not wait for ten sites as well');
  // A static fallback, so a failed request never leaves an empty line or zeros.
  assert.match(app, /STATS_FALLBACK/, 'the trust line has no static fallback');
  assert.match(app, /languages:\s*34/, 'the fallback does not carry the language count');
  // The live items go through the page language's plural, never a bare label.
  assert.match(app, /plural\(n, base\)/, 'the live counts are not pluralised');
  assert.match(app, /'trustConsents'/, 'app.js never draws the consents count');
  assert.doesNotMatch(app, /'trustSites'|data-trust="sites"/, 'app.js still draws a sites figure the band has no slot for');

  const template = readTemplate();
  for (const { code } of LANGS) {
    const dict = readDict(code);
    for (const key of ['trustSitesOne', 'trustSitesFew', 'trustSitesMany']) {
      assert.ok(!Object.prototype.hasOwnProperty.call(dict, key), `${code}.json still carries "${key}"`);
    }
    for (const base of ['trustServices', 'trustConsents']) {
      for (const form of ['One', 'Few', 'Many']) {
        const key = base + form;
        assert.ok(dict[key] && dict[key].includes('{n}'),
          `${code}.json has no "${key}" with an {n}`);
      }
    }
    assert.ok(dict.trustLanguages && /34/.test(dict.trustLanguages),
      `${code}.json has no "trustLanguages" carrying 34`);
    for (const token of ['{day}', '{month}', '{year}']) {
      assert.ok(dict.statsUpdated.includes(token),
        `"statsUpdated" in ${code}.json does not interpolate ${token}`);
    }
    assert.ok(Array.isArray(dict.statsMonths) && dict.statsMonths.length === 12,
      `${code}.json needs twelve month names for the «обновлено …» line`);

    // In the served HTML: the build's two facts are there, the live counts
    // are present as EMPTY hidden slots — never a number before the API has
    // said the threshold is met.
    const html = renderPage(template, code);
    const hero = html.match(/<section class="hero">[\s\S]*?\n  <\/section>/)[0];
    assert.doesNotMatch(hero, /id="trust"|hero-trust/, `the ${code} first screen still carries the trust line`);
    const band = html.match(/<section id="figures"[\s\S]*?\n  <\/section>/);
    assert.ok(band, `the ${code} page has no band of big numbers`);
    const line = band[0].match(/<div class="figures" id="trust">([\s\S]*?)<\/div>/);
    assert.ok(line, `the ${code} band has no #trust figures`);
    assert.match(line[1], /<p class="trust-item" data-trust="consents" hidden><\/p>/,
      `the ${code} band ships the consents slot filled or visible`);
    assert.doesNotMatch(line[1], /data-trust="sites"/, `the ${code} band still has a sites slot`);
    /* UPDATED for SPEC V1.30.3 §3 — four data cards after the hidden
       live slot: five <p class="trust-item">, four of them cards. */
    assert.equal((line[1].match(/<p class="trust-item[ "]/g) || []).length, 5, `the ${code} band does not hold the slot and four cards`);
    assert.equal((line[1].match(/<p class="trust-item fig"/g) || []).length, 4, `the ${code} band does not hold four data cards`);
    assert.ok(line[1].replace(/<[^>]+>/g, '').includes(dict.figReadiness.replace(/^36 ?/, '')),
      `the ${code} band does not carry the 36 readiness points`);
    assert.match(line[1], /<span class="trust-num">36<\/span>/, `the ${code} band does not set 36 apart`);
    assert.match(line[1], /<span class="trust-num">34<\/span>/, `the ${code} band does not set 34 apart`);
    /* UPDATED for SPEC V1.30.1 B2 — each item's opening number now sits in
       its own <span class="trust-num"> (weight 600, tabular figures), so the
       copy is compared as TEXT, tags removed; the wrap itself is asserted. */
    const lineText = line[1].replace(/<[^>]+>/g, '');
    assert.ok(lineText.includes(trustServicesText(dict, code)),
      `the ${code} trust line does not carry the build's services count`);
    assert.ok(lineText.includes(String(SITE_STATS.services)),
      `the ${code} trust line does not show stats.json's ${SITE_STATS.services}`);
    assert.ok(lineText.includes(dict.trustLanguages),
      `the ${code} trust line does not carry the language count`);
    assert.match(line[1], new RegExp(`<span class="trust-num">${SITE_STATS.services}</span>`),
      `the ${code} trust line does not set the services number apart`);
    // The «Цифры» section is gone, not merely hidden.
    assert.doesNotMatch(html, /id="numbers"|id="stats"/,
      `the ${code} page still carries the «Цифры» block`);
  }

  // The build's plural rule is the one app.js's plural() applies.
  for (const [lang, n, form] of [
    ['ru', 1, 'One'], ['ru', 3, 'Few'], ['ru', 11, 'Many'], ['ru', 21, 'One'], ['ru', 86, 'Many'],
    ['ro', 1, 'One'], ['ro', 19, 'Few'], ['ro', 20, 'Many'], ['ro', 86, 'Many'], ['ro', 101, 'Few'],
    ['en', 1, 'One'], ['en', 2, 'Many'], ['en', 86, 'Many']
  ]) {
    assert.equal(pluralForm(lang, n), form, `pluralForm(${lang}, ${n}) is not ${form}`);
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
/* UPDATED for SPEC V1.30 §3 row 9 — the version and the build date moved
   from the fourth «Цифры» tile into the footer, as one line: «ConsentKit
   0.5.30 · обновлено 5 октября 2026». The guard is the same: both values are
   the BUILD's (package.json and the README's dated size table), rendered into
   the markup, never fetched or computed in the browser. The footer is sliced
   into the law pages too, so the line is asserted there as well. */
test('the footer carries the package version and the build date', () => {
  const template = readTemplate();
  const version = JSON.parse(readFileSync(join(SRC_DIR, '..', '..', 'package.json'), 'utf8')).version;

  assert.equal(VERSION, version, 'build-site.mjs does not read package.json’s version');

  for (const { code } of LANGS) {
    const dict = readDict(code);
    const want = updatedText(dict, BUILD_DATE);
    const line = `<p class="foot-small foot-version">ConsentKit ${version} · ${want}</p>`;

    for (const [where, html] of [
      [`${code} home`, renderPage(template, code)],
      [`${code}/law`, renderLawIndex(template, code)],
      [`${code}/law/<article>`, renderLawPage(template, code, readPages(code)[0])]
    ]) {
      const foot = html.match(/<footer[\s\S]*?<\/footer>/)[0];
      assert.ok(foot.includes(line),
        `the ${where} footer does not carry «ConsentKit ${version} · ${want}»`);
    }

    // The month must be the dictionary's own name, not a number: RU needs the
    // genitive («сентября»), which no date formatter would produce.
    const month = dict.statsMonths[parseInt(BUILD_DATE.slice(5, 7), 10) - 1];
    assert.ok(want.includes(month),
      `the ${code} «обновлено …» line does not use the dictionary's month name`);
  }

  // Nothing computes either value in the browser.
  const app = readFileSync(join(SITE_DIR, 'app.js'), 'utf8');
  assert.doesNotMatch(app, /statsUpdated|statsMonths/,
    'app.js reads the build-time date keys — the line must be rendered by the build');
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

/* SPEC V1.30 §4: two new questions, «Уже стоит другой баннер — как
   перейти?» and «Как вы зарабатываете?». APPENDED: the anchors are positional
   (q1..qN), so a question inserted mid-list would repoint every support reply
   that links to a later answer. The FAQPage markup is checked against the
   whole array by the test above, so the two travel into it automatically. */
test('V1.30: the FAQ gains its two questions at the end, keeping q1..q12', () => {
  const WANT = {
    ru: [/другой баннер/, /зарабатываете/],
    ro: [/alt banner/, /câștigați/],
    en: [/another banner/, /make money/]
  };
  for (const { code } of LANGS) {
    const faq = readDict(code).faq;
    assert.equal(faq.length, 14, `${code}.json has ${faq.length} FAQ entries, V1.30 makes it 14`);
    assert.match(faq[12][0], WANT[code][0], `${code}: question 13 is not «how do I switch banners»`);
    assert.match(faq[13][0], WANT[code][1], `${code}: question 14 is not «how do you make money»`);
    // The switching answer names no other product (§0: no competitor names).
    for (const name of ['Cookiebot', 'CookieYes', 'Osano', 'Termly', 'Usercentrics',
                        'OneTrust', 'Iubenda', 'Complianz', 'KookiOk', 'Didomi']) {
      assert.ok(!faq[12][1].includes(name), `${code}: the switching answer names ${name}`);
    }
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
     which of them.

     Dark-only since 14.09.2026 (owner's decision): the light values that used
     to sit on :root are gone and the former dark twins are the only palette,
     so the tokens asserted are the dark ones. The RED is the part that did
     NOT move — §2's three red roles are theme-independent and survive the
     collapse unchanged, which is exactly why they are still pinned here. */
  for (const [token, value] of [
    ['--bg', '#141414'], ['--cream', '#1B1B1B'], ['--surface', '#1F1F1F'],
    ['--surface-2', '#262626'],
    ['--ink', '#F2F2F2'], ['--ink-soft', '#B3B3B3'], ['--line', '#333333'],
    ['--accent', '#D63838'], ['--accent-ink', '#FF6B6B'], ['--on-accent', '#FFFFFF'],
    ['--band', '#B82E2D'], ['--on-band', '#FDE1B9'],
    ['--accent-deco', '#E63939']
  ]) {
    assert.ok(new RegExp(`${token}:\\s*${value}`, 'i').test(css),
      `styles.css does not set ${token} to ${value}`);
  }
  /* And the light ground is genuinely gone rather than merely overridden: a
     stray `--bg: #FFFFFF` on some later selector would repaint the page white
     with no media query left to stop it. */
  assert.doesNotMatch(css, /--bg:\s*#FFFFFF/i,
    'styles.css still sets --bg to the old white page ground');
  assert.doesNotMatch(css, /--ink:\s*#1E1E1E/i,
    'styles.css still sets --ink to the old light-theme near-black');

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

  /* The page's own ink on each of its three grounds — the black page, the
     hero lift, and the raised panel tone that carries #dev and the demo
     window's chrome. These used to be the "dark theme" half of this test;
     since 14.09.2026 they are simply the palette. */
  assert.ok(ratio('#F2F2F2', '#141414') >= 4.5, '--ink must clear AA on the page');
  assert.ok(ratio('#B3B3B3', '#141414') >= 4.5, '--ink-soft must clear AA on the page');
  assert.ok(ratio('#F2F2F2', '#1B1B1B') >= 4.5, '--ink must clear AA on the hero lift');
  assert.ok(ratio('#B3B3B3', '#1B1B1B') >= 4.5, '--ink-soft must clear AA on the hero lift');
  assert.ok(ratio('#F2F2F2', '#262626') >= 4.5, '--ink must clear AA on the raised panel');
  assert.ok(ratio('#B3B3B3', '#262626') >= 4.5, '--ink-soft must clear AA on the raised panel');
  // The capsule is inverted trim with tokens of its own; its cream must hold.
  assert.ok(ratio('#FFF2E0', '#1F1F1F') >= 4.5, 'the capsule cream must clear AA on its pill');
  assert.ok(ratio('#CFCFCF', '#1F1F1F') >= 4.5, 'the capsule soft ink must clear AA');

  /* The fill / text split is the one piece of two-palette thinking that had to
     survive the collapse: the FILL red carries white, and the TEXT red cannot
     be that same value, because #D63838 as text on #141414 is 3.9:1. A future
     edit that "simplifies" the two into one token breaks one of these. */
  assert.ok(ratio('#FF6B6B', '#141414') >= 4.5, 'the text red must clear AA on the page');
  assert.ok(ratio('#D63838', '#141414') < 4.5,
    'if the fill red ever clears AA as text on the page ground, the split can be simplified');
  // The pills are tinted rather than filled, for exactly this reason.
  assert.ok(ratio('#FF9A9A', '#3A1F1D') >= 4.5, 'the «до» pill must clear AA');
  assert.ok(ratio('#7DDCA8', '#16301F') >= 4.5, 'the «после» pill must clear AA');
  assert.ok(ratio('#7DDCA8', '#141414') >= 4.5, 'the «после» label must clear AA on the page');

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

  // §1: the red leads the deck. #D63838 rather than the brand #E63939 —
  // owner 20.11.2026: contrast (white on #E63939 is 4.19:1, below AA).
  assert.equal(MARQUEE_CARDS[0].accent, '#D63838',
    'the first marquee card must carry the red');
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
    /* V1.24 §5: the hero's replica is now a screenshot, so the marquee is the
       ONLY consumer left of mockText and mockSettings. (V1.30.1 B1 brought a
       second one back: the live first screen's banner replica reads all five
       mock* keys through data-i18n.) Asserted here so that
       the exemption those two keys were given in the unused-key scanner above
       is backed by a real check rather than by a promise. */
    for (const key of ['mockText', 'mockSettings']) {
      const want = dict[key].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      assert.ok(strip.includes(want),
        `the ${code} marquee lost «${dict[key]}» — ${key} would then be a dead key`);
    }
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

/* §2.2's before/after slider was removed on 08.09.2026 (owner: after V1.24's
   product screens it no longer added anything the hero does not show). */

/* ------------------------------------------------------- §2.3/§2.4 CTAs */

/* UPDATED for SPEC V1.30 §4 — «одна на странице как главная; остальные
   повторы этой кнопки убираются». The repeats under «Как это работает» and
   under the pricing table are gone, so #check is reached from exactly two
   places: the capsule (short label) and the hero (full label). The count is
   EXACT now rather than a floor: a third copy coming back is the regression. */
test('the page has one primary button, and it is the free check', () => {
  const template = readTemplate();
  for (const { code } of LANGS) {
    const dict = readDict(code);
    const html = renderPage(template, code);

    const toCheck = (html.match(/href="#check"[^>]*>/g) || []).length;
    /* UPDATED for SPEC V1.30.2 §2.4 — the capsule, the hero and the final
       screen. UPDATED again for SPEC V1.30.3 §2 — the hero's button is now
       the SUBMIT of the headline check (a front end to the one form in
       #check), so the links to #check are TWO: the capsule and the final
       screen. Still exact: a third link is the regression. */
    assert.equal(toCheck, 2,
      `the ${code} page points at #check ${toCheck} times; V1.30.3 keeps the capsule and the final screen`);
    const heroCheck = html.match(/<form class="hero-check" data-hero-check[^>]*>[\s\S]*?<\/form>/);
    assert.ok(heroCheck, `the ${code} first screen has no headline check`);
    assert.match(heroCheck[0], /<button type="submit" class="btn btn--primary"[^>]*>/,
      `the ${code} headline check does not submit with the primary button`);
    assert.doesNotMatch(html, /class="section-cta"/,
      `the ${code} page still repeats the check button under a section`);

    /* Every primary button in the SERVED markup is the check: the two links
       to #check, and — inside the check form itself — its two steps' own
       buttons («Проверить», then «Прислать»). The demo's «Показать снова» is
       a secondary control since V1.30. (The pricing table is drawn by app.js
       at runtime and is not covered here: its featured Starter column still
       carries a primary «Открыть кабинет», as it did before V1.30.) */
    const PRIMARY = /<(a|button)\b[^>]*class="btn[^"]*btn--primary[^"]*"[^>]*>/g;
    const form = html.match(/<form class="check" data-check-form[\s\S]*?<\/form>/)[0];
    const outside = [...html.replace(form, '').replace(heroCheck[0], '').matchAll(PRIMARY)].map((m) => m[0]);
    assert.equal(outside.length, 2,
      `the ${code} page has ${outside.length} primary buttons outside the two forms: ${outside.join(' | ')}`);
    for (const tag of outside) {
      assert.match(tag, /href="#check"/, `the ${code} page has a primary button that is not the check: ${tag}`);
    }
    assert.equal([...heroCheck[0].matchAll(PRIMARY)].length, 1,
      `the ${code} headline check carries more than its one button`);
    assert.equal([...form.matchAll(PRIMARY)].length, 2,
      `the ${code} check form does not carry exactly its two step buttons`);

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
  }
});

/* UPDATED for SPEC V1.24 §2/§5 — the single `heroChip` is now two `.fact-pill`
   facts, so the `heroChip` half of this assertion describes copy that no longer
   exists. The accented-word half is untouched: §5 explicitly leaves the
   headline and the lede alone. */
/* UPDATED for SPEC V1.30 §3 row 2 / §4 — the first screen is the headline,
   one line, the button and the trust line. The two fact pills (V1.24 §2) and
   the «бесплатный тариф навсегда» note are gone: the pills repeated the
   «10 минут» the line now says and a price the pricing table carries. What
   stays is the accented word, split into two keys so each language can put
   its own word under the accent; and the compliance promise is gone from the
   headline («Сайт соответствует правилам ЕС», §1). */
test('the hero leads with one accented word, without pills or a compliance promise', () => {
  const template = readTemplate();
  for (const { code } of LANGS) {
    const dict = readDict(code);
    const html = renderPage(template, code);
    const hero = html.match(/<section class="hero">[\s\S]*?\n  <\/section>/)[0];

    for (const key of ['heroChip', 'heroNote', 'heroPill1Num', 'heroPill1Label',
                       'heroPill2Num', 'heroPill2Label']) {
      assert.ok(!Object.prototype.hasOwnProperty.call(dict, key),
        `${code}.json still carries "${key}" — V1.30 drops it from the first screen`);
    }
    assert.doesNotMatch(hero, /fact-pill|hero-note/, `the ${code} hero still carries pills or the note`);

    assert.ok(hero.includes(dict.heroTitleLead) && hero.includes(dict.heroTitleAccent),
      `the ${code} headline is not split into lead + accent`);
    assert.match(hero, /class="h1-accent"/);
    assert.ok(hero.includes(dict.heroLine1), `the ${code} hero has lost its line`);

    const h1 = dict.heroTitleLead + ' ' + dict.heroTitleAccent;
    assert.doesNotMatch(h1, /соответству|respectă regulile|follows EU rules/i,
      `the ${code} headline still promises compliance`);
  }
});

/* ----------------------------------------------------------- §2.6 bands */

/* UPDATED for SPEC V1.30 §3 row 3 — «красный блок остаётся; площадки —
   простой список в две колонки с разделителями, без карточек; надпись над
   заголовком убрать». The «Цифры» cream band is gone with its section. The red
   block, the button inversions and the phone rule are asserted as before. */
test('the check block is the red band, with the platforms as a plain list', () => {
  const template = readTemplate();
  const html = renderPage(template, DEFAULT_LANG);

  assert.match(html, /<section id="check" class="band check-band">/);
  assert.doesNotMatch(html, /<section id="numbers"/, '«Цифры» is still a section');

  const css = readFileSync(join(SITE_DIR, 'styles.css'), 'utf8');
  assert.match(css, /\.check-band \{[\s\S]*?background:\s*var\(--band\)/);
  // On a red band the primary button cannot also be red.
  assert.match(css, /\.check-band \.btn--primary \{[\s\S]*?color:\s*#B82E2D/);
  // The form stays a card on the band.
  assert.match(css, /\.check-band \.check \{[\s\S]*?background:\s*var\(--surface\)/);

  // The platforms are rows between rules: no fill, no radius, a top rule.
  const li = css.match(/\.fit__list li,\n\.check-band \.fit__list li \{[^}]*\}/);
  assert.ok(li, 'the platform rows have no rule of their own');
  assert.match(li[0], /background:\s*transparent/, 'the platform rows are still filled cards');
  assert.match(li[0], /border-radius:\s*0/, 'the platform rows are still rounded cards');
  assert.match(li[0], /border-top:\s*1px solid/, 'the platform rows have no rule between them');
  assert.match(css, /@media \(min-width: 960px\) \{\s*\.check-band \.fit__list \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/,
    'the platform list is not two columns on a desktop');
  const section = html.match(/<section id="check"[\s\S]*?\n  <\/section>/)[0];
  /* UPDATED for SPEC V1.30.4 §3: the block also holds the check panel, whose
     steps and figures are list items of their own — the four platforms are
     counted in their own list. */
  const fit = section.match(/<ul class="fit__list">[\s\S]*?<\/ul>/)[0];
  assert.equal((fit.match(/<li\b/g) || []).length, 4, 'the check block does not list four platforms');
  assert.doesNotMatch(section, /class="card/, 'the check block nests cards again');

  /* §1.4: on a phone the band is not a full-width slab of red. */
  assert.match(css, /@media \(max-width: 767px\) \{[\s\S]*?\.check-band \{\s*background:\s*transparent/,
    'the check band is still full-width red on a phone');
  // V1.30: the caption above the heading is gone.
  assert.doesNotMatch(html, /class="check-caption"/, 'the caption above the check heading is back');
  assert.doesNotMatch(css, /\.check-caption/, 'styles.css still styles the removed check caption');
});

/* --------------------------------------------------------- §2.7 Starter */

/* UPDATED for SPEC V1.30 §3 row 7 — «один раздел «Тарифы»: таблица тарифов
   (колонка Starter выделена) → «Сделать самому или взять готовое» (6 строк) →
   абзац «Почему не бесплатный плагин». Карточки Starter и «Коротко о продукте»
   убрать». The card existed to repeat the table's Starter column, which is
   what this test used to keep in sync; with the card gone, the guard is that
   it stays gone and that the table still highlights Starter. */
test('«Тарифы» is one section: the plans, then the comparison, then why', () => {
  const app = readFileSync(join(SRC_DIR, '..', 'app.js'), 'utf8');
  assert.doesNotMatch(app, /function renderStarter|#starter/, 'app.js still renders the Starter card');
  assert.match(app, /var FEATURED = 'starter';/, 'the pricing table no longer highlights Starter');

  const template = readTemplate();
  for (const { code } of LANGS) {
    const html = renderPage(template, code);
    const pricing = html.match(/<section id="pricing"[\s\S]*?\n  <\/section>/)[0];
    const at = (needle) => pricing.indexOf(needle);
    assert.ok(at('id="plans"') > -1, `the ${code} pricing section has no table`);
    assert.ok(at('id="plans"') < at('id="compare"'), `the ${code} comparison does not follow the plans`);
    assert.ok(at('id="compare"') < at('class="cmp-why"'), `the ${code} «why» paragraph is not last`);
    assert.doesNotMatch(pricing, /id="starter"|starter__|class="card/,
      `the ${code} pricing section still carries the Starter card or a card`);
    assert.doesNotMatch(html, /<section id="compare"/, `the ${code} comparison is still its own section`);

    const dict = readDict(code);
    for (const k of ['starterTitle', 'starterPriceUnit', 'starterPoint1', 'starterPoint2',
                     'starterPoint3', 'factsTitle', 'factCheckFree', 'factCheckFreeNum']) {
      assert.ok(!Object.prototype.hasOwnProperty.call(dict, k), `${code}.json still carries "${k}"`);
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
test('the capsule inks itself from its own tokens', () => {
  const css = readFileSync(join(SITE_DIR, 'styles.css'), 'utf8');

  const capsule = css.match(/^\.capsule \{[\s\S]*?^\}/m)[0];
  assert.match(capsule, /background:\s*var\(--capsule-bg\)/,
    'the capsule does not paint itself with --capsule-bg');
  assert.match(capsule, /color:\s*var\(--capsule-ink\)/,
    'the capsule does not ink itself with --capsule-ink');
  assert.match(capsule, /border-radius:\s*16px/, '§1 asks the capsule to round at 16px');
  assert.match(capsule, /flex-wrap:\s*nowrap/,
    'the capsule may wrap onto a second row — §1 asks for one row');

  /* One value each, on one selector. The capsule used to carry a light pair
     and a dark override; dark-only since 14.09.2026, it keeps the dark one —
     §2's lifted surface, so the pill reads as raised off the black page
     rather than as a second, blacker hole in it. */
  assert.match(css, /--capsule-bg:\s*#1F1F1F/,
    'the capsule is not on §2\'s lifted dark surface');
  assert.match(css, /--capsule-ink:\s*#FFF2E0/, 'the capsule text is not §2\'s cream');
  assert.doesNotMatch(css, /--capsule-bg:\s*#1E1E1E/,
    'the old light-theme capsule black is back — there is no light theme to need it');

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
    '.brand-mark',            // the logo shield: its red lives inside the SVG (the brand, 08.09.2026), never from the accent token
    '.chip',                  // §2: sand fill, dark text
    '.btn--ghost',            // §2: white fill, dark 1px outline
    '.plan-flag'              // §2: «чёрный с белым текстом»
    /* '.starter__fact-num' left this list with the Starter card (V1.30 §3). */
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

test('§1.2: the demo window keeps a white page inside dark chrome', () => {
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
  /* The chrome. Dark-only since 14.09.2026: the window used to declare sand
     chrome here and darken it in the two dark homes; now the dark value is
     declared once, in the same block as the paper. The SPLIT is what this
     test is really about and it survives intact — the chrome is OURS and goes
     dark with the site, while the paper depicts a VISITOR's page and must
     stay white, which is the half-switched look the owner asked to avoid,
     read the other way round. */
  assert.match(win, /--win-chrome:\s*#262626/i,
    '§1.2: the toolbar and status strip sit on the dark chrome');
  assert.match(win, /--win-ink:\s*#F2F2F2/i, 'the chrome ink does not suit a dark toolbar');
  assert.doesNotMatch(win, /--win-chrome:\s*#F5E7D3/i,
    'the old sand chrome is back — there is no light theme to justify it');

  // The toolbar and the strip both take that chrome — §1.2 names both.
  assert.match(css, /\.demo-tools \{[\s\S]*?background:\s*var\(--win-chrome\)/,
    'the demo toolbar is not on the window chrome');
  assert.match(css, /\.demo-foot \{[\s\S]*?background:\s*var\(--win-chrome\)/,
    'the demo status strip is not on the window chrome');

  /* The window declares its paper once, white, and no later rule re-declares
     it FOR THE WINDOW. (The `.shot` / `.hero-shot` replica cards carry their
     own --shot-paper, light and dark both: those depict clients' sites and
     always did, which is why they were never part of the theme mechanism.) */
  assert.match(win, /--shot-paper:\s*#FFFFFF/i,
    'the demo window no longer declares a white paper');
  // Every .demo-win block in the file, and none of them may restate the paper
  // as anything but white — the top-level one above is the only declaration.
  for (const m of css.matchAll(/\.demo-win\b[^{]*\{[^}]*\}/g)) {
    const paper = m[0].match(/--shot-paper:\s*(#[0-9a-f]{3,8})/i);
    if (paper) {
      assert.match(paper[1], /^#FFFFFF$/i,
        `a .demo-win rule repaints the depicted page ${paper[1]} — it must stay white`);
    }
  }

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

  /* UPDATED for SPEC V1.24 §2 — the copy half of this test (heroChip is at
     most 46 characters) is gone with the key: §2 replaces the chip with two
     `.fact-pill` facts, whose own length is checked in
     test/site-product.test.mjs. The CSS half above stays, and stays load-
     bearing: `.chip` is one of the six rules the §2 red-dosage test reads by
     name to prove it is sand rather than red, so the rule must survive in
     styles.css whether or not the hero is still the thing using it. */
});

/* ─────────────── dark by default, light by choice (SPEC V1.30.3 §1) */

/* REPLACES the «dark only» guards of 14.09.2026. The owner brought a light
   theme back on 20.11.2026 — but not the old mechanism: dark stays the look
   everyone gets whatever their system says (prefers-color-scheme is not used
   anywhere), and light is only the visitor's own choice, made with the
   capsule's toggle, stored under one key and applied before the first paint.
   These three tests hold that shape: the default and the boot order, the two
   palettes as one token set, and AA in both. */

/* The token blocks, read the way the browser cascades them: every
   declaration in a top-level `:root {` block (dark), and every declaration
   in the `:root[data-theme="light"] {` block (light). */
function themeTokens(source) {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, '');   // comments name tokens too
  const dark = {};
  for (const m of css.matchAll(/^:root \{([\s\S]*?)^\}/gm)) {
    for (const d of m[1].matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) dark[d[1]] = d[2].trim();
  }
  const lightBlock = css.match(/^:root\[data-theme="light"\] \{([\s\S]*?)^\}/m);
  const light = {};
  if (lightBlock) {
    for (const d of lightBlock[1].matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) light[d[1]] = d[2].trim();
  }
  return { dark, light, lightBlock: lightBlock && lightBlock[1] };
}
const isColour = (v) => /^(#[0-9a-f]{3,8}|rgba?\()/i.test(v);

test('the site is dark by default; light is the visitor\'s toggle, applied before paint', () => {
  const css = readFileSync(join(SITE_DIR, 'styles.css'), 'utf8');

  /* No reaction to the system theme — not in a rule and not in a comment. */
  assert.doesNotMatch(css, /prefers-color-scheme/,
    'styles.css reacts to the system theme — the default is dark for everyone');
  assert.match(css, /^:root \{\s*color-scheme: dark;/m, ':root is not dark by default');
  const { lightBlock } = themeTokens(css);
  assert.ok(lightBlock, 'styles.css has no :root[data-theme="light"] palette');
  assert.match(lightBlock, /color-scheme: light;/, 'the light palette does not set color-scheme: light');
  // The only theme hook is the attribute the boot script sets on <html>.
  for (const m of css.matchAll(/data-theme(?:="?([a-z]*)"?)?/g)) {
    assert.ok(!m[1] || m[1] === 'light', `styles.css names data-theme="${m[1]}" — only light is a theme of its own`);
  }

  /* The boot script: the stored choice inside try/catch, data-theme always
     stamped (so the toggle can show only when JS ran), the metas rewritten
     for light; nothing about the system preference. */
  assert.match(THEME_BOOT, /^<script>\(function\(\)\{var t="dark";try\{if\(localStorage\.getItem\("ck-site-theme"\)==="light"\)t="light"\}catch\(e\)\{\}/,
    'the boot script does not default to dark and read the stored choice in try/catch');
  assert.match(THEME_BOOT, /setAttribute\("data-theme",t\)/, 'the boot script does not stamp data-theme');
  assert.doesNotMatch(THEME_BOOT, /matchMedia|prefers-color-scheme/, 'the boot script consults the system theme');
  assert.equal(THEME_KEY, 'ck-site-theme');

  for (const f of [...outputs(), ...lawOutputs()]) {
    const html = readFileSync(f.path, 'utf8');
    const head = html.slice(0, html.indexOf('</head>'));
    // The built HTML is dark: no theme attribute until the script runs.
    assert.match(html, /<html lang="[a-z]{2}">/, `${f.label} ships a theme on <html>`);

    // Metas, then dataLayer (first script), then the theme boot, then the CSS.
    const cs = head.indexOf(THEME_META);
    const dl = head.indexOf('<script>window.dataLayer');
    const boot = head.indexOf(THEME_BOOT);
    const sheet = head.search(/<link rel="stylesheet" href="\/styles\.css/);
    assert.ok(cs > -1, `${f.label} does not carry the shared dark metas`);
    assert.ok(boot > -1, `${f.label} does not carry the theme boot script in <head>`);
    assert.ok(sheet > -1, `${f.label} does not load the stylesheet`);
    assert.ok(cs < dl && dl < boot && boot < sheet,
      `${f.label}: the order must be metas → dataLayer → theme boot → stylesheet`);

    /* The toggle: in the capsule on every page (the law pages slice the same
       header), a real toggle button with a name of its own and two icons. */
    const toggle = html.match(/<button class="theme-toggle" type="button" aria-pressed="false"\s+aria-label="([^"]+)"[\s\S]*?<\/button>/);
    assert.ok(toggle, `${f.label} has no theme toggle in the capsule`);
    assert.ok(toggle[1].trim().length > 3, `${f.label}'s theme toggle has no accessible name`);
    assert.equal((toggle[0].match(/<svg class="icon"/g) || []).length, 2, `${f.label}'s toggle lacks its sun and moon`);
    assert.doesNotMatch(html, /\{\{ICON:/, `${f.label} has an unresolved icon`);
  }

  /* Without JavaScript the toggle could not work, so it is not shown. */
  assert.match(css, /\.theme-toggle \{[^}]*display: none;/, 'the toggle shows without JavaScript');
  assert.match(css, /:root\[data-theme\] \.theme-toggle \{ display: inline-grid; \}/,
    'the toggle does not appear once the boot script ran');
  assert.match(css, /\.theme-toggle \{[^}]*width: 44px;[^}]*height: 44px;/, 'the toggle is not a 44×44 target');
});

test('the two palettes are one token set, and every text pair is AA in both', () => {
  const css = readFileSync(join(SITE_DIR, 'styles.css'), 'utf8');
  const { dark, light } = themeTokens(css);

  /* Same set: every colour token of the dark :root has a light value, and
     the light block introduces nothing the dark one lacks. */
  const darkColours = Object.keys(dark).filter((k) => isColour(dark[k])).sort();
  assert.deepEqual(Object.keys(light).sort(), darkColours,
    'the light palette and the dark one do not declare the same colour tokens');

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
  // Text token on ground token. Every pair the page sets text on.
  const PAIRS = [
    ['--ink', '--bg'], ['--ink', '--cream'], ['--ink', '--surface'], ['--ink', '--surface-2'],
    ['--ink-soft', '--bg'], ['--ink-soft', '--cream'], ['--ink-soft', '--surface'], ['--ink-soft', '--surface-2'],
    ['--accent-ink', '--bg'], ['--accent-ink', '--cream'], ['--accent-ink', '--surface'],
    ['--bg', '--ink'],                         // the inverted «Что умеет» card
    ['--on-accent', '--accent'], ['--on-band', '--band'], ['--on-band-strong', '--band'],
    ['--state-ok', '--surface'], ['--state-warn', '--surface'], ['--placeholder', '--surface'],
    ['--code-ink', '--code-bg'],
    ['--bad-ink', '--bad-bg'], ['--ok-ink', '--ok-bg'],
    ['--capsule-ink', '--capsule-bg'], ['--capsule-ink-soft', '--capsule-bg'],
    ['--capsule-ink', '--capsule-hover'], ['--capsule-ink-soft', '--capsule-hover'],
    ['--hl-card-ink', '--hl-card-bg'], ['--hl-card-soft', '--hl-card-bg'], ['--hl-card-soft', '--hl-card-muted'],
    ['--hl-card-ink', '--hl-card-muted'], ['--hl-url-ink', '--hl-url-bg']
  ];
  for (const [name, palette] of [['dark', dark], ['light', light]]) {
    for (const [fg, bg] of PAIRS) {
      const a = palette[fg];
      const b = palette[bg];
      assert.match(a || '', /^#[0-9a-f]{6}$/i, `${name}: ${fg} is not a plain hex (${a})`);
      assert.match(b || '', /^#[0-9a-f]{6}$/i, `${name}: ${bg} is not a plain hex (${b})`);
      const r = ratio(a, b);
      assert.ok(r >= 4.5, `${name}: ${fg} ${a} on ${bg} ${b} is ${r.toFixed(2)}:1, under AA`);
    }
    // The focus ring (the fill red) is a non-text indicator: 3:1 on the page.
    assert.ok(ratio(palette['--accent'], palette['--bg']) >= 3,
      `${name}: the focus ring does not reach 3:1 on the page`);
  }

  /* The reds are the dark theme's in the light one too (§1): the fill, the
     band and the decoration. Only the text red changes, to stay AA. */
  for (const t of ['--accent', '--band', '--accent-deco', '--on-accent', '--on-band']) {
    assert.equal(light[t].toUpperCase(), dark[t].toUpperCase(), `the light theme changes ${t}`);
  }
  /* UPDATED for SPEC V1.30.4 §1.2 — the owner's neutral #F3F3F1 replaced
     eClar's warm #F2F0E9, and no light token is left on the warm side. */
  assert.equal(light['--bg'].toUpperCase(), '#F3F3F1', 'the light page is not the owner\'s #F3F3F1');
  for (const [k, v] of Object.entries(light)) {
    const m = /^#([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})$/i.exec(v);
    if (!m || !/^--(bg|cream|surface|surface-2|bg-band|line|line-soft|capsule-hover|capsule-line|hl-chrome|hl-chrome-line|hl-dot)$/.test(k)) continue;
    const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16));
    assert.ok(r - b <= 4, `the light ${k} ${v} is still warm (red ${r} vs blue ${b})`);
  }
  assert.equal(light['--ink'].toUpperCase(), '#141414');
  assert.equal(light['--accent-ink'].toUpperCase(), '#B82E2D');
});

/* The metas and the boot script are constants shared by the template's head
   and the two law-page head builders, so /law cannot drift from /. */
test('the theme head is built from shared constants', () => {
  assert.equal(THEME_META, '<meta name="color-scheme" content="dark">\n<meta name="theme-color" content="#141414">');
  assert.equal(THEME_COLORS.dark, '#141414');
  assert.equal(THEME_COLORS.light, '#F3F3F1');
  assert.match(THEME_BOOT, /content","#F3F3F1"/, 'the boot script does not hand light browsers the light --bg');
  const app = readFileSync(join(SITE_DIR, 'app.js'), 'utf8');
  assert.match(app, /var THEME_COLORS = \{ dark: '#141414', light: '#F3F3F1' \};/,
    'app.js and the build disagree on the theme-color values');
  for (const f of [...outputs(), ...lawOutputs()]) {
    const html = readFileSync(f.path, 'utf8');
    assert.ok(html.includes(THEME_META), `${f.label} does not carry the shared metas verbatim`);
    assert.ok(html.includes(THEME_BOOT), `${f.label} does not carry the shared boot script verbatim`);
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
        /* UPDATED for SPEC V1.30.1 B1 — /hero.js drives the home page's
           first screen, which the law pages do not have. */
        const homeOnly = asset === '/hero.js' && !outputs().some((o) => o.path === f.path);
        assert.ok(asset.startsWith('/vendor/') || homeOnly,
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
