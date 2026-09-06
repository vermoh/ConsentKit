/* SPEC V1.10 §1/§2 — the 0.5.7 client additions.
 *
 *   §1  ConsentKit.openSettings() and the `#ck-settings` deep link.
 *   §1  texts.detailsAction: 'declaration'.
 *   §2  placeholders in place of embeds the engine is holding back.
 *
 * Two loading styles, for two different questions:
 *
 *   load()      — ck-ui.js in a BARE context (the ui-theme.test.mjs pattern).
 *                 Everything published on `ConsentKit._contrast` is pure, so
 *                 the wording and the config reading are testable with no DOM
 *                 at all. This is where placeholderText() and resolveDetails()
 *                 are exercised.
 *
 *   loadCore()  — ck-core.js against the blocking suite's stub DOM, to assert
 *                 the half of openSettings() that lives in the core: the latch
 *                 that survives a UI which has not been parsed yet.
 *
 * The DOM-side behaviour of §2 — a card actually appearing in a page, and the
 * button actually restoring the frame — is not stubbed here. It is proved in a
 * real browser instead; that check lives outside the unit suite.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const UI_SRC = readFileSync(join(REPO, 'src', 'ck-ui.js'), 'utf8');
const LOCALES_SRC = readFileSync(join(REPO, 'src', 'ck-locales.js'), 'utf8');
const CORE_SRC = readFileSync(join(REPO, 'src', 'ck-core.js'), 'utf8');

/* One context per call, like ui-theme.test.mjs: module-scope state must not
   leak between tests. `withLocales` also evaluates ck-locales.js first, which
   is how a page that ships the 32-language pack is put together. */
function load({ withLocales = false } = {}) {
  const win = { console, ConsentKit: {} };
  win.window = win;
  win.globalThis = win;
  win.self = win;
  const ctx = vm.createContext(win);
  if (withLocales) vm.runInContext(LOCALES_SRC, ctx, { filename: 'src/ck-locales.js' });
  vm.runInContext(UI_SRC, ctx, { filename: 'src/ck-ui.js' });
  const C = ctx.window.ConsentKit._contrast;
  assert.ok(C, 'ck-ui.js did not publish ConsentKit._contrast');
  return C;
}

/* ------------------------------------------------ §1 openSettings (core side) */

/* The core half of the deep link. ck-ui.js is deliberately NOT loaded: this is
   exactly the situation the latch exists for — a footer link clicked while the
   UI file is still in flight, where the dispatched event has no listener and
   would otherwise be lost. */
function loadCore() {
  const g = Object.create(null);
  const events = [];
  const doc = {
    cookie: '',
    createElement() { return { setAttribute() {}, getAttribute() { return null; }, style: {} }; },
    querySelectorAll() { return []; },
    addEventListener() {},
    dispatchEvent(ev) { events.push(ev); return true; },
    documentElement: null,
    body: null
  };
  g.window = g;
  g.self = g;
  g.document = doc;
  g.location = { href: 'https://shop.example.com/page', hostname: 'shop.example.com' };
  g.URL = URL;
  g.localStorage = null;
  g.CustomEvent = function (name, init) {
    this.type = name;
    this.detail = (init && init.detail) || null;
  };
  g.Element = function () {};
  g.Element.prototype.setAttribute = function () {};
  g.Element.prototype.removeAttribute = function () {};
  const ctx = vm.createContext(g);
  vm.runInContext(CORE_SRC, ctx, { filename: 'src/ck-core.js' });
  assert.ok(g.ConsentKit, 'src/ck-core.js did not attach ConsentKit');
  return { CK: g.ConsentKit, events };
}

test('openSettings() is public and dispatches the same event show() does', () => {
  const { CK, events } = loadCore();
  assert.equal(typeof CK.openSettings, 'function');
  CK.openSettings();
  const opened = events.filter((e) => e.type === 'ck:ui:open-preferences');
  assert.equal(opened.length, 1, 'openSettings() must ask the UI to open the panel');
});

test('openSettings() before the UI exists latches, so the request is not lost', () => {
  const { CK } = loadCore();
  // Nothing is listening: ck-ui.js has not been parsed in this context at all.
  assert.equal(CK._pendingOpen, false, 'the latch must start clear');
  CK.openSettings();
  assert.equal(CK._pendingOpen, true,
    'a call made before the UI is listening must be remembered for mount() to honour');
});

test('the core never throws when openSettings() is called on a page with no UI', () => {
  const { CK } = loadCore();
  assert.doesNotThrow(() => { CK.openSettings(); CK.openSettings(); });
});

/* ck-ui.js clears the latch as soon as it can honour it. Asserted on the source
   rather than through a mount: mount() needs a real DOM, and what matters is
   that the two files agree on the protocol — the core sets `_pendingOpen`, the
   UI reads and clears it. A rename on either side breaks this. */
test('ck-ui.js consumes the core latch and clears it', () => {
  assert.match(UI_SRC, /_pendingOpen/, 'ck-ui.js must read the core latch');
  assert.match(UI_SRC, /ck\._pendingOpen\s*=\s*false/,
    'ck-ui.js must CLEAR the latch, or every later remount would re-open the panel');
  assert.match(UI_SRC, /consumePendingOpen\(\)/, 'mount() must consume the latch');
});

/* --------------------------------------------------------- §1 the hash link */

test('the deep link is #ck-settings, and the hash is removed via replaceState', () => {
  assert.match(UI_SRC, /SETTINGS_HASH\s*=\s*'#ck-settings'/,
    'the address the declaration page links to is #ck-settings');
  assert.match(UI_SRC, /history\.replaceState/,
    'the hash must be dropped so a reload does not re-open the panel');
  // Not replaceState(null,'') — an empty URL is a no-op in some engines, which
  // would leave the hash in place.
  assert.match(UI_SRC, /replaceState\(null, '', location\.pathname \+ location\.search\)/,
    'replaceState must be given a real URL, not an empty string');
  assert.match(UI_SRC, /addEventListener\('hashchange'/,
    'a hash arriving on an already-loaded page must open the panel too');
});

test('hash handling is guarded so a stub window cannot break the banner', () => {
  // ui-branding.test.mjs evaluates ck-ui.js against a window with no event
  // plumbing at all; an unguarded window.addEventListener threw there.
  assert.doesNotThrow(() => load(), 'ck-ui.js must evaluate against a bare window');
});

/* ------------------------------------------------- §1 detailsAction: declaration */

test("detailsAction 'declaration' with a valid URL renders an outbound link", () => {
  const C = load();
  const det = C.resolveDetails({
    texts: { detailsAction: 'declaration', declarationUrl: 'https://consent.example.net/p/7/cookies' }
  });
  assert.equal(det.kind, 'declaration');
  assert.equal(det.href, 'https://consent.example.net/p/7/cookies');
});

test("detailsAction 'declaration' with no URL behaves like 'settings'", () => {
  const C = load();
  const det = C.resolveDetails({ texts: { detailsAction: 'declaration' } });
  assert.equal(det.kind, 'settings', 'a link with nowhere to go must open the panel instead');
  assert.equal(det.href, null);
});

test('a declarationUrl that is not http(s) is refused, not rendered', () => {
  const C = load();
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', '/p/7/cookies', '', null]) {
    const det = C.resolveDetails({ texts: { detailsAction: 'declaration', declarationUrl: bad } });
    assert.equal(det.kind, 'settings', `${bad} must not become a link the visitor can click`);
    assert.equal(det.href, null);
  }
});

test('declarationUrl does not change the default action', () => {
  const C = load();
  // A site that has a declaration address but never asked for it keeps the
  // policyUrl-driven default: 'policy' with a policy, 'settings' without one.
  const withPolicy = C.resolveDetails({
    texts: { policyUrl: 'https://shop.example.com/privacy', declarationUrl: 'https://c.example.net/p/7/cookies' }
  });
  assert.equal(withPolicy.kind, 'policy');
  assert.equal(withPolicy.href, 'https://shop.example.com/privacy');

  const noPolicy = C.resolveDetails({ texts: { declarationUrl: 'https://c.example.net/p/7/cookies' } });
  assert.equal(noPolicy.kind, 'settings',
    'a declaration address alone must not silently retarget «Подробнее»');
});

test("the banner renders 'declaration' as a link, not as the settings button", () => {
  // resolveDetails() choosing the right kind is worth nothing if buildBanner
  // does not have a branch for it: the else-branch renders a BUTTON, so a
  // missing branch would silently swallow the link.
  assert.match(UI_SRC, /det\.kind === 'policy' \|\| det\.kind === 'declaration'/,
    "buildBanner must render 'declaration' through the same link branch as 'policy'");
});

test("'declaration' is part of the mount signature, so a change remounts", () => {
  const C = load();
  // signature() embeds resolveDetails().kind; link and button are different DOM
  // shapes and mount() is one-shot.
  const a = C.resolveDetails({ texts: { detailsAction: 'declaration', declarationUrl: 'https://c.example.net/x' } }).kind;
  const b = C.resolveDetails({ texts: { detailsAction: 'settings' } }).kind;
  assert.notEqual(a, b);
});

/* ----------------------------------------------------- §2 placeholder wording */

test('placeholderText names the host and the category, in Russian', () => {
  const C = load();
  assert.equal(
    C.placeholderText('youtube.com', 'marketing', 'ru'),
    'Здесь содержимое от youtube.com. Оно загрузится после согласия на «Маркетинг».'
  );
});

test('placeholderText uses the same category name the panel switch shows', () => {
  const C = load();
  // «Аналитика» in the placeholder must be «Аналитика» on the switch: both
  // come from cat.<name>.title of the same dictionary.
  assert.match(C.placeholderText('stat.example.com', 'analytics', 'ru'), /«Аналитика»/);
  assert.match(C.placeholderText('stat.example.com', 'functional', 'ru'), /«Функциональные»/);
  assert.match(C.placeholderText('stat.example.com', 'marketing', 'en'), /«Marketing»/);
});

test('ru, ro and en each have their own sentence', () => {
  const C = load({ withLocales: true });
  const ru = C.placeholderText('youtube.com', 'marketing', 'ru');
  const ro = C.placeholderText('youtube.com', 'marketing', 'ro');
  const en = C.placeholderText('youtube.com', 'marketing', 'en');
  assert.match(ru, /^Здесь содержимое от youtube\.com/);
  assert.match(ro, /^Aici este conținut de la youtube\.com/);
  assert.match(en, /^Content from youtube\.com/);
  assert.equal(new Set([ru, ro, en]).size, 3, 'the three languages must differ');
});

test('every other language falls back to en (§2), never to «undefined»', () => {
  const C = load({ withLocales: true });
  // de/fr/pl are present in the locale pack but carry no placeholder strings.
  for (const lang of ['de', 'fr', 'pl', 'bg', 'zz', '', null, undefined]) {
    const s = C.placeholderText('youtube.com', 'marketing', lang);
    assert.doesNotMatch(s, /undefined/, `${lang} produced an undefined fragment`);
    assert.doesNotMatch(s, /\{host\}|\{cat\}/, `${lang} left a placeholder token unreplaced`);
    assert.match(s, /youtube\.com/);
  }
});

test('an unknown category falls back to marketing, the strict-mode category', () => {
  const C = load();
  const s = C.placeholderText('example.com', 'nonsense', 'ru');
  assert.match(s, /«Маркетинг»/);
  assert.doesNotMatch(s, /undefined/);
});

test('a missing host still yields a readable sentence', () => {
  const C = load();
  for (const host of ['', null, undefined, '   ']) {
    const s = C.placeholderText(host, 'marketing', 'ru');
    assert.doesNotMatch(s, /undefined/);
    assert.doesNotMatch(s, /\{host\}/);
  }
});

/* ------------------------------------------------ §2 placeholders: on and off */

test('placeholders default to on, and only an explicit false opts out', () => {
  const C = load();
  assert.equal(C.placeholdersEnabled({}), true, 'default is on (§2)');
  assert.equal(C.placeholdersEnabled({ blocking: {} }), true);
  assert.equal(C.placeholdersEnabled(undefined), true);
  assert.equal(C.placeholdersEnabled({ blocking: { placeholders: false } }), false);
});

test('a truthy-but-not-true value does not accidentally disable placeholders', () => {
  const C = load();
  // Only `false` is the opt-out, matching the detailsAction precedent: the
  // server validates a boolean, and anything else is treated as "unset".
  for (const v of [true, undefined, null, 0, '', 'false']) {
    assert.equal(C.placeholdersEnabled({ blocking: { placeholders: v } }), v !== false,
      `blocking.placeholders=${JSON.stringify(v)} was read wrongly`);
  }
});

test('placeholders:false takes existing cards down rather than freezing them', () => {
  assert.match(UI_SRC, /if \(!placeholdersEnabled\(c\)\) \{ clearPlaceholders\(\); return; \}/,
    'turning the option off mid-session must remove the cards already drawn');
});

/* ------------------------------------------ §2 the DOM contract with the core */

test('the sweep selects exactly the frames the core holds back', () => {
  // The core leaves a blocked frame as data-ck + data-src and NO src
  // (markBlockedIframe). Using that same selector is what makes a frame the
  // SITE allowed impossible to match — it keeps its src and is never marked.
  assert.match(UI_SRC, /querySelectorAll\('iframe\[data-ck\]\[data-src\]'\)/,
    "the sweep must use the core's own revival selector");
  assert.match(CORE_SRC, /qsa\('iframe\[data-ck\]\[data-src\]'\)/,
    'the core still revives frames through that selector');
});

test('ck-ui never writes a blocked frame src itself — the core revives it', () => {
  // Element.prototype.setAttribute is patched; only applyConsentToDom() may
  // write a blocked frame's src, under bypass and through the native setter.
  const sweep = UI_SRC.slice(UI_SRC.indexOf('function sweepPlaceholders'));
  const region = sweep.slice(0, sweep.indexOf('\n  /* ---'));
  assert.doesNotMatch(region, /setAttribute\('src'/,
    'restoring the frame is the core\'s job, not the UI\'s');
});

test('the grant merges into the existing decision instead of replacing it', () => {
  /* The trap: ConsentKit.accept({marketing:true}) SETS the whole opt-in set, so
     a naive one-category grant would switch OFF an analytics consent the
     visitor had already given. grantCategory() must read the current state
     first. */
  const grant = UI_SRC.slice(UI_SRC.indexOf('function grantCategory'));
  const body = grant.slice(0, grant.indexOf('\n  function hideFrame'));
  assert.match(body, /safeState\(\)\.categories/,
    'grantCategory must read the categories already granted');
  assert.match(body, /functional: cur\.functional === true/,
    'the other categories must be carried over, not dropped');
  assert.match(body, /analytics: cur\.analytics === true/);
});

test('the grant goes through accept(), which files the decision as «custom»', () => {
  // §2 asks for a journal entry with method 'custom'. accept(object) produces
  // exactly that in the core, and ck-saas.js logs off the resulting event — so
  // there must be no bespoke logging in the UI.
  const grant = UI_SRC.slice(UI_SRC.indexOf('function grantCategory'));
  const body = grant.slice(0, grant.indexOf('\n  function hideFrame'));
  assert.match(body, /ck\.accept\(next\)/, 'the grant must use the normal consent path');
  assert.match(CORE_SRC, /method = 'custom'/, "accept(object) must still file as 'custom'");
});

test('frames that are hidden, 1x1 or outside <body> are skipped (§2)', () => {
  const fn = UI_SRC.slice(UI_SRC.indexOf('function frameEligible'));
  const body = fn.slice(0, fn.indexOf('\n  /* Size the card'));
  assert.match(body, /document\.body\.contains\(frame\)/, 'frames outside <body> are skipped');
  assert.match(body, /cs\.display === 'none'/, 'display:none frames are skipped');
  assert.match(body, /r\.width <= 1 && r\.height <= 1/, '1x1 tracking pixels are skipped');
  // The self-collision: once this file hides a frame it reads as display:none,
  // so its own frames must be exempted before the display test runs.
  assert.match(body, /if \(frame\.getAttribute\(PH_ATTR\)\) return true;/,
    'a frame this file hid must not be skipped by its own display test');
});

test('the placeholder is a sibling, so parent-based site CSS still applies', () => {
  assert.match(UI_SRC, /parentNode\.insertBefore\(node, frame\)/,
    'wrapping the frame would break selectors like .video-wrap > iframe');
});

test('a restored frame gets its original inline display back', () => {
  const fn = UI_SRC.slice(UI_SRC.indexOf('function restoreFrame'));
  const body = fn.slice(0, fn.indexOf('\n  function dropPlaceholder'));
  assert.match(body, /getAttribute\(PH_DISPLAY\)/,
    'the display value the site had set must be put back, not blanked');
});

/* ------------------------------------------------------- §2 dictionary shape */

test('the placeholder keys are listed in STR_KEYS', () => {
  /* A key present in DICT but missing from STR_KEYS renders the literal string
     "undefined" for all 32 external locales — the trap the file documents. */
  const keys = UI_SRC.slice(UI_SRC.indexOf('var STR_KEYS'), UI_SRC.indexOf('function localeTable'));
  for (const k of ['phText', 'phAllow', 'phSettings', 'phLabel']) {
    assert.match(keys, new RegExp(`'${k}'`), `${k} is missing from STR_KEYS`);
  }
});

test('ru and ro carry the placeholder strings, and none is left in English', () => {
  const C = load({ withLocales: true });
  // The two buttons, in the two languages the SPEC names alongside en.
  assert.match(C.placeholderText('x.example', 'marketing', 'ru'), /Оно загрузится/);
  assert.match(C.placeholderText('x.example', 'marketing', 'ro'), /Se va încărca/);
  assert.match(LOCALES_SRC, /phAllow: 'Permite și arată'/, 'ro needs its own button label');
});
