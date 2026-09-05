/* SPEC V1.6 §1/§2/§4 — the 0.5.0 theme engine.
 *
 * Everything asserted here is a PURE function published on
 * `ConsentKit._contrast`. That is not an accident of testing convenience: the
 * cabinet's theme editor (SPEC §3) and the debug panel are both required to
 * quote the same numbers the banner paints — «один код — одни числа» — so the
 * arithmetic has to live somewhere neither of them owns, and be reachable
 * without a DOM.
 *
 * ck-ui.js publishes it BEFORE its own `typeof document === 'undefined'`
 * guard, which is why loading the file in a bare Node context (the
 * version.test.mjs pattern) is enough to get at all of it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const UI_SRC = readFileSync(join(REPO, 'src', 'ck-ui.js'), 'utf8');

/* One context per call: warnVariantMismatch() latches at module scope, and a
   shared context would let one test's warning suppress another's. */
function load(extraGlobals) {
  const win = { console, ConsentKit: {}, ...(extraGlobals || {}) };
  win.window = win;
  win.globalThis = win;
  win.self = win;
  const ctx = vm.createContext(win);
  vm.runInContext(UI_SRC, ctx, { filename: 'src/ck-ui.js' });
  assert.ok(ctx.window.ConsentKit._contrast,
    'ck-ui.js did not publish ConsentKit._contrast — is it still before the SSR guard?');
  return ctx.window.ConsentKit._contrast;
}

const C = load();

/* ------------------------------------------------------------ luminance */

test('relativeLuminance matches the WCAG reference values', () => {
  // The two anchors the whole scale is defined against.
  assert.equal(C.relativeLuminance('#000000'), 0);
  assert.equal(C.relativeLuminance('#ffffff'), 1);
  // sRGB green carries 0.7152 of the weight, by definition.
  assert.ok(Math.abs(C.relativeLuminance('#00ff00') - 0.7152) < 1e-9);
});

test('shorthand hex is expanded, and unreadable colours return null', () => {
  assert.equal(C.relativeLuminance('#fff'), C.relativeLuminance('#ffffff'));
  // An alpha channel is dropped rather than rejected: the RGB is still readable.
  assert.equal(C.relativeLuminance('#ffffff80'), 1);
  // Everything the CSS grammar allows but arithmetic cannot read.
  for (const bad of ['white', 'rgb(255,255,255)', 'transparent', '', null, undefined, '#12']) {
    assert.equal(C.relativeLuminance(bad), null, `${bad} should not be measurable`);
  }
});

/* ------------------------------------------------------------- ratios */

test('contrastRatio is symmetric and spans 1..21', () => {
  assert.ok(Math.abs(C.contrastRatio('#000000', '#ffffff') - 21) < 1e-9);
  assert.equal(C.contrastRatio('#ffffff', '#000000'), C.contrastRatio('#000000', '#ffffff'));
  assert.equal(C.contrastRatio('#777777', '#777777'), 1);
  assert.equal(C.contrastRatio('white', '#000'), null, 'an unreadable side must yield null');
});

/* ---------------------------------------------- ensureContrast, the table */

test('SPEC §4: white on yellow is replaced by dark text', () => {
  // The named acceptance case. #ffffff on #ffff00 is ~1.07:1 — unreadable.
  const before = C.contrastRatio('#ffffff', '#ffff00');
  assert.ok(before < 1.1, `white on yellow should be ~1.07:1, got ${before}`);

  const r = C.ensureContrast('#ffffff', '#ffff00', 4.5);
  assert.equal(r.adjusted, true, 'white on yellow must be flagged as adjusted');
  assert.equal(r.color, '#161616', 'the darker of the two candidates must win');
  assert.ok(r.ratio >= 4.5);
});

test('a colour that already passes is returned untouched, adjusted:false', () => {
  const r = C.ensureContrast('#ffffff', '#2B50D8', 4.5);
  assert.equal(r.color, '#ffffff');
  assert.equal(r.adjusted, false, 'a passing colour must not be rewritten');
  assert.ok(r.ratio >= 4.5);
});

test('on a dark background the white candidate wins instead', () => {
  const r = C.ensureContrast('#333333', '#1c1c1e', 4.5);
  assert.equal(r.adjusted, true);
  assert.equal(r.color, '#ffffff');
});

test('an unmeasurable colour is left exactly as the author wrote it', () => {
  // Silently "fixing" a colour we cannot read would be worse than not fixing
  // it: the author would see a colour they never chose and no way to explain it.
  const r = C.ensureContrast('rgb(255,255,255)', '#ffff00', 4.5);
  assert.equal(r.color, 'rgb(255,255,255)');
  assert.equal(r.adjusted, false);
});

/* --------------------------------------------------------- border stepping */

test('SPEC §4: a blue outline on a dark card is lightened until it clears 3:1', () => {
  const before = C.contrastRatio('#2B50D8', '#1c1c1e');
  assert.ok(before < 3, `#2B50D8 on the dark card should start below 3:1, got ${before}`);

  const r = C.stepToContrast('#2B50D8', '#1c1c1e', 3);
  assert.equal(r.adjusted, true);
  assert.ok(r.ratio >= 3, `stepping stopped at ${r.ratio}`);
  // Lightened, not swapped for white: a brand colour that is only slightly too
  // dark must stay recognisably the brand colour.
  assert.ok(C.relativeLuminance(r.color) > C.relativeLuminance('#2B50D8'),
    'the border should have been lightened against a dark card');
  assert.notEqual(r.color, '#ffffff', 'stepping must not jump straight to white');
});

test('on a light card the same colour is darkened instead', () => {
  const r = C.stepToContrast('#ffe000', '#ffffff', 3);
  assert.equal(r.adjusted, true);
  assert.ok(r.ratio >= 3);
  assert.ok(C.relativeLuminance(r.color) < C.relativeLuminance('#ffe000'));
});

test('a border that already clears 3:1 is not touched', () => {
  const r = C.stepToContrast('#2B50D8', '#ffffff', 3);
  assert.equal(r.color, '#2B50D8');
  assert.equal(r.adjusted, false);
});

/* --------------------------------------------------- resolveButtonStyles */

test('the defaults are accept/reject filled with the accent, settings outline', () => {
  const r = C.resolveButtonStyles({}, 'light');
  assert.equal(r.buttons.accept.variant, 'filled');
  assert.equal(r.buttons.reject.variant, 'filled');
  assert.equal(r.buttons.settings.variant, 'outline');
  assert.equal(r.buttons.accept.bg, '#2B50D8');
  assert.equal(r.buttons.settings.border, '#2B50D8');
  assert.equal(r.buttons.settings.bg, 'transparent');
  assert.equal(r.cardBg, '#ffffff', 'SPEC §1 fixes the light card at #ffffff');
});

test('the dark card is #1c1c1e per SPEC §1', () => {
  const r = C.resolveButtonStyles({}, 'dark');
  assert.equal(r.cardBg, '#1c1c1e');
});

test('EQUAL BUTTONS: accept and reject always share the same variant', () => {
  // The invariant exists for consent validity, not aesthetics: a reject button
  // that looks weaker than accept is a dark pattern, so the config cannot
  // express one. accept wins when they disagree.
  const r = C.resolveButtonStyles(
    { buttons: { accept: { variant: 'filled' }, reject: { variant: 'outline' } } }, 'light');
  assert.equal(r.buttons.accept.variant, 'filled');
  assert.equal(r.buttons.reject.variant, 'filled', 'reject must have followed accept');

  const r2 = C.resolveButtonStyles(
    { buttons: { accept: { variant: 'outline' }, reject: { variant: 'filled' } } }, 'light');
  assert.equal(r2.buttons.accept.variant, 'outline');
  assert.equal(r2.buttons.reject.variant, 'outline');
});

test('EQUAL BUTTONS: reject keeps accept\'s variant even when only reject sets one', () => {
  const r = C.resolveButtonStyles({ buttons: { reject: { variant: 'outline' } } }, 'light');
  assert.equal(r.buttons.reject.variant, 'filled',
    'an unset accept defaults to filled, and reject must follow it');
});

test('settings is independent of the pair and may be filled', () => {
  const r = C.resolveButtonStyles({ buttons: { settings: { variant: 'filled' } } }, 'light');
  assert.equal(r.buttons.settings.variant, 'filled');
  assert.equal(r.buttons.accept.variant, 'filled');
});

test('a variant mismatch warns only in debug mode, and only once', () => {
  const calls = [];
  const fakeConsole = { warn: (...a) => calls.push(a.join(' ')) };

  // No debug panel loaded: a visitor's production page must stay silent.
  const quiet = load({ console: fakeConsole });
  quiet.resolveButtonStyles(
    { buttons: { accept: { variant: 'filled' }, reject: { variant: 'outline' } } }, 'light');
  assert.equal(calls.length, 0, 'warned on a page with no debug panel');

  // Debug panel active: the config error is worth surfacing to whoever looks.
  const loud = load({ console: fakeConsole, __ckDebug: { active: true } });
  const cfg = { buttons: { accept: { variant: 'filled' }, reject: { variant: 'outline' } } };
  loud.resolveButtonStyles(cfg, 'light');
  loud.resolveButtonStyles(cfg, 'dark');
  loud.resolveButtonStyles(cfg, 'light');
  assert.equal(calls.length, 1, 'the warning must latch, not repeat per mode or per remount');
  assert.match(calls[0], /variant/);
});

test('a filled button with an unreadable text colour is corrected against its own bg', () => {
  const r = C.resolveButtonStyles(
    { buttons: { accept: { variant: 'filled', bg: '#ffff00', fg: '#ffffff' } } }, 'light');
  const a = r.buttons.accept;
  assert.equal(a.bg, '#ffff00');
  assert.equal(a.fg, '#161616', 'white on yellow must have become dark text');
  assert.equal(a.adjusted, true);
  assert.equal(a.against, '#ffff00', 'a filled button is measured against its own fill');
});

test('an outline button is measured against the CARD, not against itself', () => {
  const r = C.resolveButtonStyles(
    { buttons: { settings: { variant: 'outline', border: '#2B50D8' } } },
    'dark', { bg: '#1c1c1e', accent: '#7B96F0', onAccent: '#12182A' });
  const s = r.buttons.settings;
  assert.equal(s.against, '#1c1c1e');
  assert.equal(s.borderAdjusted, true, 'the border had to be lightened');
  assert.ok(s.borderRatio >= 3);
  assert.ok(s.ratio >= 4.5, 'the outline text must still clear 4.5 against the card');
});

test('outline text defaults to the resolved border colour', () => {
  const r = C.resolveButtonStyles(
    { buttons: { settings: { variant: 'outline', border: '#0a5c2e' } } }, 'light');
  const s = r.buttons.settings;
  assert.equal(s.border, '#0a5c2e', 'a border that already passes both floors is untouched');
  assert.equal(s.fg, '#0a5c2e', 'the text colour follows the border');
  assert.equal(s.adjusted, false);
});

test('borderWidth accepts only 1 and 2, defaulting to 1', () => {
  const w = (v) => C.resolveButtonStyles({ buttons: { accept: { borderWidth: v } } }, 'light')
    .buttons.accept.borderWidth;
  assert.equal(w(undefined), 1);
  assert.equal(w(1), 1);
  assert.equal(w(2), 2);
  assert.equal(w(9), 1, 'an out-of-range width must fall back, not be interpolated');
  assert.equal(w('3px;}body{display:none'), 1, 'a width is never interpolated raw');
});

test('a hostile colour cannot escape into the stylesheet', () => {
  // The whole reason theme values are sanitised: an injected rule could hide
  // the reject button, which is a consent-validity problem, not a cosmetic one.
  const r = C.resolveButtonStyles(
    { buttons: { accept: { bg: '#fff;}.ck-btn--reject{display:none' } } }, 'light');
  assert.equal(r.buttons.accept.bg, '#2B50D8', 'the injected value must fall back to the accent');
  const css = C.buildThemeCss(
    { theme: { buttons: { accept: { bg: 'red;}.ck-btn--reject{display:none' } } } }).css;
  assert.ok(!css.includes('display:none'), 'an injected rule reached the generated stylesheet');
});

/* ------------------------------------------------- --ck-link (accent as text) */

/* The accent has two jobs and they have different floors. As a BUTTON FILL it
   only has to carry legible text ON it; as LINK TEXT it has to be legible ON
   the card. A yellow brand accent satisfies the first and fails the second
   completely — before this token, «Подробнее», the cookie-table summary and
   the floating button's icon were painted with the raw accent and could come
   out invisible while every button on the same card passed AA. */

test('the link token is the accent when the accent is already legible on the card', () => {
  const light = C.resolveButtonStyles({}, 'light');
  assert.equal(light.link.color, '#2B50D8', 'the default light accent needs no correction');
  assert.equal(light.link.adjusted, false);
  assert.equal(light.link.against, '#ffffff', 'a link is measured against the CARD');
  assert.ok(light.link.ratio >= 4.5);

  const dark = C.resolveButtonStyles({}, 'dark');
  assert.equal(dark.link.color, '#7B96F0');
  assert.equal(dark.link.adjusted, false);
  assert.equal(dark.link.against, '#1c1c1e');
  assert.ok(dark.link.ratio >= 4.5);
});

test('SPEC §4: a yellow accent gives a usable button and an unreadable link', () => {
  // The whole reason the token exists. #ffff00 on #ffffff is ~1.07:1.
  const built = C.buildThemeCss({ theme: { accent: '#ffff00' } });
  const link = built.light.link;

  assert.ok(C.contrastRatio('#ffff00', '#ffffff') < 1.1,
    'yellow on the light card should start unreadable');
  assert.equal(link.adjusted, true, 'a yellow link must be flagged as adjusted');
  // ensureContrast SWAPS to white/#161616; it does not step the way a border does.
  assert.equal(link.color, '#161616', 'the darker candidate must win against a white card');
  assert.ok(link.ratio >= 4.5, `the corrected link is only ${link.ratio}:1`);

  // The accent itself is untouched — it still paints the button fill and the
  // switch. Only the TEXT reading of it moved.
  assert.equal(built.light.buttons.accept.bg, '#ffff00',
    'correcting the link must not repaint the button');
  assert.equal(built.light.accent, '#ffff00');
});

test('a blue accent is passed through unchanged', () => {
  // The named contrast case: what already clears AA must not be rewritten,
  // or every ordinary brand would ship a link colour nobody chose.
  const built = C.buildThemeCss({ theme: { accent: '#2B50D8' } });
  assert.equal(built.light.link.color, '#2B50D8');
  assert.equal(built.light.link.adjusted, false);
  assert.match(built.css, /--ck-link:#2B50D8/);
});

test('dark mode resolves its own link token against the dark card', () => {
  // #2B50D8 is ~2.4:1 on #1c1c1e — fine on white, hopeless on the dark card,
  // and the direction of the correction flips with the background.
  const built = C.buildThemeCss({ theme: { dark: { accent: '#2B50D8' } } });
  const link = built.dark.link;
  assert.equal(link.against, '#1c1c1e');
  assert.equal(link.adjusted, true);
  assert.equal(link.color, '#ffffff', 'on a dark card the white candidate must win');
  assert.ok(link.ratio >= 4.5);

  // And the light half of the same build is untouched by it.
  assert.equal(built.light.link.color, '#2B50D8');
  assert.equal(built.light.link.adjusted, false);
});

test('a light-only accent does not leak into the dark link token', () => {
  // Same rule the buttons already follow: a light accent is not a dark accent.
  const built = C.buildThemeCss({ theme: { accent: '#ffff00' } });
  assert.equal(built.dark.link.color, '#7B96F0', 'the dark link kept the dark palette accent');
  assert.equal(built.light.link.color, '#161616');
});

test('--ck-link is emitted for both palettes', () => {
  const css = C.buildThemeCss({}).css;
  // Three blocks: :host, the prefers-color-scheme override, :host(.ck-mode-dark).
  const decls = css.match(/--ck-link:[^;}]+/g) || [];
  assert.equal(decls.length, 3, `expected a link token in all three blocks, got ${decls.length}`);
  assert.ok(decls.includes('--ck-link:#2B50D8'), 'the light block has no link token');
  assert.ok(decls.filter((d) => d === '--ck-link:#7B96F0').length === 2,
    'both dark blocks must carry the dark link token');
});

test('every accent-as-TEXT rule consumes --ck-link, not the raw accent', () => {
  // A token that is emitted but never read is the silent failure here: the
  // tests would pass and the banner would still paint the raw accent.
  assert.match(UI_SRC, /'a\{color:var\(--ck-link\)\}'/,
    'the «Подробнее» link still reads --ck-accent');
  // These rules are split across adjacent JS string literals, so the match has
  // to be able to cross the `',\n    '` join — hence [\s\S] rather than [^'].
  assert.match(UI_SRC, /\.ck-linkbtn\{[\s\S]{0,200}?color:var\(--ck-link\)/,
    '.ck-linkbtn still reads --ck-accent');
  assert.match(UI_SRC, /\.ck-det>summary\{[\s\S]{0,200}?color:var\(--ck-link\)/,
    'the cookie-table summary still reads --ck-accent');
  assert.match(UI_SRC, /\.ck-fab\{[\s\S]{0,400}?color:var\(--ck-link\)/,
    'the floating button icon still reads --ck-accent');
  // The panel footer's own Accept/Reject. This is the one rule where both
  // tokens appear, so pin the split: the LABEL moved to --ck-link, the BORDER
  // stayed on the raw accent because a border is non-text and answers to 3:1.
  assert.match(UI_SRC,
    /\.ck-btn--outline\{background:transparent;border-color:var\(--ck-accent\);color:var\(--ck-link\)\}/,
    'the panel footer outline buttons must take link text and an accent border');
});

test('non-text accent usages keep the raw accent', () => {
  // The switch fill and the focus ring are NOT text: WCAG puts them at 3:1,
  // and swapping them to the link colour would repaint UI nobody asked to
  // change. --ck-accent must stay the raw brand colour for them.
  assert.match(UI_SRC, /\.ck-switch\[aria-checked="true"\]\{background:var\(--ck-accent\)/,
    'the switch fill should still be the raw accent');
  assert.match(UI_SRC, /:focus-visible\{outline:2px solid var\(--ck-accent\)/,
    'the focus ring should still be the raw accent');
});

/* ------------------------------------------------------------- geometry */

test('radius defaults to the reference 16/8 and clamps to 0..32', () => {
  assert.deepEqual(radius({}), { card: 16, button: 8 });
  assert.deepEqual(radius({ radius: { card: 4, button: 0 } }), { card: 4, button: 0 });
  assert.deepEqual(radius({ radius: { card: 999, button: -20 } }), { card: 32, button: 0 });
});

test('the pre-0.5.0 scalar radius still sets the card radius', () => {
  // Backwards compatibility: every block built before 0.5.0 carries radius:'10px'.
  assert.deepEqual(radius({ radius: '10px' }), { card: 10, button: 8 });
  assert.deepEqual(radius({ radius: 12 }), { card: 12, button: 8 });
  assert.deepEqual(radius({ radius: 'nonsense' }), { card: 16, button: 8 });
});

/* ----------------------------------------------------------------- font */

test('font defaults to inherit and reaches the generated stylesheet', () => {
  assert.equal(C.resolveFont({}), 'inherit');
  assert.equal(C.resolveFont({ font: 'inherit' }), 'inherit');

  const css = C.buildThemeCss({}).css;
  assert.match(css, /--ck-font:inherit/, 'the inherit family never reached the sheet');
  // The static sheet must consume the token rather than hard-coding a stack.
  assert.match(UI_SRC, /font-family:var\(--ck-font\)/);
  // font-FAMILY, never the `font` shorthand: the shorthand would drag in the
  // page's size, weight and line-height and break the fixed geometry.
  assert.ok(!/':host\{',\s*'font:inherit/.test(UI_SRC));
});

test('font: system restores the pre-0.5.0 stack', () => {
  const font = C.resolveFont({ font: 'system' });
  assert.match(font, /system-ui/);
  assert.match(C.buildThemeCss({ theme: { font: 'system' } }).css, /--ck-font:system-ui/);
});

/* ------------------------------------------------------- page font pick */

/* CSS `inherit` takes the family of the host <div>, i.e. of <body>. A site that
   sets its typeface on inner blocks and not on body/html leaves body computing
   to the BROWSER DEFAULT, so the banner rendered in Times on a page that is
   entirely sans-serif (seen live on flufi.pet, 0.5.1). The UI therefore samples
   real page text; pickPageFont is the choice, split out of the DOM reading so
   the rule can be asserted without a browser. */

test('pickPageFont takes the first family that is not the browser default', () => {
  const picked = C.pickPageFont([
    { family: 'Times' },                       // body, still the UA default
    { family: '"Google Sans", sans-serif' },   // the first real page font
    { family: 'Georgia' }
  ], 'Times');
  assert.equal(picked, '"Google Sans", sans-serif',
    'the first differing sample should win, verbatim');
});

test('pickPageFont returns null when the page states no family of its own', () => {
  // Every candidate is the UA default: there is nothing to inherit FROM, so the
  // caller must keep plain `inherit` rather than pin the banner to Times.
  assert.equal(C.pickPageFont([{ family: 'Times' }, { family: 'Times' }], 'Times'), null);
  assert.equal(C.pickPageFont([], 'Times'), null);
  assert.equal(C.pickPageFont(null, 'Times'), null);
});

test('pickPageFont ignores empty and unreadable samples', () => {
  assert.equal(C.pickPageFont([
    { family: '' }, { family: '   ' }, { family: null }, {}, null,
    { family: 'Inter' }
  ], 'Times'), 'Inter', 'an empty sample must be skipped, not treated as a family');
});

test('pickPageFont compares families as CSS, not as strings', () => {
  // Quoting and case are grammar, not identity: a body computing to
  // '"Google Sans"' is the same face as a probe reporting 'google sans', and
  // neither is a reason to pin the banner.
  assert.equal(C.pickPageFont([{ family: '"Google Sans"' }], 'google sans'), null);
  assert.equal(C.pickPageFont([{ family: 'TIMES' }], 'Times'), null);
  // Spacing after a comma is normalised the same way.
  assert.equal(C.pickPageFont([{ family: 'Inter,sans-serif' }], 'Inter, sans-serif'), null);
  // But a genuinely different family still wins, and is returned unnormalised.
  assert.equal(C.pickPageFont([{ family: '"Google Sans"' }], 'Times'), '"Google Sans"');
});

test('pickPageFont refuses a family that could break out of the declaration', () => {
  // The value is injected into a generated stylesheet. getComputedStyle
  // normalises, so this is belt-and-braces — but a family carrying ; { } or a
  // comment opener is never worth emitting.
  for (const bad of ['Inter;color:red', 'Inter{}', 'Inter/*x*/']) {
    assert.equal(C.pickPageFont([{ family: bad }, { family: 'Georgia' }], 'Times'), 'Georgia',
      `${bad} should have been skipped`);
  }
});

/* ----------------------------------------------------- generated stylesheet */

test('every button token is emitted for both palettes', () => {
  const css = C.buildThemeCss({}).css;
  for (const role of ['accept', 'reject', 'settings']) {
    for (const part of ['bg', 'fg', 'bd', 'bw']) {
      assert.ok(css.includes(`--ck-${role}-${part}:`), `--ck-${role}-${part} is missing`);
    }
  }
  assert.match(css, /--ck-radius-card:16px/);
  assert.match(css, /--ck-radius-btn:8px/);
  // The old name stays an alias so integrator CSS reading it still works.
  assert.match(css, /--ck-radius:16px/);
});

test('the button role classes read tokens, so a variant change needs no remount', () => {
  // If the variant were a class swap instead, theme.buttons would have to enter
  // signature() — and mount() is one-shot, so a post-ck:init theme change would
  // silently never apply.
  for (const role of ['accept', 'reject', 'settings']) {
    assert.ok(UI_SRC.includes(`.ck-btn--${role}{background:var(--ck-${role}-bg)`),
      `.ck-btn--${role} does not read its own tokens`);
  }
});

test('theme.dark.accent drives the dark buttons, and light accent does not leak into dark', () => {
  const built = C.buildThemeCss({ theme: { accent: '#0a5c2e', dark: { accent: '#61d69a' } } });
  assert.equal(built.light.buttons.accept.bg, '#0a5c2e');
  assert.equal(built.dark.buttons.accept.bg, '#61d69a');

  // A light-only accent must NOT carry into dark: #2B50D8 on #1c1c1e is ~2.4:1.
  const onlyLight = C.buildThemeCss({ theme: { accent: '#2B50D8' } });
  assert.notEqual(onlyLight.dark.buttons.accept.bg, '#2B50D8');
});

test('theme.dark.onAccent stays meaningful as the given filled text colour', () => {
  // It is the documented public key; it must be an INPUT to the 4.5 rule, not
  // dead config that the contrast pass silently ignores.
  const built = C.buildThemeCss({ theme: { dark: { accent: '#f0f0f0', onAccent: '#101010' } } });
  assert.equal(built.dark.buttons.accept.fg, '#101010',
    'a passing onAccent must survive the contrast pass unchanged');
});

/* ------------------------------------------------ detailsAction (SPEC §2) */

/* resolveDetails/resolveRadius come back from the vm realm, whose
   Object.prototype is not this realm's — deepEqual would fail on the prototype
   alone. Compare the fields that carry the meaning. */
function details(cfg) {
  const d = C.resolveDetails(cfg);
  return { kind: d.kind, href: d.href };
}
function radius(cfg) {
  const r = C.resolveRadius(cfg);
  return { card: r.card, button: r.button };
}

test('with no policy URL, «Подробнее» opens the settings panel', () => {
  assert.deepEqual(details({}), { kind: 'settings', href: null });
  assert.deepEqual(details({ texts: {} }), { kind: 'settings', href: null });
});

test('a policy URL flips the default to the link', () => {
  assert.deepEqual(
    details({ texts: { policyUrl: 'https://example.com/privacy' } }),
    { kind: 'policy', href: 'https://example.com/privacy' });
});

test('an explicit detailsAction always wins over the default', () => {
  assert.equal(C.resolveDetails(
    { texts: { policyUrl: 'https://e.com/p', detailsAction: 'settings' } }).kind, 'settings');
  assert.equal(C.resolveDetails(
    { texts: { policyUrl: 'https://e.com/p', detailsAction: 'hide' } }).kind, 'hide');
  assert.equal(C.resolveDetails({ texts: { detailsAction: 'hide' } }).kind, 'hide');
});

test('detailsAction: policy without a usable URL degrades to settings', () => {
  // A dead link is worse than a working button.
  assert.deepEqual(details({ texts: { detailsAction: 'policy' } }),
    { kind: 'settings', href: null });
});

test('only http(s) policy URLs are accepted', () => {
  // The visitor is invited to click this, so a javascript: or data: href is an
  // XSS vector, not a configuration quirk.
  for (const bad of ['javascript:alert(1)', 'data:text/html,<script>x</script>',
                     'JavaScript:alert(1)', '/privacy', 'example.com/privacy']) {
    const r = C.resolveDetails({ texts: { policyUrl: bad, detailsAction: 'policy' } });
    assert.equal(r.kind, 'settings', `${bad} was accepted as a policy URL`);
    assert.equal(r.href, null);
  }
  assert.equal(C.resolveDetails({ texts: { policyUrl: 'HTTPS://E.COM/p' } }).kind, 'policy');
});

test('the rendered link carries target=_blank and rel=noopener', () => {
  assert.match(UI_SRC, /link\.target = '_blank'/);
  assert.match(UI_SRC, /link\.rel = 'noopener'/);
});

test('the settings form of «Подробнее» is a button, not a href-less link', () => {
  // Before 0.5.0 it was <a href="#"> with no handler at all — a control that
  // scrolled to the top of the page and did nothing else.
  assert.ok(!UI_SRC.includes("link.href = '#'"),
    'the dead href="#" link is still being rendered');
  assert.match(UI_SRC, /ck-linkbtn/);
});

test('detailsAction is structural and therefore part of the mount signature', () => {
  // link / button / nothing are three different DOM shapes and mount() is
  // one-shot, so a change here must force a remount. Colours must NOT be here.
  const sig = UI_SRC.slice(UI_SRC.indexOf('function signature(cfg)'));
  const body = sig.slice(0, sig.indexOf('\n  }'));
  assert.match(body, /resolveDetails\(c\)\.kind/,
    'signature() ignores detailsAction — a later change would never render');
  assert.ok(!/buttons/.test(body),
    'signature() reacts to theme.buttons; those are token values and must restyle in place');
});

test('buildThemeCss takes a full config, not a bare theme object', () => {
  // It is handed ConsentKit.config, so the theme lives one level down. Getting
  // this wrong is silent: every value falls back to a default that looks right.
  assert.match(C.buildThemeCss({ theme: { font: 'system' } }).css, /--ck-font:system-ui/);
  assert.match(C.buildThemeCss({ font: 'system' }).css, /--ck-font:inherit/);
});

/* ---------------------------------------------------- built-in palette floor */

/* SPEC V1.6 §1 moved the dark card from the old blue-tinted #1A202D to a
   neutral #1c1c1e, which forced ink/muted/line/soft to be re-picked by hand so
   they would not read as a colour cast. Hand-picked constants are exactly the
   kind of thing that drifts on the next edit, and nothing else in the suite
   measures them — so measure them here. */
test('both built-in palettes clear AA for body and muted text', () => {
  const cases = [
    ['light', '#ffffff', { ink: '#1B2437', muted: '#5b6478', accent: '#2B50D8' }],
    ['dark', '#1c1c1e', { ink: '#E9E9EB', muted: '#A0A0A8', accent: '#7B96F0' }]
  ];
  for (const [mode, card, tokens] of cases) {
    // The resolver is the authority on the card colour; assert the constant
    // this test hard-codes still is that colour before measuring against it.
    assert.equal(C.resolveButtonStyles({}, mode).cardBg, card,
      `the ${mode} card colour moved — update these expectations deliberately`);
    for (const [name, value] of Object.entries(tokens)) {
      const r = C.contrastRatio(value, card);
      assert.ok(r >= 4.5,
        `${mode} --ck-${name} (${value}) is only ${r && r.toFixed(2)}:1 on ${card}`);
    }
  }
});

test('the default accent needs no correction on either card', () => {
  // If it did, every out-of-the-box banner would ship silently "adjusted"
  // colours and the debug panel would flag a config nobody wrote.
  for (const mode of ['light', 'dark']) {
    const r = C.resolveButtonStyles({}, mode);
    for (const role of ['accept', 'reject', 'settings']) {
      assert.equal(r.buttons[role].adjusted, false,
        `the default ${mode} ${role} button had to be corrected`);
    }
  }
});
