/* src/ck-debug-loader.js — the activation switch that ships instead of the panel.
 *
 * Three things must hold, and nothing else notices when they stop holding:
 *
 *  1. Inert when not activated. This is the whole point of the loader: it goes
 *     into every inline block and onto every WordPress page, so an ordinary
 *     visitor must pay ~1.5 KB and nothing else — no script element, no
 *     network request, no DOM.
 *
 *  2. The off switch still works. `?ck_debug=0` has to clear the stored flag
 *     even though the panel is not loaded and cannot clear it itself. Get this
 *     wrong and a site owner who once switched the panel on can never switch
 *     it off again.
 *
 *  3. Activation agrees with the panel. parseActivation() exists in both
 *     files — the panel must stay self-contained for the demo page, which
 *     loads it directly — so the two copies are asserted equal against a table
 *     of inputs. That duplication is the seam most likely to drift.
 *
 * Loaded the same way as test/debug.test.mjs: a window stub plus
 * vm.runInThisContext, with the surface read back off the published global.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = readFileSync(join(REPO, 'src', 'ck-debug-loader.js'), 'utf8');
const PANEL_SOURCE = readFileSync(join(REPO, 'src', 'ck-debug.js'), 'utf8');

function loadIn(source, global_, env = {}) {
  const g = globalThis;
  const saved = {
    window: g.window, self: g.self, document: g.document,
    location: g.location, localStorage: g.localStorage,
    ConsentKit: g.ConsentKit, ConsentKitDebugUrl: g.ConsentKitDebugUrl,
    __ckDebug: g.__ckDebug, __ckDebugLoader: g.__ckDebugLoader,
    navigator: g.navigator, dataLayer: g.dataLayer
  };
  for (const k of Object.keys(saved)) { delete g[k]; }

  g.window = g;
  g.self = g;
  for (const k of ['location', 'localStorage', 'document', 'ConsentKit', 'ConsentKitDebugUrl', 'navigator', '__ckDebug']) {
    if (env[k] !== undefined) { g[k] = env[k]; }
  }

  try {
    vm.runInThisContext(source, { filename: source === SOURCE ? 'src/ck-debug-loader.js' : 'src/ck-debug.js' });
    return g[global_];
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) { delete g[k]; } else { g[k] = saved[k]; }
    }
  }
}

function load(env = {}) {
  const api = loadIn(SOURCE, '__ckDebugLoader', env);
  assert.ok(api, 'src/ck-debug-loader.js did not publish window.__ckDebugLoader');
  return api;
}

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; }
  };
}

/* A document stub that records every element created and appended, so
   "no request was made" is an observation and not merely the absence of an
   opportunity. */
function fakeDoc() {
  const created = [];
  const appended = [];
  const head = { appendChild: (n) => appended.push(n) };
  return {
    created,
    appended,
    head,
    body: head,
    documentElement: head,
    readyState: 'complete',
    createElement: (tag) => {
      const node = { tagName: tag, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
      created.push(node);
      return node;
    },
    addEventListener() {}
  };
}

/* ------------------------------------------------------- URL resolution */

const resolveUrl = load().resolveUrl;
const CDN = 'https://cdn.jsdelivr.net/npm/@ecomconsult/consentkit@';

test('1st: window.ConsentKitDebugUrl wins over everything', () => {
  assert.equal(
    resolveUrl('https://own.example/panel.js', { siteId: 's1', api: 'https://api.example' }, '0.3.5'),
    'https://own.example/panel.js'
  );
});

test('2nd: the SaaS API base serves the panel from its own origin', () => {
  assert.equal(
    resolveUrl('', { siteId: 's1', api: 'https://api.example.com' }, '0.3.5'),
    'https://api.example.com/client/ck-debug.js'
  );
});

test('a trailing slash on the API base does not double up', () => {
  assert.equal(
    resolveUrl('', { siteId: 's1', api: 'https://api.example.com/' }, '0.3.5'),
    'https://api.example.com/client/ck-debug.js'
  );
});

test('the SaaS branch needs BOTH a siteId and an api base', () => {
  // ck-saas.js publishes _saas only after it has a siteId, but the object is
  // reachable from any page script; half a configuration must fall through to
  // the CDN rather than build a broken URL.
  assert.equal(resolveUrl('', { siteId: '', api: 'https://api.example.com' }, '0.3.5'),
    CDN + '0.3.5/src/ck-debug.js');
  assert.equal(resolveUrl('', { siteId: 's1', api: '' }, '0.3.5'),
    CDN + '0.3.5/src/ck-debug.js');
});

test('3rd: jsDelivr, pinned to the running core version', () => {
  assert.equal(resolveUrl('', null, '0.3.5'), CDN + '0.3.5/src/ck-debug.js');
  assert.equal(resolveUrl('', null, '1.0.0-rc.1'), CDN + '1.0.0-rc.1/src/ck-debug.js');
});

test('an unknown core version falls back to the latest tag, not to "undefined"', () => {
  assert.equal(resolveUrl('', null, ''), CDN + 'latest/src/ck-debug.js');
  assert.equal(resolveUrl(), CDN + 'latest/src/ck-debug.js');
});

test('the pinned version is URL-encoded', () => {
  assert.ok(!resolveUrl('', null, 'a/b').includes('a/b'),
    'a version containing a slash must not escape the package path');
});

/* --------------------------------------------------------- inert by default */

test('inactive: no script element, no request, no DOM', () => {
  const doc = fakeDoc();
  const api = load({
    document: doc,
    location: { search: '?utm=1', hash: '', href: 'https://example.com/' },
    localStorage: fakeStorage(),
    ConsentKit: { version: '0.3.5' }
  });
  assert.equal(api.active, false, 'the loader reported itself active without activation');
  assert.equal(api.url, null, 'the loader resolved a URL while inactive');
  assert.deepEqual(doc.created, [], 'the loader created DOM nodes while inactive');
  assert.deepEqual(doc.appended, [], 'the loader appended a script while inactive');
});

test('loading with no location, storage or document does not throw', () => {
  const api = load();
  assert.equal(api.active, false);
  assert.equal(typeof api.resolveUrl, 'function');
});

/* --------------------------------------------------------------- activation */

test('?ck_debug=1 injects exactly one async script at the resolved URL', () => {
  const doc = fakeDoc();
  const api = load({
    document: doc,
    location: { search: '?ck_debug=1', hash: '', href: 'https://example.com/' },
    localStorage: fakeStorage(),
    ConsentKit: { version: '0.3.5' }
  });

  assert.equal(api.active, true);
  assert.equal(doc.appended.length, 1, 'expected exactly one injected script');
  const s = doc.appended[0];
  assert.equal(s.tagName, 'script');
  assert.equal(s.src, CDN + '0.3.5/src/ck-debug.js');
  assert.equal(s.async, true, 'the panel must never block the page it is inspecting');
  assert.equal(api.url, s.src);
});

test('?ck_debug=1 persists the flag so the panel survives navigation', () => {
  const ls = fakeStorage();
  load({
    document: fakeDoc(),
    location: { search: '?ck_debug=1', hash: '', href: 'https://example.com/' },
    localStorage: ls,
    ConsentKit: { version: '0.3.5' }
  });
  assert.equal(ls.data.ck_debug, '1');
});

test('a stored flag alone activates the loader', () => {
  const doc = fakeDoc();
  const api = load({
    document: doc,
    location: { search: '', hash: '', href: 'https://example.com/' },
    localStorage: fakeStorage({ ck_debug: '1' }),
    ConsentKit: { version: '0.3.5' }
  });
  assert.equal(api.active, true);
  assert.equal(doc.appended.length, 1);
});

test('?ck_debug=0 clears the stored flag even though nothing is loaded', () => {
  // The regression this test exists for: the loader returns early when
  // inactive, so if it did not persist BEFORE that return, the off switch
  // would be unreachable — the panel clears the flag itself, and the panel is
  // exactly what is not on the page.
  const ls = fakeStorage({ ck_debug: '1' });
  const doc = fakeDoc();
  const api = load({
    document: doc,
    location: { search: '?ck_debug=0', hash: '', href: 'https://example.com/' },
    localStorage: ls,
    ConsentKit: { version: '0.3.5' }
  });
  assert.equal(api.active, false);
  assert.equal(ls.data.ck_debug, undefined, '?ck_debug=0 did not clear the stored flag');
  assert.deepEqual(doc.appended, [], 'the loader fetched the panel while switching it off');
});

test('the SaaS branch is taken end to end when ck-saas.js is on the page', () => {
  const doc = fakeDoc();
  load({
    document: doc,
    location: { search: '?ck_debug=1', hash: '', href: 'https://shop.example/' },
    localStorage: fakeStorage(),
    ConsentKit: { version: '0.3.5', _saas: { siteId: 'abc', api: 'https://api.consentkit.test' } }
  });
  assert.equal(doc.appended[0].src, 'https://api.consentkit.test/client/ck-debug.js');
});

test('window.ConsentKitDebugUrl is taken end to end', () => {
  const doc = fakeDoc();
  load({
    document: doc,
    location: { search: '?ck_debug=1', hash: '', href: 'https://shop.example/' },
    localStorage: fakeStorage(),
    ConsentKitDebugUrl: 'https://self.hosted/ck-debug.js',
    ConsentKit: { version: '0.3.5', _saas: { siteId: 'abc', api: 'https://api.consentkit.test' } }
  });
  assert.equal(doc.appended[0].src, 'https://self.hosted/ck-debug.js');
});

test('a panel already on the page is not fetched twice', () => {
  // The demo page loads src/ck-debug.js directly and the loader alongside it.
  const doc = fakeDoc();
  load({
    document: doc,
    location: { search: '?ck_debug=1', hash: '', href: 'https://example.com/' },
    localStorage: fakeStorage(),
    ConsentKit: { version: '0.3.5' },
    __ckDebug: { active: true }
  });
  assert.deepEqual(doc.appended, [], 'the loader fetched a panel that was already present');
});

/* ------------------------------------- the two copies of parseActivation */

test('the loader and the panel agree on every activation input', () => {
  const loaderParse = load().parseActivation;
  const panelParse = loadIn(PANEL_SOURCE, '__ckDebug').parseActivation;

  const cases = [
    ['', '', null],
    ['', '', '1'],
    ['?ck_debug', '', null],
    ['?ck_debug=1', '', null],
    ['?ck_debug=0', '', '1'],
    ['?ck_debug=', '', '1'],
    ['?ck_debug=true', '', null],
    ['?ck_debug=no', '', '1'],
    ['?utm=1&ck_debug=1', '', null],
    ['', '#ck_debug', null],
    ['', '#ck_debug=0', '1'],
    ['', '#other', '1'],
    ['?ck_debug=0', '#ck_debug', '1']
  ];

  for (const [search, hash, stored] of cases) {
    assert.deepEqual(
      loaderParse(search, hash, stored),
      panelParse(search, hash, stored),
      `activation drifted between the loader and the panel for ` +
      `search=${JSON.stringify(search)} hash=${JSON.stringify(hash)} stored=${JSON.stringify(stored)}`
    );
  }
});

/* ------------------------------------------ the panel URL is not blockable */

test('the blocking engine does not classify the panel URL as a tracker', () => {
  // ck-core.js blocks by a fixed list of tracker hosts and paths. If a future
  // entry ever matched jsDelivr or a ConsentKit API host, the panel could not
  // load before the visitor decided — which is precisely when it is needed.
  const g = globalThis;
  const saved = { window: g.window, self: g.self, document: g.document, location: g.location, ConsentKit: g.ConsentKit };
  for (const k of Object.keys(saved)) { delete g[k]; }
  g.window = g;
  g.self = g;
  g.location = { href: 'https://example.com/', hostname: 'example.com', search: '', hash: '' };

  let classify;
  try {
    vm.runInThisContext(readFileSync(join(REPO, 'src', 'ck-core.js'), 'utf8'), { filename: 'src/ck-core.js' });
    classify = g.ConsentKit && g.ConsentKit._categoryForUrl;
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) { delete g[k]; } else { g[k] = saved[k]; }
    }
  }

  assert.equal(typeof classify, 'function', 'ck-core.js did not expose _categoryForUrl');
  for (const url of [
    CDN + '0.3.5/src/ck-debug.js',
    'https://api.consentkit.test/client/ck-debug.js'
  ]) {
    assert.equal(classify(url), null, `${url} would be held back by the blocking engine`);
  }
});
