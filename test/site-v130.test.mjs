/* SPEC V1.30 §7 — the landing's «дорогой» pass: fewer things, a larger
 * scale, more air, no repeats.
 *
 * test/site-build.test.mjs stays the owner of the rendered pages, the
 * dictionaries and the palette, and test/site-product.test.mjs of V1.24's
 * product screens; this file owns V1.30's own shapes:
 *
 *   · eight sections in a fixed order, and the four that were folded away;
 *   · the type scale (tokens that exist AND are applied), the 64ch measure;
 *   · no card nested in a card, no shadows, one gated animation;
 *   · at most twelve dashes per language page;
 *   · the placeholder and the marquee buttons at 4.5:1.
 *
 * Fix a failure with: node tools/build-site.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  LANGS, SITE_DIR, MARQUEE_CARDS, readDict, readTemplate, renderPage
} from '../tools/build-site.mjs';

const CSS = readFileSync(join(SITE_DIR, 'styles.css'), 'utf8');
const APP = readFileSync(join(SITE_DIR, 'app.js'), 'utf8');

/* WCAG 2.1 contrast, the same arithmetic test/site-build.test.mjs uses. */
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

/* ------------------------------------------------------------ §3 structure */

test('§3: eight sections, in order, and the folded ones are gone', () => {
  const template = readTemplate();
  for (const { code } of LANGS) {
    const html = renderPage(template, code);
    const main = html.match(/<main id="main">([\s\S]*?)<\/main>/)[1];
    /* Opening tags of the sections that are direct children of <main>, as
       authored: two spaces of indent. Comments are stripped first — a note
       may well mention the word section. */
    const order = [...main.replace(/<!--[\s\S]*?-->/g, '')
      .matchAll(/\n  <section (?:id="([a-z-]+)"|class="hero")/g)]
      .map((m) => m[1] || 'hero');
    /* UPDATED for SPEC V1.30.2 — two sections join: the band of big numbers
       (#figures, §4.5) before «Что умеет», and the final screen (#start,
       §2.4) before #dev. */
    assert.deepEqual(order,
      ['hero', 'check', 'demo', 'figures', 'features', 'how', 'pricing', 'faq', 'start', 'dev'],
      `the ${code} page's sections run ${order.join(' → ')}`);

    // «Цифры», «Для кого», and the two that merged into their neighbours.
    for (const id of ['numbers', 'who', 'looks', 'compare']) {
      assert.doesNotMatch(html, new RegExp(`<section id="${id}"`),
        `the ${code} page still has #${id} as a section of its own`);
    }
    // The merged two keep their ids as anchors inside their new homes.
    const demo = html.match(/<section id="demo"[\s\S]*?\n  <\/section>/)[0];
    assert.match(demo, /id="looks"/, `the ${code} demo section lost the #looks anchor`);
    assert.ok(demo.indexOf('id="looks"') < demo.indexOf('class="demo-stage"'),
      `the ${code} marquee does not run above the live demo`);
    const pricing = html.match(/<section id="pricing"[\s\S]*?\n  <\/section>/)[0];
    assert.match(pricing, /id="compare"/, `the ${code} pricing section lost the #compare anchor`);
    // «Для кого» lives on as the platform rows of the check block.
    const check = html.match(/<section id="check"[\s\S]*?\n  <\/section>/)[0];
    for (const id of ['who-builders', 'who-wordpress', 'who-agency']) {
      assert.match(check, new RegExp(`id="${id}"`), `the ${code} check block lost the #${id} anchor`);
    }
    // §3 row 6: no repeat of the check button under the steps.
    const how = html.match(/<section id="how">[\s\S]*?\n  <\/section>/)[0];
    assert.doesNotMatch(how, /class="btn/, `the ${code} «Как это работает» still ends in a button`);
  }
});

test('§3: the removed sections took their dictionary keys with them', () => {
  const GONE = ['whoTitle', 'who1Title', 'who1Text', 'who2Title', 'who2Text', 'who4Title',
    'who4Text', 'statsTitle', 'statsSites', 'statsConsents', 'statsLanguages', 'statsVersion',
    'statsServices', 'statsMinutes', 'marqueeTitle', 'marqueeLede', 'checkCaption',
    'heroNote', 'heroPill1Num', 'heroPill2Num', 'starterTitle', 'factsTitle', 'ctaCabinet'];
  for (const { code } of LANGS) {
    const dict = readDict(code);
    for (const key of GONE) {
      assert.ok(!Object.prototype.hasOwnProperty.call(dict, key),
        `${code}.json still carries "${key}" of a section V1.30 removed`);
    }
  }
});

test('§3 row 5: «Согласие можно доказать» says the log cannot be changed after the fact', () => {
  const WANT = { ru: /нельзя изменить задним числом/, ro: /nu pot fi modificate retroactiv/,
                 en: /cannot be changed after the fact/ };
  for (const { code } of LANGS) {
    assert.match(readDict(code).feat3Text, WANT[code], `${code}: feat3Text lacks the immutability fact`);
  }
});

/* ------------------------------------------------------------ §2.1 type */

/* «A + Bvw» at a viewport width, so the clamp endpoints are checked as the
   numbers the spec gives (phone at 390, desktop at 1440), not as strings. */
function clampAt(token, width) {
  const m = CSS.match(new RegExp(`${token}:\\s*clamp\\((\\d+)px,\\s*([\\d.]+)px \\+ ([\\d.]+)vw,\\s*(\\d+)px\\)`));
  assert.ok(m, `styles.css does not declare ${token} as clamp(min, A + Bvw, max)`);
  const [, min, a, b, max] = m.map(Number);
  return Math.min(max, Math.max(min, a + (b * width) / 100));
}

test('§2.1: the type scale exists and is applied to the page', () => {
  for (const [token, phone, desktop] of [
    ['--fs-display', 40, 72], ['--fs-h2', 30, 44], ['--fs-h3', 19, 22],
    ['--fs-lead', 18, 20], ['--fs-body', 16, 17]
  ]) {
    assert.ok(Math.abs(clampAt(token, 390) - phone) < 0.5,
      `${token} is ${clampAt(token, 390).toFixed(1)}px at 390, §2.1 says ${phone}`);
    assert.ok(Math.abs(clampAt(token, 1440) - desktop) < 0.5,
      `${token} is ${clampAt(token, 1440).toFixed(1)}px at 1440, §2.1 says ${desktop}`);
  }
  assert.match(CSS, /--fs-small:\s*14px/, '--fs-small is not 14px');

  /* Applied, with the line heights and tracking of the table. The V1.30 layer
     is the last word on these elements, so it is read from there. */
  const layer = CSS.slice(CSS.indexOf('SPEC V1.30 — «дорогой» вид'));
  const rule = (sel) => {
    const m = layer.match(new RegExp('\\n' + sel + ' \\{[^}]*\\}'));
    assert.ok(m, `the V1.30 layer has no ${sel} rule`);
    return m[0];
  };
  const h1 = rule('h1');
  assert.match(h1, /font-size: var\(--fs-display\)/);
  assert.match(h1, /line-height: 1\.04/);
  assert.match(h1, /letter-spacing: -0\.025em/);
  assert.match(h1, /font-weight: 700/);
  const h2 = rule('h2');
  assert.match(h2, /font-size: var\(--fs-h2\)/);
  assert.match(h2, /line-height: 1\.1/);
  assert.match(h2, /letter-spacing: -0\.02em/);
  assert.match(rule('h3'), /font-size: var\(--fs-h3\)/);
  assert.match(rule('body'), /font-size: var\(--fs-body\)/);
  assert.match(rule('body'), /line-height: 1\.55/);
  assert.match(rule('\\.section-lede'), /font-size: var\(--fs-lead\)/);
  assert.match(layer, /\nh1, h2, h3 \{ text-wrap: balance; \}/, 'headings are not balanced');
  assert.match(layer, /\np, li, summary, figcaption \{ text-wrap: pretty; \}/, 'body text is not pretty-wrapped');
  // Tabular figures where numbers line up.
  assert.match(layer, /\.hero-trust,\n\.plan-table,\n\.cmp-table,[\s\S]*?\{ font-variant-numeric: tabular-nums; \}/,
    'the trust line and the tables do not use tabular figures');
});

test('§2.1: running text is held to 64 characters, and nothing is wider', () => {
  assert.match(CSS, /\np \{ max-width: 64ch; \}/, 'paragraphs are not capped at 64ch');
  assert.match(CSS, /\.section-lede \{[^}]*max-width: 64ch/, 'the section ledes are not capped at 64ch');
  for (const m of CSS.matchAll(/max-width:\s*(\d+)ch/g)) {
    assert.ok(Number(m[1]) <= 64, `styles.css sets a ${m[1]}ch measure — §2.1 caps text at 64ch`);
  }
});

/* ------------------------------------------------------------ §2.2 surfaces */

test('§2.2: no card is nested inside another card', () => {
  /* The page's card-like objects. A block (#check, #dev) may hold a card —
     the form, the code panel — but a card may not hold another. */
  const CARD = new Set(['card', 'pcard', 'feat', 'check', 'qa', 'cmp-why']);
  const VOID = new Set(['img', 'input', 'br', 'meta', 'link', 'source', 'hr', 'path', 'rect', 'circle']);
  const template = readTemplate();
  for (const { code } of LANGS) {
    const html = renderPage(template, code);
    const main = html.match(/<main id="main">([\s\S]*?)<\/main>/)[1]
      .replace(/<!--[\s\S]*?-->/g, '');
    const stack = [];
    let seen = 0;
    for (const m of main.matchAll(/<(\/?)([a-z][a-z0-9-]*)\b([^>]*?)(\/?)>/g)) {
      const [, close, tag, attrs, self] = m;
      if (close) { stack.pop(); continue; }
      if (self || VOID.has(tag)) continue;
      const cls = (attrs.match(/\sclass="([^"]*)"/) || [, ''])[1].split(/\s+/);
      const isCard = cls.some((c) => CARD.has(c));
      if (isCard) {
        assert.ok(!stack.some(Boolean),
          `the ${code} page nests a card in a card: <${tag} class="${cls.join(' ')}">`);
      }
      stack.push(isCard);
      if (isCard) seen++;
    }
    // The walk has to have met the page's cards, or it proved nothing.
    assert.ok(seen >= 6 + 4 + 1, `the ${code} walk met only ${seen} cards — did the parse break?`);
  }
});

test('§2.2: no shadows — depth is a surface tone and a 1px line', () => {
  /* A blurred box-shadow is what §2.2 rules out. Two zero-blur uses survive
     on purpose: the swatches' selection ring (0 0 0 2px, an outline that
     follows the circle) and the Creem badge, which is the vendor's own asset
     drawn the way they ship it.
     UPDATED for SPEC V1.30.1 A1 — the cards' top highlight, `inset 0 1px 0`,
     is a 1px line drawn INSIDE the border, not a shadow: the rule is about
     outer blurred shadows. So an inset layer is allowed only in exactly that
     shape (no blur, no spread, one pixel down), and every outer layer must
     still have no blur. The colour is not parsed for lengths: the old check
     read the first three numbers of the layer, which for an inset layer
     written with an rgba() would have read the colour's channels. */
  const code = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  let insets = 0;
  for (const m of code.matchAll(/box-shadow:\s*([^;]+);/g)) {
    for (const raw of m[1].split(/,(?![^(]*\))/)) {
      const layer = raw.trim();
      const geometry = layer.replace(/(rgba?|hsla?|var)\([^)]*\)|#[0-9a-f]{3,8}\b/gi, '').trim();
      if (/^inset\b/.test(geometry)) {
        assert.match(geometry, /^inset 0 1px 0$/,
          `an inset box-shadow other than the 1px top highlight: box-shadow: ${m[1]}`);
        insets++;
        continue;
      }
      const lengths = geometry.match(/-?\d*\.?\d+(px)?/g) || [];
      const blur = lengths.length >= 3 ? parseFloat(lengths[2]) : 0;
      assert.equal(blur, 0, `styles.css still casts a shadow: box-shadow: ${m[1]}`);
    }
  }
  assert.ok(insets >= 1, 'the V1.30.1 card highlight is gone — the inset branch of this test is dead');
});

/* ------------------------------------------------- V1.30.1 A1 light, depth */

/* The V1.30.1 layer, read on its own: it is the last word on the rules below. */
const LAYER_1301 = CSS.slice(CSS.indexOf('SPEC V1.30.1 — шаг A'));

test('V1.30.1 A1: the grain is one inline SVG noise on body, at 3–5%', () => {
  assert.ok(LAYER_1301.length > 0 && CSS.includes('SPEC V1.30.1 — шаг A'), 'styles.css has no V1.30.1 layer');
  const body = LAYER_1301.match(/\nbody \{[^}]*\}/);
  assert.ok(body, 'the V1.30.1 layer has no body rule');
  const url = body[0].match(/background-image:\s*url\("([^"]+)"\)/);
  assert.ok(url, 'the grain is not a background-image on body');
  /* Inline, so no request of any kind — the «no off-origin» rule — and not
     a file in site/img/ either. */
  assert.match(url[1], /^data:image\/svg\+xml,/, 'the grain is not an inline SVG data URI');
  const svg = decodeURIComponent(url[1].slice('data:image/svg+xml,'.length));
  assert.match(svg, /<feTurbulence\b/, 'the grain is not feTurbulence noise');
  assert.doesNotMatch(svg.replace(/xmlns='[^']*'/, ''), /https?:/, 'the grain SVG reaches for a URL');
  // The strength is the rect's opacity, the one alpha in the tile.
  const op = svg.match(/<rect\b[^>]*opacity='([\d.]+)'/);
  assert.ok(op, 'the grain has no opacity of its own');
  assert.ok(Number(op[1]) >= 0.03 && Number(op[1]) <= 0.05,
    `the grain is at ${op[1]} — the spec allows 0.03 to 0.05`);
  // The page ground is still painted underneath, by the token.
  assert.match(CSS, /\nbody \{[^}]*background: var\(--bg\)/, 'body no longer paints --bg under the grain');
});

test('V1.30.1 A1: the glows are pointer-less gradients behind the content', () => {
  const rule = (sel) => {
    const m = LAYER_1301.match(new RegExp('\\n' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{[^}]*\\}'));
    assert.ok(m, `the V1.30.1 layer has no ${sel} rule`);
    return m[0];
  };
  // The shared part: out of flow, no pointer, behind the section's content.
  const shared = LAYER_1301.match(/\n\.hero-shot::before,\n#features::before,\n#pricing::before \{[^}]*\}/);
  assert.ok(shared, 'the three glow layers do not share one rule');
  assert.match(shared[0], /position: absolute/);
  assert.match(shared[0], /z-index: -1/);
  assert.match(shared[0], /pointer-events: none/);
  // Their sections isolate (the glow sits above their fill) and clip (it can
  // never widen the page on a phone, nor add height).
  const host = LAYER_1301.match(/\n\.hero,\n#features,\n#pricing \{[^}]*\}/);
  assert.ok(host, 'the glow sections have no shared rule');
  assert.match(host[0], /isolation: isolate/);
  assert.match(host[0], /overflow: clip/);

  /* Under the hero picture.
     UPDATED 20.11.2026 (owner, step A review): slop-scan flagged the brand-red
     glow as `radial-halo` — a chromatic glow on a dark page reads as
     generated — so it is neutral white now, like the two section glows, at
     no more than .06, and no longer red in any form. */
  const hero = rule('.hero-shot::before');
  assert.match(hero, /radial-gradient\(ellipse closest-side, #FFFFFF, transparent\)/,
    'the hero glow is not neutral white fading out');
  assert.doesNotMatch(hero, /--accent|#E63939|#D63838|#B82E2D/i, 'the hero glow is red again');
  const heroOpacity = Number(hero.match(/opacity: ([\d.]+)/)[1]);
  assert.ok(heroOpacity <= 0.06, `the hero glow is at ${heroOpacity} — the owner capped it at .06`);
  assert.ok(heroOpacity >= 0.04, `the hero glow is at ${heroOpacity} — too faint to see behind the picture`);
  // Behind «Что умеет» and «Тарифы»: neutral white, at most .05.
  // (Its own rule, after a comment — not the shared one that opens with the hero.)
  const neutral = (LAYER_1301.match(/\*\/\n#features::before,\n#pricing::before \{[^}]*\}/) || [''])[0];
  assert.match(neutral, /radial-gradient\(ellipse closest-side, #FFFFFF, transparent\)/,
    'the section glows are not neutral white');
  assert.ok(Number(neutral.match(/opacity: ([\d.]+)/)[1]) <= 0.05, 'the section glows are stronger than .05');
  // The glow under each screenshot is pointer-less too.
  assert.match(rule('.pcard::before'), /pointer-events: none/);
});

test('V1.30.1 A1: text over the glows still clears AA', () => {
  /* The glow's PEAK composited over its ground, against the page's text
     colours: the arithmetic in the comment of the glow block, kept honest. */
  const mix = (top, a, ground) => '#' + [0, 2, 4].map((i) => {
    const t = parseInt(top.slice(1 + i, 3 + i), 16);
    const g = parseInt(ground.slice(1 + i, 3 + i), 16);
    return Math.round(t * a + g * (1 - a)).toString(16).padStart(2, '0');
  }).join('');
  /* UPDATED 20.11.2026: the hero glow is white now; the opacity is read
     from the stylesheet, so a stronger glow cannot slip past this check. */
  const heroAlpha = Number(LAYER_1301.match(/\n\.hero-shot::before \{[^}]*opacity: ([\d.]+)/)[1]);
  const heroPeak = mix('#FFFFFF', heroAlpha, '#1B1B1B');   // the hero lift
  for (const ink of ['#F2F2F2', '#B3B3B3', '#FF6B6B']) {
    assert.ok(ratio(ink, heroPeak) >= 4.5, `${ink} over the hero glow is ${ratio(ink, heroPeak).toFixed(2)}:1`);
  }
  const pagePeak = mix('#FFFFFF', 0.05, '#141414');   // «Что умеет», «Тарифы»
  for (const ink of ['#F2F2F2', '#B3B3B3', '#FF6B6B']) {
    assert.ok(ratio(ink, pagePeak) >= 4.5, `${ink} over the section glow is ${ratio(ink, pagePeak).toFixed(2)}:1`);
  }
});

test('V1.30.1 A1: cards have a translucent edge and a 1px top highlight', () => {
  const edge = LAYER_1301.match(/\n\.pcard,\n\.feat \{[^}]*\}/);
  assert.ok(edge, 'the card edge rule is missing');
  assert.match(edge[0], /border: 1px solid rgba\(255, 255, 255, \.08\)/);
  assert.match(edge[0], /box-shadow: inset 0 1px 0 rgba\(255, 255, 255, \.06\)/);
  // The screenshot frame: 1px, white at .1, radius 12.
  const shot = LAYER_1301.match(/\n\.pcards \.pcard__shot \{[^}]*\}/);
  assert.ok(shot, 'the screenshot frame rule is missing');
  assert.match(shot[0], /border: 1px solid rgba\(255, 255, 255, \.1\)/);
  assert.match(shot[0], /border-radius: 12px/);
});

/* ------------------------------------------------------- V1.30.1 A3 bento */

test('V1.30.1 A3: «Что умеет» is a 12-column bento on a computer, one column on a phone', () => {
  const desk = LAYER_1301.match(/@media \(min-width: 900px\) \{([\s\S]*?)\n\}/);
  assert.ok(desk, 'the bento has no desktop block');
  assert.match(desk[1], /\.pcards \{ grid-template-columns: repeat\(12, minmax\(0, 1fr\)\); \}/,
    'the product grid is not 12 columns');
  /* The spans, card by card: [7 | 5] [5 | 7] and the last row halved — the
     spec's [4 | 4 | 4] needs a seventh card the six-card test does not allow. */
  const span = {};
  for (const m of desk[1].matchAll(/((?:\.pcard:nth-child\(\d\),?\s*)+)\{ grid-column: span (\d+); \}/g)) {
    for (const n of m[1].matchAll(/nth-child\((\d)\)/g)) span[n[1]] = Number(m[2]);
  }
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((n) => span[n]), [7, 5, 5, 7, 6, 6],
    'the bento rows are not [7 | 5] [5 | 7] [6 | 6]');
  // Each row fills the twelve columns exactly — no dead cell.
  assert.equal(span[1] + span[2], 12);
  assert.equal(span[3] + span[4], 12);
  assert.equal(span[5] + span[6], 12);
  // The base rule (outside any query) is still the phone's single column.
  assert.match(CSS, /\n\.pcards \{\n  display: grid;\n  grid-template-columns: 1fr;/,
    'the phone no longer gets one column');
  // The big first card: its screenshot runs out past the right edge.
  assert.match(LAYER_1301, /\.pcard:nth-child\(1\) \.pcard__shot \{ margin-right: calc\(-/,
    'the first card\'s screenshot does not run past the right edge');
});

/* UPDATED for SPEC V1.30.2 §4.2 — buttons leave the field radius for a
   value of their own: a pill (--r-pill, 999px), as on heroui. Fields stay 12. */
test('§2.2: one radius scale — 12 fields, pill buttons, 20 cards, 28 blocks', () => {
  assert.match(CSS, /--r-field:\s*12px/);
  assert.match(CSS, /--r-card:\s*20px/);
  assert.match(CSS, /--r-block:\s*28px/);
  assert.match(CSS, /--r-pill:\s*999px/);
  assert.match(CSS, /\n\.btn \{ border-radius: var\(--r-pill\); \}\n\.field select,\n\.check__field input \{ border-radius: var\(--r-field\); \}/);
  // Nothing after it hands a button a square corner back.
  const after = CSS.slice(CSS.indexOf('.btn { border-radius: var(--r-pill); }') + 10);
  assert.doesNotMatch(after, /\n\.btn[^{,]*\{[^}]*border-radius/, 'a later rule takes the pill off the buttons');
  assert.match(CSS, /\.card,\n\.check,\n\.feat,\n\.step-art,\n\.pcard \{ border-radius: var\(--r-card\); \}/);
});

/* ------------------------------------------------------------ §2.3 motion */

test('§2.3: the one animation is the reveal, and it is gated twice', () => {
  // In the stylesheet: only inside a no-preference block.
  const gates = [...CSS.matchAll(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/g)]
    .map((m) => m[0]);
  const revealGate = gates.find((g) => /\.reveal \{/.test(g));
  assert.ok(revealGate, 'the reveal styles are not inside a no-preference block');
  assert.match(revealGate, /\.reveal \{ opacity: 0; transform: translateY\(12px\); \}/);
  assert.match(revealGate, /400ms cubic-bezier\(\.2, \.7, \.2, 1\)/, 'the reveal is not 400ms on the spec curve');
  const outside = CSS.replace(revealGate, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(outside, /\.reveal\b/, '.reveal is styled outside the motion gate');

  // In app.js: the class is added by script only, after the same query.
  assert.match(APP, /function wireReveal\(\)/, 'app.js has no reveal');
  assert.match(APP, /matchMedia\('\(prefers-reduced-motion: no-preference\)'\)/,
    'app.js marks sections without asking whether motion is welcome');
  assert.match(APP, /typeof IntersectionObserver !== 'function'/,
    'app.js hides sections even where it cannot reveal them again');
  assert.match(APP, /io\.unobserve\(e\.target\)/, 'the reveal is not once-only');
  // …and the served markup never ships a hidden section.
  for (const { code } of LANGS) {
    assert.doesNotMatch(renderPage(readTemplate(), code), /class="[^"]*\breveal\b/,
      `the ${code} page ships a section pre-hidden for the reveal`);
  }
});

/* ------------------------------------------------------------ §4 copy */

/* What a visitor can read on the page in a language: the served text (tags,
   scripts and comments removed), plus every dictionary string that only
   app.js puts on screen — the FAQ, the pricing labels, the check and demo
   states. Not counted: the head and law-page keys, which never render on the
   home page, and the marquee strip. The strip's de/fr/it/es cards quote the
   real client's own locale pack (src/ck-locales.js) verbatim — the marquee
   test insists on it — so their wording is the banner's, not this page's. */
function visibleCopy(code) {
  const template = readTemplate();
  const html = renderPage(template, code);
  const body = html.slice(html.indexOf('<body'))
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<div class="marquee-viewport"[\s\S]*?<\/ul>\s*<ul[\s\S]*?<\/ul>/, ' ');
  const text = body.replace(/<[^>]+>/g, ' ');

  const inTemplate = new Set([...template.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)].map((m) => m[1]));
  const NOT_ON_PAGE = new Set(['pages', 'htmlLang', 'docTitle', 'docDesc', 'lawDated', 'lawIndexTitle',
    'lawIndexDesc', 'lawIndexLede', 'statsMonths', 'statsUpdated',
    // build-rendered into the marquee (excluded above) or the trust line (in `text`)
    'mockTitle', 'mockText', 'mockAccept', 'mockReject', 'mockSettings',
    'trustServicesOne', 'trustServicesFew', 'trustServicesMany']);
  const runtime = Object.entries(readDict(code))
    .filter(([k]) => !inTemplate.has(k) && !NOT_ON_PAGE.has(k))
    .map(([, v]) => (Array.isArray(v) ? v.flat().join(' ') : String(v)));
  return text + ' ' + runtime.join(' ');
}

test('§4: at most twelve dashes on each language page', () => {
  for (const { code } of LANGS) {
    const dashes = (visibleCopy(code).match(/[—–]/g) || []).length;
    assert.ok(dashes <= 12, `the ${code} page carries ${dashes} dashes — §4 sets the target at 12`);
  }
});

test('§0/§4: the copy keeps its tone rules', () => {
  for (const { code } of LANGS) {
    const copy = visibleCopy(code);
    for (const re of [/штраф/i, /аудит/i, /консультац/i, /amend/i, /audit/i, /consultanț/i,
                      /\bfines?\b/i, /consultation/i]) {
      assert.doesNotMatch(copy, re, `the ${code} page says «${copy.match(re)?.[0]}» — §0 rules it out`);
    }
    // No prices in prose: a euro amount only ever appears in the pricing table,
    // which app.js draws from numbers, not from the dictionary.
    assert.doesNotMatch(copy, /€\s?\d|\d\s?€|\d+\s?(?:EUR|евро|euro)\b/i,
      `the ${code} copy quotes a price`);
    for (const name of ['Cookiebot', 'CookieYes', 'Osano', 'Termly', 'Usercentrics',
                        'OneTrust', 'Iubenda', 'Complianz', 'KookiOk', 'consentkit.us']) {
      assert.ok(!copy.includes(name), `the ${code} page names ${name}`);
    }
  }
});

/* ------------------------------------------------------------ §5 a11y */

test('§5: the address placeholder clears 4.5:1 on its field', () => {
  const rule = CSS.match(/\.check__field input::placeholder \{[^}]*\}/);
  assert.ok(rule, 'the placeholder has no colour of its own');
  const color = rule[0].match(/color:\s*(#[0-9A-Fa-f]{6})/)[1];
  assert.match(rule[0], /opacity: 1/, 'the browser may still fade the placeholder');
  // The field is --surface on the band, the page ground on the law pages.
  for (const ground of ['#1F1F1F', '#141414']) {
    assert.ok(ratio(color, ground) >= 4.5,
      `the placeholder ${color} on ${ground} is ${ratio(color, ground).toFixed(2)}:1`);
  }
});

/* §5 «кнопки в макетах ленты: текст на заливке ≥ 4,5:1». No exceptions: the
   red cards moved from the brand #E63939 (white on it 4.19:1) to #D63838
   (4.69:1) — owner 20.11.2026: contrast. Every fill, and every outline label,
   has to clear AA. */
test('§5: the marquee replica buttons read at 4.5:1, every card, no exceptions', () => {
  for (const c of MARQUEE_CARDS) {
    assert.ok(ratio('#FFFFFF', c.accent) >= 4.5,
      `white on the ${c.accent} marquee card is ${ratio('#FFFFFF', c.accent).toFixed(2)}:1`);
  }
  // Outline labels: --shot-accent-ink on a light card, the title ink on a dark one.
  assert.match(CSS, /--shot-accent-ink: #B82E2D;/);
  assert.ok(ratio('#B82E2D', '#FFFFFF') >= 4.5, 'the light replica outline label does not clear AA');
  assert.match(CSS, /\.shot--dark \.shot-btn--settings \{ color: var\(--shot-title\); \}/,
    'the outline label on a dark replica is not the card\'s title ink');
  assert.ok(ratio('#FFF2E0', '#17140F') >= 4.5, 'the dark replica title ink does not clear AA');
});

test('§5: touch targets reach 44px on a phone', () => {
  const block = CSS.match(/── §5 touch targets[\s\S]*?@media \(max-width: 760px\) \{([\s\S]*?)\n\}/);
  assert.ok(block, 'styles.css has no phone touch-target block');
  for (const sel of ['.capsule-menu', '.capsule-cta', '.head-nav a', '.head-link', '.btn--sm',
                     '.lang-btn', '.foot-links a', '.swatch', '.check__agree label']) {
    assert.ok(block[1].includes(sel), `${sel} has no 44px floor on a phone`);
  }
  assert.match(block[1], /min-height: 44px/);
});
