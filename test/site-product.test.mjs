/* SPEC V1.24 §7 — the product screens.
 *
 * V1.24 turned «Что умеет» from ten sentences into six cards that SHOW the
 * dashboard, put a real screenshot in the hero window, and added the
 * «Своими силами / ConsentKit» table. All three depend on files and structure
 * that nothing else in the suite watches:
 *
 *   · six .webp screenshots in site/img/, referenced from the built pages,
 *     one file per page language, the dashboard shot in its dark theme
 *     (cabinet-stats-ro.webp and so on). The hero's picture was a seventh
 *     until V1.30.1 B1 made the first screen live markup;
 *   · six .pcard articles, each with a fact pill, a heading and an image;
 *   · #compare with six rows, in three languages, no Cyrillic in ro/en
 *     (since V1.30 a block inside «Тарифы», not a section of its own);
 *   · a hero with exactly one primary button and no route to #demo.
 *
 * The existing test/site-build.test.mjs stays the owner of the rendered
 * pages, the dictionaries and the palette; this file owns V1.24's own shapes.
 *
 * Fix a failure with: node tools/build-site.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  LANGS, SITE_DIR, readDict, readTemplate, renderPage
} from '../tools/build-site.mjs';

/* ------------------------------------------------------------- §0 images */

/* The seven screenshots, the alt key each one carries, and the card it
   belongs to. Listed here rather than globbed: a file that quietly stops
   being referenced would still be «present» to a glob, and a file the
   template names but nobody shipped is the failure that matters. */
/* V1.30 §3.1: the hero's screenshot of a client site (hero-site.webp) is
   replaced by a composed picture — a fictional shop running our real banner,
   with the dashboard's answers card in front. Owner 20.11.2026: one picture
   per page language (the banner and the card speak the page's language), so
   the hero is not in SHOTS — every page references every SHOTS file — but in
   HERO_SHOTS below, one per page. New names, because site/img/ is not
   content-hashed (§0).
   UPDATED for SPEC V1.30.1 A2 — the card in the hero is re-shot in the
   cabinet's dark theme, so the three pictures are new files (hero-v1301-*),
   and the six product screenshots follow the hero's rule: one file per page
   language, the cabinet in its dark theme speaking that language (the cookie
   declaration stays the light public page it is). SHOTS holds the BASE name;
   a page references `<base>-<its language>.webp` and no other language's. */
/* UPDATED for SPEC V1.30.1 B1 — the first screen is no longer a picture
   but the same composition in markup (shop, banner replica, cabinet card;
   see test/site-v1301b.test.mjs), so the three hero-v1301-*.webp files are
   gone from site/img/ and from these lists. Their old names stay here only
   so the hero test below can insist that no page still asks for one. */
const OLD_HERO_SHOTS = ['hero-v1301-ro.webp', 'hero-v1301-ru.webp', 'hero-v1301-en.webp'];
const SHOTS = [
  ['cabinet-readiness', 'pshot1Alt'],
  ['cabinet-scan', 'pshot2Alt'],
  ['cabinet-stats', 'pshot3Alt'],
  ['cabinet-texts', 'pshot4Alt'],
  ['declaration', 'pshot5Alt'],
  ['cabinet-preview', 'pshot6Alt']
];
const shotFile = (base, code) => `${base}-${code}.webp`;
/* SPEC V1.30.2 §0: the owner's glass shield (two widths) and the close-up.
   The close-up ships at 800 only — the source is 784px, and its 2× upscale
   added weight, not detail (the spec's own fallback). */
const SHIELD_FILES = ['shield-glass-600.webp', 'shield-glass-1200.webp', 'shield-closeup-800.webp'];
/* SPEC V1.30.3 §1: the five CABINET screenshots again, shot in the cabinet's
   light theme, shown when the page is light (the declaration is the public
   page, light in both themes, so it has no twin). */
const LIGHT_SHOTS = SHOTS.filter(([base]) => base !== 'declaration');
const lightShotFile = (base, code) => `${base}-light-${code}.webp`;

/* The pixel size of a .webp, read from its header — the three container
   shapes libwebp writes: simple lossy (VP8), lossless (VP8L) and extended
   (VP8X, which carries alpha, as the hero does). */
function webpSize(path) {
  const b = readFileSync(path);
  assert.equal(b.toString('ascii', 0, 4), 'RIFF', `${path} is not a RIFF file`);
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

/* 250 KB is the ceiling §0 sets. It is not arbitrary: seven of these load on
   one page, and the hero's is not even lazy — past this the first screen
   starts costing more than the page it advertises. */
const MAX_BYTES = 250 * 1024;

test('§0: the product screenshots exist in site/img/ and stay small', () => {
  const files = SHOTS.flatMap(([base]) => LANGS.map(({ code }) => shotFile(base, code)));
  assert.equal(files.length, 6 * 3);
  for (const file of files) {
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

    for (const [file, altKey] of SHOTS.map(([base, key]) => [shotFile(base, code), key])) {
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

      /* V1.30.1 A2: the reserved box has the file's own shape (the hero
         reserves its CSS size, the 2× file is twice that), or the picture
         would be squeezed or leave a gap while it loads. */
      const [w, h] = webpSize(join(SITE_DIR, 'img', file));
      const [, aw, ah] = tag[0].match(/\swidth="(\d+)" height="(\d+)"/).map(Number);
      assert.ok(Math.abs(w / h - aw / ah) < 0.005,
        `${src} is ${w}×${h} but the ${code} page reserves a ${aw}×${ah} box`);
    }

    /* All three languages share one template, so the three shots of a card
       must be one pixel size. */
    for (const [base] of SHOTS) {
      const sizes = LANGS.map(({ code: c }) => webpSize(join(SITE_DIR, 'img', shotFile(base, c))).join('×'));
      assert.equal(new Set(sizes).size, 1, `${base}: the three languages differ in size (${sizes.join(', ')})`);
    }

    /* V1.30.1 A2: the page shows its own language's screenshots and none of
       another page's — a Russian dashboard on the Romanian page is exactly
       what the per-language files exist to prevent. */
    for (const [base] of SHOTS) {
      for (const { code: other } of LANGS) {
        if (other === code) continue;
        assert.ok(!html.includes(shotFile(base, other)),
          `the ${code} page references the ${other} screenshot ${shotFile(base, other)}`);
      }
      assert.ok(!html.includes(`/img/${base}.webp`),
        `the ${code} page still references the single-language ${base}.webp`);
    }
  }
});

test('§0 / V1.30.1 A2: site/img/ holds exactly the pictures the pages use', () => {
  /* Images are not hashed, so an old name that lingers is not harmless: it
     is a second copy someone can link to. The folder is the six
     per-language screenshots, nothing else (V1.30.1 B1: the hero trio went
     with the picture). */
  /* UPDATED for SPEC V1.30.2 §0 — plus the owner's two shield pictures,
     one set for every language (test/site-v1302.test.mjs owns their use). */
  /* UPDATED for SPEC V1.30.3 §1 — plus the light twins of the five cabinet
     screenshots, one per language. */
  const want = new Set([...SHOTS.flatMap(([base]) => LANGS.map(({ code }) => shotFile(base, code))),
    ...LIGHT_SHOTS.flatMap(([base]) => LANGS.map(({ code }) => lightShotFile(base, code))),
    ...SHIELD_FILES]);
  const have = readdirSync(join(SITE_DIR, 'img')).filter((f) => !f.startsWith('.'));
  for (const f of have) assert.ok(want.has(f), `site/img/${f} is not referenced by any page`);
  assert.equal(have.length, want.size, `site/img/ holds ${have.length} files, the pages use ${want.size}`);
});

/* SPEC V1.30.3 §1: in the light theme the bento shows the cabinet's light
   theme. Each of the five cabinet cards carries two <img>: the dark one and,
   right after it, its light twin — same alt (from the dictionary), same box,
   both lazy. The stylesheet displays one of them; a lazy image that is not
   displayed is never fetched, so each visitor downloads one set. */
test('V1.30.3 §1: the light cabinet screenshots exist, pair with the dark ones, and load only in light', () => {
  const template = readTemplate();
  for (const { code } of LANGS) {
    const html = renderPage(template, code);
    for (const [base] of LIGHT_SHOTS) {
      const dark = shotFile(base, code);
      const light = lightShotFile(base, code);
      const path = join(SITE_DIR, 'img', light);
      assert.ok(existsSync(path), `site/img/${light} is missing`);
      assert.ok(statSync(path).size < MAX_BYTES, `site/img/${light} is over 250 KB`);
      assert.deepEqual(webpSize(path), webpSize(join(SITE_DIR, 'img', dark)),
        `${light} is not the pixel size of ${dark}`);
      const pair = html.match(new RegExp(`(<img class="shot-dark" src="/img/${dark}"[^>]*>)\\s*(<img class="shot-light" src="/img/${light}"[^>]*>)`));
      assert.ok(pair, `the ${code} page does not set ${light} right after ${dark}`);
      const attrs = (tag) => tag.replace(/^<img class="[^"]+" src="[^"]+"/, '');
      assert.equal(attrs(pair[2]), attrs(pair[1]), `${light} does not share the dark image's box, alt and loading`);
      assert.match(pair[2], /loading="lazy"/, `${light} is not lazy`);
    }
    // The declaration has no twin.
    assert.doesNotMatch(html, /declaration-light-/, `the ${code} page asks for a light declaration`);
  }
  const css = readFileSync(join(SITE_DIR, 'styles.css'), 'utf8');
  assert.match(css, /\.pcard__shot img\.shot-light \{ display: none; \}/, 'the light shots are displayed by default');
  assert.match(css, /:root\[data-theme="light"\] \.pcard__shot img\.shot-dark \{ display: none; \}/,
    'the dark shots stay displayed in the light theme');
  assert.match(css, /:root\[data-theme="light"\] \.pcard__shot img\.shot-light \{ display: block; \}/,
    'the light shots are not shown in the light theme');
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
  /* UPDATED for SPEC V1.30 §5 — «минимум 14 px для любого текста»: the pill
     was 13px and is the page's smallest type, so it moves up to the floor. */
  assert.match(pill, /font-size: 14px/, '§2 / V1.30 §5: the pill is not 14px');

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

/* UPDATED for SPEC V1.30 §3 row 7 — #compare moved into «Тарифы» as the
   block after the plans table. Everything below is asserted on that block
   exactly as it was on the section: six rows, seven highlighted cells, three
   languages, no competitor named, no frightening words. */
test('§4: #compare is six rows of facts, in all three languages', () => {
  const template = readTemplate();

  for (const { code } of LANGS) {
    const html = renderPage(template, code);
    const dict = readDict(code);
    const pricing = html.match(/<section id="pricing"[\s\S]*?\n  <\/section>/);
    assert.ok(pricing, `the ${code} page has no <section id="pricing">`);
    const section = pricing[0].match(/<div class="compare" id="compare">([\s\S]*)$/);
    assert.ok(section, `the ${code} pricing section has no #compare block`);

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

    /* UPDATED for SPEC V1.30.1 B1 — the hero picture (V1.30 §3.1: a
       fictional shop running our banner, the dashboard card in front, one
       file per language) became that same composition in MARKUP: no <img>,
       no file, and no old picture of any language left behind. What the
       picture's tag guaranteed is kept in the new shape: the frame is in the
       served HTML (first paint, no request), its box is reserved, and it is
       labelled once in the page's language. The composition's own contract —
       inert replica, no consent client, reduced motion — is
       test/site-v1301b.test.mjs. */
    const fig = hero.match(/<figure class="hero-shot"[^>]*>/);
    assert.ok(fig, `the ${code} hero has no figure`);
    assert.match(fig[0], /role="img"/, `the ${code} hero composition is not one image to assistive tech`);
    const label = readDict(code).heroShotAlt.replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    assert.ok(fig[0].includes(`aria-label="${label}"`),
      `the ${code} hero is not labelled with its own heroShotAlt`);
    assert.match(hero, /<div class="hl" data-hero-live aria-hidden="true" inert>/,
      `the ${code} hero has no live composition`);
    /* UPDATED for SPEC V1.30.2 §4.1 — one <img> is allowed back into the
       first screen: the small glass shield standing in the headline, and it
       is decoration (alt="", aria-hidden). Nothing else is a picture. */
    const imgs = hero.match(/<img\b[^>]*>/g) || [];
    assert.equal(imgs.length, 1, `the ${code} hero has ${imgs.length} pictures — only the shield in the headline`);
    assert.match(imgs[0], /class="h1-shield" src="\/img\/shield-glass-600\.webp"/);
    assert.match(imgs[0], /alt="" aria-hidden="true"/, `the ${code} headline shield is not decorative`);
    assert.ok(hero.indexOf(imgs[0]) > hero.indexOf('<h1>') && hero.indexOf(imgs[0]) < hero.indexOf('</h1>'),
      `the ${code} shield is not inside the headline`);
    for (const file of OLD_HERO_SHOTS) {
      assert.ok(!html.includes(file), `the ${code} page still references ${file}`);
      assert.ok(!existsSync(join(SITE_DIR, 'img', file)), `site/img/${file} is still there`);
    }
    assert.ok(!html.includes('hero-v130.webp'),
      `the ${code} page still references the single-language hero-v130.webp`);
    assert.ok(!/hero-v130-(ro|ru|en)\.webp/.test(html),
      `the ${code} page still references a V1.30 hero picture with the light cabinet card`);
    /* The old screenshot of a client's site is gone from the page, and the
       marquee's skeleton replica is not the hero's banner either: the live
       one has its own measured component (.hl-banner). */
    assert.ok(!html.includes('hero-site.webp'), `the ${code} page still references hero-site.webp`);
    assert.ok(!/class="shot-banner"/.test(hero),
      `the ${code} hero carries a skeleton replica beside the picture`);
  }
});

/* ------------------------------------------------------- §3 the geometry */

/* UPDATED for SPEC V1.30 — «Цифры» (#numbers) and «Для кого» (#who) are no
   longer sections, so the shared rule shapes the two blocks that remain, and
   the radius follows §2.2's scale: 28 for large blocks, 20 on a phone. The
   assertions are otherwise the ones V1.24 §3 made. */
test('§3: the coloured blocks are rounded cards, not full-bleed strips', () => {
  const css = readFileSync(join(SITE_DIR, 'styles.css'), 'utf8');

  /* One rule for both, so their radius and rhythm cannot drift apart. */
  const card = css.match(/\n#check,\n#dev \{[\s\S]*?\n\}/);
  assert.ok(card, '§3: the blocks are not shaped by a shared rule');
  assert.match(card[0], /border-radius: 28px/, 'V1.30 §2.2: the block radius is not 28');
  assert.match(card[0], /margin: 0 auto 24px/, '§3: the 24px rhythm between blocks is missing');
  assert.match(card[0], /max-width: calc\(var\(--wrap\) \+ 48px\)/,
    '§3: the blocks still run the full width of the page');
  assert.doesNotMatch(css, /#numbers|#who\b/, 'styles.css still shapes the removed sections');

  /* On a phone the radius steps down to the card radius (20). */
  assert.match(css, /@media \(max-width: 760px\) \{[\s\S]*?#check,\n  #dev \{[\s\S]*?border-radius: 20px/,
    '§3: the blocks keep their desktop radius on a phone');

  /* And the one thing §3 insists must NOT change: the check block is still
     red. The band test in site-build.test.mjs owns this too; it is repeated
     here because §3 is the change that could plausibly have dropped it. */
  assert.match(css, /\.check-band \{[\s\S]*?background: var\(--band\)/,
    '§3 changed the check block\'s colour — only its geometry may change');
});

/* ---------------------------------------------------------- §6 languages */

test('§6: the new strings exist in all three languages, ro and en without Cyrillic', () => {
  /* V1.30: the hero pills are gone (their keys with them); the trust line
     and the FAQ's side column bring keys of their own. */
  const KEYS = [
    'heroShotAlt', 'heroTitleLead', 'heroTitleAccent', 'heroLine1',
    'trustLanguages', 'faqLede',
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
  for (const [key, digits] of [['pcard1Num', '36'], ['pcard4Num', '34'], ['pcard5Num', '1']]) {
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
