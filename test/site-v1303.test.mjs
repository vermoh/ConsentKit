/* SPEC V1.30.3 — the landing after eclar.md: a light theme by the visitor's
 * toggle, the headline check, the data cards, simpler copy.
 *
 * The theme's own guards (dark by default, the boot order, one token set and
 * AA in both palettes) live in test/site-build.test.mjs beside the tests they
 * replaced; the light screenshots in test/site-product.test.mjs. This file
 * holds the rest:
 *
 *   §1  the light theme's exceptions: the final screen stays a dark island,
 *       the grain is off;
 *   §2  the headline check — a real, named field inside the sentence, a front
 *       end to the ONE check form in #check (which stays where the law pages
 *       and every «Проверить сайт» link find it);
 *   §3  the four data cards and their build-drawn charts;
 *   §4  the new strings in all three languages.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  LANGS, SITE_DIR, SITE_STATS, readDict, readTemplate, renderPage,
  HERO_SHARES, READINESS_POINTS, READINESS_DONE, BANNER_LANGUAGES, FIG_BUBBLES,
  figAcceptChart, figServicesChart, figReadinessChart, figLanguagesChart
} from '../tools/build-site.mjs';

const CSS = readFileSync(join(SITE_DIR, 'styles.css'), 'utf8');
const LAYER = CSS.slice(CSS.indexOf('SPEC V1.30.3 — светлая тема'));
const APP = readFileSync(join(SITE_DIR, 'app.js'), 'utf8');
const CYRILLIC = /[А-Яа-яЁё]/;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pages = () => LANGS.map(({ code }) => [code, renderPage(readTemplate(), code), readDict(code)]);

/* ------------------------------------------------------------------ §1 */

test('§1: in the light theme the final screen stays dark and the grain is off', () => {
  assert.ok(LAYER.length > 1000, 'styles.css has no V1.30.3 layer');
  const final = LAYER.match(/\n:root\[data-theme="light"\] \.final \{([^}]*)\}/);
  assert.ok(final, 'the final screen does not answer the light theme');
  // The close-up has the dark ground in the picture: the section keeps it.
  for (const [token, value] of [['--bg', '#141414'], ['--ink', '#F2F2F2'], ['--ink-soft', '#B3B3B3'], ['--accent-ink', '#FF6B6B']]) {
    assert.match(final[1], new RegExp(`${token}:\\s*${value};`), `the light theme's final screen does not keep ${token} dark`);
  }
  assert.match(final[1], /color-scheme: dark;/);
  assert.match(final[1], /color: var\(--ink\);/, 'the final screen\'s text does not follow its own dark ink');
  assert.match(final[1], /border-radius: var\(--r-big\);/);
  assert.match(LAYER, /\n:root\[data-theme="light"\] body \{ background-image: none; \}/, 'the grain stays on the light page');
});

/* ------------------------------------------------------------------ §2 */

test('§2: the headline check is a named field inside the sentence, with the one primary button', () => {
  for (const [code, html, dict] of pages()) {
    const hero = html.match(/<section class="hero">[\s\S]*?\n  <\/section>/)[0];
    const form = hero.match(/<form class="hero-check" data-hero-check action="#check" method="get" novalidate>([\s\S]*?)<\/form>/);
    assert.ok(form, `${code}: the first screen has no headline check`);
    const line = form[1].match(/<p class="hero-check__line">([\s\S]*?)<\/p>/);
    assert.ok(line, `${code}: the headline check has no sentence`);
    // Lead, field, tail — in this order, in one line.
    const lead = line[1].indexOf(`>${esc(dict.heroCheckLead)}</span>`);
    const field = line[1].indexOf('<input class="hero-check__input"');
    const tail = line[1].indexOf(`>${esc(dict.heroCheckTail)}</span>`);
    assert.ok(lead > -1 && field > lead && tail > field, `${code}: the sentence is not lead → field → tail`);

    const input = line[1].match(/<input class="hero-check__input"[^>]*>/)[0];
    // A name for a screen reader (the visible sentence is not its label).
    assert.match(input, new RegExp(`aria-label="${esc(dict.checkDomainLabel)}"`), `${code}: the field has no accessible name`);
    // Without JS the sentence reads whole: the placeholder is the example value.
    assert.match(input, new RegExp(`placeholder="${esc(dict.heroCheckPlaceholder)}"`), `${code}: the field has no example value`);
    assert.match(input, /type="text" inputmode="url"/);
    // Nothing in the front end is ever sent on its own.
    assert.doesNotMatch(form[1], /\sname=/, `${code}: the headline check has a named field — it must not submit anything itself`);
    assert.doesNotMatch(form[1], /\sid=/, `${code}: the headline check carries an id`);
    assert.match(form[1], /<button type="submit" class="btn btn--primary" data-i18n="ctaCheck">/,
      `${code}: the headline check does not submit with the page's one primary button`);
    assert.ok(form[1].includes(`>${esc(dict.ctaCheck)}</button>`), `${code}: the button is not ctaCheck`);
    // The consent tick, the same words as the form's own, and a honeypot.
    assert.match(form[1], /<input type="checkbox" data-hero-agree>\s*<span data-i18n="checkAgree">/, `${code}: no consent tick`);
    assert.match(form[1], /<span class="check__hp" aria-hidden="true"><input type="text" value="" tabindex="-1" autocomplete="off" data-hero-hp><\/span>/,
      `${code}: the headline check has no honeypot`);

    // The ONE check form is still in #check, after the first screen.
    const check = html.match(/<section id="check"[\s\S]*?\n  <\/section>/)[0];
    assert.match(check, /<form class="check" data-check-form novalidate>/, `${code}: #check lost the check form`);
    assert.equal((html.match(/data-check-form/g) || []).length, 1, `${code}: more than one check form`);
  }
});

test('§2: the tick appears once an address is typed, without moving anything', () => {
  const sup = LAYER.match(/@supports selector\(:has\(\*\)\) \{([\s\S]*?)\n\}/);
  assert.ok(sup, 'the reveal is not gated on :has support');
  assert.match(sup[1], /\.hero-check__agree \{ visibility: hidden; \}/);
  assert.match(sup[1], /\.hero-check:has\(\.hero-check__input:not\(:placeholder-shown\)\) \.hero-check__agree/);
  assert.match(sup[1], /visibility: visible;/);
  assert.doesNotMatch(sup[1], /display: none/, 'the tick is removed from the layout — showing it would push the page');
  // Its box is a real target (WCAG 2.5.8).
  assert.match(LAYER, /\n\.hero-check__agree input \{[^}]*width: 24px;[^}]*height: 24px;/);
  // The field is the line's own type, underlined, and its example value reads.
  const field = LAYER.match(/\n\.hero-check__input \{([^}]*)\}/)[1];
  assert.match(field, /font: inherit;/);
  assert.match(field, /border-bottom: 2px dashed var\(--ink-soft\);/);
  assert.match(LAYER, /\n\.hero-check__input::placeholder \{ color: var\(--ink-soft\); opacity: 1; \}/);
});

test('§2: app.js hands the headline check to the one form and takes the visitor to #check', () => {
  const fn = APP.slice(APP.indexOf('function wireHeroCheck()'), APP.indexOf('Boot'));
  assert.ok(fn.length > 100, 'app.js has no wireHeroCheck');
  assert.match(fn, /\$\('#check form\[data-check-form\]'\)/, 'the target is not the form in #check');
  assert.match(fn, /ev\.preventDefault\(\)/);
  assert.match(fn, /dEl\.value = field\.value\.trim\(\)/, 'the address is not copied into the form');
  assert.match(fn, /dispatchEvent\(new Event\('input', \{ bubbles: true \}\)\)/,
    'the copy does not raise an input event (analytics.js counts the first keystroke from it)');
  assert.match(fn, /if \(agree && aEl && agree\.checked\) aEl\.checked = true;/);
  assert.match(fn, /if \(hp && hEl && hp\.value\) hEl\.value = hp\.value;/, 'the honeypot is not carried over');
  assert.match(fn, /getElementById\('check'\)/);
  // Mirrored while typing, so ck_scan_start still counts the first keystroke.
  assert.match(fn, /heroField\.addEventListener\('input'/, 'the address is not mirrored as it is typed');
  assert.match(fn, /submitCheck\(target\)/, 'the headline check does not run the same submit');
  assert.match(APP, /wireCheckForms\(\);\n    wireHeroCheck\(\);/, 'wireHeroCheck is not wired after the forms');
});

/* ------------------------------------------------------------------ §3 */

test('§3: four data cards — number, phrase, a chart the build draws', () => {
  for (const [code, html, dict] of pages()) {
    const band = html.match(/<div class="figures" id="trust">([\s\S]*?)<\/div>/)[1];
    const cards = [...band.matchAll(/<p class="trust-item fig"([^>]*)>([\s\S]*?)<\/p>/g)];
    assert.deepEqual(cards.map((c) => c[1].match(/data-fig="([a-z]+)"/)[1]), ['accept', 'services', 'readiness', 'languages'],
      `${code}: the cards are not accept, services, readiness, languages`);
    for (const [, , body] of cards) {
      assert.match(body, /^<span class="trust-num">/, `${code}: a card does not open with its number`);
      assert.match(body, /<span class="fig__text">[^<]+<\/span>/, `${code}: a card has no phrase`);
      const svg = body.match(/<svg class="fig__chart[^"]*"[^>]*>/);
      assert.ok(svg, `${code}: a card has no chart`);
      assert.match(svg[0], /aria-hidden="true" focusable="false"/, `${code}: a chart is exposed to assistive tech`);
      assert.doesNotMatch(body, /fill="#|stroke="#|style=/, `${code}: a chart paints a colour of its own`);
    }
    // The example card is marked as an example and shows the hero card's share.
    assert.ok(cards[0][2].includes(`<span class="fig__note">${esc(dict.figExample)}</span>`), `${code}: the 59% card is not marked as an example`);
    assert.match(cards[0][2], new RegExp(`^<span class="trust-num">${HERO_SHARES.accept}<span class="fig__unit">%</span></span>`));
    if (code !== 'ru') {
      for (const k of ['figAccept', 'figExample']) assert.doesNotMatch(dict[k], CYRILLIC, `${code}: ${k} has Cyrillic`);
    }
  }
});

test('§3: the charts say what the numbers say', () => {
  // The hero card's shares, one ring: three arcs that start where the last ended.
  assert.equal(HERO_SHARES.accept + HERO_SHARES.reject + HERO_SHARES.custom, 100);
  const template = readTemplate();
  for (const [k, v] of Object.entries({ accept: HERO_SHARES.accept, reject: HERO_SHARES.reject, custom: HERO_SHARES.custom })) {
    assert.ok(template.includes(`<span class="hl-share-v">${v}&nbsp;%</span>`), `the first screen's card does not show ${k} ${v} %`);
  }
  const ring = figAcceptChart();
  const offsets = [...ring.matchAll(/stroke-dashoffset="(-?[\d.]+)"/g)].map((m) => Math.abs(Number(m[1])));
  assert.deepEqual(offsets, [0, HERO_SHARES.accept, HERO_SHARES.accept + HERO_SHARES.reject]);
  // One dot per service in the catalogue.
  const dots = figServicesChart();
  assert.equal((dots.match(/<circle /g) || []).length, SITE_STATS.services);
  assert.match(dots, new RegExp(`data-dots="${SITE_STATS.services}"`));
  // 36 segments, 7 done (the readiness screenshot's «7 из 36»).
  const ready = figReadinessChart();
  assert.equal((ready.match(/<circle /g) || []).length, READINESS_POINTS);
  assert.equal((ready.match(/class="fig-a"/g) || []).length, READINESS_DONE);
  // The bubbles add up to the 34 languages.
  const langs = figLanguagesChart();
  const rest = Number(langs.match(/>\+(\d+)<\/text>/)[1]);
  assert.equal(FIG_BUBBLES.length + rest, BANNER_LANGUAGES);
  // No two bubbles overlap, and they stay in the 204×96 box.
  const all = FIG_BUBBLES.concat([['+', 98, 82, 13]]);
  for (const [, x, y, r] of all) assert.ok(x - r >= 0 && x + r <= 204 && y - r >= 0 && y + r <= 96, 'a bubble leaves its box');
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const [, x1, y1, r1] = all[i]; const [, x2, y2, r2] = all[j];
    assert.ok(Math.hypot(x1 - x2, y1 - y2) >= r1 + r2, `bubbles ${all[i][0]} and ${all[j][0]} overlap`);
  }
  // Deterministic: drawing twice gives the same bytes.
  assert.equal(figAcceptChart() + figServicesChart() + figReadinessChart() + figLanguagesChart(),
    figAcceptChart() + figServicesChart() + figReadinessChart() + figLanguagesChart());
});

test('§3: the cards and charts are tokens in both themes, never red, 40px corners', () => {
  const rules = [...LAYER.matchAll(/\n([^\n{}]*(?:\.fig|#trust)[^{]*)\{([^}]*)\}/g)];
  assert.ok(rules.length > 8, 'the card rules are missing');
  for (const [, sel, body] of rules) {
    assert.doesNotMatch(body, /--accent|--band\b|#[0-9a-f]{3,8}\b|rgba?\(/i, `${sel.trim()} paints a raw colour or red`);
  }
  assert.match(LAYER, /\.fig__chart--ring \.fig-a \{ stroke: var\(--ink\); \}/);
  assert.match(LAYER, /#trust \.trust-num \{[^}]*font-size: 40px;/);
  assert.match(LAYER, /\n\.figures \{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
});

/* ------------------------------------------------------------------ §4 */

test('§4: the new strings exist in three languages, ro and en without Cyrillic', () => {
  for (const { code } of LANGS) {
    const dict = readDict(code);
    for (const k of ['themeToggle', 'heroCheckLead', 'heroCheckPlaceholder', 'heroCheckTail', 'figAccept', 'figExample']) {
      assert.ok(typeof dict[k] === 'string' && dict[k].trim(), `${code}.json has no ${k}`);
      if (code !== 'ru') assert.doesNotMatch(dict[k], CYRILLIC, `${code}: ${k} has Cyrillic`);
    }
    // The example address is a Moldovan one, in the page's own language.
    assert.match(dict.heroCheckPlaceholder, /\.md$/);
  }
});
