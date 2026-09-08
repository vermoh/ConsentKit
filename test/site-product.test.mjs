/* SPEC V1.24 §7 — the product screens.
 *
 * V1.24 turned «Что умеет» from ten sentences into six cards that SHOW the
 * dashboard, put a real screenshot in the hero window, and added the
 * «Своими силами / ConsentKit» table. All three depend on files and structure
 * that nothing else in the suite watches:
 *
 *   · seven .webp screenshots in site/img/, referenced from the built pages;
 *   · six .pcard articles, each with a fact pill, a heading and an image;
 *   · #compare with six rows, in three languages, no Cyrillic in ro/en;
 *   · a hero with exactly one primary button and no route to #demo.
 *
 * The existing test/site-build.test.mjs stays the owner of the rendered
 * pages, the dictionaries and the palette; this file owns V1.24's own shapes.
 *
 * Fix a failure with: node tools/build-site.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  LANGS, SITE_DIR, readDict, readTemplate, renderPage
} from '../tools/build-site.mjs';

/* ------------------------------------------------------------- §0 images */

/* The seven screenshots, the alt key each one carries, and the card it
   belongs to. Listed here rather than globbed: a file that quietly stops
   being referenced would still be «present» to a glob, and a file the
   template names but nobody shipped is the failure that matters. */
const SHOTS = [
  ['hero-site.webp', 'heroShotAlt'],
  ['cabinet-readiness.webp', 'pshot1Alt'],
  ['cabinet-scan.webp', 'pshot2Alt'],
  ['cabinet-stats.webp', 'pshot3Alt'],
  ['cabinet-texts.webp', 'pshot4Alt'],
  ['declaration.webp', 'pshot5Alt'],
  ['cabinet-preview.webp', 'pshot6Alt']
];

/* 250 KB is the ceiling §0 sets. It is not arbitrary: seven of these load on
   one page, and the hero's is not even lazy — past this the first screen
   starts costing more than the page it advertises. */
const MAX_BYTES = 250 * 1024;

test('§0: the seven product screenshots exist in site/img/ and stay small', () => {
  for (const [file] of SHOTS) {
    const path = join(SITE_DIR, 'img', file);
    assert.ok(existsSync(path), `site/img/${file} is missing`);
    const bytes = statSync(path).size;
    assert.ok(bytes > 0, `site/img/${file} is empty`);
    assert.ok(bytes < MAX_BYTES,
      `site/img/${file} is ${Math.round(bytes / 1024)} KB — §0 caps them at 250 KB`);
  }
});

test('§0: every screenshot is referenced from every built page, with a real alt', () => {
  const template = readTemplate();

  for (const { code } of LANGS) {
    const html = renderPage(template, code);
    const dict = readDict(code);

    for (const [file, altKey] of SHOTS) {
      /* Root-absolute, always. /ru and /ro are SUBFOLDERS: a relative
         "img/cabinet-scan.webp" on /ru resolves to /ru/img/… and 404s, which
         is the same trap the «assets are referenced absolutely» test guards
         for scripts and stylesheets. */
      const src = `/img/${file}`;
      assert.ok(html.includes(`src="${src}"`),
        `the ${code} page does not reference ${src}`);

      // The <img> tag itself, so alt/width/height are checked on the right one.
      const tag = html.match(new RegExp(`<img[^>]*src="${src}"[^>]*>`));
      assert.ok(tag, `the ${code} page has no <img> for ${src}`);

      const alt = tag[0].match(/\salt="([^"]*)"/);
      assert.ok(alt, `${src} has no alt attribute on the ${code} page`);
      assert.ok(alt[1].trim().length > 0,
        `${src} has an EMPTY alt on the ${code} page — §1 asks for real alt copy`);
      /* And the alt is this language's own, not the template's Russian
         fallback: an alt that never went through the dictionary is copy two
         of the three pages cannot read. */
      assert.equal(alt[1], dict[altKey].replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
        `${src} on the ${code} page does not carry "${altKey}" from ${code}.json`);

      // width/height reserve the box before the bytes arrive, so the six
      // cards do not shuffle the page as they load.
      assert.match(tag[0], /\swidth="\d+"/, `${src} has no width attribute`);
      assert.match(tag[0], /\sheight="\d+"/, `${src} has no height attribute`);
    }
  }
});

/* ------------------------------------------------------ §1 product cards */

test('§1: six product cards, each with a fact pill, a heading and a screenshot', () => {
  const template = readTemplate();

  for (const { code } of LANGS) {
    const html = renderPage(template, code);
    const section = html.match(/<section id="features">([\s\S]*?)\n  <\/section>/);
    assert.ok(section, `the ${code} page has no <section id="features">`);

    const cards = [...section[1].matchAll(/<article class="pcard [^"]*">([\s\S]*?)<\/article>/g)];
    assert.equal(cards.length, 6,
      `the ${code} page has ${cards.length} .pcard articles, not 6`);

    for (const [i, m] of cards.entries()) {
      const card = m[1];
      assert.match(card, /<p class="fact-pill">/, `product card ${i + 1} (${code}) has no fact pill`);
      assert.match(card, /class="fact-pill__num"/, `product card ${i + 1} (${code}) has no pill number`);
      assert.match(card, /class="fact-pill__label"/, `product card ${i + 1} (${code}) has no pill label`);
      assert.match(card, /<h3[^>]*>[^<]+<\/h3>/, `product card ${i + 1} (${code}) has no heading`);
      assert.match(card, /<img[^>]+src="\/img\/[a-z-]+\.webp"/,
        `product card ${i + 1} (${code}) has no screenshot`);
      /* §1: «кнопок в карточках нет». A card that grew a button would put a
         second call to action next to the page's one primary. */
      assert.ok(!/class="btn/.test(card),
        `product card ${i + 1} (${code}) has a button — §1 allows none`);
    }

    /* The three tones, twice each, in the cream / sand / dark order §1 sets.
       Asserted as a sequence and not as a set: the point of the order is that
       two cards of the same tone never sit side by side in the two-column
       grid. */
    const tones = [...section[1].matchAll(/<article class="pcard pcard--([a-z]+)">/g)]
      .map((m) => m[1]);
    assert.deepEqual(tones, ['cream', 'sand', 'dark', 'cream', 'sand', 'dark'],
      `the ${code} cards run ${tones.join('/')} — §1 asks for cream/sand/dark twice`);

    /* §1: the four remaining facts as a compact text row under the grid. */
    assert.ok(section[1].includes(readDict(code).featMoreTitle),
      `the ${code} page has no «И ещё» subheading`);
    const more = [...section[1].matchAll(/<article class="feat">/g)];
    assert.equal(more.length, 4, `the ${code} «И ещё» row has ${more.length} cards, not 4`);
  }
});

test('§1/§2: the card tones and the pill are built from existing tokens only', () => {
  const css = readFileSync(join(SITE_DIR, 'styles.css'), 'utf8');

  /* «ни одного нового цвета не вводить» (§1). Each tone is one token the
     palette already defines, which is also what makes the dark theme work
     without a rule of its own — every one of these has a dark twin already. */
  assert.match(css, /\.pcard--cream \{\s*background: var\(--surface-2\)/,
    '§1: the cream card is not the sand surface token');
  assert.match(css, /\.pcard--sand\s+\{\s*background: var\(--cream\)/,
    '§1: the sand card is not the cream token');
  assert.match(css, /\.pcard--dark\s+\{\s*background: var\(--ink\)/,
    '§1: the dark card is not --ink');

  /* §2: the pill is --ink with light text, so it inverts itself in the dark
     theme rather than needing a second declaration that could drift. */
  const pill = css.match(/\n\.fact-pill \{[\s\S]*?\n\}/)[0];
  assert.match(pill, /background: var\(--ink\)/, '§2: the pill is not the ink fill');
  assert.match(pill, /color: var\(--bg\)/, '§2: the pill text is not the page ground');
  assert.match(pill, /border-radius: 10px/, '§2: the pill radius is not 10');
  assert.match(pill, /font-size: 13px/, '§2: the pill is not 13px');

  /* §1: «Красного в карточках нет.» The whole product section, pill included,
     must not spend the accent — the page's red budget is the primary button,
     the headline word and the check block. */
  for (const sel of ['.pcard', '.pcard--cream', '.pcard--sand', '.pcard--dark',
                     '.pcard__shot', '.fact-pill', '.fact-pill__num', '.feat']) {
    const rule = css.match(new RegExp(
      '\\n' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{[^}]*\\}'));
    assert.ok(rule, `styles.css has no ${sel} rule`);
    assert.ok(!/var\(--accent(-ink)?\)/.test(rule[0]),
      `${sel} spends the accent — §1 keeps red out of the product cards`);
  }

  /* §1: the tilt, and the card that clips it. Without overflow:hidden the
     rotated screenshot hangs outside the card instead of running under it. */
  const card = css.match(/\n\.pcard \{[\s\S]*?\n\}/)[0];
  assert.match(card, /overflow: hidden/, '§1: the card does not clip its screenshot');
  assert.match(card, /border-radius: 20px/, '§1: the card radius is not 20');
  const shot = css.match(/\n\.pcard__shot \{[\s\S]*?\n\}/)[0];
  assert.match(shot, /transform: rotate\(-2deg\) translateY\(12px\)/,
    '§1: the screenshot is not tilted the way the spec describes');
  /* §1: «На узких экранах наклон 0, картинка во всю ширину.» */
  assert.match(css, /@media \(max-width: 700px\) \{[\s\S]*?\.pcard__shot \{[\s\S]*?transform: none/,
    '§1: the tilt is not switched off on a narrow screen');
});

/* --------------------------------------------------------- §4 the table */

test('§4: #compare is six rows of facts, in all three languages', () => {
  const template = readTemplate();

  for (const { code } of LANGS) {
    const html = renderPage(template, code);
    const dict = readDict(code);
    const section = html.match(/<section id="compare">([\s\S]*?)\n  <\/section>/);
    assert.ok(section, `the ${code} page has no <section id="compare">`);

    // Exactly six rows, and each carries this language's own three strings.
    const rows = [...section[1].matchAll(/<tr>\s*<th scope="row"[\s\S]*?<\/tr>/g)];
    assert.equal(rows.length, 6, `the ${code} compare table has ${rows.length} rows, not 6`);

    for (let n = 1; n <= 6; n++) {
      for (const key of [`cmpRow${n}`, `cmpRow${n}Self`, `cmpRow${n}Us`]) {
        assert.ok(dict[key] && dict[key].trim(), `${code}.json has no "${key}"`);
        assert.ok(section[1].includes(dict[key]),
          `the ${code} compare table does not carry "${key}"`);
      }
    }

    // The two column heads and the section's own heading and lede.
    for (const key of ['compareTitle', 'compareLede', 'cmpColSelf', 'cmpColUs']) {
      assert.ok(section[1].includes(dict[key]),
        `the ${code} compare section does not carry "${key}"`);
    }

    /* §4: the ConsentKit column is highlighted the way the pricing table's
       recommended column is — one class, on the head cell and on all six
       value cells. */
    const featured = [...section[1].matchAll(/class="is-featured"/g)];
    assert.equal(featured.length, 7,
      `the ${code} compare table marks ${featured.length} cells featured, not 7 (head + six rows)`);

    /* §4 forbids naming or grading anyone else. Only our own name may appear,
       and it appears exactly where the column head is. */
    for (const name of ['Cookiebot', 'CookieYes', 'Osano', 'Termly', 'Usercentrics',
                        'OneTrust', 'Iubenda', 'Complianz']) {
      assert.ok(!section[1].includes(name),
        `the ${code} compare table names ${name} — §4 forbids competitor names`);
    }

    /* §4 also forbids scaring the reader: the tone of «Своими силами» is
       neutral, so none of the words the site avoids everywhere else may
       appear here either. */
    for (const word of ['штраф', 'amend', 'amenzi', 'fine ', 'аудит', 'консультац']) {
      assert.ok(!section[1].toLowerCase().includes(word.toLowerCase()),
        `the ${code} compare table says «${word}» — §4 keeps the left column neutral`);
    }
  }
});

test('§4: the compare highlight reuses the pricing look without touching its rule', () => {
  const css = readFileSync(join(SITE_DIR, 'styles.css'), 'utf8');

  /* Two rules that say the same two things, deliberately NOT merged into one
     selector list: test/site-build.test.mjs reads `.plan-table .is-featured`
     by name to prove the pricing highlight is still sand with a dark 1px
     border, and a joined selector reads to that matcher as a deleted rule. */
  const ours = css.match(/\n\.cmp-table \.is-featured \{[\s\S]*?\n\}/);
  assert.ok(ours, 'styles.css has no .cmp-table .is-featured rule');
  assert.match(ours[0], /background: var\(--surface-2\)/,
    '§4: the ConsentKit column is not sand');
  assert.match(ours[0], /border-left: 1px solid var\(--ink\)/,
    '§4: the ConsentKit column has no dark 1px border');
  assert.ok(css.includes('.plan-table .is-featured {'),
    'the pricing table\'s own featured rule was merged away — §4 leaves it alone');

  /* Same discipline as the pricing table: the WRAPPER scrolls sideways, the
     page never does. */
  assert.match(css, /\.cmp-scroll \{[\s\S]*?overflow-x: auto/,
    'the compare table can widen the page — it needs its own scroll wrapper');
});

/* ---------------------------------------------------------- §5 the hero */

test('§5: the hero has one primary button and no route to the demo', () => {
  const template = readTemplate();

  for (const { code } of LANGS) {
    const html = renderPage(template, code);
    const hero = html.match(/<section class="hero">[\s\S]*?\n  <\/section>/)[0];

    const primaries = hero.match(/class="btn[^"]*btn--primary[^"]*"/g) || [];
    assert.equal(primaries.length, 1,
      `the ${code} hero has ${primaries.length} primary buttons — §5 asks for exactly one`);

    /* §5: «Кнопка "Посмотреть демо" из первого экрана убирается.» The section
       itself stays, reachable from the menu — this is only about the hero. */
    assert.ok(!/href="#demo"/.test(hero),
      `the ${code} hero still links to #demo — §5 removes that button`);
    assert.ok(!/class="btn btn--ghost"/.test(hero),
      `the ${code} hero still has a secondary button`);

    // …and the demo is genuinely still on the page, one section down.
    assert.match(html, /<section id="demo"/,
      `the ${code} page lost the demo section entirely — §5 only moves the button`);
    assert.match(html, /<nav class="head-nav"[\s\S]*?href="#demo"/,
      `the ${code} menu no longer offers the demo`);

    /* §5: the window frame keeps its three dots and gains the real banner. */
    assert.match(hero, /<div class="shot-bar" aria-hidden="true">/,
      `the ${code} hero window lost its title bar`);
    assert.match(hero, /<img class="shot-img" src="\/img\/hero-site\.webp"/,
      `the ${code} hero does not show the real banner screenshot`);
    /* The old skeleton replica must be gone, not merely hidden behind it —
       two banners in one frame is what §5 replaces. */
    assert.ok(!/class="shot-banner"/.test(hero),
      `the ${code} hero still carries the skeleton replica beside the screenshot`);
  }
});

/* ------------------------------------------------------- §3 the geometry */

test('§3: the coloured blocks are rounded cards, not full-bleed strips', () => {
  const css = readFileSync(join(SITE_DIR, 'styles.css'), 'utf8');

  /* One rule for all four, so their radius and rhythm cannot drift apart. */
  const card = css.match(/\n#check,\n#numbers,\n#who,\n#dev \{[\s\S]*?\n\}/);
  assert.ok(card, '§3: the four blocks are not shaped by a shared rule');
  assert.match(card[0], /border-radius: 24px/, '§3: the block radius is not 24');
  assert.match(card[0], /margin: 0 auto 24px/, '§3: the 24px rhythm between blocks is missing');
  assert.match(card[0], /max-width: calc\(var\(--wrap\) \+ 48px\)/,
    '§3: the blocks still run the full width of the page');

  /* §3: «на мобильном радиус 16, отступы 24/20.» */
  assert.match(css, /@media \(max-width: 760px\) \{[\s\S]*?#check,\n  #numbers,\n  #who,\n  #dev \{[\s\S]*?border-radius: 16px/,
    '§3: the blocks keep their 24px radius on a phone');

  /* And the one thing §3 insists must NOT change: the check block is still
     red. The band test in site-build.test.mjs owns this too; it is repeated
     here because §3 is the change that could plausibly have dropped it. */
  assert.match(css, /\.check-band \{[\s\S]*?background: var\(--band\)/,
    '§3 changed the check block\'s colour — only its geometry may change');
});

/* ---------------------------------------------------------- §6 languages */

test('§6: the new strings exist in all three languages, ro and en without Cyrillic', () => {
  const KEYS = [
    'heroPill1Num', 'heroPill1Label', 'heroPill2Num', 'heroPill2Label', 'heroShotAlt',
    'featMoreTitle', 'compareTitle', 'compareLede', 'cmpColSelf', 'cmpColUs',
    'cmpTableCaption', 'pcard5Title', 'pcard5Text'
  ];
  for (let n = 1; n <= 6; n++) {
    KEYS.push(`pcard${n}Num`, `pcard${n}Label`, `pshot${n}Alt`);
    KEYS.push(`cmpRow${n}`, `cmpRow${n}Self`, `cmpRow${n}Us`);
  }

  const CYRILLIC = /[Ѐ-ӿ]/;

  for (const { code } of LANGS) {
    const dict = readDict(code);
    for (const key of KEYS) {
      assert.ok(typeof dict[key] === 'string' && dict[key].trim(),
        `site/src/i18n/${code}.json has no "${key}"`);
      if (code !== 'ru') {
        assert.ok(!CYRILLIC.test(dict[key]),
          `"${key}" in ${code}.json contains Cyrillic — §6: ro and en carry none`);
      }
    }
  }

  /* §6: «Плашки с числами одинаковы во всех языках, подписи переводятся.»
     The digits are the same everywhere — 36, 34, 1 — while «10 минут» and
     «каждую неделю» are sentences and are translated with the labels. */
  for (const [key, digits] of [['pcard1Num', '36'], ['pcard4Num', '34'], ['pcard5Num', '1'],
                               ['heroPill2Num', '€0']]) {
    for (const { code } of LANGS) {
      assert.equal(readDict(code)[key], digits,
        `"${key}" differs in ${code}.json — §6 keeps the numbers identical`);
    }
  }

  /* §3 of the site rules and the owner's own list: no invented figures. Every
     number a pill shows has to be one the site already stands behind. */
  const KNOWN = new Set(['36', '34', '10', '1', '0']);
  for (const { code } of LANGS) {
    const dict = readDict(code);
    for (let n = 1; n <= 6; n++) {
      for (const num of String(dict[`pcard${n}Num`]).match(/\d+/g) || []) {
        assert.ok(KNOWN.has(num),
          `pill ${n} in ${code}.json shows "${num}", which is not a number the site already carries`);
      }
    }
  }
});
