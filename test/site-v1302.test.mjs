/* SPEC V1.30.2 — art direction by section, motion on scroll, the glass shield,
 * and §4, the owner's reference language (heroui.com, coda.co).
 *
 * The older files keep what they own (site-build: pages, dictionaries, the
 * CTA count; site-product: the image folder; site-v130: section order and
 * radii; site-v1301b: icons). This file owns what V1.30.2 added:
 *
 *   · the owner's two shield pictures: present, small, decorative, lazy below
 *     the fold, their reserved box the file's own shape;
 *   · every scroll animation inside BOTH gates — @supports
 *     (animation-timeline: view()) and prefers-reduced-motion: no-preference —
 *     and moving transform / opacity only;
 *   · the final screen in three languages, ro/en without Cyrillic;
 *   · the FAQ numbers hidden from screen readers;
 *   · §4: the centred two-tone first screen with the shield in the line, the
 *     «Работает с» row (no request, no competitor), the two-tone section
 *     heads, the pills, the band of big numbers.
 *
 * Fix a failure with: node tools/build-site.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  LANGS, SITE_DIR, PLATFORMS, readDict, readTemplate, renderPage, renderLawIndex
} from '../tools/build-site.mjs';

const CSS = readFileSync(join(SITE_DIR, 'styles.css'), 'utf8');
const APP = readFileSync(join(SITE_DIR, 'app.js'), 'utf8');
const LAYER = CSS.slice(CSS.indexOf('SPEC V1.30.2 — арт-дирекция'));
const CYRILLIC = /[Ѐ-ӿ]/;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pages = () => LANGS.map(({ code }) => [code, renderPage(readTemplate(), code), readDict(code)]);
const sectionOf = (html, id) => {
  const m = html.match(new RegExp(`<section id="${id}"[\\s\\S]*?\\n  <\\/section>`));
  assert.ok(m, `no <section id="${id}">`);
  return m[0];
};

/* The pixel size of a .webp (VP8 / VP8L / VP8X), as site-product reads it. */
function webpSize(path) {
  const b = readFileSync(path);
  assert.equal(b.toString('ascii', 8, 12), 'WEBP', `${path} is not a WebP`);
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (kind === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
  }
  if (kind === 'VP8X') return [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1];
  throw new Error(`${path}: unknown WebP chunk ${kind}`);
}

/* ------------------------------------------------------------ §0 images */

const SHIELDS = {
  'shield-glass-600.webp': 600,
  'shield-glass-1200.webp': 1200,
  'shield-closeup-800.webp': 800
};

test('§0: the shield pictures exist, under the 250 KB ceiling, at their named widths', () => {
  for (const [file, width] of Object.entries(SHIELDS)) {
    const path = join(SITE_DIR, 'img', file);
    assert.ok(existsSync(path), `site/img/${file} is missing`);
    assert.ok(statSync(path).size < 250 * 1024, `site/img/${file} is over 250 KB`);
    assert.equal(webpSize(path)[0], width, `site/img/${file} is not ${width}px wide`);
  }
  // The two glass widths are one picture.
  const [a, b] = ['shield-glass-600.webp', 'shield-glass-1200.webp'].map((f) => webpSize(join(SITE_DIR, 'img', f)));
  assert.ok(Math.abs(a[0] / a[1] - b[0] / b[1]) < 0.005, 'the two glass shields differ in shape');
  // §0's fallback: the 2× close-up looked soft, so only the 800 ships.
  assert.ok(!existsSync(join(SITE_DIR, 'img', 'shield-closeup-1600.webp')),
    'shield-closeup-1600.webp ships although the page never shows the close-up past 800px');
});

test('§0: every shield on the page is decorative, sized, and lazy below the fold', () => {
  for (const [code, html] of pages()) {
    const tags = html.match(/<img\b[^>]*shield-[^>]*>/g) || [];
    assert.equal(tags.length, 3, `the ${code} page shows ${tags.length} shields, not 3 (headline, check, final)`);
    for (const tag of tags) {
      assert.match(tag, /\salt=""/, `${code}: a shield has a real alt — it is decoration`);
      assert.match(tag, /\saria-hidden="true"/, `${code}: a shield is exposed to assistive tech`);
      assert.match(tag, /\sdecoding="async"/, `${code}: a shield decodes on the main thread`);
      const [, w, h] = tag.match(/\swidth="(\d+)" height="(\d+)"/).map(Number);
      const file = tag.match(/\ssrc="\/img\/([^"]+)"/)[1];
      const [fw, fh] = webpSize(join(SITE_DIR, 'img', file));
      assert.ok(Math.abs(w / h - fw / fh) < 0.005, `${code}: ${file} reserves ${w}×${h}, the file is ${fw}×${fh}`);
      for (const m of tag.matchAll(/(?:src|srcset)="([^"]+)"/g)) {
        for (const url of m[1].split(',').map((s) => s.trim().split(/\s+/)[0])) {
          assert.ok(url.startsWith('/img/'), `${code}: ${url} is not root-absolute`);
        }
      }
    }
    // Below the first screen: the check block's and the final screen's.
    for (const cls of ['check-shield', 'final-shield']) {
      const tag = tags.find((t) => t.includes(`class="${cls}"`));
      assert.ok(tag, `${code}: no .${cls}`);
      assert.match(tag, /\sloading="lazy"/, `${code}: .${cls} is not lazy`);
    }
    const check = sectionOf(html, 'check');
    assert.match(check, /class="check-shield"[^>]*srcset="\/img\/shield-glass-600\.webp 600w, \/img\/shield-glass-1200\.webp 1200w"/);
    // Outside the form the law pages copy.
    const form = check.match(/<form class="check"[\s\S]*?<\/form>/)[0];
    assert.doesNotMatch(form, /shield/, `${code}: the shield is inside the shared check form`);
  }
});

/* ------------------------------------------------------------ §1 motion */

/* The one block every scroll animation lives in, as authored. */
const GATE_OPEN = '@supports (animation-timeline: view()) {\n  @media (prefers-reduced-motion: no-preference) {';
function gateBlock() {
  const at = CSS.indexOf(GATE_OPEN);
  assert.ok(at > -1, 'styles.css has no @supports (view()) + no-preference gate');
  // Walk the braces from the @supports to its own closing one.
  let depth = 0;
  for (let i = CSS.indexOf('{', at); i < CSS.length; i++) {
    if (CSS[i] === '{') depth++;
    else if (CSS[i] === '}' && --depth === 0) return CSS.slice(at, i + 1);
  }
  throw new Error('the motion gate never closes');
}

test('§1: every scroll-driven animation is inside both gates', () => {
  const gate = gateBlock();
  const outside = CSS.replace(gate, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const prop of ['animation-timeline', 'animation-range', 'view-timeline', 'scroll-timeline']) {
    assert.doesNotMatch(outside, new RegExp(`${prop}\\s*:`), `${prop} is set outside the two motion gates`);
  }
  assert.doesNotMatch(outside, /@keyframes sd-/, 'a scroll keyframe set is defined outside the gates');
  assert.doesNotMatch(outside, /animation(?:-name)?:\s*sd-/, 'a scroll animation is attached outside the gates');
  // Each of the five elements the spec moves is in there, on a scroll timeline.
  for (const [sel, name] of [['.pcards .pcard__shot', 'sd-rise'], ['.check-shield', 'sd-sway'],
    ['#trust .trust-item', 'sd-appear'], ['#plans .plan-price__num', 'sd-appear'], ['.final-shield', 'sd-drift']]) {
    const rule = gate.match(new RegExp('\\n\\s*' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{([^}]*)\\}'));
    assert.ok(rule, `${sel} is not animated inside the gate`);
    assert.match(rule[1], new RegExp(`animation: ${name} linear both;`));
    // After the shorthand, which would otherwise reset them.
    assert.ok(rule[1].indexOf('animation-timeline') > rule[1].indexOf('animation:'),
      `${sel}: animation-timeline is reset by the shorthand after it`);
    assert.match(rule[1], /animation-range:/, `${sel} has no range`);
  }
});

test('§1: the scroll keyframes move transform and opacity only', () => {
  const gate = gateBlock();
  const frames = [...gate.matchAll(/@keyframes (sd-[a-z]+) \{([\s\S]*?)\n    \}/g)];
  assert.ok(frames.length >= 4, `expected the sd- keyframes in the gate, found ${frames.length}`);
  for (const [, name, body] of frames) {
    for (const prop of body.matchAll(/([a-z-]+)\s*:/g)) {
      assert.ok(['transform', 'opacity'].includes(prop[1]), `@keyframes ${name} animates ${prop[1]}`);
    }
  }
  // Text only ENTERS: the two text animations are bounded to the entry phase.
  for (const sel of ['#trust .trust-item', '#plans .plan-price__num']) {
    const rule = gate.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{([^}]*)\\}'))[1];
    assert.match(rule, /animation-range: entry 0% entry \d+%;/, `${sel} moves after it has entered`);
  }
});

/* ------------------------------------------------------ §2.4 final screen */

test('§2.4: the final screen, in three languages, before #dev', () => {
  for (const [code, html, dict] of pages()) {
    const final = sectionOf(html, 'start');
    assert.ok(html.indexOf('<section id="start"') < html.indexOf('<section id="dev"'), `${code}: the final screen is not before #dev`);
    assert.ok(final.includes(`>${esc(dict.finalTitle)}</h2>`), `${code}: the final screen does not say finalTitle`);
    assert.match(final, /<a class="btn btn--primary" href="#check" data-i18n="ctaCheck">/,
      `${code}: the final screen's button is not the check`);
    assert.ok(final.includes(`>${esc(dict.ctaCheck)}</a>`), `${code}: the final button is not ctaCheck`);
    assert.match(final, /<img class="final-shield" src="\/img\/shield-closeup-800\.webp"/);
    if (code !== 'ru') assert.doesNotMatch(dict.finalTitle, CYRILLIC, `${code}: finalTitle has Cyrillic`);
    if (code !== 'ru') assert.doesNotMatch(dict.finalTitle, /[—–]/, `${code}: finalTitle carries a dash`);
  }
  assert.equal(readDict('ru').finalTitle, 'Поставьте баннер сегодня — проверка сайта бесплатна',
    'the Russian line is the owner\'s own wording');
  // Clipped, so the close-up running out past the right edge cannot widen the page.
  assert.match(LAYER, /\n\.final \{[^}]*overflow: clip;/);
  assert.match(LAYER, /\n#check \{[^}]*overflow: clip;/);
});

/* --------------------------------------------------------------- §2.5 FAQ */

test('§2.5: the FAQ numbers are drawn by app.js, two digits, hidden from screen readers', () => {
  const faq = APP.slice(APP.indexOf('function renderFaq()'), APP.indexOf('function openFaqFromHash()'));
  assert.match(faq, /el\('span', 'qa-n', \(i < 9 \? '0' : ''\) \+ \(i \+ 1\)\)/, 'the number is not 01…14');
  assert.match(faq, /n\.setAttribute\('aria-hidden', 'true'\)/, 'a screen reader would read «ноль один»');
  assert.match(faq, /el\('span', 'qa-q', qa\[0\]\)/, 'the question is not its own span');
  const n = LAYER.match(/\n\.qa-n \{[^}]*\}/);
  assert.ok(n, 'no .qa-n rule');
  assert.match(n[0], /monospace/);
  assert.match(n[0], /color: var\(--ink-soft\)/);
  // The answer starts on the question's line: number column + gap.
  assert.match(LAYER, /\n\.qa p \{ margin-left: 44px; \}/);
});

/* -------------------------------------------------------- §2.6 the footer */

test('§2.6: the footer wordmark is decoration drawn from the capsule\'s own path', () => {
  const template = readTemplate();
  assert.equal((template.match(/id="ck-wordmark"/g) || []).length, 1, 'the wordmark path has no single id');
  for (const [where, html] of [...pages().map(([c, h]) => [c, h]), ['ru/law', renderLawIndex(template, 'ru')]]) {
    const foot = html.match(/<footer[\s\S]*?<\/footer>/)[0];
    assert.match(foot, /<div class="wrap foot-mark" aria-hidden="true">\s*<svg class="foot-word"[^>]*><use href="#ck-wordmark"\/><\/svg>/,
      `${where}: the footer wordmark is missing or exposed`);
    assert.match(html, /<path id="ck-wordmark" d="/, `${where}: the page has no #ck-wordmark to point at`);
  }
  assert.match(LAYER, /\n\.foot-word \{[^}]*width: 60%;[^}]*color: var\(--line\);/);
});

/* -------------------------------------------------- §4.1 the first screen */

test('§4.1: the first screen is centred, two-tone, with the shield in the line', () => {
  for (const [code, html, dict] of pages()) {
    const h1 = html.match(/<h1>([\s\S]*?)<\/h1>/)[1];
    const at = (s) => h1.indexOf(s);
    const lead = `>${esc(dict.heroTitleLead)}<`;
    const shield = '<img class="h1-shield"';
    assert.ok(at(lead) > -1 && at(shield) > at(lead), `${code}: the shield does not follow the lead`);
    assert.ok(at(`>${esc(dict.heroTitleLead2)}<`) > at(shield), `${code}: the shield is not between words of the first line`);
    assert.match(h1, new RegExp(`<span class="h1-tail" data-i18n="heroTitleTail">${esc(dict.heroTitleTail)}</span> <em class="h1-accent"`),
      `${code}: the grey tail does not run into the red word`);
    // The shield follows the lead directly (a word joiner, no space): never a
    // nowrap group, which pushed the long Romanian lead off a phone.
    assert.match(h1, /^<span data-i18n="heroTitleLead">[^<]+<\/span>&#8288;<img class="h1-shield"/,
      `${code}: the shield does not follow the lead directly`);
    assert.doesNotMatch(h1, /h1-keep|nowrap/, `${code}: the headline holds a nowrap group again`);
    for (const k of ['heroTitleLead', 'heroTitleLead2', 'heroTitleTail', 'heroTitleAccent']) {
      if (code !== 'ru') assert.doesNotMatch(dict[k], CYRILLIC, `${code}: ${k} has Cyrillic`);
    }
  }
  const rule = (sel) => {
    const m = LAYER.match(new RegExp('\\n' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{([^}]*)\\}'));
    assert.ok(m, `the V1.30.2 layer has no ${sel} rule`);
    return m[1];
  };
  assert.match(rule('.hero-copy'), /text-align: center/);
  const h1 = rule('.hero h1');
  assert.match(h1, /font-weight: 600/);
  assert.match(h1, /letter-spacing: -0\.03em/);
  assert.match(h1, /line-height: 1;/);
  assert.match(rule('.h1-tail'), /color: var\(--ink-soft\)/);
  assert.match(rule('.h1-shield'), /height: \.9em/);
  assert.match(LAYER, /@media \(max-width: 560px\) \{\n  \.h1-shield \{ height: \.85em; \}/);
  assert.match(rule('.hero .lede'), /max-width: 56ch/);
});

test('§4.2: buttons are pills, 52px tall and 44px small', () => {
  const btn = LAYER.match(/\n\.btn \{[^}]*\}/)[0];
  assert.match(btn, /min-height: 52px/);
  assert.match(LAYER, /\n\.btn--sm \{ min-height: 44px; \}/);
  // Still one red: the secondary pill is dark with a thin light edge.
  /* UPDATED for SPEC V1.30.3 §1 — the edge is the --edge-ghost token (dark:
     white at .16, as before; light: ink at .22). */
  assert.match(LAYER, /\n\.btn--ghost:not\(:hover\) \{ border-color: var\(--edge-ghost\); \}/);
  assert.match(CSS, /^\s+--edge-ghost:\s+rgba\(255, 255, 255, \.16\);/m);
});

/* --------------------------------------------------- §4.3 «Работает с» */

/* UPDATED 20.11.2026 (owner): real logos — Simple Icons 16.38.0 (CC0-1.0)
   for the eight platforms the collection has, Tilda and OpenCart as text. */
test('§4.3: the platform row sits under the first screen, makes no request, names no competitor', () => {
  assert.equal(PLATFORMS.length, 10);
  const withLogo = PLATFORMS.filter((p) => p.logo);
  assert.deepEqual(PLATFORMS.filter((p) => p.wordmark).map((p) => p.name), ['WooCommerce', 'Wix']);
  assert.match(CSS, /\n\.platform__name--sr \{[^}]*clip-path: inset\(50%\);/, 'the wordmarks\' names are not kept for screen readers');
  assert.deepEqual(PLATFORMS.filter((p) => !p.logo).map((p) => p.name), ['Tilda', 'OpenCart'],
    'only Tilda and OpenCart may go without a logo — Simple Icons has none for them');
  // The logos are files beside their CC0 licence and a note on the marks.
  const BRANDS = join(SITE_DIR, 'icons', 'brands');
  const lic = readFileSync(join(BRANDS, 'LICENSE.md'), 'utf8');
  assert.match(lic, /CC0 1\.0 Universal/, 'site/icons/brands/LICENSE.md is not the CC0 text');
  const readme = readFileSync(join(BRANDS, 'README.md'), 'utf8');
  assert.match(readme, /Simple Icons/);
  assert.match(readme, /belong to their owners/);
  assert.match(readme, /nominative/);
  const files = readdirSync(BRANDS).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)).sort();
  assert.deepEqual(files, withLogo.map((p) => p.logo).sort(), 'site/icons/brands holds a logo the row does not use, or misses one');

  for (const [code, html, dict] of pages()) {
    const hero = html.match(/<section class="hero">[\s\S]*?\n  <\/section>/)[0];
    const row = hero.match(/<div class="platforms">[\s\S]*?<\/div>/);
    assert.ok(row, `${code}: no platform row in the first screen`);
    assert.ok(hero.indexOf('<div class="platforms">') > hero.indexOf('</figure>'), `${code}: the row is not under the composition`);
    assert.ok(row[0].includes(`>${esc(dict.platformsLabel)}</p>`), `${code}: the row has no label`);
    const items = [...row[0].matchAll(/<li class="platform[^"]*">([\s\S]*?)<\/li>/g)].map((m) => m[1]);
    assert.equal(items.length, PLATFORMS.length, `${code}: the row does not list ${PLATFORMS.length} platforms`);
    PLATFORMS.forEach((p, i) => {
      /* Every platform has its name as TEXT — the accessible name of the
         item: visible beside a symbol, screen-reader-only beside a wordmark
         (WooCommerce, Wix — the logo already spells it). */
      const nameSpan = p.wordmark ? '<span class="platform__name platform__name--sr">' : '<span class="platform__name">';
      assert.ok(items[i].includes(`${nameSpan}${p.name}</span>`), `${code}: ${p.name} has no name in text`);
      const svg = items[i].match(/<svg[\s\S]*?<\/svg>/);
      if (p.logo) {
        assert.ok(svg, `${code}: ${p.name} has no logo`);
        assert.match(svg[0], p.wordmark
          ? /^<svg class="brand brand--wordmark" width="\d+" height="16" viewBox="[\d. ]+" fill="currentColor" aria-hidden="true" focusable="false">/
          : /^<svg class="brand" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">/,
          `${code}: ${p.name}'s logo is not a decorative inline currentColor svg`);
        assert.doesNotMatch(svg[0], /<title>|fill="#|stroke="#/, `${code}: ${p.name}'s logo carries a title or a colour of its own`);
      } else {
        assert.equal(svg, null, `${code}: ${p.name} has a logo it should not have`);
      }
    });
    assert.doesNotMatch(row[0], /\b(src|href|srcset)=|url\(|<use\b|<image\b/, `${code}: the platform row asks for a resource`);
    for (const name of ['Cookiebot', 'CookieYes', 'Osano', 'Termly', 'Usercentrics', 'OneTrust',
                        'Iubenda', 'Complianz', 'KookiOk', 'consentkit.us']) {
      assert.ok(!row[0].includes(name), `${code}: the platform row names ${name}`);
    }
    if (code !== 'ru') assert.doesNotMatch(dict.platformsLabel, CYRILLIC);
  }
  // Monochrome --ink-soft in both themes: the text and the logo both.
  assert.match(LAYER, /\n\.platform \{[^}]*color: var\(--ink-soft\)/);
  assert.match(CSS, /\n\.platform \.brand \{[^}]*color: var\(--ink-soft\)/);
});

/* --------------------------------------------------- §4.4 section heads */

const HEADS = [
  ['demo', 'kickerDemo', 'demoTitle', 'demoTitle2'],
  ['features', 'kickerFeatures', 'featTitle', 'featTitle2'],
  ['how', 'kickerHow', 'howTitle', 'howTitle2'],
  ['pricing', 'kickerPricing', 'priceTitle', 'priceTitle2'],
  ['faq', 'kickerFaq', 'faqTitle', 'faqTitle2']
];

test('§4.4: five section heads carry a label and a two-tone heading, in three languages', () => {
  for (const [code, html, dict] of pages()) {
    for (const [id, kicker, title, title2] of HEADS) {
      const sec = sectionOf(html, id);
      assert.match(sec, new RegExp(`<p class="kicker"><svg class="icon"[\\s\\S]*?</svg><span data-i18n="${kicker}">${esc(dict[kicker])}</span></p>`),
        `${code} #${id}: no label with an icon`);
      assert.ok(sec.includes(`<h2><span data-i18n="${title}">${esc(dict[title])}</span> <span class="h2-soft" data-i18n="${title2}">${esc(dict[title2])}</span></h2>`),
        `${code} #${id}: the heading is not two-tone`);
      for (const k of [kicker, title2]) {
        assert.ok(dict[k] && dict[k].trim(), `${code}.json has no ${k}`);
        assert.doesNotMatch(dict[k], /[—–]/, `${code}: ${k} carries a dash`);
        if (code !== 'ru') assert.doesNotMatch(dict[k], CYRILLIC, `${code}: ${k} has Cyrillic`);
      }
    }
    // The four with a lede put it on the right, in a ≤ 44ch column.
    for (const id of ['demo', 'features', 'how', 'pricing']) {
      assert.match(sectionOf(html, id), /<div class="section-head section-head--split">/, `${code} #${id}: not a split head`);
    }
  }
  assert.match(LAYER, /grid-template-columns: minmax\(0, 1fr\) minmax\(0, 44ch\);/);
  assert.match(LAYER, /\n\.h2-soft \{[^}]*color: var\(--ink-soft\)/);
  assert.match(LAYER, /\n\.kicker \{[^}]*font-size: var\(--fs-small\)[^}]*color: var\(--ink-soft\)/);
});

/* --------------------------------------------- §4.5 the band of numbers */

/* UPDATED for SPEC V1.30.3 §3 — the band is four data cards now (the
   charts are tested in test/site-v1303.test.mjs); still before «Что умеет». */
test('§4.5: the band of big numbers sits before «Что умеет», as cards', () => {
  for (const [code, html] of pages()) {
    assert.ok(html.indexOf('<section id="figures"') < html.indexOf('<section id="features"'),
      `${code}: the band is not before «Что умеет»`);
    assert.ok(html.indexOf('<section id="figures"') > html.indexOf('<section id="demo"'));
  }
  // Weight 600 and tabular figures come from the B2 rule every .trust-num has.
  assert.match(CSS, /\n\.trust-num \{ font-weight: 600; font-variant-numeric: tabular-nums; \}/);
});

/* ------------------------------------------------------- §2.3 pricing */

test('§2.3: prices at 40px, the Starter edge is light, the «why» is a quote', () => {
  assert.match(LAYER, /\n#plans \.plan-price__num \{[^}]*font-size: 40px;[^}]*font-weight: 600;[^}]*tabular-nums/);
  // UPDATED for SPEC V1.30.3 §1 — a token, white at .14 in the dark theme.
  assert.match(LAYER, /#plans \.plan-table \.is-featured \{ border-left-color: var\(--edge-featured\);/);
  assert.match(CSS, /^\s+--edge-featured:\s+rgba\(255, 255, 255, \.14\);/m);
  assert.match(LAYER, /\n\.cmp-why \{[^}]*border-left: 2px solid var\(--line\)/);
  for (const [code, html, dict] of pages()) {
    const head = sectionOf(html, 'pricing').match(/<div class="section-head[\s\S]*?\n      <\/div>/)[0];
    assert.ok(head.includes(`<p class="price-head-note" data-i18n="priceHeadNote">${esc(dict.priceHeadNote)}</p>`),
      `${code}: «Цены в евро, без НДС» is not beside the heading`);
    assert.doesNotMatch(dict.priceFoot, /euro|евро|VAT|TVA|НДС/i, `${code}: the currency line is said twice`);
  }
});
