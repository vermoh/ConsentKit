/* SPEC V1.18.1 §1 — назначение и срок cookie на языке посетителя (0.5.16).
 *
 * The problem this fixes: before 0.5.16 a `cookieTable` row carried ONE
 * `purpose` string and ONE `expiry` string, and the server's scanner wrote
 * both in Russian. A Romanian visitor to a Moldovan shop therefore read
 * Russian sentences in the «Pentru ce» and «Expiră» columns of an otherwise
 * Romanian panel.
 *
 * Two answers, and this file proves both:
 *
 *   §1.1  `purpose` may be `{ ru, ro, en, <lang> }`. Resolved by the banner's
 *         language, then that language's two-letter base, then `en`, and then
 *         — the one step that differs from `texts.links[].label` — by the
 *         FIRST non-empty value in the object. A link with no label for this
 *         language is skipped, because a link with no words is not a link; a
 *         cookie row cannot be skipped, because the visitor is being told what
 *         the site stores on their machine, and hiding the row over a missing
 *         translation would hide the cookie.
 *
 *   §1.2  `expiryDays` is a NUMBER, so the cell is written here rather than
 *         quoted. The plural forms come from the dictionary, so every one of
 *         the 34 languages needs both new keys — which is what the
 *         completeness test at the foot of this file is for.
 *
 * Everything asserted here is PURE: ck-ui.js publishes cookiePurpose() and
 * cookieExpiry() on ConsentKit._contrast precisely so that the wording is
 * testable (and quotable by the cabinet's cookie-table editor) with no DOM.
 * The one thing that needs the DOM — the <td> the renderer actually appends —
 * is proved on the SOURCE instead, the way ui-texts.test.mjs proves the debug
 * panel's resolver coupling: what matters is that the renderer CALLS these
 * two functions rather than reimplementing either chain and drifting from it.
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

/* One context per call, the ui-texts.test.mjs pattern: ck-ui.js in a BARE
   context (no `document` at all), so nothing here can accidentally depend on
   module state a render would have left behind. */
function load({ withLocales = true } = {}) {
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

/** The strings ck-ui would build for one banner language. */
function stringsFor(C, lang) {
  return C.buildStrings(C.resolveLang(lang, C.localeTable()), C.localeTable());
}

/* ------------------------------------------------------ §1.1 purpose object */

test('an object purpose resolves to the banner’s own language', () => {
  const C = load();
  const p = { ru: 'Статистика посещений', ro: 'Statistici de vizitare', en: 'Visit statistics' };
  assert.equal(C.cookiePurpose(p, 'ru'), 'Статистика посещений');
  assert.equal(C.cookiePurpose(p, 'ro'), 'Statistici de vizitare');
  assert.equal(C.cookiePurpose(p, 'en'), 'Visit statistics');
});

test('a regional code falls back to its two-letter base, like resolveLang does', () => {
  /* «один код — одни правила»: a `pt-BR` banner reads `texts['pt']` in
     buildStrings and must read `purpose.pt` here for the same reason. */
  const C = load();
  assert.equal(C.cookiePurpose({ pt: 'Estatísticas', en: 'Stats' }, 'pt-br'), 'Estatísticas');
  // The exact code still WINS over the base when the object carries both.
  assert.equal(
    C.cookiePurpose({ 'pt-br': 'Brasil', pt: 'Portugal', en: 'Stats' }, 'pt-br'),
    'Brasil'
  );
});

test('case is not identity: an upper-case banner code still finds its key', () => {
  const C = load();
  assert.equal(C.cookiePurpose({ ro: 'Statistici' }, 'RO'), 'Statistici');
});

test('a language the object does not carry falls back to en', () => {
  const C = load();
  const p = { ru: 'Статистика', en: 'Visit statistics' };
  assert.equal(C.cookiePurpose(p, 'de'), 'Visit statistics');
  assert.equal(C.cookiePurpose(p, 'ro'), 'Visit statistics');
});

test('with no en either, the FIRST non-empty language wins — the row is never hidden', () => {
  /* THE step that separates a cookie row from a banner link. linkLabel() stops
     at `en` and returns null, and resolveLinks() then drops the link — right
     there, because a link with no words on it is not a link. A declared cookie
     is a different promise: the visitor is being told what is stored on their
     machine, so the operator's own words are shown in whatever language they
     exist rather than leaving the cell blank. */
  const C = load();
  assert.equal(C.cookiePurpose({ de: 'Besuchsstatistik' }, 'ro'), 'Besuchsstatistik');
  // Empty strings are skipped on the way to it: `ru: ''` is not an answer.
  assert.equal(C.cookiePurpose({ ru: '', ro: '   ', de: 'Statistik' }, 'fr'), 'Statistik');
});

test('a string purpose is untouched — a config written before 0.5.16 renders as it did', () => {
  const C = load();
  assert.equal(C.cookiePurpose('Visit statistics', 'ro'), 'Visit statistics');
  assert.equal(C.cookiePurpose('Статистика посещений', 'en'), 'Статистика посещений');
  // Trimmed, like every other author-supplied string that goes through str().
  assert.equal(C.cookiePurpose('  Visit statistics  ', 'en'), 'Visit statistics');
});

test('a value that is not a string or a language map yields an empty cell', () => {
  const C = load();
  for (const bad of [undefined, null, 42, true, ['a'], '', '   ', {}, { ru: '' }, { ru: 5 }]) {
    assert.equal(C.cookiePurpose(bad, 'ru'), '',
      `${JSON.stringify(bad)} should resolve to nothing, not to a rendered value`);
  }
});

test('only OWN properties are read', () => {
  /* `purpose` is author-supplied JSON that may have been merged over a
     prototype; an inherited key would hand str() a function rather than a
     missing line. Same guard branding's pickPoweredByText carries. */
  const C = load();

  // An inherited `en` is not the en step, and an inherited anything is not the
  // first-non-empty step either: an object whose OWN keys are all empty has
  // nothing to say, however much its prototype carries.
  const inherited = Object.create({ en: 'inherited', de: 'geerbt' });
  assert.equal(C.cookiePurpose(inherited, 'de'), '', 'an inherited value must not be read');
  inherited.ru = 'Своё';
  assert.equal(C.cookiePurpose(inherited, 'ru'), 'Своё', 'an own key still resolves');
  assert.equal(C.cookiePurpose(inherited, 'de'), 'Своё',
    'first-non-empty must pick the OWN ru, not the inherited de or en');

  // And the usual suspects on Object.prototype are not answers either.
  assert.equal(C.cookiePurpose({}, 'constructor'), '');
  assert.equal(C.cookiePurpose({}, 'toString'), '');
});

/* ------------------------------------------------------- §1.2 expiry / days */

test('expiryDays 0 and null both read as the session word', () => {
  const C = load();
  const ru = stringsFor(C, 'ru');
  const ro = stringsFor(C, 'ro');
  const en = stringsFor(C, 'en');
  for (const days of [0, null]) {
    assert.equal(C.cookieExpiry({ expiryDays: days }, ru, 'ru'), 'сессия');
    assert.equal(C.cookieExpiry({ expiryDays: days }, ro, 'ro'), 'sesiune');
    assert.equal(C.cookieExpiry({ expiryDays: days }, en, 'en'), 'session');
  }
});

test('the session word beats a stale `expiry` string on the same row', () => {
  /* The migration case: §2.2 has the server keep writing `expiry` as a ru
     string for older inline copies of the client, so from 0.5.16 on a row
     carries BOTH and the localised one must be the one that shows. */
  const C = load();
  const ro = stringsFor(C, 'ro');
  assert.equal(C.cookieExpiry({ expiryDays: 0, expiry: 'сессия' }, ro, 'ro'), 'sesiune');
});

test('a positive expiryDays takes the language’s own plural form', () => {
  const C = load();
  const ru = stringsFor(C, 'ru');
  const ro = stringsFor(C, 'ro');
  const en = stringsFor(C, 'en');
  const at = (T, lang, n) => C.cookieExpiry({ expiryDays: n }, T, lang);

  /* ru — ONE form on purpose. «дн.» is an abbreviation, it does not decline,
     and it is the wording the cabinet already shows the owner. plural() clamps
     its index to the array length, so 1/2/5/21 all read the same, and this
     test says so out loud rather than leaving it to look like a plural bug. */
  assert.equal(at(ru, 'ru', 1), '1 дн.');
  assert.equal(at(ru, 'ru', 2), '2 дн.');
  assert.equal(at(ru, 'ru', 5), '5 дн.');
  assert.equal(at(ru, 'ru', 21), '21 дн.');

  // ro — all three buckets: 1 -> zi, 2..19 -> zile, 20+ -> «de zile».
  assert.equal(at(ro, 'ro', 1), '1 zi');
  assert.equal(at(ro, 'ro', 2), '2 zile');
  assert.equal(at(ro, 'ro', 5), '5 zile');
  assert.equal(at(ro, 'ro', 21), '21 de zile');

  // en — the ordinary two-form rule.
  assert.equal(at(en, 'en', 1), '1 day');
  assert.equal(at(en, 'en', 2), '2 days');
  assert.equal(at(en, 'en', 5), '5 days');
  assert.equal(at(en, 'en', 21), '21 days');
});

test('a positive expiryDays wins over a legacy `expiry` string', () => {
  const C = load();
  const ro = stringsFor(C, 'ro');
  assert.equal(C.cookieExpiry({ expiryDays: 730, expiry: '2 года' }, ro, 'ro'), '730 de zile');
});

test('with no expiryDays at all, the `expiry` string renders exactly as before', () => {
  const C = load();
  const ru = stringsFor(C, 'ru');
  assert.equal(C.cookieExpiry({ expiry: '2 года' }, ru, 'ru'), '2 года');
  assert.equal(C.cookieExpiry({ expiry: '  2 года  ' }, ru, 'ru'), '2 года');
  // Nothing to say at all -> nothing; the renderer supplies the em dash.
  assert.equal(C.cookieExpiry({}, ru, 'ru'), '');
  assert.equal(C.cookieExpiry({ name: '_ga' }, ru, 'ru'), '');
});

test('a malformed expiryDays is treated as absent, not rendered', () => {
  /* The server validates «целое ≥ 0 или null» (§2.1), so these can only reach
     the client from a hand-written config — and falling through to `expiry`
     shows the operator's own words instead of «-3 дн.» or «NaN дн.». */
  const C = load();
  const ru = stringsFor(C, 'ru');
  for (const bad of [-1, -30, 1.5, NaN, Infinity, '30', true, [], {}]) {
    assert.equal(C.cookieExpiry({ expiryDays: bad, expiry: '2 года' }, ru, 'ru'), '2 года',
      `expiryDays=${JSON.stringify(bad)} must fall through to the expiry string`);
    assert.equal(C.cookieExpiry({ expiryDays: bad }, ru, 'ru'), '',
      `expiryDays=${JSON.stringify(bad)} with no expiry must render nothing`);
  }
});

test('a row that is not an object yields nothing rather than throwing', () => {
  const C = load();
  const ru = stringsFor(C, 'ru');
  for (const bad of [null, undefined, 'x', 7]) assert.equal(C.cookieExpiry(bad, ru, 'ru'), '');
});

test('an unknown banner language still gets a lifetime, through the en dictionary', () => {
  /* buildStrings fills a missing key from DICT.en, and pluralIndex falls to the
     two-form default for a language with no rule of its own. The point is that
     nothing renders «undefined». */
  const C = load();
  const T = stringsFor(C, 'ja');            // not in the pack -> resolves to en
  assert.equal(C.cookieExpiry({ expiryDays: 30 }, T, 'ja'), '30 days');
  assert.equal(C.cookieExpiry({ expiryDays: 0 }, T, 'ja'), 'session');
});

/* --------------------------------------------- the dictionary keys themselves */

test('the 0.5.16 keys are listed in STR_KEYS and PLURAL_KEYS', () => {
  /* A DICT key missing from these lists is `undefined` for all 32 external
     locales and renders the literal word "undefined" — the failure mode the
     comment above STR_KEYS exists to prevent. And the split matters: a plural
     ARRAY listed in STR_KEYS would be skipped by that loop's `typeof ===
     'string'` test and leave every locale on the English forms. */
  const strKeys = /var STR_KEYS = \[([\s\S]*?)\];/.exec(UI_SRC);
  assert.ok(strKeys, 'STR_KEYS is no longer a literal array');
  assert.match(strKeys[1], /'expirySession'/, 'expirySession must be in STR_KEYS');
  assert.doesNotMatch(strKeys[1], /'expiryDays'/, 'expiryDays is an array; it belongs in PLURAL_KEYS');

  const pluralKeys = /var PLURAL_KEYS = \[([\s\S]*?)\];/.exec(UI_SRC);
  assert.ok(pluralKeys, 'PLURAL_KEYS is no longer a literal array');
  assert.match(pluralKeys[1], /'expiryDays'/, 'expiryDays must be in PLURAL_KEYS');
});

test('every locale carries expirySession and expiryDays, in a usable shape', () => {
  /* The completeness rule, mirroring the extraTitle test in ui-texts.test.mjs.
     A key missing from a locale falls back to en, which would put the English
     word «session» in a Greek panel — silently. The plural table gets the
     stricter check: pluralForms() rejects an array wholesale if any slot is not
     a non-empty string, and a rejected table sends that locale back to English
     plurals, so a typo here is invisible without this assertion. */
  const C = load();
  const table = C.localeTable();
  const codes = Object.keys(table);
  assert.ok(codes.length >= 34, `expected the full locale pack, got ${codes.length}`);

  for (const code of codes) {
    const L = table[code];

    assert.equal(typeof L.expirySession, 'string', `${code}.expirySession is missing`);
    assert.ok(L.expirySession.trim().length > 0, `${code}.expirySession is empty`);

    assert.ok(Array.isArray(L.expiryDays), `${code}.expiryDays must be an array of plural forms`);
    assert.ok(L.expiryDays.length >= 1 && L.expiryDays.length <= 3,
      `${code}.expiryDays has ${L.expiryDays.length} forms; pluralForms() reads at most 3`);
    for (const form of L.expiryDays) {
      assert.equal(typeof form, 'string', `${code}.expiryDays has a non-string form`);
      assert.ok(form.length > 0, `${code}.expiryDays has an empty form`);
      assert.ok(form.includes('{n}'), `${code}.expiryDays form «${form}» has no {n} placeholder`);
    }
  }
});

test('every locale renders a real lifetime, never the raw template or «undefined»', () => {
  /* The end-to-end version of the check above: buildStrings + plural, per
     language, at the four counts that separate the three plural families. */
  const C = load();
  const table = C.localeTable();
  for (const code of Object.keys(table)) {
    const T = C.buildStrings(code, table);
    assert.equal(C.cookieExpiry({ expiryDays: null }, T, code), table[code].expirySession,
      `${code} did not use its own session word`);
    for (const n of [1, 2, 5, 21]) {
      const out = C.cookieExpiry({ expiryDays: n }, T, code);
      assert.ok(out.includes(String(n)), `${code} at ${n} lost the number: «${out}»`);
      assert.doesNotMatch(out, /\{n\}/, `${code} at ${n} left the placeholder in: «${out}»`);
      assert.doesNotMatch(out, /undefined/, `${code} at ${n} rendered undefined`);
    }
  }
});

test('the ro locale spells all three of its plural buckets', () => {
  /* Romanian is the language V1.18.1 was written for, and the «de» above 19 is
     the form a two-form table would silently lose. Pinned by spelling, not just
     by shape, because this one is the point of the exercise. */
  const C = load();
  const ro = C.localeTable().ro;
  /* Sliced into an array of THIS realm: ck-locales.js is evaluated inside a vm
     context, so its arrays carry that context's Array.prototype and deepEqual
     compares prototypes, not just contents. */
  assert.deepEqual(Array.prototype.slice.call(ro.expiryDays),
    ['{n} zi', '{n} zile', '{n} de zile']);
  assert.equal(ro.expirySession, 'sesiune');
});

/* -------------------------------------------------- the renderer, on the source */

test('the cookie table RESOLVES both cells rather than printing the raw fields', () => {
  /* «один код — одни правила». cookieTable() needs a DOM, so the coupling is
     asserted on the source the way ui-texts.test.mjs asserts the debug panel's:
     what must not happen is a second copy of either chain drifting from the one
     the cabinet quotes. Both the group's «Какие cookie» table and a service's
     «Cookies it sets» table are this one function, so this covers both. */
  const from = UI_SRC.indexOf('function cookieTable(rows, summaryText)');
  assert.ok(from > -1, 'cookieTable() has been renamed');
  const body = UI_SRC.slice(from, UI_SRC.indexOf('function makeGroupToggle'));

  assert.match(body, /cookiePurpose\(row\.purpose, LANG\)/,
    'the purpose cell must go through cookiePurpose() with the resolved banner language');
  assert.match(body, /cookieExpiry\(row, T, LANG\)/,
    'the expiry cell must go through cookieExpiry() with the built strings');
  assert.doesNotMatch(body, /String\(row\.purpose ==/,
    'the raw-purpose fallback is still in the renderer');
  assert.doesNotMatch(body, /String\(row\.expiry ==/,
    'the raw-expiry fallback is still in the renderer');
  // The em dash stays the empty-cell mark it has been since 0.5.0.
  assert.match(body, /\|\| '—'/, 'an unresolvable cell must still render the em dash');
});

test('both resolvers are published for the cabinet, next to the other pure halves', () => {
  const C = load();
  assert.equal(typeof C.cookiePurpose, 'function');
  assert.equal(typeof C.cookieExpiry, 'function');
});

test('cookiePurpose does not disturb the link and service chains it sits next to', () => {
  /* Three chains, three functions, on purpose — the regression this guards is
     someone "unifying" them later. linkLabel() must still return null (which is
     what makes resolveLinks drop a label-less link), and servicePurpose() must
     still stop at its own base-code-then-en rule. */
  const C = load();
  assert.equal(C.linkLabel({ de: 'Mehr' }, 'ro'), null,
    'a link with no label for this language must still be skipped, not first-non-empty');
  assert.equal(C.cookiePurpose({ de: 'Mehr' }, 'ro'), 'Mehr',
    'a cookie row must still take the first non-empty language');
  assert.equal(C.servicePurpose({ purpose: { de: 'Mehr' } }, 'ro'), '',
    'servicePurpose must keep its own narrower chain');
});

/* ----------------------------------------------- §1 the core keeps both fields */

/* ck-core.js the way test/version.test.mjs loads it: a classic side-effect
   script against a bare global, then read window.ConsentKit back. */
function loadCore() {
  const g = { console };
  g.window = g;
  g.globalThis = g;
  g.self = g;
  const ctx = vm.createContext(g);
  vm.runInContext(readFileSync(join(REPO, 'src', 'ck-core.js'), 'utf8'), ctx,
    { filename: 'src/ck-core.js' });
  assert.ok(ctx.window.ConsentKit, 'src/ck-core.js did not attach window.ConsentKit');
  return ctx.window.ConsentKit;
}

test('init() carries an object purpose and a numeric expiryDays through untouched', () => {
  /* SPEC V1.18.1 §1.3 — the config the PANEL reads is the one the core stored,
     and the core clones it on the way in. Nothing in the core validates or
     rewrites a cookieTable row, and this is the test that says so: if a future
     normaliser starts copying rows field by field, an object `purpose` and a
     numeric `expiryDays` are exactly what it would quietly drop, and the panel
     would fall back to Russian without anything failing. */
  const ck = loadCore();
  const purpose = { ru: 'Статистика посещений', ro: 'Statistici de vizitare', en: 'Visit statistics' };
  ck.init({
    cookieTable: [
      { name: '_ga', category: 'analytics', vendor: 'Google', purpose: purpose, expiryDays: 730, expiry: '2 года' },
      { name: 'PHPSESSID', category: 'necessary', purpose: 'Сессия', expiryDays: null }
    ]
  });

  const rows = ck.config.cookieTable;
  assert.ok(Array.isArray(rows) && rows.length === 2, 'the cookieTable did not survive init()');

  assert.equal(typeof rows[0].purpose, 'object', 'the object purpose was flattened or dropped');
  assert.equal(rows[0].purpose.ro, 'Statistici de vizitare');
  assert.equal(rows[0].purpose.ru, 'Статистика посещений');
  assert.equal(rows[0].expiryDays, 730, 'the numeric expiryDays did not survive');
  assert.equal(rows[0].expiry, '2 года', 'the legacy expiry string must be kept for older clients');

  // null is a value here, not «absent» — it is how a session cookie is written.
  assert.equal(rows[1].purpose, 'Сессия', 'a string purpose must still pass through');
  assert.equal(rows[1].expiryDays, null, 'expiryDays: null must survive as null');
  assert.ok('expiryDays' in rows[1], 'the key itself must survive, not just its value');
});

test('a row the core stored renders through the same two resolvers', () => {
  /* End to end across the two files, with no DOM: what the core kept is what
     the panel resolves. This is the assertion that would fail if either side
     drifted while its own unit tests kept passing. */
  const ck = loadCore();
  ck.init({
    cookieTable: [{
      name: '_ga', category: 'analytics',
      purpose: { ru: 'Статистика посещений', ro: 'Statistici de vizitare', en: 'Visit statistics' },
      expiryDays: 730, expiry: '2 года'
    }]
  });
  const row = ck.config.cookieTable[0];

  const C = load();
  for (const [lang, want, when] of [
    ['ru', 'Статистика посещений', '730 дн.'],
    ['ro', 'Statistici de vizitare', '730 de zile'],
    ['en', 'Visit statistics', '730 days']
  ]) {
    const T = stringsFor(C, lang);
    assert.equal(C.cookiePurpose(row.purpose, lang), want, `${lang} purpose`);
    assert.equal(C.cookieExpiry(row, T, lang), when, `${lang} expiry`);
  }
});

/* ------------------------------------------------------------------ version */

test('the client version literal is 0.5.16 in the core', () => {
  const core = readFileSync(join(REPO, 'src', 'ck-core.js'), 'utf8');
  assert.match(core, /version: '0\.5\.16',/, 'src/ck-core.js was not bumped');
});
