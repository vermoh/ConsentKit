/*!
 * consentkit — CommonJS entry. Same side effects as index.mjs.
 *
 * `require('../src/ck-core.js')` cannot be trusted for a value: this package is
 * `"type": "module"`, so Node parses the src files as ESM and hands back an
 * empty namespace instead of `module.exports`. The core attaches itself to the
 * global either way, and that is what we read.
 */

'use strict';

var CATEGORIES = ['necessary', 'functional', 'analytics', 'marketing'];

function undecidedState() {
  return {
    decided: false,
    id: null,
    ts: null,
    policyVersion: '1',
    categories: { necessary: true, functional: false, analytics: false, marketing: false },
    method: null
  };
}

function createStub() {
  return {
    version: '0.2.0',
    config: {},
    init: function () { return undecidedState(); },
    allowed: function (cat) { return cat === 'necessary'; },
    getState: undecidedState,
    accept: function () { return undecidedState(); },
    rejectAll: function () { return undecidedState(); },
    withdraw: function () { return undecidedState(); },
    show: function () {},
    hide: function () {},
    _categories: CATEGORIES.slice(),
    _isStub: true
  };
}

// The core binds to `window` when it exists, else `globalThis`. Check `window`
// first: under jsdom / Web Workers / an SSR DOM shim they are different objects
// and the API lands only on `window`.
function globalCandidates() {
  var seen = [];
  function push(g) { if (g && seen.indexOf(g) === -1) seen.push(g); }
  try { if (typeof window !== 'undefined') push(window); } catch (e) { /* noop */ }
  try { if (typeof globalThis !== 'undefined') push(globalThis); } catch (e) { /* noop */ }
  try { if (typeof global !== 'undefined') push(global); } catch (e) { /* noop */ }
  try { if (typeof self !== 'undefined') push(self); } catch (e) { /* noop */ }
  return seen;
}

function resolveApi() {
  var candidates = globalCandidates();
  for (var i = 0; i < candidates.length; i++) {
    var api = candidates[i].ConsentKit;
    if (api && typeof api.getState === 'function') return api;
  }
  return createStub();
}

// 1. Core — required, DOM-optional, starts blocking at parse time.
try { require('../src/ck-core.js'); } catch (e) { /* fall through to stub */ }

var hasDom = typeof document !== 'undefined' && typeof window !== 'undefined';

if (hasDom) {
  // 2. Locales — optional language packs.
  try { require('../src/ck-locales.js'); } catch (e) { /* optional */ }
  // 3. UI — touches `document` at module scope, browser only.
  try { require('../src/ck-ui.js'); } catch (e) { /* best effort */ }
}

var ConsentKit = resolveApi();

module.exports = ConsentKit;
module.exports.ConsentKit = ConsentKit;
module.exports.default = ConsentKit;
