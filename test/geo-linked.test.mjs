/* SPEC V1.19 — geo rules (§1) and one consent across domains (§2).
 *
 * Three features that all decide something BEFORE the banner would appear, so
 * every one of them is only observable through what the core did to its state,
 * its cookies and its events by the time init() returns.
 *
 * Two things this suite needs that no other harness in the repo provides:
 *
 *  1. A REAL cookie jar. Everywhere else `document.cookie` is a plain string,
 *     so a write replaces the whole jar. §2.1 is entirely about which `domain=`
 *     a browser ACCEPTS, and a browser signals refusal by silently dropping the
 *     write — there is no exception to catch. The jar below therefore models
 *     acceptance explicitly (`acceptDomains`) and, crucially, ACCEPTS THE WRITE
 *     AND DISCARDS IT for anything else, which is the behaviour the probe in
 *     shareDomain() has to detect by reading back.
 *
 *  2. A referrer, a history and a hash. §2.2 adopts a decision from a URL
 *     fragment, and every guard on that path (ts window, referrer host, payload
 *     shape) is a reason to REFUSE — so the tests that matter are the negative
 *     ones, and each has to be able to fail for its own single reason.
 *
 * THE VACUOUS-PASS TRAP, twice over:
 *   - "the banner is hidden" and "the core never ran" look identical from the
 *     outside. Every geo test therefore also asserts that consent was GRANTED,
 *     which only a core that actually reached applyGeoGrant() can produce.
 *   - "the fragment was rejected" and "the fragment was never read" look
 *     identical too. The malformed/expired/bad-referrer tests are each paired
 *     with a positive control built from the same helper, so a harness that
 *     silently stopped feeding fragments in fails the positive instead of
 *     passing all four.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CORE = readFileSync(join(REPO, 'src', 'ck-core.js'), 'utf8');
const SAAS = readFileSync(join(REPO, 'src', 'ck-saas.js'), 'utf8');

/* ----------------------------------------------------------------- cookie jar */

/**
 * A document.cookie that behaves like a browser's.
 *
 * `acceptDomains` is the set of `domain=` values this "browser" will honour;
 * anything else is parsed, looks successful to the caller and is then thrown
 * away — exactly how a real browser treats `domain=co.uk` on example.co.uk.
 * A write with no domain always lands.
 */
function cookieJar({ acceptDomains = [] } = {}) {
  const jar = new Map();               // name -> { value, domain }
  const ok = new Set(acceptDomains.map((d) => d.replace(/^\./, '')));
  const writes = [];                   // every raw string written, for assertions

  return {
    writes,
    jar,
    get cookie() {
      return [...jar].map(([n, v]) => `${n}=${v.value}`).join('; ');
    },
    set cookie(str) {
      writes.push(String(str));
      const parts = String(str).split(';').map((p) => p.trim());
      const [pair, ...attrs] = parts;
      const eq = pair.indexOf('=');
      const name = eq > -1 ? pair.slice(0, eq) : pair;
      const value = eq > -1 ? pair.slice(eq + 1) : '';

      let domain = null;
      let expires = null;
      for (const a of attrs) {
        const i = a.indexOf('=');
        const k = (i > -1 ? a.slice(0, i) : a).toLowerCase();
        const v = i > -1 ? a.slice(i + 1) : '';
        if (k === 'domain') { domain = v; }
        if (k === 'expires') { expires = Date.parse(v); }
      }

      // A domain the browser refuses: the write is a silent no-op. This is the
      // single most load-bearing line in the file — shareDomain() detects
      // refusal ONLY by reading the cookie back and not finding it.
      if (domain && !ok.has(domain.replace(/^\./, ''))) { return; }

      // Past expiry is a delete, and it must respect the same domain rule.
      if (expires !== null && isFinite(expires) && expires <= Date.now()) {
        const held = jar.get(name);
        if (held && (held.domain || null) === (domain || null)) { jar.delete(name); }
        return;
      }
      jar.set(name, { value, domain: domain || null });
    }
  };
}

/* --------------------------------------------------------------------- stub DOM */

function makeElement(tagName, doc, g) {
  const attrs = new Map();
  const el = {
    tagName: tagName.toUpperCase(),
    nodeType: 1,
    ownerDocument: doc,
    parentNode: null,
    childNodes: [],
    attributes: [],
    _src: '',
    getAttribute(n) { const k = String(n).toLowerCase(); return attrs.has(k) ? attrs.get(k) : null; },
    _set(n, v) {
      const k = String(n).toLowerCase();
      attrs.set(k, String(v));
      el.attributes = [...attrs].map(([name, value]) => ({ name, value }));
    },
    _remove(n) { attrs.delete(String(n).toLowerCase()); },
    setAttribute(n, v) { return g.Element.prototype.setAttribute.call(el, n, v); },
    removeAttribute(n) { return el._remove(n); },
    hasAttribute(n) { return attrs.has(String(n).toLowerCase()); },
    querySelectorAll() { return []; },
    appendChild(c) { c.parentNode = el; el.childNodes.push(c); return c; },
    insertBefore(c) { c.parentNode = el; el.childNodes.push(c); return c; },
    removeChild(c) {
      const i = el.childNodes.indexOf(c);
      if (i > -1) { el.childNodes.splice(i, 1); }
      c.parentNode = null;
      return c;
    }
  };
  return el;
}

/**
 * Loads src/ck-core.js against a stub window.
 *
 *   href          — the page URL (its hostname drives the cookie-domain probe)
 *   hash          — location.hash, where a §2.2 fragment arrives
 *   referrer      — document.referrer, the §2.2 origin check
 *   country       — pre-seeds ConsentKit._geo the way ck-saas.js does
 *   acceptDomains — which `domain=` values the fake browser honours
 *   cookies       — name -> value already in the jar (a stored decision)
 */
function loadCore({
  href = 'https://shop.example.com/page',
  hash = '',
  referrer = '',
  country = null,
  acceptDomains = [],
  cookies = {},
  localStorage: lsSeed = null
} = {}) {
  const g = Object.create(null);
  const events = [];
  const jar = cookieJar({ acceptDomains });
  for (const [k, v] of Object.entries(cookies)) { jar.jar.set(k, { value: v, domain: null }); }

  const listeners = {};
  const doc = {
    _all: [],
    referrer,
    createElement(tag) { const el = makeElement(tag, doc, g); doc._all.push(el); return el; },
    querySelectorAll(sel) {
      return doc._all.filter((el) => {
        const t = el.tagName.toLowerCase();
        if (sel === 'script[src]') { return t === 'script' && el.getAttribute('src'); }
        if (sel === 'iframe[src]') { return t === 'iframe' && el.getAttribute('src'); }
        return false;
      });
    },
    addEventListener(name, fn, capture) { (listeners[name] = listeners[name] || []).push({ fn, capture }); },
    dispatchEvent(ev) { events.push({ type: ev.type, detail: ev.detail }); return true; },
    documentElement: null,
    body: null
  };
  Object.defineProperty(doc, 'cookie', {
    get() { return jar.cookie; },
    set(v) { jar.cookie = v; }
  });
  doc.body = makeElement('body', doc, g);
  doc._all.push(doc.body);

  function srcProto() {
    const P = function () {};
    Object.defineProperty(P.prototype, 'src', {
      configurable: true, enumerable: true,
      get() { return this._src || ''; },
      set(v) { this._src = String(v); this._set('src', String(v)); }
    });
    return P;
  }

  const url = new URL(href);
  const replaced = [];
  const store = { ...(lsSeed || {}) };

  g.window = g;
  g.self = g;
  g.document = doc;
  g.location = {
    href, hostname: url.hostname, pathname: url.pathname, search: url.search, hash
  };
  g.history = {
    replaceState(a, b, u) { replaced.push(u); g.location.hash = String(u).includes('#') ? '#' + String(u).split('#')[1] : ''; }
  };
  g.HTMLScriptElement = srcProto();
  g.HTMLIFrameElement = srcProto();
  g.Element = function () {};
  g.Element.prototype.setAttribute = function (n, v) { return this._set(n, v); };
  g.Element.prototype.removeAttribute = function (n) { return this._remove(n); };
  g.URL = URL;
  g.Buffer = Buffer;
  g.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  };
  // The core dispatches through a CustomEvent it constructs itself.
  g.CustomEvent = function (type, init) { this.type = type; this.detail = init && init.detail; };
  g.dataLayer = [];

  const ctx = vm.createContext(g);
  vm.runInContext(CORE, ctx, { filename: 'src/ck-core.js' });

  const CK = g.ConsentKit;
  assert.ok(CK, 'src/ck-core.js did not attach ConsentKit');
  assert.equal(g.location.hostname, url.hostname, 'the stub lost its hostname');
  if (country) { CK._geo = { country }; }

  return {
    CK, g, doc, jar, events, store, replaced, listeners,
    // Fires a capture-phase click on `el`, the way a browser would.
    click(el) {
      for (const { fn, capture } of (listeners.click || [])) {
        if (capture) { fn({ target: el }); }
      }
    },
    anchor(href2) {
      const a = makeElement('a', doc, g);
      a._set('href', href2);
      doc.body.appendChild(a);
      return a;
    },
    // The ck:init the core dispatched, which is what ck-ui.js would mount on.
    initEvent() { return events.filter((e) => e.type === 'ck:init').pop() || null; }
  };
}

// base64url, matching the encoder in the core.
const b64url = (obj) => Buffer.from(JSON.stringify(obj), 'utf8').toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fragment = ({
  v = 1,
  ts = Date.now(),
  categories = { functional: true, analytics: true, marketing: false },
  services,
  raw
} = {}) => 'ck_consent=' + (raw !== undefined ? raw : b64url({ v, ts, state: { categories, services } }));

/* ================================================================== §1 geo */

const GEO_LIST = { geo: { mode: 'list', countries: ['MD', 'DE'] } };

test('§1 in scope: a country on the list gets the banner and no grant', () => {
  const env = loadCore({ country: 'MD' });
  env.CK.init(GEO_LIST);

  assert.equal(env.CK._geo.inScope, true);
  assert.equal(env.CK._geo.country, 'MD');
  const s = env.CK.getState();
  assert.equal(s.decided, false, 'an in-scope visitor has decided nothing');
  assert.equal(s.categories.analytics, false, 'nothing may be granted before the banner');
  assert.equal(s.method, null);
});

test('§1 out of scope: no banner, everything granted, nothing persisted', () => {
  const env = loadCore({ country: 'FR' });
  env.CK.init(GEO_LIST);

  assert.equal(env.CK._geo.inScope, false, 'FR is not on the list');
  const s = env.CK.getState();
  // The grant is the half that makes "no banner" legitimate rather than broken:
  // trackers must actually run for this visitor.
  assert.equal(s.categories.analytics, true);
  assert.equal(s.categories.marketing, true);
  assert.equal(s.categories.functional, true);
  assert.equal(env.CK.allowed('analytics'), true, 'the blocking engine must let analytics through');
  // …and `decided` stays false, so getState() does not claim a choice nobody made.
  assert.equal(s.decided, false, 'a geo grant is not a decision the visitor made');
  assert.equal(s.method, 'geo');
  assert.equal(s.id, null);
  assert.equal(s.ts, null);
});

test('§1 out of scope writes NOTHING to cookie or localStorage', () => {
  const env = loadCore({ country: 'FR', acceptDomains: ['example.com'] });
  env.CK.init(GEO_LIST);

  assert.equal(env.jar.jar.has('ck_consent'), false,
    'a geo grant must leave no consent cookie — the visitor must see the banner in the EU');
  assert.equal(env.store.ck_consent, undefined,
    'a geo grant must leave no localStorage record');
});

test('§1 unknown country shows the banner', () => {
  // No x-ck-country at all: a standalone page, or CORS not exposing the header.
  const env = loadCore({ country: null });
  env.CK.init(GEO_LIST);

  assert.equal(env.CK._geo.inScope, true, 'unknown country must fall to the safe side');
  assert.equal(env.CK.getState().categories.analytics, false);
});

test('§1 the country match is case-insensitive', () => {
  for (const [country, list, inScope] of [
    ['md', ['MD'], true],
    ['MD', ['md'], true],
    ['fr', ['MD'], false]
  ]) {
    const env = loadCore({ country });
    env.CK.init({ geo: { mode: 'list', countries: list } });
    assert.equal(env.CK._geo.inScope, inScope, `${country} against ${list}`);
  }
});

test("§1 mode 'all' (and an absent geo block) is always in scope", () => {
  for (const cfg of [{}, { geo: { mode: 'all' } }, { geo: { mode: 'all', countries: ['MD'] } }]) {
    const env = loadCore({ country: 'FR' });
    env.CK.init(cfg);
    assert.equal(env.CK._geo.inScope, true, JSON.stringify(cfg));
    assert.equal(env.CK.getState().method, null, 'no grant when everyone is in scope');
  }
});

test('§1 an empty country list cannot hide the banner from everyone', () => {
  const env = loadCore({ country: 'FR' });
  env.CK.init({ geo: { mode: 'list', countries: [] } });
  assert.equal(env.CK._geo.inScope, true,
    'an empty list is a misconfiguration, and the safe reading is "show it"');
});

test('§1 a stored decision beats the geo rule', () => {
  // A visitor who chose "reject" and then travelled must keep their refusal —
  // an out-of-scope grant would silently overturn it.
  const rec = Buffer.from(JSON.stringify({
    id: '11111111-1111-4111-8111-111111111111',
    ts: new Date().toISOString(),
    policyVersion: '1',
    categories: { necessary: true, functional: false, analytics: false, marketing: false },
    method: 'reject_all'
  }), 'utf8').toString('base64');

  const env = loadCore({ country: 'FR', cookies: { ck_consent: rec } });
  env.CK.init(GEO_LIST);

  const s = env.CK.getState();
  assert.equal(s.decided, true);
  assert.equal(s.method, 'reject_all', 'the geo grant must not overwrite a real decision');
  assert.equal(s.categories.analytics, false);
});

test('§1 ck:init reports the geo state, so ck-ui can skip the banner', () => {
  const env = loadCore({ country: 'FR' });
  env.CK.init(GEO_LIST);
  const ev = env.initEvent();
  assert.ok(ev, 'the core did not dispatch ck:init');
  assert.equal(ev.detail.state.decided, false);
  assert.equal(env.CK._geo.inScope, false,
    'ck-ui reads _geo, not the event — it must be set by the time ck:init fires');
});

/* ============================================================ §2.1 subdomains */

test('§2.1 default (shareSubdomains off) writes the cookie with no domain', () => {
  const env = loadCore({ href: 'https://shop.example.com/p', acceptDomains: ['example.com'] });
  env.CK.init({});
  env.CK.accept('all');

  const held = env.jar.jar.get('ck_consent');
  assert.ok(held, 'no consent cookie was written');
  assert.equal(held.domain, null, 'the default path must stay byte-identical to 0.5.16');
  assert.ok(!env.jar.writes.some((w) => w.includes('ck_probe')),
    'the domain probe must not run at all when the feature is off');
});

test('§2.1 on: the cookie lands on the registrable domain', () => {
  const env = loadCore({ href: 'https://shop.example.com/p', acceptDomains: ['example.com'] });
  env.CK.init({ consent: { shareSubdomains: true } });
  env.CK.accept('all');

  const held = env.jar.jar.get('ck_consent');
  assert.ok(held, 'no consent cookie was written');
  assert.equal(held.domain, '.example.com',
    'blog.example.com must be able to read what shop.example.com wrote');
});

test('§2.1 a public suffix is skipped: shortest ACCEPTED wins, not shortest tried', () => {
  /* The browser refuses `.co.uk` silently. Trying longest-first would stop at
     the full host and share nothing; trying shortest-first without honouring
     the refusal would set an unusable cookie. Only "shortest that reads back"
     produces .example.co.uk. */
  const env = loadCore({
    href: 'https://a.b.example.co.uk/p',
    acceptDomains: ['example.co.uk', 'b.example.co.uk']
  });
  env.CK.init({ consent: { shareSubdomains: true } });
  env.CK.accept('all');

  assert.equal(env.jar.jar.get('ck_consent').domain, '.example.co.uk');
});

test('§2.1 the probe cookie never survives', () => {
  const env = loadCore({ href: 'https://shop.example.com/p', acceptDomains: ['example.com'] });
  env.CK.init({ consent: { shareSubdomains: true } });
  env.CK.accept('all');
  assert.equal(env.jar.jar.has('ck_probe'), false,
    'the domain probe left a stray cookie on the visitor');
});

test('§2.1 localhost and IP literals get no domain at all', () => {
  for (const href of ['http://localhost:3000/p', 'http://127.0.0.1/p']) {
    const env = loadCore({ href, acceptDomains: ['localhost', '127.0.0.1'] });
    env.CK.init({ consent: { shareSubdomains: true } });
    env.CK.accept('all');
    const held = env.jar.jar.get('ck_consent');
    assert.ok(held, `${href}: no cookie`);
    assert.equal(held.domain, null, `${href}: a domain= on an IP/localhost is invalid`);
  }
});

test('§2.1 when no candidate is accepted the cookie is written host-only', () => {
  // Nothing in acceptDomains, so every probe is dropped — the fallback must be
  // the 0.5.16 behaviour rather than an unusable cookie or a throw.
  const env = loadCore({ href: 'https://shop.example.com/p', acceptDomains: [] });
  env.CK.init({ consent: { shareSubdomains: true } });
  env.CK.accept('all');
  const held = env.jar.jar.get('ck_consent');
  assert.ok(held, 'the fallback must still write a cookie');
  assert.equal(held.domain, null);
});

test('§2.1 reading prefers the record with the newer ts', () => {
  const mk = (ts, analytics) => Buffer.from(JSON.stringify({
    id: '11111111-1111-4111-8111-111111111111',
    ts, policyVersion: '1',
    categories: { necessary: true, functional: false, analytics, marketing: false },
    method: 'custom'
  }), 'utf8').toString('base64');

  const older = new Date(Date.now() - 60000).toISOString();
  const newer = new Date().toISOString();

  // localStorage newer than the cookie: with sharing on, localStorage wins.
  const on = loadCore({
    href: 'https://shop.example.com/p',
    acceptDomains: ['example.com'],
    cookies: { ck_consent: mk(older, false) },
    localStorage: { ck_consent: mk(newer, true) }
  });
  on.CK.init({ consent: { shareSubdomains: true } });
  assert.equal(on.CK.getState().categories.analytics, true,
    'a sibling subdomain wrote the cookie earlier; this origin decided later');

  // The same jar with the feature OFF keeps the old cookie-first precedence.
  const off = loadCore({
    href: 'https://shop.example.com/p',
    cookies: { ck_consent: mk(older, false) },
    localStorage: { ck_consent: mk(newer, true) }
  });
  off.CK.init({});
  assert.equal(off.CK.getState().categories.analytics, false,
    'with the feature off the cookie must still win unconditionally');
});

/* ========================================================= §2.2 linked domains */

const LINKED = { consent: { linkedDomains: ['partner.example', 'other.test'] } };

test('§2.2 a valid fragment is adopted as a persisted decision', () => {
  const env = loadCore({
    href: 'https://shop.example.com/p',
    hash: '#' + fragment({ categories: { functional: true, analytics: true, marketing: false } }),
    referrer: 'https://partner.example/checkout'
  });
  env.CK.init(LINKED);

  const s = env.CK.getState();
  assert.equal(s.decided, true, 'the fragment was not adopted');
  assert.equal(s.method, 'linked');
  assert.equal(s.categories.analytics, true);
  assert.equal(s.categories.marketing, false, 'a false in the payload stays false');
  // Persisted, unlike a geo grant: this IS the visitor's decision.
  assert.ok(env.jar.jar.get('ck_consent'), 'an adopted decision must be stored');
  assert.ok(env.store.ck_consent, 'an adopted decision must reach localStorage');
});

test('§2.2 the fragment is stripped from the address bar after adoption', () => {
  const env = loadCore({
    href: 'https://shop.example.com/p',
    hash: '#' + fragment(),
    referrer: 'https://partner.example/'
  });
  env.CK.init(LINKED);
  assert.equal(env.replaced.length, 1, 'history.replaceState was not called');
  assert.ok(!env.replaced[0].includes('ck_consent'), 'the fragment survived the strip');
});

test('§2.2 stripping keeps the rest of the fragment', () => {
  const env = loadCore({
    href: 'https://shop.example.com/p',
    hash: '#section=pricing&' + fragment(),
    referrer: 'https://partner.example/'
  });
  env.CK.init(LINKED);
  assert.match(env.replaced[0], /#section=pricing$/,
    "a site's own deep link must survive — this is not ck-ui's whole-hash strip");
});

test('§2.2 an EXPIRED fragment is ignored', () => {
  const stale = Date.now() - 11 * 60 * 1000;   // the window is 10 minutes
  const env = loadCore({
    href: 'https://shop.example.com/p',
    hash: '#' + fragment({ ts: stale }),
    referrer: 'https://partner.example/'
  });
  env.CK.init(LINKED);
  assert.equal(env.CK.getState().decided, false, 'an 11-minute-old fragment must not be adopted');
});

test('§2.2 a FUTURE-dated fragment is ignored', () => {
  const env = loadCore({
    href: 'https://shop.example.com/p',
    hash: '#' + fragment({ ts: Date.now() + 60 * 60 * 1000 }),
    referrer: 'https://partner.example/'
  });
  env.CK.init(LINKED);
  assert.equal(env.CK.getState().decided, false,
    'a fabricated far-future ts is as wrong as an expired one');
});

test('§2.2 a fragment from an UNLISTED referrer is ignored', () => {
  const env = loadCore({
    href: 'https://shop.example.com/p',
    hash: '#' + fragment(),
    referrer: 'https://evil.example.org/landing'
  });
  env.CK.init(LINKED);
  assert.equal(env.CK.getState().decided, false, 'only a linked host may hand over a decision');
});

test('§2.2 an EMPTY referrer is accepted (strict Referrer-Policy)', () => {
  const env = loadCore({
    href: 'https://shop.example.com/p',
    hash: '#' + fragment(),
    referrer: ''
  });
  env.CK.init(LINKED);
  assert.equal(env.CK.getState().decided, true,
    'a same-company navigation under a strict policy sends no referrer');
});

test('§2.2 a subdomain of a linked host is a valid referrer', () => {
  const env = loadCore({
    href: 'https://shop.example.com/p',
    hash: '#' + fragment(),
    referrer: 'https://www.partner.example/checkout'
  });
  env.CK.init(LINKED);
  assert.equal(env.CK.getState().decided, true);
});

test('§2.2 malformed fragments are ignored silently', () => {
  const bad = [
    fragment({ raw: 'not-base64-@@@' }),
    fragment({ raw: Buffer.from('{"nope":1}').toString('base64') }),
    fragment({ v: 2 }),                                        // wrong version
    fragment({ categories: { functional: 'yes', analytics: true, marketing: false } }),
    fragment({ categories: { analytics: true } }),             // incomplete
    fragment({ raw: '' })
  ];
  for (const f of bad) {
    const env = loadCore({
      href: 'https://shop.example.com/p', hash: '#' + f, referrer: 'https://partner.example/'
    });
    env.CK.init(LINKED);
    assert.equal(env.CK.getState().decided, false, `adopted a malformed payload: ${f.slice(0, 40)}`);
    // And the page still works: the banner would show, nothing threw.
    assert.ok(env.initEvent(), 'ck:init did not fire after a bad fragment');
  }
});

test('§2.2 a fragment is ignored when the site declares no linked domains', () => {
  const env = loadCore({
    href: 'https://shop.example.com/p',
    hash: '#' + fragment(),
    referrer: 'https://partner.example/'
  });
  env.CK.init({});   // no consent.linkedDomains
  assert.equal(env.CK.getState().decided, false);
});

test('§2.2 an adopted decision carries the service denials', () => {
  const env = loadCore({
    href: 'https://shop.example.com/p',
    hash: '#' + fragment({ services: { hotjar: false } }),
    referrer: 'https://partner.example/'
  });
  env.CK.init({
    consent: LINKED.consent,
    services: [{ id: 'hotjar', name: 'Hotjar', category: 'analytics', hosts: ['hotjar.com'] }]
  });
  assert.equal(env.CK.getState().decided, true);
  assert.deepEqual(Array.prototype.slice.call(env.CK._deniedServices()), ['hotjar']);
});

test('§2.2 an adopted grant still respects a category disabled in config', () => {
  const env = loadCore({
    href: 'https://shop.example.com/p',
    hash: '#' + fragment({ categories: { functional: true, analytics: true, marketing: true } }),
    referrer: 'https://partner.example/'
  });
  env.CK.init({
    consent: LINKED.consent,
    categories: { marketing: { enabled: false } }
  });
  assert.equal(env.CK.getState().categories.marketing, false,
    'a linked payload cannot grant a category this site does not run');
});

/* --------------------------------------------------------- fragment on click */

function decided(env, cfg = LINKED) {
  env.CK.init(cfg);
  env.CK.accept('all');
  return env;
}

test('§2.2 a click on a linked host gets the fragment appended', () => {
  const env = decided(loadCore({ href: 'https://shop.example.com/p' }));
  const a = env.anchor('https://partner.example/cart');
  env.click(a);

  const href = a.getAttribute('href');
  assert.match(href, /#ck_consent=/, 'no fragment was appended to a linked link');
  // …and it decodes to this visitor's actual decision.
  const raw = href.split('#ck_consent=')[1];
  const json = JSON.parse(Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  assert.equal(json.v, 1);
  assert.equal(json.state.categories.analytics, true);
  assert.ok(Math.abs(Date.now() - json.ts) < 5000, 'the payload ts must be now');
});

test('§2.2 subdomains of a linked host are covered; other hosts are not', () => {
  const env = decided(loadCore({ href: 'https://shop.example.com/p' }));
  const yes = env.anchor('https://www.partner.example/cart');
  const no = env.anchor('https://unrelated.example.org/page');
  const self = env.anchor('/local/page');
  env.click(yes); env.click(no); env.click(self);

  assert.match(yes.getAttribute('href'), /#ck_consent=/);
  assert.equal(no.getAttribute('href'), 'https://unrelated.example.org/page',
    'a link to an unlisted host must be left exactly as the author wrote it');
  assert.equal(self.getAttribute('href'), '/local/page', 'a same-site link needs no fragment');
});

test('§2.2 nothing is appended before a decision exists', () => {
  const env = loadCore({ href: 'https://shop.example.com/p' });
  env.CK.init(LINKED);          // no accept()
  const a = env.anchor('https://partner.example/cart');
  env.click(a);
  assert.equal(a.getAttribute('href'), 'https://partner.example/cart',
    'there is no consent to carry yet');
});

test('§2.2 the fragment merges with an existing one and replaces a stale copy', () => {
  const env = decided(loadCore({ href: 'https://shop.example.com/p' }));

  const a = env.anchor('https://partner.example/cart#tab=two');
  env.click(a);
  const href = a.getAttribute('href');
  assert.match(href, /#tab=two&ck_consent=/, "the link's own fragment was destroyed");

  // A second click must not stack a second ck_consent pair.
  env.click(a);
  assert.equal(a.getAttribute('href').match(/ck_consent=/g).length, 1,
    'a stale payload must be replaced, not appended to');
});

test('§2.2 a click on an inner element still finds the anchor', () => {
  const env = decided(loadCore({ href: 'https://shop.example.com/p' }));
  const a = env.anchor('https://partner.example/cart');
  const span = env.doc.createElement('span');
  a.appendChild(span);
  span.parentNode = a;
  env.click(span);
  assert.match(a.getAttribute('href'), /#ck_consent=/,
    'clicks land on the <span> inside the <a>, not the <a>');
});

test('§2.2 non-http schemes are left alone', () => {
  const env = decided(loadCore({ href: 'https://shop.example.com/p' }));
  for (const href of ['mailto:hi@partner.example', 'tel:+37360000000', 'javascript:void(0)']) {
    const a = env.anchor(href);
    env.click(a);
    assert.equal(a.getAttribute('href'), href, `${href} must not carry a consent payload`);
  }
});

test('§2.2 at most 10 linked hosts are honoured', () => {
  const many = Array.from({ length: 14 }, (_, i) => `h${i}.example`);
  const env = decided(loadCore({ href: 'https://shop.example.com/p' }),
    { consent: { linkedDomains: many } });

  const inside = env.anchor('https://h9.example/x');    // 10th entry
  const outside = env.anchor('https://h10.example/x');  // 11th, over the cap
  env.click(inside); env.click(outside);

  assert.match(inside.getAttribute('href'), /#ck_consent=/);
  assert.equal(outside.getAttribute('href'), 'https://h10.example/x',
    'the 11th host is over the cap and must be ignored');
});

test('§2.2 a round trip: what a click writes, an init on the other site adopts', () => {
  const sender = decided(loadCore({ href: 'https://shop.example.com/p' }));
  const a = sender.anchor('https://partner.example/cart');
  sender.click(a);
  const hash = '#' + a.getAttribute('href').split('#')[1];

  const receiver = loadCore({
    href: 'https://partner.example/cart',
    hash,
    referrer: 'https://shop.example.com/p'
  });
  receiver.CK.init({ consent: { linkedDomains: ['shop.example.com'] } });

  const s = receiver.CK.getState();
  assert.equal(s.decided, true, 'the receiving site did not adopt what the sender wrote');
  assert.equal(s.method, 'linked');
  assert.equal(s.categories.analytics, true);
});

/* ================================================ beacons: geo once per session */

/* The ck-saas harness. Deliberately separate from the core one above: what is
   under test here is the LOADER's choice of when to post, so the core is a stub
   that reports whatever method the test wants, and sessionStorage is shared
   across two loader runs the way one browser session shares it. */
function runSaasGeo({ method = 'geo', cached = true, country = 'FR', sessionStore = {} } = {}) {
  const posted = [];
  const tag = {
    getAttribute: (n) => (n === 'data-ck-id' ? 'site-1' : n === 'data-ck-api' ? 'https://api.test' : null)
  };
  const cfg = { v: 7, policyVersion: '1', log: { endpoint: 'https://api.test/v1/consent', key: 'k1' } };
  const store = cached
    ? { 'ck_cfg_site-1': JSON.stringify({ etag: 'W/"1"', config: cfg, country }) }
    : {};
  const listeners = {};

  const g = {};
  g.window = g;
  g.self = g;
  g.document = {
    currentScript: tag,
    querySelectorAll: () => [tag],
    addEventListener: (n, fn) => { listeners[n] = fn; }
  };
  g.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); }
  };
  g.sessionStorage = {
    getItem: (k) => (k in sessionStore ? sessionStore[k] : null),
    setItem: (k, v) => { sessionStore[k] = String(v); }
  };
  g.console = { warn: () => {}, error: () => {} };
  g.navigator = {};
  g.addEventListener = () => {};
  g.setTimeout = () => 0;
  g.clearTimeout = () => {};
  g.AbortController = function () { this.signal = null; this.abort = () => {}; };
  g.fetch = (url, opts) => {
    if (!opts || opts.method !== 'POST') {
      return Promise.resolve({
        ok: true, status: 304,
        headers: { get: (h) => (h.toLowerCase() === 'x-ck-country' ? country : null) }
      });
    }
    posted.push({ url, body: JSON.parse(opts.body) });
    return Promise.resolve({ ok: true, status: 200, headers: { get: () => null } });
  };

  const state = {
    decided: method === 'linked',
    id: method === 'linked' ? '33333333-3333-4333-8333-333333333333' : null,
    ts: method === 'linked' ? '2026-09-07T10:00:00.000Z' : null,
    policyVersion: '1',
    categories: { necessary: true, functional: true, analytics: true, marketing: true },
    services: {},
    method
  };
  g.ConsentKit = {
    version: '0.5.17',
    config: { policyVersion: '1' },
    _geo: null,
    init() { return state; },
    getState() { return state; },
    _extendHostDb() { return 0; },
    _deniedServices() { return []; }
  };

  vm.runInContext(SAAS, vm.createContext(g), { filename: 'src/ck-saas.js' });
  /* The loader records the init-time decision from a MICROTASK (the journal's
     own arrays are still hoisted-undefined while the file's top level runs), so
     nothing is posted until the queue drains. Every beacon assertion below
     therefore awaits `settle()` first — a test that forgets sees zero posts and
     fails loudly rather than passing for the wrong reason. */
  const settle = async () => { for (let i = 0; i < 12; i++) { await Promise.resolve(); } };
  return { posted, g, store, sessionStore, settle };
}

test('§1 the geo grant sends exactly one beacon with method "geo"', async () => {
  const env = runSaasGeo({ method: 'geo' });
  await env.settle();
  assert.equal(env.posted.length, 1, 'the geo grant produced no journal record');
  assert.equal(env.posted[0].body.method, 'geo');
  // buildPayload's fallbacks fill the nulls the core deliberately left.
  assert.ok(env.posted[0].body.id, 'the beacon needs an id even though the state has none');
  assert.ok(env.posted[0].body.ts);
  assert.equal(env.posted[0].body.categories.analytics, true);
  assert.ok(!('services' in env.posted[0].body), 'a geo grant is not a services choice');
});

test('§1 the geo beacon is once per SESSION, not per page load', async () => {
  const session = {};
  const first = runSaasGeo({ method: 'geo', sessionStore: session });
  await first.settle();
  assert.equal(first.posted.length, 1);
  assert.equal(session.ck_geo_logged, '1', 'the session flag was not written');

  // A second page in the same visit: same sessionStorage, fresh everything else.
  const second = runSaasGeo({ method: 'geo', sessionStore: session });
  await second.settle();
  assert.equal(second.posted.length, 0,
    'ten pages of browsing is one fact about one visit, not ten journal rows');
});

test('§1 a missing sessionStorage degrades to a beacon, never a throw', async () => {
  // Private mode / an exotic embed. Duplicate rows are the acceptable failure;
  // an exception on someone's site is not.
  const env = runSaasGeo({ method: 'geo', sessionStore: undefined });
  await env.settle();
  assert.equal(env.posted.length, 1);
});

test('§2.2 an adopted decision sends a beacon with method "linked"', async () => {
  const env = runSaasGeo({ method: 'linked' });
  await env.settle();
  assert.equal(env.posted.length, 1, 'the cached path dropped the linked beacon');
  assert.equal(env.posted[0].body.method, 'linked');
  assert.equal(env.posted[0].body.id, '33333333-3333-4333-8333-333333333333',
    'a real decision keeps its own id, unlike a geo grant');
});

test('§2.2 the linked beacon is NOT rate-limited by the geo session flag', async () => {
  const session = { ck_geo_logged: '1' };
  const env = runSaasGeo({ method: 'linked', sessionStore: session });
  await env.settle();
  assert.equal(env.posted.length, 1, 'a real decision must always be journalled');
});

test('an ordinary decision sends nothing extra at init time', async () => {
  // The regression guard for recordInitDecision(): it must fire for exactly two
  // methods and stay out of the way of every other path.
  for (const method of ['accept_all', 'reject_all', 'custom']) {
    const env = runSaasGeo({ method });
    await env.settle();
    assert.equal(env.posted.length, 0,
      `${method} is journalled by the ck:consent listener, not by init`);
  }
});

/* ---------------------------------------------------------- the cached country */

test('§1.4 the cached country is published before init runs', () => {
  const env = runSaasGeo({ method: 'geo', cached: true, country: 'FR' });
  assert.equal(env.g.ConsentKit._geo.country, 'FR',
    'a warm load must know the country without waiting for the network');
});

test('§1.4 background revalidation refreshes the cached country', async () => {
  const env = runSaasGeo({ method: 'geo', cached: true, country: 'DE' });
  for (let i = 0; i < 12; i++) { await Promise.resolve(); }
  const entry = JSON.parse(env.store['ck_cfg_site-1']);
  assert.equal(entry.country, 'DE',
    'the 304 carried a fresh x-ck-country and the entry must record it');
});

test('§1.4 storeGeo MERGES, so revalidation cannot blank inScope', () => {
  /* The trap: the core writes { country, inScope } during init, and the
     background revalidation lands afterwards. A plain assignment would leave
     inScope undefined — which reads as "not false" to ck-ui, and the banner
     would appear for an out-of-scope visitor on exactly the warm loads that are
     supposed to be the fast ones. */
  const env = runSaasGeo({ method: 'geo', cached: true, country: 'FR' });
  env.g.ConsentKit._geo = { country: 'FR', inScope: false };   // as init() left it
  return (async () => {
    for (let i = 0; i < 12; i++) { await Promise.resolve(); }
    assert.equal(env.g.ConsentKit._geo.inScope, false,
      'revalidation clobbered the geo decision');
    assert.equal(env.g.ConsentKit._geo.country, 'FR');
  })();
});

/* ------------------------------------------------------------- the debug panel */

test('the debug report carries the country, the geo decision and the linked count', async () => {
  const g = globalThis;
  const saved = { window: g.window, self: g.self, ConsentKit: g.ConsentKit, __ckDebug: g.__ckDebug };
  for (const k of Object.keys(saved)) { delete g[k]; }
  try {
    g.window = g;
    g.self = g;
    g.ConsentKit = {
      version: '0.5.17',
      config: { policyVersion: '1', consent: { linkedDomains: ['a.example', 'b.example'] } },
      _geo: { country: 'MD', inScope: false },
      getState: () => ({ decided: false, categories: {}, method: 'geo' })
    };
    vm.runInThisContext(readFileSync(join(REPO, 'src', 'ck-debug.js'), 'utf8'),
      { filename: 'src/ck-debug.js' });
    const api = g.__ckDebug;
    const r = api.buildReport(api.reportInput ? api.reportInput() : {
      version: '0.5.17',
      state: { decided: false, categories: {}, method: 'geo' },
      config: { consent: { linkedDomains: ['a.example', 'b.example'] } },
      geo: { country: 'MD', inScope: false }
    });
    assert.equal(r.client.country, 'MD');
    assert.equal(r.client.geoInScope, false);
    assert.equal(r.client.linkedDomains, 2);
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) { delete g[k]; } else { g[k] = saved[k]; }
    }
  }
});

test('the debug panel has geo and linked strings in ru, en and ro', () => {
  const src = readFileSync(join(REPO, 'src', 'ck-debug.js'), 'utf8');
  // Anchored on the six-space indent of the STRINGS tables: `country:` also
  // appears in buildReport()'s client block at four spaces, and counting that
  // one would make this pass with only two translations.
  for (const key of ['country', 'countryUnknown', 'banner', 'bannerShown', 'bannerHiddenGeo', 'linked']) {
    const hits = src.match(new RegExp('^ {6}' + key + ':', 'gm')) || [];
    assert.equal(hits.length, 3, `${key} must exist in exactly ru, en and ro (found ${hits.length})`);
  }
});

/* ---------------------------------------------------------------- the banner */

/* ck-ui.js mounts a Shadow DOM against a real browser and none of the harnesses
   in this repo can drive it, so the §1.1 contract is pinned at the source level
   instead. Weak, and deliberately narrow: what it actually guards is that the
   two halves of the rule cannot drift apart — the banner is hidden out of scope
   AND the floating button is still shown, which is a single expression in
   syncFromState and would be the natural thing to "simplify" into
   `if (geoSilent()) return;`. That simplification hides the FAB too, and the
   visitor loses their only way to reach the panel. */
test('§1.1 ck-ui hides the banner out of scope but keeps the settings button', () => {
  const ui = readFileSync(join(REPO, 'src', 'ck-ui.js'), 'utf8');

  assert.match(ui, /inScope === false/,
    'ck-ui must read ConsentKit._geo.inScope to know it is out of scope');

  // The one expression that decides all three nodes. Both operands must be
  // there: `s.decided` alone ignores geo, `geoSilent()` alone forgets consent.
  const m = ui.match(/var decided = ([^;]+);/);
  assert.ok(m, 'syncFromState no longer computes a single `decided`');
  assert.match(m[1], /s\.decided/, 'a real decision must still hide the banner');
  assert.match(m[1], /geoSilent\(\)/, 'an out-of-scope visitor must not see the banner');

  // The FAB is toggled off that SAME value, so "hidden banner" and "visible
  // settings button" cannot come apart.
  assert.match(ui, /nodes\.fab\.classList\.toggle\('ck-hidden', !decided\)/,
    'the floating settings button must be shown whenever the banner is hidden');

  // And the check is explicitly `=== false`: an absent or half-written _geo
  // (an older core, a failed config fetch) must fall to "show the banner".
  assert.doesNotMatch(ui, /inScope\s*==\s*false[^=]/,
    'a loose comparison would treat a missing _geo as out of scope');
});

/* -------------------------------------------------- the two _geo writers meet */

/* ck-saas.js writes `_geo.country` and the core's init() then writes the WHOLE
   object as `{ country, inScope }`. Two writers, one field, and the core's write
   comes second — so if init() ever read the country as empty, the loader's work
   would be silently discarded and every visitor would look like "country
   unknown", i.e. always in scope. The stub-core beacon tests above cannot catch
   this (their init() is a no-op), so it is asserted here against the real core.

   The whitespace case is the one that would slip through a truthiness check on
   the raw header: `' '` is truthy, `.toUpperCase()` leaves it truthy, and it
   would then match nothing in `countries` and silently hide the banner. */
test('§1.4 the country the loader published survives the core\'s own _geo write', () => {
  const env = loadCore({ country: 'md' });     // as a header would arrive
  env.CK.init({ geo: { mode: 'list', countries: ['MD'] } });

  assert.equal(env.CK._geo.country, 'MD', 'init() lost (or failed to normalise) the country');
  assert.equal(env.CK._geo.inScope, true);
  assert.equal(typeof env.CK._geo.inScope, 'boolean',
    'inScope must always be a real boolean — ck-ui tests it with ===');
});

test('§1.4 a blank country header reads as unknown, not as a country', () => {
  const env = loadCore({ country: '   ' });
  env.CK.init({ geo: { mode: 'list', countries: ['MD'] } });
  assert.equal(env.CK._geo.inScope, true,
    'whitespace is not a country, and unknown must fall to "show the banner"');
});

test('§1 an out-of-scope grant still respects a category disabled in config', () => {
  // The mirror of the linked-domain case: filterByConfig() must gate the geo
  // grant too, or a site that switched marketing off entirely would have it
  // switched back on for every out-of-scope visitor.
  const env = loadCore({ country: 'FR' });
  env.CK.init({
    geo: { mode: 'list', countries: ['MD'] },
    categories: { marketing: { enabled: false } }
  });

  const s = env.CK.getState();
  assert.equal(s.method, 'geo', 'the geo grant did not run — this test would pass vacuously');
  assert.equal(s.categories.analytics, true, 'an enabled category is still granted');
  assert.equal(s.categories.marketing, false,
    'geo cannot grant a category the site does not run at all');
  assert.equal(s.categories.necessary, true, 'necessary is always on');
});
