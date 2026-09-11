/* SPEC-V1.26 §1 — the Consent Mode v2 `default` push.
 *
 * The core pushes exactly one 'consent'/'default' at PARSE TIME, before init()
 * can read integrations.gcm and before any tag can load. That single push is
 * the whole contract with Google for a visitor who has not answered yet, so
 * its signals are asserted here rather than inferred from a later update.
 *
 * WHY THIS FILE EXISTS SEPARATELY
 * The blocking, geo and debug suites each build a stub DOM for their own
 * reason and assert on state, cookies or events — none of them looks at what
 * landed in window.dataLayer. 0.5.22 adds two flags (url_passthrough,
 * ads_data_redaction) whose entire observable effect IS that push, so they
 * would otherwise be guarded by nothing.
 *
 * THE ARGUMENTS-OBJECT TRAP
 * The core's gtag shim is `function ckGtag() { dataLayerPush(arguments); }` —
 * so dataLayer[0] is an ARGUMENTS OBJECT, not an array and not an event
 * object. `deepEqual` against an array fails, and `dl[0].event` is undefined.
 * Every assertion below indexes it positionally: [0]='consent', [1]='default',
 * [2]=the signals. Anything reading .event here is reading the wrong shape.
 *
 * THE VACUOUS-PASS TRAP
 * A stub that fails to load the core leaves dataLayer empty, and "no push with
 * the wrong flags" would pass every `doesNotMatch`-style check. So the first
 * assertion is that the push EXISTS and carries the pre-existing signals
 * (all-denied + wait_for_update), and the new flags are asserted beside them —
 * a core that never ran fails on the count, not on a flag.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CORE = readFileSync(join(REPO, 'src', 'ck-core.js'), 'utf8');

/* ------------------------------------------------------------------- stub DOM */

/* Deliberately the smallest stub that lets ck-core.js PARSE: it installs
   patches on HTMLScriptElement/HTMLIFrameElement/Element prototypes and
   document.createElement at parse time, so those have to exist or the file
   throws before it ever reaches gcmDefault(). Nothing here models blocking —
   that is blocking.test.mjs's job. */
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
    _set(n, v) { attrs.set(String(n).toLowerCase(), String(v)); return undefined; },
    _remove(n) { attrs.delete(String(n).toLowerCase()); return undefined; },
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

/** Loads src/ck-core.js against a stub window and returns what it pushed. */
function loadCore() {
  const g = Object.create(null);
  const doc = {
    _all: [],
    referrer: '',
    cookie: '',
    createElement(tag) { const el = makeElement(tag, doc, g); doc._all.push(el); return el; },
    querySelectorAll() { return []; },
    addEventListener() {},
    dispatchEvent() { return true; },
    documentElement: null,
    body: null
  };
  doc.body = makeElement('body', doc, g);

  function srcProto() {
    const P = function () {};
    Object.defineProperty(P.prototype, 'src', {
      configurable: true, enumerable: true,
      get() { return this._src || ''; },
      set(v) { this._src = String(v); this._set('src', String(v)); }
    });
    return P;
  }

  const store = {};
  g.window = g;
  g.self = g;
  g.document = doc;
  g.location = {
    href: 'https://shop.example.com/page',
    hostname: 'shop.example.com',
    pathname: '/page',
    search: '',
    hash: ''
  };
  g.history = { replaceState() {} };
  g.HTMLScriptElement = srcProto();
  g.HTMLIFrameElement = srcProto();
  g.Element = function () {};
  g.Element.prototype.setAttribute = function (n, v) { return this._set(n, v); };
  g.Element.prototype.removeAttribute = function (n) { return this._remove(n); };
  g.URL = URL;
  g.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  };
  g.CustomEvent = function (type, init) { this.type = type; this.detail = init && init.detail; };

  // Seeded EMPTY, exactly as a real page's first line does: the core appends
  // to whatever is already there, and the parse-time default must land at [0].
  g.dataLayer = [];

  const ctx = vm.createContext(g);
  vm.runInContext(CORE, ctx, { filename: 'src/ck-core.js' });

  assert.ok(g.ConsentKit, 'src/ck-core.js did not attach ConsentKit');
  return { CK: g.ConsentKit, dataLayer: g.dataLayer };
}

/** The parse-time 'consent'/'default' entry, as [kind, mode, signals]. */
function defaultPush(dataLayer) {
  const hits = dataLayer.filter((e) => e && e[0] === 'consent' && e[1] === 'default');
  assert.equal(hits.length, 1,
    `expected exactly one 'consent'/'default' push at parse time, saw ${hits.length}`);
  return hits[0];
}

/* --------------------------------------------------------------- the push */

test('the parse-time Consent Mode default is pushed once, all-denied', () => {
  const { dataLayer } = loadCore();

  // The positive control for every assertion below: a core that never ran
  // pushes nothing, and this is where that fails.
  assert.ok(dataLayer.length > 0, 'the core pushed nothing into window.dataLayer');

  const push = defaultPush(dataLayer);
  const signals = push[2];

  /* Every opt-in signal denied before the visitor answers — the pre-existing
     contract 0.5.22 must not disturb while adding two flags beside it. */
  for (const key of ['ad_storage', 'analytics_storage', 'ad_user_data',
                     'ad_personalization', 'functionality_storage',
                     'personalization_storage']) {
    assert.equal(signals[key], 'denied', `${key} is not denied in the default push`);
  }
  assert.equal(signals.security_storage, 'granted',
    'security_storage is never consent-gated');
  assert.equal(signals.wait_for_update, 500,
    'the default push lost wait_for_update');
});

test('SPEC-V1.26 §1: url_passthrough and ads_data_redaction ship ON by default', () => {
  const { dataLayer } = loadCore();
  const signals = defaultPush(dataLayer)[2];

  /* url_passthrough: with ad_storage denied there is no cookie to carry the
     click id. Without this flag a visitor who DECLINED loses the gclid between
     the landing page and the cabinet — our own product would break our own
     ads' attribution, and every customer's, since they install this file
     rather than a hand-tuned container. */
  assert.equal(signals.url_passthrough, true,
    'the default push does not set url_passthrough — a declined visitor loses the gclid');

  /* ads_data_redaction: the other half of the same refusal — Google trims
     identifiers out of the ad requests themselves while ad_storage is denied. */
  assert.equal(signals.ads_data_redaction, true,
    'the default push does not set ads_data_redaction');

  // Booleans, not the 'granted'/'denied' strings the storage signals use:
  // Google reads these two as flags and a string is truthy either way, so a
  // wrong type would go unnoticed in a browser and silently disable nothing.
  assert.equal(typeof signals.url_passthrough, 'boolean');
  assert.equal(typeof signals.ads_data_redaction, 'boolean');
});

test('the two flags belong to the default only, not to consent updates', () => {
  /* Google expects them once, with the default. gcmUpdate() maps categories
     onto storage signals and must not repeat page-level flags — an update
     carrying them is not what the documentation describes, and it would let a
     later update re-assert a setting the site owner may have overridden. */
  const { CK, dataLayer } = loadCore();

  CK.init({ integrations: { gcm: true, gtmDataLayer: true } });
  CK.accept('all');

  const updates = dataLayer.filter((e) => e && e[0] === 'consent' && e[1] === 'update');
  assert.ok(updates.length > 0, 'accepting everything pushed no consent update');

  for (const u of updates) {
    assert.equal(u[2].url_passthrough, undefined,
      'a consent update repeats url_passthrough');
    assert.equal(u[2].ads_data_redaction, undefined,
      'a consent update repeats ads_data_redaction');
    assert.equal(u[2].wait_for_update, undefined,
      'a consent update repeats wait_for_update');
  }
});
