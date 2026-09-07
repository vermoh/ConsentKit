/* SPEC §1.9 — «Второй экземпляр ck.js уступает первому».
 *
 * A page can carry two snippets: an old page-level block whose site id is long
 * dead, plus the site-wide one somebody added later. Each <script src=".../ck.js">
 * loads the WHOLE served bundle — ck-core + ck-locales + ck-ui-branding + ck-ui
 * + ck-saas concatenated — so every one of those files runs twice in the same
 * window.
 *
 * Before 0.5.14 that was fatal in a way the loader arbitration in ck-saas.js
 * could not fix on its own. The second bundle's ck-core republished a fresh,
 * uninitialised engine over `window.ConsentKit`; the first engine kept its DOM
 * patches and its observer but nothing pointed at it any more, and the first
 * loader — still mid-fetch, holding its own `CK` reference — applied the real
 * config to the orphan. Meanwhile the second copy of ck-ui registered a second
 * `ck:init` listener with its own `mounted` closure and drew a banner from the
 * core's parse-time DEFAULTS. A browser stand ended the page on
 * `window.ConsentKit.config.policyVersion === '1'` with default texts on screen.
 *
 * So this suite runs the concatenated bundle TWICE in ONE vm context, which is
 * exactly what the browser does, and asserts the second run yields to the first.
 *
 * THE VACUOUS-PASS TRAP, twice over — this harness is built against both:
 *
 *   - `document.dispatchEvent` must really call the listeners. A stub that only
 *     returns true (the blocking.test.mjs shape, which needs no bus) would make
 *     "exactly one mount" pass because there were ZERO mounts. The bus below is
 *     real, and its listener array is also what the "registered once" assertion
 *     counts.
 *   - mount() does `getElementById('ck-root')` and then
 *     `host.shadowRoot || host.attachShadow(...)`, so counting hosts or roots
 *     would pass even with two copies mounting: the second closure finds the
 *     first one's host and reuses it. The fake host therefore carries NO
 *     `shadowRoot` property and the count is of `attachShadow()` CALLS, which
 *     two mounting closures necessarily make twice.
 *
 * And a positive control at the end: with the guard flag deleted, the same
 * third run must produce the doubling. If that ever stops failing-by-design,
 * the harness has gone blind and every assertion above is worthless.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* The served bundle, in the order tools/build-inline.mjs concatenates it.
   ck-saas.js is included because it is part of what a snippet loads, but it
   stays inert here: the fake DOM has no `script[data-ck-id]`, so findOwnTag()
   returns null and the loader returns before it can reach for fetch. init() is
   called by the test instead — which is what SPEC §1.9 is about anyway. */
const BUNDLE = ['ck-core.js', 'ck-locales.js', 'ck-ui-branding.js', 'ck-ui.js', 'ck-saas.js']
  .map((f) => readFileSync(join(REPO, 'src', f), 'utf8'))
  .join('\n;\n');

/* ------------------------------------------------------------------- fake DOM */

/* A real classList, not a stub of one. applyTheme() calls
   `host.classList.remove(...)` on the mount host, and mount() runs it BEFORE
   the banner is built — so a node without one throws right there. The core
   wraps its whole dispatch in try/catch, which means such a throw does not
   surface: it silently eats the FIRST ck:init listener and the remaining ones
   never run. "Exactly one mount" would then pass on a page where both copies
   were in fact mounting. Cost of the omission: the suite reports success for
   the bug it exists to catch. */
function makeClassList(node) {
  const set = new Set();
  const sync = () => { node.className = [...set].join(' '); };
  return {
    add(...cs) { cs.forEach((c) => c && set.add(c)); sync(); },
    remove(...cs) { cs.forEach((c) => set.delete(c)); sync(); },
    toggle(c, force) {
      const on = force === undefined ? !set.has(c) : !!force;
      if (on) { set.add(c); } else { set.delete(c); }
      sync();
      return on;
    },
    contains(c) { return set.has(c); }
  };
}

function makeNode(tagName, doc, g) {
  const attrs = new Map();
  const node = {
    tagName: String(tagName).toUpperCase(),
    nodeType: 1,
    ownerDocument: doc,
    parentNode: null,
    childNodes: [],
    attributes: [],
    style: {},
    className: '',
    id: '',
    _src: '',
    textContent: '',
    innerHTML: '',
    dataset: {},
    getAttribute(n) { const k = String(n).toLowerCase(); return attrs.has(k) ? attrs.get(k) : null; },
    _set(n, v) {
      const k = String(n).toLowerCase();
      attrs.set(k, String(v));
      node.attributes = [...attrs].map(([name, value]) => ({ name, value }));
      if (k === 'id') { node.id = String(v); }
    },
    _remove(n) {
      attrs.delete(String(n).toLowerCase());
      node.attributes = [...attrs].map(([name, value]) => ({ name, value }));
    },
    setAttribute(n, v) { return g.Element.prototype.setAttribute.call(node, n, v); },
    removeAttribute(n) { return node._remove(n); },
    hasAttribute(n) { return attrs.has(String(n).toLowerCase()); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementsByTagName() { return []; },
    appendChild(child) { child.parentNode = node; node.childNodes.push(child); return child; },
    insertBefore(child) { child.parentNode = node; node.childNodes.push(child); return child; },
    removeChild(child) {
      const i = node.childNodes.indexOf(child);
      if (i > -1) { node.childNodes.splice(i, 1); }
      child.parentNode = null;
      return child;
    },
    contains(other) { return node.childNodes.indexOf(other) > -1; },
    addEventListener() {},
    removeEventListener() {},
    focus() {},
    closest() { return null; },
    // NOTE: no `shadowRoot` property. mount() reads `host.shadowRoot ||
    // host.attachShadow(...)`, so exposing one would let a second mounting
    // closure quietly reuse the first root and hide the very bug this file is
    // about. See the header.
    attachShadow() {
      g.__attachShadowCalls++;
      const root = makeNode('#shadow-root', doc, g);
      root.host = node;
      return root;
    }
  };
  node.classList = makeClassList(node);
  return node;
}

function makePage() {
  const g = Object.create(null);
  const listeners = {};      // type -> [fn], the real bus
  const errors = [];         // listener throws the harness must not hide
  const nodes = [];

  g.__attachShadowCalls = 0;

  const doc = {
    cookie: '',
    readyState: 'complete',
    _all: nodes,
    createElement(tag) { const n = makeNode(tag, doc, g); nodes.push(n); return n; },
    createTextNode(t) { const n = makeNode('#text', doc, g); n.textContent = String(t); return n; },
    getElementById(id) { return nodes.find((n) => n.id === id) || null; },
    querySelector() { return null; },
    // Deliberately empty for every selector: no blocked tags, and — the part
    // that matters for ck-saas.js — no `script[data-ck-id]`, so the loader
    // stays inert and cannot drag a strict fallback into this test.
    querySelectorAll() { return []; },
    addEventListener(type, fn) {
      (listeners[type] || (listeners[type] = [])).push(fn);
    },
    removeEventListener(type, fn) {
      const l = listeners[type];
      if (!l) { return; }
      const i = l.indexOf(fn);
      if (i > -1) { l.splice(i, 1); }
    },
    /* A REAL dispatch. Without this, "exactly one mount" would pass on zero.
       Each listener is called in its own try/catch and the failure is RECORDED
       rather than rethrown, because that is what a browser does — one broken
       handler does not stop the others. The core's own dispatch() has a single
       try/catch around the whole call, so re-throwing here would let a stub gap
       in ONE listener silently cancel every later one. `listenerErrors()` is
       asserted empty by the suite, so a gap becomes a failure instead of a
       quiet miscount. */
    dispatchEvent(ev) {
      const l = listeners[ev && ev.type] || [];
      for (const fn of l.slice()) {
        try { fn(ev); } catch (e) { errors.push((ev && ev.type) + ': ' + (e && e.message)); }
      }
      return true;
    },
    documentElement: null,
    body: null,
    head: null
  };
  doc.body = makeNode('body', doc, g);
  doc.head = makeNode('head', doc, g);
  doc.documentElement = makeNode('html', doc, g);
  nodes.push(doc.body, doc.head, doc.documentElement);

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
  g.globalThis = g;
  g.document = doc;
  g.console = { log() {}, info() {}, warn() {}, error() {} };
  g.location = { href: 'https://shop.example.com/page', hostname: 'shop.example.com', search: '', hash: '' };
  g.navigator = { language: 'en' };
  g.URL = URL;
  g.localStorage = null;
  g.Promise = Promise;
  g.setTimeout = () => 0;          // no real timers: ck-ui's font ladder and the
  g.clearTimeout = () => {};       // missed-ck:init fallback must not fire here
  g.setInterval = () => 0;
  g.clearInterval = () => {};
  g.requestAnimationFrame = () => 0;
  g.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {} });
  g.getComputedStyle = () => ({ getPropertyValue: () => '', fontFamily: '' });
  g.DOMParser = class { parseFromString() { return null; } };
  g.HTMLScriptElement = srcProto();
  g.HTMLIFrameElement = srcProto();
  g.Element = function () {};
  g.Element.prototype.setAttribute = function (n, v) { return this._set(n, v); };
  g.Element.prototype.removeAttribute = function (n) { return this._remove(n); };
  g.CustomEvent = function (name, init) {
    this.type = name;
    this.detail = (init && init.detail) || null;
  };
  g.addEventListener = () => {};
  g.removeEventListener = () => {};
  g.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
  g.atob = (s) => Buffer.from(s, 'base64').toString('binary');

  const ctx = vm.createContext(g);

  return {
    g, ctx, doc, listeners,
    listenerErrors() { return errors.slice(); },
    run() { vm.runInContext(BUNDLE, ctx, { filename: 'bundle(ck.js)' }); },
    /* Must run INSIDE the context. Deleting the property off the sandbox object
       from out here looks like it worked — the outer read goes undefined — but
       the contextified global keeps its own value and the code under test still
       sees `true`. That silent divergence would turn the control below into the
       exact vacuous pass it exists to catch. */
    clearUiFlag() { vm.runInContext('delete window.__ckUiLoaded;', ctx); },
    initCount(type) { return (listeners[type] || []).length; },
    mounts() { return g.__attachShadowCalls; }
  };
}

/* ---------------------------------------------------------------- the suite */

test('a second bundle does not replace window.ConsentKit', () => {
  const page = makePage();
  page.run();

  const first = page.g.ConsentKit;
  assert.ok(first, 'the first bundle did not publish window.ConsentKit');
  assert.equal(typeof first.init, 'function');

  // A mark on the FIRST object. `===` alone would also be satisfied by an
  // object that had been rebuilt in place; this cannot be.
  first.__probe = 'first-engine';

  assert.doesNotThrow(() => page.run(), 'the second bundle threw');

  assert.equal(page.g.ConsentKit, first,
    'the second ck-core republished over the first engine — the loaders hold a stale CK');
  assert.equal(page.g.ConsentKit.__probe, 'first-engine',
    'window.ConsentKit is a different object than the one the first run set up');
});

test('a second bundle registers no second ck:init listener', () => {
  const page = makePage();
  page.run();
  const afterOne = page.initCount('ck:init');
  assert.equal(afterOne, 1, 'the first bundle must register exactly one ck:init listener');

  page.run();
  assert.equal(page.initCount('ck:init'), 1,
    'the second ck-ui registered its own ck:init listener with its own mounted closure');
});

test('init() after a double load mounts the banner exactly once', () => {
  const page = makePage();
  page.run();
  page.run();

  assert.equal(page.mounts(), 0, 'nothing may mount before init()');
  assert.doesNotThrow(() => page.g.ConsentKit.init({ policyVersion: '1' }), 'init() threw');

  assert.deepEqual(page.listenerErrors(), [],
    'a ck:init listener threw — the harness is missing DOM, and a throw here would ' +
    'cancel every later listener and fake a single mount');
  assert.equal(page.mounts(), 1,
    'the banner mounted ' + page.mounts() + ' times — one copy of ck-ui per snippet');
});

/* The browser stand's exact symptom, and the one test here that has to be
   written from the LOADER's point of view rather than the page's.

   Reading back the same object you just called init() on cannot fail, guard or
   no guard — it is the same object either way. The production failure needed a
   reference captured BEFORE the second bundle landed: ck-saas.js grabs
   `var CK = global.ConsentKit` at parse time and calls `CK.init(config)` later,
   when its fetch resolves. If the second core has republished in between, the
   real config goes onto the orphan and `window.ConsentKit` is left holding the
   parse-time defaults — `policyVersion === '1'`, default texts on screen.

   So CK1 below IS that mid-fetch loader, and this test fails without the core
   guard. */
test('a config applied by a loader that captured CK before the second bundle still lands on the page', () => {
  const page = makePage();
  page.run();
  const CK1 = page.g.ConsentKit;   // what a loader captured before bundle 2
  page.run();
  CK1.init({ policyVersion: 'from-the-server' });

  assert.equal(page.g.ConsentKit.config.policyVersion, 'from-the-server',
    'window.ConsentKit fell back to the parse-time default — the second core ' +
    'republished and the real config was applied to an orphaned engine');
});

test('the core stands down but keeps the first engine working', () => {
  const page = makePage();
  page.run();
  page.run();
  const CK = page.g.ConsentKit;

  // The surviving engine is the whole point: a stood-down core must not have
  // taken the live one's API with it.
  assert.equal(typeof CK.getState, 'function');
  assert.equal(typeof CK._extendHostDb, 'function');
  CK.init({ policyVersion: '1' });
  assert.equal(CK.getState().decided, false);
  assert.equal(CK._categoryForUrl('https://static.hotjar.com/x.js'), 'analytics',
    'the first engine lost its host database');
});

/* ------------------------------------------------------- the positive control */

/* Everything above passes trivially if this harness cannot see a double load in
   the first place — a dropped listener, a reused shadow root, a mount that
   never happens. So: clear the flag ck-ui claims the page with, run the bundle
   a third time, and require the doubling to appear. A green suite with THIS
   test green is the only combination that means anything. */
test('control: with the ck-ui guard flag cleared, a third bundle really does double', () => {
  const page = makePage();
  page.run();
  page.run();
  assert.equal(page.initCount('ck:init'), 1);

  page.clearUiFlag();
  page.run();

  assert.equal(page.initCount('ck:init'), 2,
    'the harness cannot observe a second ck-ui at all — every assertion above is vacuous');

  page.g.ConsentKit.init({ policyVersion: '1' });
  assert.deepEqual(page.listenerErrors(), [],
    'a listener threw during the control run');
  assert.equal(page.mounts(), 2,
    'the harness cannot observe a second mount — the "exactly one mount" test proves nothing');
});
