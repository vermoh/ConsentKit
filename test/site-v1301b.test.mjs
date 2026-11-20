/* SPEC V1.30.1 step B — the live first screen (B1), icons and numbers (B2).
 *
 * test/site-v130.test.mjs owns V1.30 and step A; test/site-product.test.mjs
 * keeps the hero's outer contract (one button, labelled figure, no picture
 * left behind). This file owns what step B added:
 *
 *   · the composition is markup, rendered in the page's language, its box
 *     reserved, its replica inert and hidden from assistive tech;
 *   · it can never act as a consent banner: no client, no cookie, no beacon,
 *     no control — statically here, live in the Playwright check of the PR;
 *   · it moves only under prefers-reduced-motion: no-preference, only by
 *     transform / opacity / colour, and pauses when it cannot be seen;
 *   · site/hero.js stays under 4 KB gzip and is versioned like app.js;
 *   · the Lucide icons are inline, licensed, 24px / 1.5 / --ink-soft, no red;
 *   · the step numbers are still text for a screen reader.
 *
 * Fix a failure with: node tools/build-site.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import {
  LANGS, SITE_DIR, HERO_DAILY, HERO_TOTAL, ICON_DIR, VERSIONED_ASSETS,
  readDict, readTemplate, renderPage, outputs
} from '../tools/build-site.mjs';

const CSS = readFileSync(join(SITE_DIR, 'styles.css'), 'utf8');
const HERO_JS = readFileSync(join(SITE_DIR, 'hero.js'), 'utf8');
const LAYER_B = CSS.slice(CSS.indexOf('SPEC V1.30.1 — шаг B'));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const heroOf = (html) => html.match(/<section class="hero">[\s\S]*?\n  <\/section>/)[0];
const stageOf = (html) => heroOf(html).match(/<div class="hl" data-hero-live[\s\S]*?\n      <\/figure>/)[0];

/* ------------------------------------------------------------- B1 markup */

test('B1: the first screen is the composition in markup, in the page\'s own language', () => {
  const template = readTemplate();
  for (const { code } of LANGS) {
    const html = renderPage(template, code);
    const dict = readDict(code);
    const stage = stageOf(html);

    // The three parts: the shop in its window, the banner replica, the card.
    for (const part of ['hl-win', 'hl-shop', 'hl-banner', 'hl-card', 'hl-cursor']) {
      assert.match(stage, new RegExp(`class="${part}[ "]`), `the ${code} stage has no .${part}`);
    }
    // The banner speaks the page's language, with the replica copy the
    // marquee cards use; the card with the dashboard's own wording.
    for (const key of ['mockTitle', 'mockText', 'mockAccept', 'mockReject', 'mockSettings',
                       'heroCardTitle', 'heroCardAccept', 'heroCardReject', 'heroCardCustom',
                       'heroCardTotal', 'heroCardFunctional', 'heroCardAnalytics', 'heroCardMarketing']) {
      assert.ok(stage.includes('>' + esc(dict[key]) + '<'), `the ${code} stage does not say ${key}`);
    }
    assert.match(stage, new RegExp(`<div class="hl-banner" lang="${dict.htmlLang}">`),
      `the ${code} banner replica is not marked as the page language`);
    // The shop is a fictional Romanian store on every page, and says so.
    assert.match(stage, /<div class="hl-shop" lang="ro">/);
  }
});

test('B1: the card\'s numbers agree with each other', () => {
  // The chart is thirty days, and they add up to the total the card prints.
  assert.equal(HERO_DAILY.length, 30);
  assert.equal(HERO_TOTAL, HERO_DAILY.reduce((n, [all]) => n + all, 0));
  for (const [all, accept] of HERO_DAILY) assert.ok(accept <= all, 'a day accepts more than it answered');
  const share = HERO_DAILY.reduce((n, [, a]) => n + a, 0) / HERO_TOTAL;
  assert.ok(Math.abs(share - 0.59) < 0.01, `the chart's accept share is ${(share * 100).toFixed(1)} %, the tile says 59 %`);

  const html = renderPage(readTemplate(), 'ru');
  const stage = stageOf(html);
  assert.match(stage, new RegExp(`<span class="hl-total-n" data-hl-count>${HERO_TOTAL}</span>`));
  assert.equal((stage.match(/class="hl-day"/g) || []).length, 30);
  // Today is the last day, the one hero.js grows, and it carries its count.
  const today = HERO_DAILY[HERO_DAILY.length - 1][0];
  assert.match(stage, new RegExp(`<g class="hl-today" data-hl-today="${today}">`));
});

test('B1: the replica cannot be used, focused, read out or mistaken for a banner', () => {
  const template = readTemplate();
  for (const { code } of LANGS) {
    const html = renderPage(template, code);
    const stage = stageOf(html);
    // aria-hidden and inert on the whole stage: no screen reader meets a fake
    // banner and no Tab lands on it. The figure speaks once, by its label.
    assert.match(stage, /^<div class="hl" data-hero-live aria-hidden="true" inert>/);
    // Nothing in it is a control, a link, a form or a script — the «buttons»
    // are spans. No id either: nothing on the page can address the replica.
    assert.doesNotMatch(stage, /<(button|a|input|select|textarea|form|script|iframe)\b/,
      `the ${code} replica contains a real control`);
    assert.doesNotMatch(stage, /\b(tabindex|href|onclick|id)=/, `the ${code} replica is addressable`);
    // And not the client's own markup: the page's real banner (#ck-root) is
    // the only element the vendor client styles or listens to.
    assert.doesNotMatch(stage, /\bck-|data-ck/, `the ${code} replica borrows the client's hooks`);
    // Exactly one primary button in the hero, still the free check.
    assert.equal((heroOf(html).match(/btn--primary/g) || []).length, 1);
  }
});

test('B1: the stage reserves its box and scales without script', () => {
  const rule = (sel) => {
    const m = LAYER_B.match(new RegExp('\\n' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{[^}]*\\}'));
    assert.ok(m, `the step B layer has no ${sel} rule`);
    return m[0];
  };
  assert.match(rule('.hero-shot'), /container-type: inline-size/);
  const hl = rule('.hl');
  assert.match(hl, /aspect-ratio: 1152 \/ 700/, 'the stage does not reserve the 1152×700 box');
  assert.match(hl, /width: 100%/);
  assert.match(LAYER_B, /@supports \(width: 1cqw\) \{\n  \.hl \{ --u: calc\(100cqw \/ 1152\); \}/,
    'the design pixel is not 1/1152 of the container');
  // Every part is placed inside the reserved box, never in flow below it.
  for (const sel of ['.hl-win', '.hl-card', '.hl-banner', '.hl-cursor']) {
    assert.match(rule(sel), /position: absolute/, `${sel} is in flow and could push the page`);
  }
});

/* ------------------------------------------------------------- B1 motion */

test('B1: the cycle runs only under no-preference, and only moves what cannot shift the layout', () => {
  const gates = [...LAYER_B.matchAll(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/g)]
    .map((m) => m[0]);
  const gate = gates.find((g) => g.includes('.hl--live'));
  assert.ok(gate, 'the hero timeline is not inside a no-preference block');
  for (const part of ['.hl-banner', '.hl-cursor', '.hl-b-btn--accept', '.hl-total-n']) {
    assert.match(gate, new RegExp(`\\.hl--live ${part.replace('.', '\\.')} \\{ animation: hl-`),
      `${part} is not animated inside the gate`);
  }
  // Paused as one: hidden tab or off screen freezes every part together.
  // (!important: every part's own `animation` shorthand resets the play
  // state at a higher specificity — a plain rule here lost, measured live.)
  assert.match(gate, /\.hl--paused,\n  \.hl--paused \* \{ animation-play-state: paused !important; \}/);

  // Nowhere else does a .hl rule animate or transition.
  const outside = CSS.replace(gate, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of outside.matchAll(/\n([^\n{}]*\.hl[^{]*)\{([^}]*)\}/g)) {
    assert.doesNotMatch(m[2], /\b(animation|transition)\s*:/, `${m[1].trim()} moves outside the motion gate`);
  }

  // The keyframes touch transform, opacity and colour only — nothing that
  // changes a box, so the cycle adds no layout shift.
  const frames = [...CSS.matchAll(/@keyframes (hl-[a-z]+) \{([\s\S]*?)\n\}/g)];
  assert.equal(frames.length, 5, `expected five hl- timelines, found ${frames.length}`);
  for (const [, name, body] of frames) {
    for (const prop of body.matchAll(/([a-z-]+)\s*:/g)) {
      assert.ok(['opacity', 'transform', 'color', 'background-color', 'fill'].includes(prop[1]),
        `@keyframes ${name} animates ${prop[1]}`);
    }
  }
});

test('B1: hero.js stays out of the way — reduced motion, hidden tab, off screen', () => {
  const code = HERO_JS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  // Asked first, before anything is touched: reduce means the served frame.
  const ask = code.indexOf("matchMedia('(prefers-reduced-motion: no-preference)').matches) return");
  assert.ok(ask > -1, 'hero.js does not bail out under reduced motion');
  assert.ok(ask < code.indexOf("classList.add('hl--live')"), 'hero.js goes live before asking about motion');
  assert.match(code, /addEventListener\('visibilitychange'/, 'hero.js does not pause in a hidden tab');
  assert.match(code, /new IntersectionObserver\(/, 'hero.js does not pause off screen');
  assert.match(code, /document\.hidden \|\| !onScreen/);
  // The count follows the CSS clock, so it pauses with it.
  assert.match(code, /addEventListener\('animationiteration', tick\)/);
});

test('B1: the composition can write no cookie and send no beacon', () => {
  const code = HERO_JS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const re of [/ConsentKit/, /document\.cookie/, /ck_consent/, /localStorage/, /sessionStorage/,
                    /\bfetch\(/, /XMLHttpRequest/, /sendBeacon/, /\bImage\(/, /__ck/, /createElement\('script'\)/]) {
    assert.doesNotMatch(code, re, `hero.js reaches for ${re}`);
  }
  // And the stage itself loads nothing: no src, no url() in it.
  const stage = stageOf(renderPage(readTemplate(), 'ro'));
  assert.doesNotMatch(stage, /\bsrc=|url\(/, 'the stage asks for a resource');
});

test('B1: hero.js is ≤ 4 KB gzip, versioned, and on the home pages only', () => {
  const gz = gzipSync(readFileSync(join(SITE_DIR, 'hero.js'))).length;
  assert.ok(gz <= 4096, `hero.js is ${gz} bytes gzip — the spec allows 4 KB`);
  assert.ok(VERSIONED_ASSETS.includes('/hero.js'), 'hero.js gets no ?v=');
  for (const f of outputs()) {
    assert.match(readFileSync(f.path, 'utf8'), /<script src="\/hero\.js\?v=[0-9a-f]{8}"><\/script>/,
      `${f.label} does not load a versioned hero.js`);
  }
  const vercel = JSON.parse(readFileSync(join(SITE_DIR, 'vercel.json'), 'utf8'));
  assert.ok(vercel.headers.some((h) => h.source.includes('hero.js')),
    'vercel.json does not give hero.js the short cache app.js has');
});

/* ------------------------------------------------------------- B2 icons */

const ICONS = {
  how: ['code-xml', 'circle-check', 'scan-search', 'sliders-horizontal'],
  more: ['circle-pause', 'megaphone', 'languages', 'users'],
  fit: ['layout-template', 'plug', 'shopping-bag', 'building-2'],
  /* UPDATED for SPEC V1.30.2 §4.4 — the labels over the section headings:
     #demo, #features, #how, #pricing, #faq. */
  kicker: ['app-window', 'layout-grid', 'route', 'tag', 'message-circle-question']
};

test('B2: the Lucide icons are files beside their ISC licence, and every one is used', () => {
  const lic = join(ICON_DIR, 'LICENSE.txt');
  assert.ok(existsSync(lic), 'site/icons/LICENSE.txt is missing — Lucide ships under ISC');
  const text = readFileSync(lic, 'utf8');
  assert.match(text, /^ISC License/);
  assert.match(text, /Lucide Contributors/);
  const files = readdirSync(ICON_DIR).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)).sort();
  assert.deepEqual(files, Object.values(ICONS).flat().sort(), 'site/icons/ holds icons the page does not use, or misses one');
  const template = readTemplate();
  for (const name of files) {
    assert.ok(template.includes(`{{ICON:${name}}}`), `${name}.svg is not placed in the template`);
    assert.match(readFileSync(join(ICON_DIR, name + '.svg'), 'utf8'), /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"[^>]*viewBox="0 0 24 24"/);
  }
});

test('B2: icons are inline, 24px, stroke 1.5, hidden from assistive tech, never a request', () => {
  const template = readTemplate();
  for (const { code } of LANGS) {
    const html = renderPage(template, code);
    const icons = html.match(/<svg class="icon"[\s\S]*?<\/svg>/g) || [];
    assert.equal(icons.length, 17, `the ${code} page has ${icons.length} icons, not 17 (12 + five section labels)`);
    for (const svg of icons) {
      assert.match(svg, /^<svg class="icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1\.5"/);
      assert.match(svg, /aria-hidden="true" focusable="false"/);
      // Shapes only: no <use>, no link, no image, no colour of its own.
      assert.doesNotMatch(svg, /<use\b|href=|<image\b|url\(|fill="#|stroke="#/);
    }
    // Where they sit: four steps, four «И ещё» facts, four platforms.
    const how = html.match(/<ol class="steps[\s\S]*?<\/ol>/)[0];
    const more = html.match(/<div class="feat-more">[\s\S]*?\n      <\/div>/)[0];
    const fit = html.match(/<ul class="fit__list">[\s\S]*?<\/ul>/)[0];
    assert.equal((how.match(/<svg class="icon"/g) || []).length, 4);
    assert.equal((more.match(/<svg class="icon"/g) || []).length, 4);
    assert.equal((fit.match(/<svg class="icon"/g) || []).length, 4);
    assert.doesNotMatch(html, /\{\{ICON:/, `the ${code} page has an unresolved icon`);
  }
});

test('B2: the icons are --ink-soft and never red', () => {
  const icon = LAYER_B.match(/\n\.icon \{[^}]*\}/);
  assert.ok(icon, 'the step B layer has no .icon rule');
  assert.match(icon[0], /color: var\(--ink-soft\)/);
  assert.match(icon[0], /width: 24px/);
  for (const m of LAYER_B.matchAll(/\n([^\n{}]*\.icon[^{]*)\{([^}]*)\}/g)) {
    assert.doesNotMatch(m[2], /--accent|--band\b|#E63939|#D63838|#B82E2D/i, `${m[1].trim()} paints an icon red`);
  }
  // The old red disc is gone from the steps.
  assert.match(LAYER_B, /\n\.step-n \{[^}]*background: none/);
});

test('B2: the step numbers are still text a screen reader reads, hidden from the eye', () => {
  const template = readTemplate();
  for (const { code } of LANGS) {
    const how = renderPage(template, code).match(/<ol class="steps[\s\S]*?<\/ol>/)[0];
    const nums = [...how.matchAll(/<span class="step-n"([^>]*)>(\d)<\/span>/g)];
    assert.deepEqual(nums.map((m) => m[2]), ['1', '2', '3', '4']);
    for (const m of nums) assert.doesNotMatch(m[1], /aria-hidden/, `the ${code} step ${m[2]} is hidden from a screen reader`);
  }
  const rule = LAYER_B.match(/\n\.step-n \{[^}]*\}/)[0];
  assert.match(rule, /position: absolute/);
  assert.match(rule, /clip-path: inset\(50%\)/);
  assert.doesNotMatch(rule, /display: none|visibility: hidden/, 'the number is removed, not just hidden from view');
});

test('B2: the big numbers are weight 600 in tabular figures', () => {
  assert.match(LAYER_B, /\n\.fact-pill__num \{ font-weight: 600; font-variant-numeric: tabular-nums; \}/);
  assert.match(LAYER_B, /\n\.trust-num \{ font-weight: 600; font-variant-numeric: tabular-nums; \}/);
  // app.js gives the live counts the same span the build gives the services.
  const app = readFileSync(join(SITE_DIR, 'app.js'), 'utf8');
  assert.match(app, /className = 'trust-num'/, 'the live trust counts are not set apart like the build\'s');
});
