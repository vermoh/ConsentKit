/* The blocking engine: runtime host overrides (§1.3) and strict mode (§2).
 *
 * Everything else in this suite guards artefacts — versions, sha256 copies,
 * generated files. This one exercises the engine itself, which means it needs a
 * DOM: the core installs its patches on HTMLScriptElement.prototype,
 * HTMLIFrameElement.prototype, Element.prototype.setAttribute and
 * document.createElement at parse time, and nothing about strict mode is
 * observable without them.
 *
 * The stub below is deliberately small and honest about what it is: enough DOM
 * for the patches to install and for a script/iframe to be created, given a src
 * and asked what happened. It is NOT a browser — MutationObserver is absent, so
 * these tests cover the createElement / .src / setAttribute paths, which are the
 * paths that actually stop a request in a real browser anyway.
 *
 * THE VACUOUS-PASS TRAP: isSameSite() returns true (i.e. "do not intercept")
 * whenever location.hostname is empty, which is exactly what a careless stub
 * gives you. Strict mode would then be inert and every "is it blocked?"
 * assertion would pass for the wrong reason. Several tests therefore assert a
 * same-site pass and a third-party block in the SAME fixture, so a broken
 * location breaks the suite instead of hiding inside it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = readFileSync(join(REPO, 'src', 'ck-core.js'), 'utf8');

/* ------------------------------------------------------------------- stub DOM */

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
    // The unpatched writers. The core holds a reference to
    // Element.prototype.setAttribute taken BEFORE it patches the prototype, and
    // calls it to write its own bookkeeping attributes; that reference must not
    // re-enter the patch, exactly as in a browser.
    _set(n, v) {
      const k = String(n).toLowerCase();
      attrs.set(k, String(v));
      el.attributes = [...attrs].map(([name, value]) => ({ name, value }));
      return undefined;
    },
    _remove(n) {
      attrs.delete(String(n).toLowerCase());
      el.attributes = [...attrs].map(([name, value]) => ({ name, value }));
      return undefined;
    },
    // Page-facing setAttribute goes through whatever currently sits on
    // Element.prototype — i.e. through the core's patch once it is installed.
    setAttribute(n, v) { return g.Element.prototype.setAttribute.call(el, n, v); },
    removeAttribute(n) { return el._remove(n); },
    hasAttribute(n) { return attrs.has(String(n).toLowerCase()); },
    querySelectorAll() { return []; },
    appendChild(child) { child.parentNode = el; el.childNodes.push(child); return child; },
    insertBefore(child) { child.parentNode = el; el.childNodes.push(child); return child; },
    removeChild(child) {
      const i = el.childNodes.indexOf(child);
      if (i > -1) { el.childNodes.splice(i, 1); }
      child.parentNode = null;
      return child;
    }
  };
  return el;
}

/**
 * Loads src/ck-core.js against a stub window rooted at `href`.
 * Returns { ConsentKit, document, make } where make(tag) creates an element
 * through the (patched) document.createElement.
 */
function load({ href = 'https://shop.example.com/page', cookie = '' } = {}) {
  const g = Object.create(null);
  const doc = {
    cookie,
    _all: [],
    createElement(tag) { const el = makeElement(tag, doc, g); doc._all.push(el); return el; },
    querySelectorAll(sel) {
      // Only the selectors applyConsentToDom() / initialScan() actually use.
      return doc._all.filter((el) => {
        const t = el.tagName.toLowerCase();
        if (sel.includes('script[type="text/plain"][data-ck]')) {
          const a = t === 'script' && el.getAttribute('type') === 'text/plain' && el.getAttribute('data-ck');
          const b = sel.includes('script[data-ck-blocked]') && t === 'script' && el.getAttribute('data-ck-blocked');
          const c = sel.includes('iframe[data-ck][data-src]') && t === 'iframe' &&
            el.getAttribute('data-ck') && el.getAttribute('data-src');
          return !!(a || b || c);
        }
        if (sel === 'iframe[data-ck][data-src]') {
          return t === 'iframe' && el.getAttribute('data-ck') && el.getAttribute('data-src');
        }
        if (sel === 'script[src]') { return t === 'script' && el.getAttribute('src'); }
        if (sel === 'iframe[src]') { return t === 'iframe' && el.getAttribute('src'); }
        return false;
      });
    },
    addEventListener() {},
    dispatchEvent() { return true; },
    documentElement: null,
    body: null
  };
  // A parent for inserted elements. reviveScript() calls
  // old.parentNode.insertBefore(fresh, old) and then removes the original, so
  // without a real parent a revival is silently a no-op.
  doc.body = makeElement('body', doc, g);
  doc._all.push(doc.body);

  // Prototypes the core patches. Plain accessor pairs over a private field is
  // exactly the shape a real browser exposes.
  function srcProto() {
    const P = function () {};
    Object.defineProperty(P.prototype, 'src', {
      configurable: true,
      enumerable: true,
      get() { return this._src || ''; },
      // Writes the attribute directly: in a browser the native src setter does
      // not go back through Element.prototype.setAttribute either.
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
  // The core captures Element.prototype.setAttribute as `nativeSetAttribute`
  // and calls it with the element as `this`. Stub elements are plain objects
  // carrying their own setAttribute, so the "native" is simply a trampoline to
  // it — `_set` is the unpatched writer that makeElement installs.
  g.Element = function () {};
  g.Element.prototype.setAttribute = function (n, v) { return this._set(n, v); };
  g.URL = URL;
  g.localStorage = null;
  g.Element.prototype.removeAttribute = function (n) { return this._remove(n); };

  const context = vm.createContext(g);
  vm.runInContext(SOURCE, context, { filename: 'src/ck-core.js' });

  const CK = g.ConsentKit;
  assert.ok(CK, 'src/ck-core.js did not attach ConsentKit');
  // Guard against the vacuous pass described in the header.
  assert.equal(g.location.hostname, new URL(href).hostname, 'the stub lost its hostname');

  return { CK, doc, g, make: (tag) => doc.createElement(tag) };
}

/* Elements are created through the patched document.createElement, then given a
   src through the property setter — the path a real tag manager uses. */
function insert(env, tag, src) {
  const el = env.make(tag);
  // reviveScript() inserts the replacement next to the original and removes it,
  // so a blocked script only comes back if it is actually in the tree.
  env.doc.body.appendChild(el);
  el.src = src;
  return el;
}

function isBlocked(el) {
  return el.getAttribute('data-ck-blocked') === '1';
}

/* --------------------------------------------------- _extendHostDb: before init */

test('_extendHostDb is a public function and reports how many entries it took', () => {
  const { CK } = load();
  assert.equal(typeof CK._extendHostDb, 'function');
  assert.equal(CK._extendHostDb({ 'tracker.example': 'analytics' }), 1);
  // Re-adding the same pair is not a second entry.
  assert.equal(CK._extendHostDb({ 'tracker.example': 'analytics' }), 0);
});

test('_categoryForUrl sees an override added BEFORE init()', () => {
  const { CK } = load();
  assert.equal(CK._categoryForUrl('https://tracker.example/t.js'), null);
  CK._extendHostDb({ 'tracker.example': 'analytics' });
  assert.equal(CK._categoryForUrl('https://tracker.example/t.js'), 'analytics');
  // Suffix semantics, the same as HOST_DB: subdomains are covered.
  assert.equal(CK._categoryForUrl('https://cdn.tracker.example/t.js'), 'analytics');
  // …but a merely similar name is not.
  assert.equal(CK._categoryForUrl('https://nottracker.example/t.js'), null);
});

test('_categoryForUrl sees an override added AFTER init()', () => {
  const { CK } = load();
  CK.init({ policyVersion: '1' });
  assert.equal(CK._categoryForUrl('https://late.example/t.js'), null);
  CK._extendHostDb({ 'late.example': 'marketing' });
  assert.equal(CK._categoryForUrl('https://late.example/t.js'), 'marketing');
});

test('a host override blocks a script inserted after init()', () => {
  const env = load();
  env.CK.init({ policyVersion: '1' });
  env.CK._extendHostDb({ 'late.example': 'marketing' });
  const el = insert(env, 'script', 'https://late.example/t.js');
  assert.ok(isBlocked(el), 'the override was not applied to a later insertion');
  assert.equal(el.getAttribute('data-ck'), 'marketing');
});

test('an override wins over the shipped HOST_DB entry for the same host', () => {
  const { CK } = load();
  assert.equal(CK._categoryForUrl('https://static.hotjar.com/x.js'), 'analytics');
  CK._extendHostDb({ 'hotjar.com': 'marketing' });
  assert.equal(CK._categoryForUrl('https://static.hotjar.com/x.js'), 'marketing');
});

test('_extendHostDb rejects unknown categories and malformed hosts', () => {
  const { CK } = load();
  assert.equal(CK._extendHostDb({ 'x.example': 'nonsense' }), 0);
  assert.equal(CK._extendHostDb({ 'no-dot': 'analytics' }), 0);
  assert.equal(CK._extendHostDb({ 'sp ace.example': 'analytics' }), 0);
  assert.equal(CK._extendHostDb({ 'x.example': 42 }), 0);
  assert.equal(CK._categoryForUrl('https://x.example/a.js'), null);
  // Non-objects are ignored rather than thrown over.
  assert.equal(CK._extendHostDb(null), 0);
  assert.equal(CK._extendHostDb('nope'), 0);
  assert.equal(CK._extendHostDb(['a.example']), 0);
});

test('_extendHostDb normalises host case and a trailing port', () => {
  const { CK } = load();
  CK._extendHostDb({ 'Tracker.EXAMPLE:443': 'analytics' });
  assert.equal(CK._categoryForUrl('https://tracker.example/t.js'), 'analytics');
});

/* ------------------------------------------------------- strict mode: the gate */

test('known mode (the default) lets an unknown third party through', () => {
  const env = load();
  env.CK.init({ policyVersion: '1' });
  const unknown = insert(env, 'script', 'https://widget.unknown-vendor.com/w.js');
  assert.ok(!isBlocked(unknown), 'a plain build must not block unknown hosts');
  // …while a known tracker in the same fixture still is.
  const known = insert(env, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  assert.ok(isBlocked(known), 'known-mode blocking regressed');
});

test('strict blocks an unknown third-party script but not a same-site one', () => {
  // Both halves in one fixture: a broken location stub fails here rather than
  // making every strict assertion pass vacuously.
  const env = load({ href: 'https://shop.example.com/page' });
  env.CK.init({ policyVersion: '1', blocking: { mode: 'strict' } });

  const third = insert(env, 'script', 'https://widget.unknown-vendor.com/w.js');
  assert.ok(isBlocked(third), 'strict mode did not intercept an unknown third party');
  assert.equal(third.getAttribute('data-ck'), 'marketing', 'strict interceptions are marketing');

  const own = insert(env, 'script', 'https://shop.example.com/app.js');
  assert.ok(!isBlocked(own), 'strict mode blocked a first-party script');
});

test('strict treats a subdomain of the page as same-site', () => {
  const env = load({ href: 'https://www.shop.example.com/page' });
  env.CK.init({ policyVersion: '1', blocking: { mode: 'strict' } });
  assert.ok(!isBlocked(insert(env, 'script', 'https://cdn.shop.example.com/app.js')));
  assert.ok(!isBlocked(insert(env, 'script', 'https://shop.example.com/app.js')));
  assert.ok(!isBlocked(insert(env, 'script', '/local/app.js')), 'a relative src is first-party');
});

test('strict uses the multi-label public suffix list for same-site', () => {
  const env = load({ href: 'https://www.shop.co.uk/page' });
  env.CK.init({ policyVersion: '1', blocking: { mode: 'strict' } });
  assert.ok(!isBlocked(insert(env, 'script', 'https://cdn.shop.co.uk/app.js')), 'same registrable domain under co.uk');
  // Without the PSL entry both would collapse to "co.uk" and this would pass
  // as same-site — which is the bug the list exists to prevent.
  assert.ok(isBlocked(insert(env, 'script', 'https://other.co.uk/w.js')), 'a different co.uk site is third-party');
});

test('strict honours the built-in allowlist', () => {
  const env = load();
  env.CK.init({ policyVersion: '1', blocking: { mode: 'strict' } });
  for (const url of [
    'https://cdn.jsdelivr.net/npm/x/x.js',
    'https://unpkg.com/x/x.js',
    'https://cdnjs.cloudflare.com/ajax/libs/x/x.js',
    'https://code.jquery.com/jquery-3.7.1.min.js',
    'https://js.stripe.com/v3/',
    'https://pay.google.com/gp/p/js/pay.js',
    'https://checkout.creem.io/embed.js',
    'https://js.hcaptcha.com/1/api.js'
  ]) {
    assert.ok(!isBlocked(insert(env, 'script', url)), `${url} should be allowed by BASE_ALLOW`);
  }
});

test('the recaptcha allowance is scoped to its path, not the whole host', () => {
  const env = load();
  env.CK.init({ policyVersion: '1', blocking: { mode: 'strict' } });
  assert.ok(!isBlocked(insert(env, 'script', 'https://www.google.com/recaptcha/api.js')));
  assert.ok(!isBlocked(insert(env, 'script', 'https://www.gstatic.com/recaptcha/releases/x/recaptcha.js')));
  // The rest of www.google.com is emphatically not waved through.
  assert.ok(isBlocked(insert(env, 'script', 'https://www.google.com/ads/beacon.js')));
});

test('_baseAllow is exported and matches what the engine allows', () => {
  const { CK } = load();
  assert.ok(Array.isArray(CK._baseAllow));
  for (const h of ['cdn.jsdelivr.net', 'unpkg.com', 'cdnjs.cloudflare.com', 'fonts.googleapis.com',
    'fonts.gstatic.com', 'hcaptcha.com', 'js.stripe.com', 'pay.google.com',
    'checkout.creem.io', 'code.jquery.com']) {
    assert.ok(CK._baseAllow.includes(h), `${h} is missing from _baseAllow`);
  }
  assert.ok(CK._baseAllow.includes('www.google.com/recaptcha'));
  assert.ok(CK._baseAllow.includes('www.gstatic.com/recaptcha'));
  // A copy, not the live array: a caller must not be able to widen the
  // allowlist. Read twice from the SAME instance — comparing against a fresh
  // load() would pass even if the live array were handed out, because each
  // load() re-evaluates the source.
  const first = CK._baseAllow;
  first.push('evil.example');
  assert.ok(!CK._baseAllow.includes('evil.example'),
    '_baseAllow handed out its live array — a caller could widen the allowlist');
});

/* ------------------------------------------------- infrastructure (§8) */

test('_infra is exported, suffix-matched and inert', () => {
  const { CK } = load();
  const infra = CK._infra();
  assert.ok(Array.isArray(infra) && infra.length > 0, '_infra() returned no list');
  for (const h of ['tildacdn.com', 'tildacdn.net', 'tilda.ws', 'static.wixstatic.com',
    'parastorage.com', 'cdn.shopify.com', 'squarespace-cdn.com', 'assets.website-files.com',
    'cdn.jsdelivr.net', 'unpkg.com', 'cdnjs.cloudflare.com', 'code.jquery.com',
    'ajax.googleapis.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'hcaptcha.com',
    'consent.ecomconsult.net']) {
    assert.ok(infra.includes(h), `${h} is missing from _infra()`);
  }

  // A copy, for the same reason _baseAllow is one: the scanner and the strict
  // engine both read this list, and a caller must not be able to widen it.
  infra.push('evil.example');
  assert.ok(!CK._infra().includes('evil.example'), '_infra() handed out its live array');

  // §8's whole list is inside the strict allowlist, so what a site owner reads
  // in _baseAllow really is everything strict lets through.
  for (const h of CK._infra()) {
    assert.ok(CK._baseAllow.includes(h), `${h} is in _infra() but not in _baseAllow`);
  }
});

test('_isInfra accepts a URL or a bare host and matches subdomains', () => {
  const { CK } = load();
  assert.ok(CK._isInfra('https://static.tildacdn.com/js/tilda-blocks-2.4.js'));
  assert.ok(CK._isInfra('https://ws.tildacdn.com/'), '§8 names ws.tildacdn.com specifically');
  assert.ok(CK._isInfra('tildacdn.com'), 'a bare host must work — the scanner passes hosts');
  assert.ok(CK._isInfra('static.wixstatic.com'));
  assert.ok(CK._isInfra('https://fonts.gstatic.com/s/x.woff2'));

  assert.ok(!CK._isInfra('https://widget.unknown-vendor.com/w.js'));
  assert.ok(!CK._isInfra('nottildacdn.com'), 'suffix matching must respect the label boundary');
  assert.ok(!CK._isInfra(''));
  assert.ok(!CK._isInfra(null));
  assert.ok(!CK._isInfra(42));
});

test('strict never intercepts infrastructure', () => {
  const env = load({ href: 'https://flufi.pet/page' });
  env.CK.init({ policyVersion: '1', blocking: { mode: 'strict' } });
  // The flufi.pet observation from §8: a Tilda site whose only pre-consent
  // third parties are the platform's own CDN and Google Fonts. Strict mode
  // blocking these would break the page and report nothing a visitor cares
  // about.
  for (const url of [
    'https://static.tildacdn.com/js/tilda-blocks-2.4.js',
    'https://ws.tildacdn.com/socket',
    'https://static.tildacdn.net/img/x.png',
    'https://static.wixstatic.com/x.js',
    'https://static.parastorage.com/services/x.bundle.js',
    'https://cdn.shopify.com/s/files/x.js',
    'https://static1.squarespace-cdn.com/x.js',
    'https://assets.website-files.com/x/x.js',
    'https://ajax.googleapis.com/ajax/libs/jquery/3.7.1/jquery.min.js',
    'https://fonts.googleapis.com/css2?family=Inter',
    'https://fonts.gstatic.com/s/inter/x.woff2',
    'https://consent.ecomconsult.net/client/ck-saas.js'
  ]) {
    assert.ok(!isBlocked(insert(env, 'script', url)), `strict intercepted infrastructure: ${url}`);
  }
});

test('infrastructure hosts are never classified as trackers', () => {
  // §8's contract with the scanner: an infra host has no consent category, so
  // it can never reach findings.trackers or a summary count. If an entry ever
  // gained a category, categoryForUrl would win over the allowlist and the two
  // sides would disagree about the same host — this is the guard against that.
  const { CK } = load();
  for (const host of CK._infra()) {
    assert.equal(CK._categoryForUrl('https://' + host + '/x.js'), null,
      `${host} is in _infra() but the database also gives it a category`);
    assert.equal(CK._categoryForUrl('https://sub.' + host + '/x.js'), null,
      `sub.${host} is under an _infra() entry but the database gives it a category`);
  }
});

test('Cloudflare Web Analytics is analytics, not infrastructure (§8)', () => {
  const env = load();
  // §8 calls this one out by name: the rest of Cloudflare's edge is
  // infrastructure, but this beacon measures visitors, so it is blocked as
  // analytics and must NOT be waved through by the infra allowlist.
  const { CK } = env;
  assert.equal(CK._categoryForUrl('https://static.cloudflareinsights.com/beacon.min.js'), 'analytics');
  assert.ok(!CK._isInfra('static.cloudflareinsights.com'));
  assert.ok(!CK._infra().includes('cloudflare.com'),
    'a bare cloudflare.com entry would wave the analytics beacon through');

  env.CK.init({ policyVersion: '1', blocking: { mode: 'strict' } });
  assert.ok(isBlocked(insert(env, 'script', 'https://static.cloudflareinsights.com/beacon.min.js')),
    'the Cloudflare analytics beacon must still be blocked before consent');
  // …while the CDN half of Cloudflare stays allowed.
  assert.ok(!isBlocked(insert(env, 'script', 'https://cdnjs.cloudflare.com/ajax/libs/x/x.js')));
});

test('a page-supplied ConsentKitDebugUrl host counts as infrastructure', () => {
  // §8 lists ConsentKitDebugUrl alongside our own service. It is a runtime
  // global rather than a shipped entry, so it is resolved at call time.
  const env = load();
  env.g.ConsentKitDebugUrl = 'https://debug.mirror.example/ck-debug.js';
  env.CK.init({ policyVersion: '1', blocking: { mode: 'strict' } });
  assert.ok(!isBlocked(insert(env, 'script', 'https://debug.mirror.example/ck-debug.js')),
    'strict blocked the debug panel the page itself pointed at');
  // Not a blanket allowance: only that exact host.
  assert.ok(isBlocked(insert(env, 'script', 'https://other.mirror.example/x.js')));
});

test('strict honours the site allowlist from config', () => {
  const env = load();
  env.CK.init({ policyVersion: '1', blocking: { mode: 'strict', allow: ['partner.example', '.Widgets.NET'] } });
  assert.ok(!isBlocked(insert(env, 'script', 'https://partner.example/w.js')));
  assert.ok(!isBlocked(insert(env, 'script', 'https://cdn.partner.example/w.js')), 'allow entries cover subdomains');
  assert.ok(!isBlocked(insert(env, 'script', 'https://widgets.net/w.js')), 'allow entries are case- and dot-insensitive');
  assert.ok(isBlocked(insert(env, 'script', 'https://other.example/w.js')), 'an unlisted host is still blocked');
});

test('a HOST_DB necessary/functional host passes strict on its own category', () => {
  const env = load();
  env.CK.init({
    policyVersion: '1',
    blocking: { mode: 'strict' },
    categories: { functional: { enabled: true } }
  });
  const chat = insert(env, 'script', 'https://widget.intercom.io/widget/abc');
  // functional is not granted yet, so it IS held back — but as 'functional',
  // its real category, and not as a strict-mode marketing interception.
  assert.ok(isBlocked(chat));
  assert.equal(chat.getAttribute('data-ck'), 'functional');

  env.CK.accept({ functional: true, analytics: false, marketing: false });
  const chat2 = insert(env, 'script', 'https://widget.intercom.io/widget/abc');
  assert.ok(!isBlocked(chat2), 'a granted functional host must pass even in strict mode');
});

test('strict does not touch data:, blob: or javascript: sources', () => {
  const env = load();
  env.CK.init({ policyVersion: '1', blocking: { mode: 'strict' } });
  for (const src of ['data:text/javascript,void 0', 'blob:https://x/y', 'about:blank']) {
    assert.ok(!isBlocked(insert(env, 'script', src)), `${src} should not be intercepted`);
  }
});

test('strict is inert when the page has no hostname (SSR / about:blank)', () => {
  const env = load({ href: 'about:blank' });
  env.CK.init({ policyVersion: '1', blocking: { mode: 'strict' } });
  // Conservative by design: with nothing to compare against, everything counts
  // as same-site rather than everything being blocked.
  assert.ok(!isBlocked(insert(env, 'script', 'https://widget.unknown-vendor.com/w.js')));
});

/* -------------------------------------------------------------- strict: iframes */

test('strict intercepts an unknown third-party iframe and leaves it revivable', () => {
  const env = load();
  env.CK.init({ policyVersion: '1', blocking: { mode: 'strict' } });

  const frame = insert(env, 'iframe', 'https://widget.unknown-vendor.com/embed');
  assert.ok(isBlocked(frame), 'strict mode did not intercept a third-party iframe');
  assert.equal(frame.getAttribute('data-ck'), 'marketing');
  assert.equal(frame.getAttribute('data-src'), 'https://widget.unknown-vendor.com/embed');
  // applyConsentToDom()'s iframe branch bails when src is still set, so the
  // attribute must be gone or the frame could never be revived.
  assert.equal(frame.getAttribute('src'), null, 'a blocked iframe must carry no src');
  // …and an iframe is never given type="text/plain": that is script-only.
  assert.equal(frame.getAttribute('type'), null);

  const own = insert(env, 'iframe', 'https://shop.example.com/embed');
  assert.ok(!isBlocked(own), 'a first-party iframe must not be intercepted');
});

test('a granted category revives a strict-blocked iframe', () => {
  const env = load();
  env.CK.init({ policyVersion: '1', blocking: { mode: 'strict' } });
  const frame = insert(env, 'iframe', 'https://widget.unknown-vendor.com/embed');
  assert.equal(frame.getAttribute('src'), null);

  env.CK.accept('all');
  assert.equal(frame.getAttribute('src'), 'https://widget.unknown-vendor.com/embed',
    'consent did not restore the iframe src');
});

/* ------------------------------------------------------------ revival on consent */

test('a strict-blocked script comes back when marketing is granted', () => {
  const env = load();
  env.CK.init({ policyVersion: '1', blocking: { mode: 'strict' } });
  const el = insert(env, 'script', 'https://widget.unknown-vendor.com/w.js');
  assert.ok(isBlocked(el));

  env.CK.accept({ functional: false, analytics: false, marketing: true });

  // reviveScript() replaces the element: the original leaves the tree and a
  // fresh script with the real src takes its place.
  const revived = env.doc._all.filter((e) => e.getAttribute('data-ck-restored') === '1');
  assert.equal(revived.length, 1, 'the blocked script was not revived');
  assert.equal(revived[0].getAttribute('src') || revived[0]._src,
    'https://widget.unknown-vendor.com/w.js');
});

test('analytics-only consent does NOT release a strict interception', () => {
  const env = load();
  env.CK.init({ policyVersion: '1', blocking: { mode: 'strict' } });
  insert(env, 'script', 'https://widget.unknown-vendor.com/w.js');
  env.CK.accept({ functional: true, analytics: true, marketing: false });
  assert.equal(env.doc._all.filter((e) => e.getAttribute('data-ck-restored')).length, 0,
    'a strict interception is marketing and must survive an analytics-only consent');
});

test('after consent, strict stops intercepting new insertions', () => {
  const env = load();
  env.CK.init({ policyVersion: '1', blocking: { mode: 'strict' } });
  env.CK.accept('all');
  const el = insert(env, 'script', 'https://widget.unknown-vendor.com/w.js');
  assert.ok(!isBlocked(el), 'strict kept blocking after marketing was granted');
});

/* --------------------------------------------------------------- _blocked() flag */

test('_blocked() marks strict interceptions and only those', () => {
  const env = load();
  env.CK.init({ policyVersion: '1', blocking: { mode: 'strict' } });
  insert(env, 'script', 'https://widget.unknown-vendor.com/w.js');
  insert(env, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

  const list = env.CK._blocked();
  const unknown = list.find((b) => b.host === 'widget.unknown-vendor.com');
  const known = list.find((b) => b.host === 'connect.facebook.net');

  assert.ok(unknown, 'the strict interception is missing from _blocked()');
  assert.equal(unknown.strict, true, 'a strict interception must be flagged');
  assert.equal(unknown.category, 'marketing');

  assert.ok(known, 'the known tracker is missing from _blocked()');
  assert.equal(known.strict, false, 'a database hit is not a strict interception');
});

test('_blocked() lists an engine-blocked iframe exactly once', () => {
  // The markup sweep selects iframe[data-ck][data-src], which is precisely the
  // shape markBlockedIframe() leaves behind — data-ck-blocked is what keeps the
  // same frame from being reported twice, once as 'engine' and once as 'markup'.
  const env = load();
  env.CK.init({ policyVersion: '1', blocking: { mode: 'strict' } });
  insert(env, 'iframe', 'https://widget.unknown-vendor.com/embed');

  const frames = env.CK._blocked().filter((b) => b.kind === 'iframe');
  assert.equal(frames.length, 1, 'the blocked iframe was double-counted');
  assert.equal(frames[0].origin, 'engine');
  assert.equal(frames[0].strict, true);
});

test('_blocked() carries no query string', () => {
  const env = load();
  env.CK.init({ policyVersion: '1', blocking: { mode: 'strict' } });
  insert(env, 'script', 'https://widget.unknown-vendor.com/w.js?uid=SECRET&email=a@b.c');
  const rec = env.CK._blocked().find((b) => b.host === 'widget.unknown-vendor.com');
  assert.equal(rec.path, '/w.js');
  assert.ok(!JSON.stringify(rec).includes('SECRET'));
});

/* ------------------------------------------------------------------ config shape */

test('blocking defaults to known mode with an empty allowlist', () => {
  const { CK } = load();
  CK.init({ policyVersion: '1' });
  // Structural, not deepEqual: the config object was built inside the vm realm,
  // so its Object/Array prototypes are not this realm's.
  assert.equal(CK.config.blocking.mode, 'known');
  assert.equal(CK.config.blocking.allow.length, 0);
});

test('config.blocking.allow is replaced wholesale, not merged element-wise', () => {
  const { CK } = load();
  CK.init({ policyVersion: '1', blocking: { mode: 'strict', allow: ['a.example'] } });
  assert.equal(CK.config.blocking.mode, 'strict');
  assert.deepEqual([...CK.config.blocking.allow], ['a.example']);
});

test('setting only the mode keeps the default allowlist', () => {
  const { CK } = load();
  CK.init({ policyVersion: '1', blocking: { mode: 'strict' } });
  assert.equal(CK.config.blocking.mode, 'strict');
  assert.equal(CK.config.blocking.allow.length, 0,
    'a partial blocking object must keep the default allowlist');
});

test('an unknown blocking.mode value behaves as known, not as strict', () => {
  const env = load();
  env.CK.init({ policyVersion: '1', blocking: { mode: 'STRICT' } });
  assert.ok(!isBlocked(insert(env, 'script', 'https://widget.unknown-vendor.com/w.js')),
    'only the exact string "strict" may turn strict mode on');
});

/* --------------------------------------------------------- setAttribute path */

test('strict also covers setAttribute("src", …) on scripts and iframes', () => {
  const env = load();
  env.CK.init({ policyVersion: '1', blocking: { mode: 'strict' } });

  const s = env.make('script');
  s.setAttribute('src', 'https://widget.unknown-vendor.com/w.js');
  assert.ok(isBlocked(s), 'setAttribute bypassed strict mode for a script');

  const f = env.make('iframe');
  f.setAttribute('src', 'https://widget.unknown-vendor.com/embed');
  assert.ok(isBlocked(f), 'setAttribute bypassed strict mode for an iframe');
  assert.equal(f.getAttribute('src'), null);
});

/* ------------------------------------------- what consent did NOT bring back */

test('_blocked() keeps reporting an interception that never came back', () => {
  /* An element created and given a src but never appended cannot be revived:
     applyConsentToDom() only walks the document, and reviveScript() needs a
     parentNode. Before this was handled, such an entry silently vanished from
     the panel the moment its category was granted — precisely when the owner
     is asking "why did my widget not come back after consent?", which is the
     workflow both README and INSTALL.ru send them to that panel for. */
  const env = load();
  env.CK.init({ policyVersion: '1', blocking: { mode: 'strict' } });

  const orphan = env.make('script');           // deliberately NOT appended
  orphan.src = 'https://orphan-widget.example/w.js';
  assert.ok(isBlocked(orphan));

  const attached = insert(env, 'script', 'https://normal-widget.example/w.js');
  assert.ok(isBlocked(attached));

  assert.equal(env.CK._blocked().length, 2);

  env.CK.accept('all');

  const after = env.CK._blocked();
  const hosts = after.map((b) => b.host);
  assert.ok(hosts.includes('orphan-widget.example'),
    'an interception that never came back disappeared from the report');
  assert.ok(!hosts.includes('normal-widget.example'),
    'a revived element must NOT still be reported as blocked');
  assert.equal(after.find((b) => b.host === 'orphan-widget.example').revived, false);
});

test('_blocked() marks entries that did come back before consent is given', () => {
  const env = load();
  env.CK.init({ policyVersion: '1', blocking: { mode: 'strict' } });
  insert(env, 'script', 'https://widget.unknown-vendor.com/w.js');
  // Nothing has been revived yet, but nothing has been granted either, so the
  // entry is simply pending — not a failure to come back.
  const rec = env.CK._blocked()[0];
  assert.equal(rec.revived, false);
  assert.equal(rec.strict, true);
});

test('a revived iframe stops being reported as blocked', () => {
  const env = load();
  env.CK.init({ policyVersion: '1', blocking: { mode: 'strict' } });
  insert(env, 'iframe', 'https://widget.unknown-vendor.com/embed');
  assert.equal(env.CK._blocked().length, 1);
  env.CK.accept('all');
  assert.equal(env.CK._blocked().length, 0, 'a revived iframe is still reported as blocked');
});

/* ------------------------------------------------ init({ hostdb }) standalone */

test('init({ hostdb }) merges overrides on a standalone page', () => {
  // The README lists `hostdb` as an init() key, so it has to work without
  // ck-saas.js on the page — not only through the SaaS config path.
  const { CK } = load();
  assert.equal(CK._categoryForUrl('https://cfg-host.example/x.js'), null);
  CK.init({ policyVersion: '1', hostdb: { 'cfg-host.example': 'analytics' } });
  assert.equal(CK._categoryForUrl('https://cfg-host.example/x.js'), 'analytics');
});

test('init({ hostdb }) applies before the initial scan of the markup', () => {
  // A script already in the document must be classified against the overrides,
  // which is why extendHostDb runs before initialScan() inside init().
  const env = load();
  const el = env.make('script');
  env.doc.body.appendChild(el);
  el._set('src', 'https://markup-host.example/t.js');   // as the parser left it

  env.CK.init({ policyVersion: '1', hostdb: { 'markup-host.example': 'marketing' } });
  assert.ok(isBlocked(el), 'the initial scan did not see the config overrides');
  assert.equal(el.getAttribute('data-ck'), 'marketing');
});

test('a malformed hostdb in config is ignored rather than fatal', () => {
  const { CK } = load();
  CK.init({ policyVersion: '1', hostdb: 'not-an-object' });
  assert.equal(CK.getState().decided, false);
  CK.init({ policyVersion: '1', hostdb: { 'bad.example': 'nonsense' } });
  assert.equal(CK._categoryForUrl('https://bad.example/x.js'), null);
});
