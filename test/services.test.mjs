/* SPEC V1.12 §3 — services in the settings panel and in the consent record
 * (client 0.5.8).
 *
 * The spec's own test list, in order:
 *   - рендер сервисов по группам на трёх языках
 *   - переключатель сервиса -> блокировка и удаление cookie
 *   - маяк с `services`
 *   - восстановление прокрутки
 *   - отсутствие перерисовки при неизменном отчёте
 *   - старый конфиг без `services` рендерится как раньше
 *
 * Three loading styles, for three different questions:
 *
 *   loadCore() — src/ck-core.js against the blocking suite's stub DOM. This is
 *                where the engine half lives: what gets held back, what gets
 *                revived, which cookies are deleted, what lands in the record.
 *                It carries `btoa`/`atob`, which the blocking suite's own stub
 *                deliberately omits — without them saveRecord() silently writes
 *                nothing and every "did it persist?" assertion would pass for
 *                the wrong reason.
 *
 *   loadUi()   — src/ck-ui.js in a bare context, reading the pure functions it
 *                publishes on ConsentKit._contrast: the plural forms, the group
 *                header, which cookieTable rows sit under which service.
 *
 *   loadDebug()— src/ck-debug.js in a bare context, for the pure report rules.
 *
 * THE VACUOUS-PASS TRAP, twice over:
 *   - a stub with no btoa makes every persistence test pass emptily (see above);
 *   - a ck-saas harness whose ConsentKit stub has no `_deniedServices` makes
 *     every "the beacon does NOT carry services" test pass for the wrong
 *     reason. The beacon tests below therefore all run against a stub that DOES
 *     report a denial, so an absent field is provably the method guard.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CORE_SRC = readFileSync(join(REPO, 'src', 'ck-core.js'), 'utf8');
const UI_SRC = readFileSync(join(REPO, 'src', 'ck-ui.js'), 'utf8');
const LOCALES_SRC = readFileSync(join(REPO, 'src', 'ck-locales.js'), 'utf8');
const DEBUG_SRC = readFileSync(join(REPO, 'src', 'ck-debug.js'), 'utf8');

/* Values that cross the vm boundary carry the OTHER realm's prototypes, so
   `deepStrictEqual` compares an Array made in the sandbox against one made
   here and fails on identity alone — with an actual/expected pair that prints
   identically, which is the most confusing failure in the suite. Everything
   read back out of a vm context therefore goes through this first. */
const plain = (v) => JSON.parse(JSON.stringify(v));

/* ------------------------------------------------------------------ fixtures */

/* Two services in ONE category, so «this service is held while the rest of the
   category runs» is provable rather than indistinguishable from «analytics is
   off». `weird-tracker.example` is in no shipped table, which is what proves
   §2's «hosts не обязаны быть в HOST_DB». */
const SERVICES = [
  {
    id: 'hotjar',
    name: 'Hotjar',
    vendor: 'Hotjar Ltd',
    category: 'analytics',
    hosts: ['hotjar.com'],
    cookies: ['_hjSession', '_hjSessionUser'],
    privacyUrl: 'https://www.hotjar.com/privacy/',
    purpose: {
      ru: 'Записывает, как посетители двигаются по странице.',
      ro: 'Înregistrează cum se mișcă vizitatorii pe pagină.',
      en: 'Records how visitors move around the page.'
    }
  },
  {
    id: 'google-analytics',
    name: 'Google Analytics',
    vendor: 'Google Ireland Limited',
    category: 'analytics',
    hosts: ['google-analytics.com'],
    cookies: ['_ga'],
    privacyUrl: 'https://policies.google.com/privacy',
    purpose: { ru: 'Считает посещения страниц.', en: 'Counts page visits.' }
  },
  {
    id: 'weird-tracker',
    name: 'Weird Tracker',
    vendor: 'Weird Ltd',
    category: 'marketing',
    hosts: ['weird-tracker.example'],
    cookies: [],
    purpose: { en: 'Unknown to the shipped tracker database.' }
  }
];

const COOKIE_TABLE = [
  { name: '_hjSession', category: 'analytics', vendor: 'Hotjar', purpose: 'Session', expiry: '30 min' },
  { name: '_hjSessionUser', category: 'analytics', vendor: 'Hotjar', purpose: 'Visitor', expiry: '1 year' },
  { name: '_ga', category: 'analytics', vendor: 'Google', purpose: 'Visits', expiry: '2 years' },
  { name: 'own_stat', category: 'analytics', vendor: 'This site', purpose: 'Own counter', expiry: '1 day' }
];

/* ------------------------------------------------------------------ stub DOM */

function makeElement(tagName, doc, g) {
  const attrs = new Map();
  const el = {
    tagName: tagName.toUpperCase(),
    nodeType: 1,
    ownerDocument: doc,
    parentNode: null,
    childNodes: [],
    attributes: [],
    type: undefined,
    async: false,
    text: '',
    textContent: '',
    _src: '',
    getAttribute(n) { const k = String(n).toLowerCase(); return attrs.has(k) ? attrs.get(k) : null; },
    _set(n, v) {
      const k = String(n).toLowerCase();
      attrs.set(k, String(v));
      el.attributes = [...attrs].map(([name, value]) => ({ name, value }));
    },
    _remove(n) {
      attrs.delete(String(n).toLowerCase());
      el.attributes = [...attrs].map(([name, value]) => ({ name, value }));
    },
    setAttribute(n, v) { return g.Element.prototype.setAttribute.call(el, n, v); },
    removeAttribute(n) { return el._remove(n); },
    hasAttribute(n) { return attrs.has(String(n).toLowerCase()); },
    querySelectorAll() { return []; },
    appendChild(child) { child.parentNode = el; el.childNodes.push(child); return child; },
    insertBefore(child) { child.parentNode = el; el.childNodes.push(child); return child; },
    removeChild(child) {
      const i = el.childNodes.indexOf(child);
      if (i > -1) el.childNodes.splice(i, 1);
      child.parentNode = null;
      return child;
    }
  };
  return el;
}

/**
 * The core against a stub DOM, with a REAL cookie jar.
 *
 * `document.cookie` in the blocking suite's stub is a plain string, so the last
 * write wins and a delete clobbers the record. A consent record that survives a
 * purge is precisely what §3 asks about, so this jar implements the browser's
 * actual semantics: a write sets or expires ONE name, a read returns them all.
 */
function loadCore({ href = 'https://shop.example.com/page', jar = {} } = {}) {
  const g = Object.create(null);
  const cookies = Object.assign({}, jar);
  const writes = [];

  const doc = {
    _all: [],
    get cookie() {
      return Object.keys(cookies).map((k) => k + '=' + cookies[k]).join('; ');
    },
    set cookie(line) {
      writes.push(String(line));
      const m = /^\s*([^=;]+)=([^;]*)/.exec(String(line));
      if (!m) return;
      const name = m[1].trim();
      if (/expires=Thu, 01 Jan 1970/i.test(String(line))) delete cookies[name];
      else cookies[name] = m[2];
    },
    createElement(tag) { const el = makeElement(tag, doc, g); doc._all.push(el); return el; },
    querySelectorAll(sel) {
      return doc._all.filter((el) => {
        const t = el.tagName.toLowerCase();
        if (sel.includes('script[type="text/plain"][data-ck]')) {
          const a = t === 'script' && el.getAttribute('type') === 'text/plain' && el.getAttribute('data-ck');
          const b = sel.includes('script[data-ck-blocked]') && t === 'script' && el.getAttribute('data-ck-blocked');
          return !!(a || b);
        }
        if (sel === 'iframe[data-ck][data-src]') {
          return t === 'iframe' && el.getAttribute('data-ck') && el.getAttribute('data-src');
        }
        if (sel === 'script[src]') return t === 'script' && el.getAttribute('src');
        if (sel === 'iframe[src]') return t === 'iframe' && el.getAttribute('src');
        return false;
      });
    },
    addEventListener() {},
    dispatchEvent() { return true; },
    documentElement: null,
    body: null
  };
  doc.body = makeElement('body', doc, g);
  doc._all.push(doc.body);

  function srcProto() {
    const P = function () {};
    Object.defineProperty(P.prototype, 'src', {
      configurable: true,
      enumerable: true,
      get() { return this._src || ''; },
      set(v) { this._src = String(v); this._set('src', String(v)); }
    });
    return P;
  }

  g.window = g;
  g.self = g;
  g.document = doc;
  g.location = { href, hostname: new URL(href).hostname };
  g.HTMLScriptElement = srcProto();
  g.HTMLIFrameElement = srcProto();
  g.Element = function () {};
  g.Element.prototype.setAttribute = function (n, v) { return this._set(n, v); };
  g.Element.prototype.removeAttribute = function (n) { return this._remove(n); };
  g.URL = URL;
  g.localStorage = null;
  // Without these, b64encode() returns '' and saveRecord() writes NOTHING —
  // every persistence assertion below would then pass on an empty jar.
  g.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
  g.atob = (s) => Buffer.from(s, 'base64').toString('binary');

  const context = vm.createContext(g);
  vm.runInContext(CORE_SRC, context, { filename: 'src/ck-core.js' });

  const CK = g.ConsentKit;
  assert.ok(CK, 'src/ck-core.js did not attach ConsentKit');
  assert.equal(g.location.hostname, new URL(href).hostname, 'the stub lost its hostname');
  // Prove the jar works before anything relies on it.
  doc.cookie = 'probe=1';
  assert.match(doc.cookie, /probe=1/, 'the cookie jar does not store');
  doc.cookie = 'probe=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  assert.doesNotMatch(doc.cookie, /probe=/, 'the cookie jar does not delete');

  return {
    CK,
    doc,
    g,
    cookies,
    writes,
    make: (tag) => doc.createElement(tag),
    record() {
      const m = /ck_consent=([^;]+)/.exec(doc.cookie);
      if (!m) return null;
      return JSON.parse(Buffer.from(m[1], 'base64').toString('utf8'));
    }
  };
}

function insert(env, tag, src) {
  const el = env.make(tag);
  env.doc.body.appendChild(el);
  el.src = src;
  return el;
}

const isBlocked = (el) => el.getAttribute('data-ck-blocked') === '1';

/** ck-ui.js in a bare context; returns the pure export surface. */
function loadUi() {
  const win = { console, ConsentKit: {} };
  win.window = win;
  win.globalThis = win;
  win.self = win;
  const ctx = vm.createContext(win);
  vm.runInContext(LOCALES_SRC, ctx, { filename: 'src/ck-locales.js' });
  vm.runInContext(UI_SRC, ctx, { filename: 'src/ck-ui.js' });
  const C = win.ConsentKit._contrast;
  assert.ok(C, 'ck-ui.js did not publish ConsentKit._contrast');
  return C;
}

/** The strings ck-ui would build for one banner language. */
function stringsFor(C, lang) {
  const table = C.localeTable();
  return C.buildStrings(C.resolveLang(lang, table), table);
}

/** ck-debug.js in a bare context; returns its pure API. */
function loadDebug() {
  const g = { console };
  g.window = g;
  g.self = g;
  g.globalThis = g;
  const ctx = vm.createContext(g);
  vm.runInContext(DEBUG_SRC, ctx, { filename: 'src/ck-debug.js' });
  assert.ok(g.__ckDebug, 'ck-debug.js did not publish __ckDebug');
  return g.__ckDebug;
}

/* ============================================================ config parsing */

test('the core normalises the config rows and drops what it cannot trust', () => {
  const { CK } = loadCore();
  CK.init({
    policyVersion: '1',
    services: SERVICES.concat([
      { id: 'BAD ID', name: 'x', category: 'analytics', hosts: ['x.example'], cookies: [] },
      { id: 'bad-cat', name: 'x', category: 'nonsense', hosts: ['y.example'], cookies: [] },
      { id: 'off', name: 'x', category: 'analytics', hosts: ['z.example'], cookies: [], enabled: false },
      { id: 'hotjar', name: 'duplicate', category: 'marketing', hosts: ['dup.example'], cookies: [] },
      'not an object'
    ])
  });

  const ids = plain(CK._services().map((s) => s.id));
  assert.deepEqual(ids, ['hotjar', 'google-analytics', 'weird-tracker'],
    'a malformed id, an unknown category, enabled:false, a duplicate and a non-object must all be dropped');

  // The duplicate must not have overwritten the first row's category.
  assert.equal(CK._services()[0].category, 'analytics');
  // enabled:false is invisible to the engine too, not merely to the panel.
  assert.equal(CK._serviceForUrl('https://z.example/a.js'), null,
    'a service with enabled:false must not be matched by _serviceForUrl');
});

test('a javascript: privacyUrl is dropped rather than rendered as a link', () => {
  const { CK } = loadCore();
  CK.init({
    policyVersion: '1',
    services: [{
      id: 'evil', name: 'Evil', vendor: 'E', category: 'analytics',
      hosts: ['evil.example'], cookies: [],
      // eslint-disable-next-line no-script-url
      privacyUrl: 'javascript:alert(1)'
    }]
  });
  assert.equal(CK._services()[0].privacyUrl, null,
    'only http(s) may reach an href the visitor is invited to click');
});

test('_serviceForUrl matches hosts by suffix and paths by substring', () => {
  const { CK } = loadCore();
  CK.init({
    policyVersion: '1',
    services: SERVICES.concat([{
      id: 'by-path', name: 'By path', vendor: 'P', category: 'marketing',
      hosts: [], paths: ['/gtag/js'], cookies: []
    }])
  });

  // Suffix, exactly like HOST_DB: a subdomain is covered, a lookalike is not.
  assert.equal(CK._serviceForUrl('https://static.hotjar.com/x.js').id, 'hotjar');
  assert.equal(CK._serviceForUrl('https://hotjar.com/x.js').id, 'hotjar');
  assert.equal(CK._serviceForUrl('https://nothotjar.com/x.js'), null);
  // Substring of the resolved URL, exactly like PATH_DB.
  assert.equal(CK._serviceForUrl('https://anything.example/gtag/js?id=G-1').id, 'by-path');
  assert.equal(CK._serviceForUrl('https://unrelated.example/a.js'), null);
});

test('a service host unknown to HOST_DB is blocked under the service category', () => {
  const { CK } = loadCore();
  // §2: «клиент 0.5.8 расширяет карту блокировки хостами сервисов из конфига».
  assert.equal(CK._categoryForUrl('https://weird-tracker.example/t.js'), null,
    'the fixture host must be unknown BEFORE init, or this proves nothing');
  CK.init({ policyVersion: '1', services: SERVICES });
  assert.equal(CK._categoryForUrl('https://weird-tracker.example/t.js'), 'marketing');
});

test('_serviceForUrl hands out copies, not the live rows the engine reads', () => {
  const { CK } = loadCore();
  CK.init({ policyVersion: '1', services: SERVICES });
  const a = CK._serviceForUrl('https://static.hotjar.com/x.js');
  a.hosts.push('example.com');
  a.category = 'necessary';
  const b = CK._serviceForUrl('https://static.hotjar.com/x.js');
  assert.equal(b.category, 'analytics');
  assert.deepEqual(plain(b.hosts), ['hotjar.com'], 'page code must not be able to widen the block map');
});

/* ==================================================== blocking and revival */

test('a denied service is held back while the rest of its category runs', () => {
  const env = loadCore();
  env.CK.init({ policyVersion: '1', services: SERVICES });
  env.CK.accept({ functional: false, analytics: true, marketing: false, services: { hotjar: false } });

  const denied = insert(env, 'script', 'https://static.hotjar.com/x.js');
  const allowed = insert(env, 'script', 'https://www.google-analytics.com/analytics.js');

  assert.ok(isBlocked(denied), 'the refused service must be held exactly as an unconsented category is');
  assert.ok(!isBlocked(allowed),
    'the OTHER analytics service must still run — otherwise this only proves analytics is off');
  assert.equal(env.CK.allowedService('hotjar'), false);
  assert.equal(env.CK.allowedService('google-analytics'), true);
});

test('allowedService is false whenever the category is denied, refusal or not', () => {
  const env = loadCore();
  env.CK.init({ policyVersion: '1', services: SERVICES });
  env.CK.rejectAll();
  assert.equal(env.CK.allowedService('hotjar'), false);
  assert.equal(env.CK.allowedService('google-analytics'), false);
});

test('allowedService is true for an id the config does not declare', () => {
  const env = loadCore();
  env.CK.init({ policyVersion: '1', services: SERVICES });
  env.CK.accept('all');
  // The engine withholds nothing it was never told about; answering `false`
  // would silently disable a site's own code for a service it removed.
  assert.equal(env.CK.allowedService('never-heard-of-it'), true);
});

test('granting the category does NOT revive a refused service’s script', () => {
  /* The trap this test exists for: applyConsentToDom() used to revive on
     allowed(category) alone, so accepting analytics would bring back the very
     script the visitor singled out to refuse. */
  const env = loadCore();
  env.CK.init({ policyVersion: '1', services: SERVICES });

  const held = insert(env, 'script', 'https://static.hotjar.com/x.js');
  const other = insert(env, 'script', 'https://www.google-analytics.com/analytics.js');
  assert.ok(isBlocked(held) && isBlocked(other), 'both must start held (nothing consented yet)');

  env.CK.accept({ functional: false, analytics: true, marketing: false, services: { hotjar: false } });

  /* reviveScript() does not un-block the original element: it builds a FRESH
     <script>, marks it data-ck-restored, inserts it next to the old one and
     removes the old one. So «did it come back?» is a question about the tree,
     not about the element the test is holding. */
  const restored = env.doc.body.childNodes
    .filter((el) => el.getAttribute('data-ck-restored') === '1')
    .map((el) => el.getAttribute('src'));

  assert.deepEqual(plain(restored), ['https://www.google-analytics.com/analytics.js'],
    'exactly the consented service must come back — the refused one must not, ' +
    'and something must, or the grant did nothing at all');
  assert.ok(env.doc.body.childNodes.includes(held),
    'the refused script must still be sitting there, held');
  assert.equal(held.getAttribute('data-ck-restored'), null);
  assert.ok(!env.doc.body.childNodes.includes(other),
    'the revived original is replaced by the fresh copy');
});

test('a refused service’s iframe keeps its src withheld after the grant', () => {
  const env = loadCore();
  env.CK.init({ policyVersion: '1', services: SERVICES });
  const frame = insert(env, 'iframe', 'https://static.hotjar.com/embed.html');
  assert.equal(frame.getAttribute('src'), null, 'the frame must start held');

  env.CK.accept({ functional: false, analytics: true, marketing: false, services: { hotjar: false } });
  assert.equal(frame.getAttribute('src'), null,
    'applyConsentToDom must consult the refusal for iframes too, not only scripts');

  // And clearing the refusal brings it back through the normal path.
  env.CK.accept({ functional: false, analytics: true, marketing: false, services: {} });
  assert.equal(frame.getAttribute('src'), 'https://static.hotjar.com/embed.html');
});

test('a strict-mode interception is still labelled strict; a service match is not', () => {
  const env = loadCore();
  env.CK.init({ policyVersion: '1', blocking: { mode: 'strict' }, services: SERVICES });
  const bySvc = insert(env, 'script', 'https://weird-tracker.example/t.js');
  const byStrict = insert(env, 'script', 'https://nobody-knows-this.example/t.js');

  assert.ok(isBlocked(bySvc) && isBlocked(byStrict));
  // A host the config named is not an "unknown third party": it keeps the
  // service's own category rather than being filed under marketing-by-default.
  assert.equal(bySvc.getAttribute('data-ck'), 'marketing');
  const blocked = env.CK._blocked();
  const svcRec = blocked.find((b) => b.host === 'weird-tracker.example');
  const strictRec = blocked.find((b) => b.host === 'nobody-knows-this.example');
  assert.equal(svcRec.strict, false, 'the config named this host — it is not a strict-mode guess');
  assert.equal(strictRec.strict, true);
});

/* ============================================================ cookie removal */

test('the cookies of a refused service are deleted, the rest are left alone', () => {
  const env = loadCore({
    jar: { _hjSession: 'a', _hjSessionUser: 'b', _ga: 'c', own_stat: 'd' }
  });
  env.CK.init({ policyVersion: '1', services: SERVICES, cookieTable: COOKIE_TABLE });
  env.CK.accept({ functional: false, analytics: true, marketing: false, services: { hotjar: false } });

  assert.equal(env.cookies._hjSession, undefined, 'a refused service’s cookie must go');
  assert.equal(env.cookies._hjSessionUser, undefined);
  assert.equal(env.cookies._ga, 'c', 'a consented service’s cookie must stay');
  assert.equal(env.cookies.own_stat, 'd', 'a cookie no service claims must stay');
});

test('the sweep runs on every commit, not only on the click that refused', () => {
  /* A visitor who refuses Hotjar with analytics OFF, then turns analytics ON,
     has just handed the category a chance to write the cookies of a service
     they said no to. */
  const env = loadCore();
  env.CK.init({ policyVersion: '1', services: SERVICES });
  env.CK.accept({ functional: false, analytics: false, marketing: false, services: { hotjar: false } });

  env.doc.cookie = '_hjSession=late';
  assert.equal(env.cookies._hjSession, 'late');

  env.CK.accept({ functional: false, analytics: true, marketing: false });
  assert.equal(env.cookies._hjSession, undefined,
    'a still-standing refusal must be swept on the next decision too');
});

test('withdraw() clears the refusals and sweeps their cookies', () => {
  const env = loadCore({ jar: { _hjSession: 'a' } });
  env.CK.init({ policyVersion: '1', services: SERVICES });
  env.CK.accept({ functional: false, analytics: true, marketing: false, services: { hotjar: false } });
  env.doc.cookie = '_hjSession=again';

  env.CK.withdraw();
  assert.deepEqual(plain(env.CK.getState().services), {},
    'a withdrawal erases the record, so the refusals it carried go with it');
  assert.equal(env.cookies._hjSession, undefined);
});

/* ============================================================ the record */

test('ck_consent stores refusals ONLY, as services: { id: false }', () => {
  const env = loadCore();
  env.CK.init({ policyVersion: '1', services: SERVICES });
  env.CK.accept({ functional: false, analytics: true, marketing: false, services: { hotjar: false } });

  const rec = env.record();
  assert.ok(rec, 'nothing was written — is btoa missing from the stub?');
  assert.deepEqual(plain(rec.services), { hotjar: false },
    'the consented service must not appear: the map is refusals only');
});

test('a decision with no refusals writes the exact record 0.5.7 wrote', () => {
  const env = loadCore();
  env.CK.init({ policyVersion: '1' });
  env.CK.accept('all');
  const rec = env.record();
  assert.ok(!('services' in rec),
    'a site with no services must store no `services` key at all — the shape does not change until it has to');
  assert.deepEqual(plain(Object.keys(rec).sort()),
    ['categories', 'id', 'method', 'policyVersion', 'ts'].sort());
});

test('the refusal survives a reload and still blocks', () => {
  const first = loadCore();
  first.CK.init({ policyVersion: '1', services: SERVICES });
  first.CK.accept({ functional: false, analytics: true, marketing: false, services: { hotjar: false } });
  const payload = /ck_consent=([^;]+)/.exec(first.doc.cookie)[1];

  const second = loadCore({ jar: { ck_consent: payload } });
  second.CK.init({ policyVersion: '1', services: SERVICES });

  assert.deepEqual(plain(second.CK.getState().services), { hotjar: false });
  assert.equal(second.CK.allowedService('hotjar'), false);
  assert.ok(isBlocked(insert(second, 'script', 'https://static.hotjar.com/x.js')),
    'a refusal restored from storage must block on the next page load');
});

test('a refusal survives its category being switched off and back on', () => {
  // §3: «включён → сервисы включены, кроме отключённых вручную».
  const env = loadCore();
  env.CK.init({ policyVersion: '1', services: SERVICES });
  env.CK.accept({ functional: false, analytics: true, marketing: false, services: { hotjar: false } });

  // A later decision that says nothing about services must leave them alone.
  env.CK.accept({ functional: false, analytics: false, marketing: false });
  assert.deepEqual(plain(env.CK.getState().services), { hotjar: false });

  env.CK.accept({ functional: false, analytics: true, marketing: false });
  assert.deepEqual(plain(env.CK.getState().services), { hotjar: false });
  assert.equal(env.CK.allowedService('hotjar'), false,
    'the refusal must outlive the group toggle, or the group switch silently re-consents');
});

test('«Принять всё» and «Отклонить всё» clear the refusals', () => {
  const env = loadCore();
  env.CK.init({ policyVersion: '1', services: SERVICES });
  env.CK.accept({ functional: false, analytics: true, marketing: false, services: { hotjar: false } });

  env.CK.accept('all');
  assert.deepEqual(plain(env.CK.getState().services), {},
    'accept_all means all of it — a surviving refusal would be a decision the visitor did not make');
  assert.equal(env.CK.allowedService('hotjar'), true);

  env.CK.accept({ functional: true, analytics: true, marketing: true, services: { hotjar: false } });
  env.CK.rejectAll();
  assert.deepEqual(plain(env.CK.getState().services), {});
});

test('a tampered stored map cannot widen or narrow what is blocked', () => {
  // The record lives in a cookie: it is attacker-writable and nothing in it is
  // trusted. Only `false` under a well-formed id survives the read.
  const rec = {
    id: '11111111-1111-4111-8111-111111111111',
    ts: new Date().toISOString(),
    policyVersion: '1',
    categories: { necessary: true, functional: false, analytics: true, marketing: false },
    services: { hotjar: false, 'google-analytics': true, 'BAD ID': false, other: 1 },
    method: 'custom'
  };
  const payload = Buffer.from(JSON.stringify(rec), 'utf8').toString('base64');
  const env = loadCore({ jar: { ck_consent: payload } });
  env.CK.init({ policyVersion: '1', services: SERVICES });

  assert.deepEqual(plain(env.CK.getState().services), { hotjar: false },
    'a `true`, a malformed id and a non-boolean must all be dropped');
  assert.equal(env.CK.allowedService('google-analytics'), true);
});

test('getState() hands out a copy of the refusal map', () => {
  const env = loadCore();
  env.CK.init({ policyVersion: '1', services: SERVICES });
  env.CK.accept({ functional: false, analytics: true, marketing: false, services: { hotjar: false } });
  const s = env.CK.getState();
  s.services['google-analytics'] = false;
  assert.equal(env.CK.allowedService('google-analytics'), true,
    'page code must not be able to add a refusal by writing to getState()');
});

/* ==================================================== the panel: three languages */

test('the group header reads «N сервисов · M cookie» in ru, ro and en', () => {
  const C = loadUi();
  assert.equal(C.groupCountLabel(3, 5, stringsFor(C, 'ru'), 'ru'), '3 сервиса · 5 cookie');
  assert.equal(C.groupCountLabel(3, 5, stringsFor(C, 'ro'), 'ro'), '3 servicii · 5 cookie-uri');
  assert.equal(C.groupCountLabel(3, 5, stringsFor(C, 'en'), 'en'), '3 services · 5 cookies');
});

test('each language gets its own plural forms, not the English ones', () => {
  const C = loadUi();
  const ru = stringsFor(C, 'ru');
  const ro = stringsFor(C, 'ro');
  // 1 / 2 / 5 pick three DIFFERENT Russian forms.
  assert.equal(C.plural(ru.svcCount, 1, 'ru'), '1 сервис');
  assert.equal(C.plural(ru.svcCount, 2, 'ru'), '2 сервиса');
  assert.equal(C.plural(ru.svcCount, 5, 'ru'), '5 сервисов');
  // …and 21 goes back to the first, which is what a naive n===1 rule gets wrong.
  assert.equal(C.plural(ru.svcCount, 21, 'ru'), '21 сервис');
  // Romanian needs «de» past 19.
  assert.equal(C.plural(ro.svcCount, 1, 'ro'), '1 serviciu');
  assert.equal(C.plural(ro.svcCount, 5, 'ro'), '5 servicii');
  assert.equal(C.plural(ro.svcCount, 20, 'ro'), '20 de servicii');
});

test('a locale with no plural table of its own falls back to English wholesale', () => {
  /* The trap: buildStrings() copies only `typeof === 'string'` values, so an
     array listed in STR_KEYS would ALWAYS fall through to en. The plural keys
     therefore have their own branch — and a language that ships no forms must
     get a coherent English table, never a half-filled one. */
  const C = loadUi();
  const de = stringsFor(C, 'de');
  assert.equal(C.plural(de.svcCount, 1, 'de'), '1 service');
  assert.equal(C.plural(de.svcCount, 4, 'de'), '4 services');
  // …while ru, which DOES ship them, must not be silently English.
  assert.notEqual(C.plural(stringsFor(C, 'ru').svcCount, 4, 'ru'), '4 services');
});

test('the service purpose follows the banner language and falls back to en', () => {
  const C = loadUi();
  const hotjar = SERVICES[0];
  assert.match(C.servicePurpose(hotjar, 'ru'), /Записывает/);
  assert.match(C.servicePurpose(hotjar, 'ro'), /Înregistrează/);
  assert.match(C.servicePurpose(hotjar, 'en'), /Records/);
  // A language the row does not carry falls back to en, not to a stray language.
  assert.match(C.servicePurpose(hotjar, 'de'), /Records/);
  // ro missing on the second row: en, not Russian.
  assert.match(C.servicePurpose(SERVICES[1], 'ro'), /Counts/);
  // Nothing at all renders nothing, never the string "undefined".
  assert.equal(C.servicePurpose({ purpose: {} }, 'ru'), '');
  assert.equal(C.servicePurpose({}, 'ru'), '');
});

test('«Политика» is translated in all three languages', () => {
  const C = loadUi();
  assert.equal(stringsFor(C, 'ru').svcPolicy, 'Политика');
  assert.equal(stringsFor(C, 'ro').svcPolicy, 'Politica');
  assert.equal(stringsFor(C, 'en').svcPolicy, 'Privacy policy');
});

test('the row disclosure «Подробнее» is translated in ru, ro and en', () => {
  /* 0.5.12. It is NOT the banner's `more`: ro renders that as «Aflați mai
     multe», a sentence, where the row needs a one-word control. */
  const C = loadUi();
  assert.equal(stringsFor(C, 'ru').svcDetails, 'Подробнее');
  assert.equal(stringsFor(C, 'ro').svcDetails, 'Detalii');
  assert.equal(stringsFor(C, 'en').svcDetails, 'Details');
  assert.notEqual(stringsFor(C, 'ro').svcDetails, stringsFor(C, 'ro').more);
});

test('the 0.5.12 keys are in STR_KEYS, so no locale renders «undefined»', () => {
  /* A key added to DICT but not to STR_KEYS is `undefined` for all 32 external
     locales — the file's own comment warns about exactly this, and the string
     "undefined" would be painted on the card. */
  const C = loadUi();
  for (const lang of ['de', 'fr', 'pl', 'ro', 'ru', 'en']) {
    const T = stringsFor(C, lang);
    for (const key of ['svcDetails', 'svcListLabel']) {
      assert.equal(typeof T[key], 'string', `${lang}.${key} is not a string`);
      assert.ok(T[key].length > 0 && T[key] !== 'undefined', `${lang}.${key} is empty`);
    }
  }
  // A locale with no translation of its own falls back to en, not to nothing.
  assert.equal(stringsFor(C, 'de').svcDetails, 'Details');
});

test('a service’s cookies are listed under it and dropped from the group table', () => {
  const C = loadUi();
  const rows = COOKIE_TABLE.filter((r) => r.category === 'analytics');
  const svcs = SERVICES.filter((s) => s.category === 'analytics');

  assert.deepEqual(plain(C.cookieRowsForService(rows, svcs[0]).map((r) => r.name)),
    ['_hjSession', '_hjSessionUser']);
  assert.deepEqual(plain(C.cookieRowsForService(rows, svcs[1]).map((r) => r.name)), ['_ga']);
  // What is left is exactly the cookie no service claims.
  assert.deepEqual(plain(C.looseCookies(rows, svcs).map((r) => r.name)), ['own_stat']);
});

test('a service naming a cookie the table does not describe invents no row', () => {
  const C = loadUi();
  const rows = [{ name: '_ga', category: 'analytics' }];
  const svc = { id: 'x', cookies: ['_ga', '_not_in_table'] };
  assert.deepEqual(plain(C.cookieRowsForService(rows, svc).map((r) => r.name)), ['_ga']);
});

/* ============================================ the old config renders unchanged */

test('with no services the group table is the whole cookie list, untouched', () => {
  const C = loadUi();
  const rows = COOKIE_TABLE.filter((r) => r.category === 'analytics');
  const loose = C.looseCookies(rows, []);
  assert.equal(loose, rows, 'with no services the list must be passed through, not rebuilt');
  assert.deepEqual(plain(loose.map((r) => r.name)), ['_hjSession', '_hjSessionUser', '_ga', 'own_stat']);
});

/* The source region of buildCategory(), which several tests below read. */
function categorySource() {
  const body = UI_SRC.slice(UI_SRC.indexOf('function buildCategory'));
  return body.slice(0, body.indexOf('\n  /* SPEC V1.6 §2'));
}

function serviceSource() {
  const body = UI_SRC.slice(UI_SRC.indexOf('  function buildService(svc, cat, rows)'));
  return body.slice(0, body.indexOf('\n  /* The <details> block'));
}

test('the panel source renders the counter ONLY when the group has services', () => {
  /* «старый конфиг без services рендерится как раньше» means the header carries
     NO counter at all — not «0 сервисов · 3 cookie». Asserted on the source,
     because the guard is a branch rather than a value: the DOM render itself is
     covered in a real browser.

     0.5.12: the counter became the disclosure BUTTON, so the guard now wraps
     makeGroupToggle() rather than a bare appendChild — but it is still one
     `if (svcs.length)`, and the service list still sits behind the same test. */
  const region = categorySource();
  assert.match(region, /if \(svcs\.length\) \{\s*\n\s*toggle = makeGroupToggle\(/,
    'the counter must sit behind a services-present guard');
  assert.match(region, /if \(svcs\.length\) \{[\s\S]*?var list = el\('div', 'ck-svcs'\)/,
    'the service list must sit behind the same guard');
  // And the group's own summary line is unchanged from 0.5.7.
  assert.match(region, /T\.cookiesIn \+ ' \(' \+ loose\.length \+ '\)'/);
});

/* ==================================== 0.5.12: collapsed by default, compact */

test('a group with services starts COLLAPSED, and the header control opens it', () => {
  /* Owner finding 2: eight services pushed the switches off the screen. The
     region must therefore be built `hidden`, and the ONLY thing that clears it
     is the toggle's own click handler. */
  const region = categorySource();
  assert.match(region, /region\.hidden = true;/,
    'the services region must be built collapsed');
  assert.match(region, /toggle\.addEventListener\('click'[\s\S]*?region\.hidden = open;/,
    "the header control must be what toggles the region");
  assert.match(region, /toggle\.setAttribute\('aria-expanded'/,
    'the control must report its expanded state');
});

test('the group control is a real button wired to the region it shows', () => {
  /* A <div> with a click handler is not keyboard reachable and announces
     nothing; §2 asks for «a real <button aria-expanded>». */
  const src = UI_SRC.slice(UI_SRC.indexOf('function makeGroupToggle'));
  const body = src.slice(0, src.indexOf('\n  function buildCategory'));
  assert.match(body, /el\('button', 'ck-cat__count ck-cat__toggle'\)/,
    'the disclosure must be a <button>, not a styled div');
  assert.match(body, /b\.type = 'button'/,
    'a bare <button> inside a form would submit it');
  assert.match(body, /aria-expanded', 'false'/, 'it must start collapsed');
  assert.match(body, /aria-controls', regionId/,
    'the control must name the region it shows');
});

test('the loose-cookie list moves INSIDE the region, but only when there are services', () => {
  /* «opening it reveals the services list and, at the end, the «Какие cookie
     (N)» list». A group with no services keeps the 0.5.7 shape: the table sits
     at the top level, never behind a disclosure that does not exist. */
  const region = categorySource();
  const inside = region.indexOf("region.appendChild(cookieTable(loose");
  const outside = region.indexOf("wrap.appendChild(cookieTable(loose");
  assert.ok(inside > -1, 'with services the group table must live inside the region');
  assert.ok(outside > inside,
    'with no services the group table must still be appended to the card itself');
  assert.match(region, /\} else if \(loose\.length\) \{/,
    'the service-less path must be the else branch, not a second disclosure');
});

test('a service row is one line until its own «Подробнее» is opened', () => {
  /* The purpose, the policy link and «Какие cookie ставит (N)» must ALL be
     inside the row's <details>, not next to the name. */
  const body = serviceSource();
  const detAt = body.indexOf("el('details', 'ck-det ck-svc__det')");
  assert.ok(detAt > -1, 'the row needs its own <details> disclosure');
  for (const marker of ["el('p', 'ck-svc__desc'", "el('a', 'ck-svc__policy'", 'T.svcCookies']) {
    assert.ok(body.indexOf(marker) > detAt,
      `${marker} must be built inside the row's disclosure, not on the visible line`);
  }
  // The visible line is name + vendor, and the vendor joins the name element.
  assert.match(body.slice(0, detAt), /name\.appendChild\(el\('span', 'ck-svc__vendor', svc\.vendor\)\)/,
    'the vendor belongs on the name line, not in a paragraph under it');
});

test('the row disclosure is labelled per service, not «Подробнее» eight times', () => {
  const body = serviceSource();
  assert.match(body, /aria-label', T\.svcDetails \+ ' — ' \+ svc\.name/,
    'every row would otherwise announce the same bare word');
});

/* ============================================ 0.5.12: necessary has no switch */

test('a service in the necessary group gets NO switch, only the «always on» badge', () => {
  /* Owner finding 1: the Cloudflare card rendered a switch, stuck at OFF —
     syncGroup() only ever ran for the opt-in groups, so nothing could ever turn
     it on, and the visitor was shown a control that lied. */
  const body = serviceSource();
  assert.match(body, /var locked = cat === 'necessary';/);
  assert.match(body, /if \(!locked\) \{[\s\S]*?makeServiceSwitch\(svc, cat\)/,
    'the switch must sit behind a not-necessary guard');
  assert.match(body, /if \(locked\) name\.appendChild\(el\('span', 'ck-svc__badge', T\.alwaysOn\)\)/,
    'the badge must take the switch\u2019s place');
  // And it must not be registered, so no loop can ever write it into the map.
  const pushAt = body.indexOf('serviceSwitches[cat].push(sw)');
  const guardAt = body.indexOf('if (!locked) {');
  assert.ok(pushAt > guardAt && guardAt > -1,
    'a necessary service must never enter serviceSwitches[]');
});

/* The owner's live shape: a Cloudflare card in the «Необходимые» group. */
const NECESSARY_SVC = {
  id: 'cloudflare',
  name: 'Cloudflare',
  vendor: 'Cloudflare, Inc.',
  category: 'necessary',
  hosts: ['cf-assets.example'],
  cookies: ['__cf_bm'],
  purpose: { ru: 'Защищает сайт от перегрузки и ботов.', en: 'Protects the site from bots.' }
};

test('a necessary service cannot be denied through accept()', () => {
  const env = loadCore();
  env.CK.init({ policyVersion: '1', services: SERVICES.concat([NECESSARY_SVC]) });
  // The shape the owner's config produced: a denial aimed at a necessary id.
  env.CK.accept({ analytics: true, services: { cloudflare: false, hotjar: false } });

  assert.equal(env.CK.allowedService('cloudflare'), true,
    'a necessary service is always allowed');
  const stored = plain(env.CK.getState().services);
  assert.ok(!('cloudflare' in stored),
    'the denial map must never carry a necessary service id');
  // The refusal that IS legitimate is untouched — this is not a blanket wipe.
  assert.equal(stored.hotjar, false);
  assert.equal(env.CK.allowedService('hotjar'), false);
  assert.deepEqual(plain(env.CK._deniedServices()), ['hotjar']);
  // …and it never reaches the cookie either.
  const rec = env.record();
  assert.deepEqual(plain(rec.services), { hotjar: false });
});

test('a stored record naming a necessary service is stripped on read', () => {
  /* THE VACUOUS-PASS TRAP: testing only the accept() path would pass even if the
     filter lived nowhere near the read path. init() runs buildServices() BEFORE
     loadRecord(), which is what makes the category known in time — reverse that
     ordering and this is the test that fails. Written by hand, the way a record
     from a client that predates the fix would look. */
  const rec = {
    id: '11111111-1111-4111-8111-111111111111',
    ts: new Date().toISOString(),
    policyVersion: '1',
    categories: { necessary: true, functional: false, analytics: true, marketing: false },
    services: { cloudflare: false, hotjar: false },
    method: 'custom'
  };
  const payload = Buffer.from(JSON.stringify(rec), 'utf8').toString('base64');
  const env = loadCore({ jar: { ck_consent: payload } });
  env.CK.init({ policyVersion: '1', services: SERVICES.concat([NECESSARY_SVC]) });

  assert.equal(env.CK.allowedService('cloudflare'), true,
    'a stored denial for a necessary service must not survive the read');
  assert.deepEqual(plain(env.CK.getState().services), { hotjar: false });
  assert.deepEqual(plain(env.CK._deniedServices()), ['hotjar']);
});

test('a necessary service’s resources are never held back by a denial', () => {
  const env = loadCore();
  env.CK.init({ policyVersion: '1', services: [NECESSARY_SVC] });
  env.CK.accept({ functional: false, analytics: false, marketing: false,
                  services: { cloudflare: false } });
  assert.ok(!isBlocked(insert(env, 'script', 'https://cf-assets.example/turnstile.js')),
    'a necessary service must load whatever the denial map was asked to say');
});

test('a config with no services leaves the core with an empty registry', () => {
  const env = loadCore();
  env.CK.init({ policyVersion: '1', cookieTable: COOKIE_TABLE });
  assert.deepEqual(plain(env.CK._services()), []);
  assert.equal(env.CK._serviceForUrl('https://static.hotjar.com/x.js'), null);
  assert.deepEqual(plain(env.CK._deniedServices()), []);
  // And blocking is exactly what it was: by category, from the shipped table.
  env.CK.accept({ functional: false, analytics: true, marketing: false });
  assert.ok(!isBlocked(insert(env, 'script', 'https://static.hotjar.com/x.js')));
});

test('services are part of the remount signature', () => {
  /* Without this, a SaaS config arriving after the first mount would make the
     ENGINE block per service while the panel kept showing the service-less
     render — the visitor could see no switch for something being blocked. */
  const C = loadUi();
  assert.notEqual(C.signature({ services: SERVICES }), C.signature({}));
  assert.equal(C.serviceSignature({}), '0');
  assert.equal(C.serviceSignature({ services: [] }), '0');
  // A row the core would drop must not force a rebuild either.
  assert.equal(
    C.serviceSignature({ services: [{ id: 'a', category: 'analytics', enabled: false }] }), '0');
  // Rewording a purpose is text inside an existing row: no rebuild.
  const a = C.signature({ services: [{ id: 'x', category: 'analytics', purpose: { en: 'one' } }] });
  const b = C.signature({ services: [{ id: 'x', category: 'analytics', purpose: { en: 'two' } }] });
  assert.equal(a, b);
});

/* ============================================ the panel writes the right map */

test('readSwitches records a refusal from dataset.man, not from what is shown', () => {
  /* THE BUG THIS PINS: syncGroup() forces every service switch to
     aria-checked=false when its group goes off. Reading aria-checked would then
     record «I refused all of these» the moment the group was switched off — and
     a later save with the group off would ERASE a real refusal, so the service
     would silently run again when the group came back on. `dataset.man` is the
     visitor's decision; aria-checked is only what the switch is showing. */
  const src = UI_SRC.slice(UI_SRC.indexOf('function readSwitches'));
  const body = src.slice(0, src.indexOf('\n  function doAcceptAll'));
  assert.match(body, /b\.dataset\.man === '1'/,
    'the refusal map must be read from the hand-set flag');
  assert.doesNotMatch(body, /aria-checked[^\n]*svc|svcs\[[^\]]*\] = false;[^\n]*aria-checked/,
    'reading aria-checked for services loses a refusal when the group is off');
  assert.doesNotMatch(body, /if \(!out\[cat\]\) continue;/,
    'skipping refused groups is what erased the refusal');
});

test('syncGroup pushes the group state down but never clears dataset.man', () => {
  const src = UI_SRC.slice(UI_SRC.indexOf('function syncGroup'));
  const body = src.slice(0, src.indexOf('\n  function buildService'));
  assert.match(body, /b\.dataset\.man !== '1'/,
    'a hand-refused service must stay off when its group comes back on');
  assert.doesNotMatch(body, /dataset\.man\s*=/,
    'syncGroup must not write the hand-set flag — only the visitor and the record set it');
});

test('the placeholder button clears the refusal in the SAME accept() call', () => {
  /* The core revives blocked frames inside commit(), so a refusal still
     standing at that moment leaves the frame dead until some later consent
     change happens to run applyConsentToDom() again. */
  const src = UI_SRC.slice(UI_SRC.indexOf('function grantCategory'));
  const body = src.slice(0, src.indexOf('\n  function hideFrame'));
  const clearAt = body.indexOf('denialsWithout');
  const acceptAt = body.indexOf('ck.accept(next)');
  assert.ok(clearAt > -1 && acceptAt > -1);
  assert.ok(clearAt < acceptAt,
    'the refusal must be cleared BEFORE accept(), not after — one commit, one revival');
  assert.match(body, /next\.services = denials/,
    'the cleared map must ride along on the same accept()');
});

test('the placeholder grant keeps every OTHER refusal', () => {
  /* accept() replaces the map wholesale, so the button must copy the rest
     across — otherwise showing one video silently re-consents to everything
     else the visitor refused. */
  const env = loadCore();
  env.CK.init({ policyVersion: '1', services: SERVICES });
  env.CK.accept({
    functional: false, analytics: true, marketing: false,
    services: { hotjar: false, 'google-analytics': false }
  });

  // What grantCategory() computes, applied through the same public path.
  const stored = env.CK.getState().services;
  const svc = env.CK._serviceForUrl('https://static.hotjar.com/embed.html');
  const next = {};
  Object.keys(stored).forEach((k) => { if (k !== svc.id) next[k] = false; });
  env.CK.accept({ functional: false, analytics: true, marketing: false, services: next });

  assert.equal(env.CK.allowedService('hotjar'), true, 'the frame’s own service must be freed');
  assert.equal(env.CK.allowedService('google-analytics'), false,
    'the other refusal must survive — the button frees ONE service, not all of them');
});

/* ==================================================================== beacon */

/* ck-saas.js reads its own <script> tag and then calls CK.init(). The stub
   below ALWAYS reports a denial, so «no services field» is provably the method
   guard rather than an empty registry (the vacuous pass in the header). */
function runSaas({ method = 'custom', denied = ['hotjar'], decided = true } = {}) {
  const SAAS = readFileSync(join(REPO, 'src', 'ck-saas.js'), 'utf8');
  const posted = [];
  const tag = {
    getAttribute: (n) => (n === 'data-ck-id' ? 'site-1' : n === 'data-ck-api' ? 'https://api.test' : null)
  };
  const store = {
    'ck_cfg_site-1': JSON.stringify({
      etag: 'W/"1"',
      config: { v: 7, policyVersion: '1', log: { endpoint: 'https://api.test/v1/consent', key: 'k1' } }
    })
  };
  const listeners = {};

  const g = {};
  g.window = g;
  g.self = g;
  g.document = {
    currentScript: tag,
    querySelectorAll: () => [tag],
    addEventListener: (name, fn) => { listeners[name] = fn; }
  };
  g.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); }
  };
  g.console = { warn: () => {}, error: () => {} };
  g.navigator = {};
  g.addEventListener = () => {};
  g.setTimeout = () => 0;
  g.clearTimeout = () => {};
  /* Two different callers reach this: the background config revalidation (a
     GET, because the cache above is warm) and the beacon (a POST). Only the
     POST is what these tests are about; answering the GET with a 304 keeps the
     revalidation from either throwing on `opts.body` or replacing the config. */
  g.AbortController = function () { this.signal = null; this.abort = () => {}; };
  g.fetch = (url, opts) => {
    if (!opts || opts.method !== 'POST') {
      return Promise.resolve({ ok: true, status: 304, headers: { get: () => null } });
    }
    posted.push({ url, body: JSON.parse(opts.body) });
    return Promise.resolve({ ok: true, status: 200, headers: { get: () => null } });
  };
  const state = {
    decided,
    id: '22222222-2222-4222-8222-222222222222',
    ts: '2026-09-06T10:00:00.000Z',
    policyVersion: '1',
    categories: { necessary: true, functional: false, analytics: true, marketing: false },
    services: denied.reduce((m, id) => (m[id] = false, m), {}),
    method
  };
  g.ConsentKit = {
    version: '0.5.8',
    config: { policyVersion: '1' },
    init() { return state; },
    getState() { return state; },
    _extendHostDb() { return 0; },
    // The load-bearing half: a stub without this makes every negative below
    // pass for the wrong reason.
    _deniedServices() { return denied.slice(); }
  };

  const ctx = vm.createContext(g);
  vm.runInContext(SAAS, ctx, { filename: 'src/ck-saas.js' });

  const fire = (name) => {
    const fn = listeners[name];
    assert.ok(fn, `ck-saas.js registered no ${name} listener`);
    fn({ detail: { state } });
  };
  return { posted, fire, state };
}

test('the beacon carries `services` on a custom decision', () => {
  const env = runSaas({ method: 'custom', denied: ['hotjar'] });
  env.fire('ck:consent');
  assert.equal(env.posted.length, 1, 'nothing was posted — the harness is not wired');
  assert.deepEqual(env.posted[0].body.services, ['hotjar']);
  assert.equal(env.posted[0].body.method, 'custom');
});

test('the beacon omits `services` on accept_all and reject_all', () => {
  // Same non-empty _deniedServices stub: the absence must be the method guard.
  for (const method of ['accept_all', 'reject_all']) {
    const env = runSaas({ method, denied: ['hotjar'] });
    env.fire('ck:consent');
    assert.equal(env.posted.length, 1);
    assert.ok(!('services' in env.posted[0].body),
      `${method} must not carry a services field even when the core reports a refusal`);
  }
});

test('the beacon omits `services` on withdraw', () => {
  const env = runSaas({ method: 'custom', denied: ['hotjar'], decided: false });
  env.fire('ck:change');
  assert.equal(env.posted.length, 1);
  assert.equal(env.posted[0].body.method, 'withdraw');
  assert.ok(!('services' in env.posted[0].body),
    'a withdrawal is not a choice about services');
});

test('the beacon omits `services` rather than sending an empty array', () => {
  const env = runSaas({ method: 'custom', denied: [] });
  env.fire('ck:consent');
  assert.equal(env.posted.length, 1);
  assert.ok(!('services' in env.posted[0].body),
    'an empty array is a field the server did not need to receive');
});

test('nothing else in the beacon changes', () => {
  const env = runSaas({ method: 'custom', denied: ['hotjar'] });
  env.fire('ck:consent');
  const keys = Object.keys(env.posted[0].body).sort();
  assert.deepEqual(keys,
    ['categories', 'cfg', 'id', 'key', 'method', 'services', 'siteId', 'ts'].sort(),
    'the payload is a closed field list — `services` is the only addition');
});

/* ============================================================== debug panel */

test('the report key ignores generatedAt and nothing else', () => {
  /* «отсутствие перерисовки при неизменном отчёте». generatedAt is a fresh
     timestamp on every tick, so comparing the report as-is would never match
     and would suppress nothing at all. */
  const D = loadDebug();
  const base = { generatedAt: '2026-09-06T10:00:00Z', blocked: [], requests: [], consent: { status: 'none' } };
  const later = Object.assign({}, base, { generatedAt: '2026-09-06T10:00:03Z' });
  const changed = Object.assign({}, base, { blocked: [{ host: 'x.example' }] });

  assert.equal(D.reportKey(base), D.reportKey(later),
    'a new timestamp alone must NOT count as a change');
  assert.notEqual(D.reportKey(base), D.reportKey(changed),
    'a real change must still redraw');
});

test('render() suppresses the redraw when the key is unchanged', () => {
  const src = DEBUG_SRC.slice(DEBUG_SRC.indexOf('function render(force)'));
  const head = src.slice(0, src.indexOf('body.textContent'));
  assert.match(head, /key === renderKey/, 'render must compare the key before rebuilding');
  assert.match(head, /return;/, 'and return without touching the DOM when it matches');
  assert.match(head, /langBefore !== T|langBefore === T/,
    'a language switch changes every string without changing the report — it must still redraw');
});

test('render() saves the scroll before clearing and restores it after', () => {
  /* «панель отладки при прокрутке вниз прыгает обратно (render() очищает
     body)». Source order is what is being asserted: the read must precede the
     clear (an emptied body reports 0) and the write must follow the last
     append. */
  const src = DEBUG_SRC.slice(DEBUG_SRC.indexOf('function render(force)'));
  const body = src.slice(0, src.indexOf('\n  function schedule'));

  const readAt = body.indexOf('scrollTop = body.scrollTop');
  const clearAt = body.indexOf("body.textContent = ''");
  const writeAt = body.indexOf('body.scrollTop = scrollTop');
  const lastAppend = body.lastIndexOf('body.appendChild');

  assert.ok(readAt > -1, 'render() does not read body.scrollTop');
  assert.ok(writeAt > -1, 'render() does not restore body.scrollTop');
  assert.ok(readAt < clearAt, 'the scroll must be read BEFORE the body is emptied');
  assert.ok(writeAt > lastAppend, 'the scroll must be restored AFTER the content is back');
});

test('every «до согласия» row gets one of the four notes, and later rows get none', () => {
  const D = loadDebug();
  const requests = [
    { host: 'held.example', path: '/a', when: 'before', category: 'analytics', at: 5, count: 1 },
    { host: 'dead.example', path: '/b', when: 'before', category: 'analytics', at: 6, count: 1 },
    { host: 'early.example', path: '/c', when: 'before', category: 'marketing', at: 7, count: 1 },
    { host: 'after.example', path: '/d', when: 'after', category: 'analytics', at: 99, count: 1 }
  ];
  const blocked = [
    { host: 'held.example', revived: true },
    { host: 'dead.example', revived: false }
  ];

  // `why || null`, not the raw value: JSON round-tripping an array turns a
  // trailing `undefined` into `null`, and the "no note" case is the point of
  // the last row.
  const whys = (list) => plain(list.map((r) => r.why || null));

  assert.deepEqual(whys(D.explainRequests(requests, blocked, [])),
    ['held', 'dead', 'early', null],
    'a row the engine caught is «задержан», one that never came back is «не ожил», ' +
    'an untouched one ran before the banner line, and an after-consent row needs no note');

  // With Consent Mode denied, an untouched row is «без cookie», not «раньше строки».
  const gcm = [{ type: 'gtag consent default', signals: { analytics_storage: 'denied', ad_storage: 'denied' } }];
  assert.deepEqual(whys(D.explainRequests(requests, blocked, gcm)),
    ['held', 'dead', 'gcm', null]);
});

test('a necessary host gets no note at all', () => {
  /* A `necessary` host is never held back, so it is in no `blocked` record —
     and every note would then be a lie about it: «раньше строки баннера» (we
     never wanted to hold it) or, on any page where Consent Mode defaults to
     denied, «Consent Mode: без cookie, но адрес…». Sending the owner off to chase
     __cf_bm is exactly the noise §3 exists to remove. */
  const D = loadDebug();
  const requests = [
    { host: 'infra.example', path: '/a', when: 'before', category: 'necessary', at: 1, count: 1 },
    { host: 'ga.example', path: '/b', when: 'before', category: 'analytics', at: 2, count: 1 }
  ];
  const gcm = [{ type: 'gtag consent default', signals: { analytics_storage: 'denied', ad_storage: 'denied' } }];

  const withGcm = D.explainRequests(requests, [], gcm);
  assert.equal(withGcm[0].why, undefined, 'a necessary row must carry no note');
  assert.equal(withGcm[1].why, 'gcm', '…while the opt-in row beside it still does');

  // …and with no Consent Mode either, where the fallback would be «early».
  const plainRun = D.explainRequests(requests, [], []);
  assert.equal(plainRun[0].why, undefined);
  assert.equal(plainRun[1].why, 'early');
});

test('a service may declare category necessary, and its rows stay unannotated', () => {
  // Proves the rule above without depending on which hosts HOST_DB happens to
  // file as necessary: §2 allows all four categories on a service row.
  const env = loadCore();
  env.CK.init({
    policyVersion: '1',
    services: [{
      id: 'cf', name: 'Cloudflare', vendor: 'Cloudflare', category: 'necessary',
      hosts: ['cf-probe.example'], cookies: ['__cf_bm']
    }]
  });
  assert.equal(env.CK._categoryForUrl('https://cf-probe.example/x'), 'necessary');
  // A necessary host is never withheld, whatever the consent state.
  assert.ok(!isBlocked(insert(env, 'script', 'https://cf-probe.example/x.js')));

  const D = loadDebug();
  const row = { host: 'cf-probe.example', path: '/x.js', when: 'before', category: 'necessary', at: 1, count: 1 };
  assert.equal(D.explainRequests([row], [], [])[0].why, undefined);
});

test('explainRequests leaves every existing field of a row intact', () => {
  const D = loadDebug();
  const row = { host: 'x.example', path: '/p', when: 'before', category: 'analytics', at: 3, kind: 'script', count: 2 };
  const out = D.explainRequests([row], [], [])[0];
  for (const k of Object.keys(row)) assert.equal(out[k], row[k], `field ${k} was lost`);
  assert.equal(out.why, 'early');
  // And the input is not mutated: buildReport hands out fresh rows.
  assert.ok(!('why' in row), 'explainRequests must not write back into its input');
});

test('the four notes and the cabinet line exist in ru, ro and en', () => {
  const D = loadDebug();
  const keys = Object.values(D.whyKeys).concat(['cabinet']);
  for (const lang of ['ru', 'ro', 'en']) {
    const S = D.strings[lang];
    assert.ok(S, `ck-debug.js has no ${lang} strings`);
    for (const k of keys) {
      assert.equal(typeof S[k], 'string', `${lang}.${k} is missing`);
      assert.ok(S[k].length > 0, `${lang}.${k} is empty`);
    }
  }
  // Distinct wording, not the same sentence three times.
  assert.notEqual(D.strings.ru.whyEarly, D.strings.en.whyEarly);
  assert.notEqual(D.strings.ro.whyEarly, D.strings.en.whyEarly);
});

test('the ro panel dictionary is complete, not half-translated', () => {
  const D = loadDebug();
  const en = plain(Object.keys(D.strings.en).sort());
  const ro = plain(Object.keys(D.strings.ro).sort());
  assert.deepEqual(ro, en, 'ro must carry exactly the keys en does');
});

test('pickLang resolves ro (and the legacy mo tag) to the ro panel', () => {
  const D = loadDebug();
  assert.equal(D.pickLang('ro', ''), 'ro');
  assert.equal(D.pickLang('auto', 'ro-RO'), 'ro');
  assert.equal(D.pickLang('auto', 'mo-MD'), 'ro');
  assert.equal(D.pickLang('ru', ''), 'ru');
  assert.equal(D.pickLang('de', ''), 'en');
});

test('the embed placeholder names the SERVICE when a refusal is what holds it', () => {
  /* The state this wave introduces: analytics granted, Hotjar refused, the
     frame still held. Naming the category there would read «загрузится после
     согласия на "Аналитика"» to a visitor who has already agreed to analytics. */
  const C = loadUi();
  const byCategory = C.placeholderText('youtube.com', 'marketing', 'ru');
  assert.match(byCategory, /Маркетинг/, '0.5.7 behaviour: the category names itself');

  const byService = C.placeholderText('hotjar.com', 'analytics', 'ru', 'Hotjar');
  assert.match(byService, /Hotjar/, 'the refused service must be what the sentence asks for');
  assert.doesNotMatch(byService, /Аналитика/,
    'naming a category the visitor already granted is the bug this fixes');

  // An empty or absent subject falls back to the category, so nothing changes
  // for a frame held the ordinary way.
  assert.equal(C.placeholderText('youtube.com', 'marketing', 'ru', ''), byCategory);
  assert.equal(C.placeholderText('youtube.com', 'marketing', 'ru', null), byCategory);
});

test('the placeholder asks the core which service is holding the frame', () => {
  /* holdingService() must answer null unless the SERVICE is the reason: with
     the category still denied, the category is the honest thing to name,
     because freeing the service alone would not bring the frame back. */
  const src = UI_SRC.slice(UI_SRC.indexOf('function holdingService'));
  const body = src.slice(0, src.indexOf('\n  /* ------'));
  assert.match(body, /ck\.allowed\(svc\.category\)/,
    'a frame whose category is still denied must name the category, not the service');
  assert.match(body, /ck\.allowedService\(svc\.id\)/,
    'the refusal is what decides');

  const build = UI_SRC.slice(UI_SRC.indexOf('function buildPlaceholder'));
  const region = build.slice(0, build.indexOf('\n  /* «Разрешить и показать»'));
  assert.match(region, /held \? held\.name : null/,
    'buildPlaceholder must pass the service name through to placeholderText');
});

/* ====================================================== pinned interactions */

test('a service host that is also infrastructure becomes blockable', () => {
  /* PINNED, not fixed. buildServices() folds service hosts into EXTRA_DB, and
     isInfraHost() treats anything with a category as NOT infrastructure. So a
     site that declares `forms.tildaapi.one` as a service stops treating it as
     the builder's own asset delivery and starts holding it until consent.

     That is what §2 literally asks for — «клиент расширяет карту блокировки
     хостами сервисов из конфига» — and the owner declaring it as a service IS
     the decision. Recorded here so the behaviour is deliberate rather than
     discovered on a live Tilda site. */
  const env = loadCore();
  assert.equal(env.CK._isInfra('forms.tildaapi.one'), true,
    'the fixture host must be infrastructure BEFORE the config names it');

  env.CK.init({
    policyVersion: '1',
    services: [{
      id: 'tilda-forms', name: 'Tilda Forms', vendor: 'Tilda', category: 'functional',
      hosts: ['forms.tildaapi.one'], cookies: ['tildasid']
    }]
  });

  assert.equal(env.CK._isInfra('forms.tildaapi.one'), false,
    'declaring a host as a service gives it a category, and a categorised host is not infrastructure');
  assert.equal(env.CK._categoryForUrl('https://forms.tildaapi.one/x'), 'functional');
  assert.ok(isBlocked(insert(env, 'script', 'https://forms.tildaapi.one/x.js')),
    'it is now held until functional consent');
});

test('the config caps the registry at 50 services', () => {
  const env = loadCore();
  const many = [];
  for (let i = 0; i < 60; i++) {
    many.push({ id: 'svc-' + i, name: 'S' + i, vendor: 'V', category: 'analytics',
      hosts: ['h' + i + '.example'], cookies: [] });
  }
  env.CK.init({ policyVersion: '1', services: many });
  assert.equal(env.CK._services().length, 50);
  assert.equal(env.CK._serviceForUrl('https://h49.example/a.js').id, 'svc-49');
  assert.equal(env.CK._serviceForUrl('https://h50.example/a.js'), null);
});
