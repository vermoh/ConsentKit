/*!
 * Internal: locates the ConsentKit global, or hands back a safe no-op stub.
 * Not a public entry point — no `exports` subpath maps here.
 */

const CATEGORIES = ['necessary', 'functional', 'analytics', 'marketing'];

function emptyCategories() {
  return { necessary: true, functional: false, analytics: false, marketing: false };
}

/** Undecided state, shape-identical to what the real core returns. */
export function undecidedState() {
  return {
    decided: false,
    id: null,
    ts: null,
    policyVersion: '1',
    categories: emptyCategories(),
    method: null
  };
}

/**
 * No-op API with the exact public surface, for environments where the core
 * could not attach itself. Every method is safe to call and returns the same
 * shape as the real one, so consumer code needs no branching.
 */
export function createStub() {
  const stub = {
    version: '0.5.3',
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
    // v0.4.0: the stub mirrors the real surface, so consumer code that calls
    // these needs no branching when the core failed to attach.
    _extendHostDb: function () { return 0; },
    _baseAllow: [],
    _categoryForUrl: function () { return null; },
    // v0.4.1 (§8): the infrastructure list. Empty here for the same reason
    // _baseAllow is — a stub means the engine never attached, so it is not
    // letting anything through and must not claim a list it does not enforce.
    _infra: function () { return []; },
    _isInfra: function () { return false; },
    _blocked: function () { return []; },
    _isStub: true
  };
  return stub;
}

/**
 * Candidate global objects, in the order the core itself prefers them.
 *
 * `src/ck-core.js` binds to `typeof window !== 'undefined' ? window :
 * globalThis`, so `window` must be checked FIRST. In a browser the two are the
 * same object and the order is moot, but under jsdom, Web Workers or an SSR
 * DOM shim `window` is a distinct object and the API lands only there —
 * checking `globalThis` alone would silently fall back to the stub.
 */
function globalCandidates() {
  const seen = [];
  const push = (g) => { if (g && seen.indexOf(g) === -1) seen.push(g); };
  try { if (typeof window !== 'undefined') push(window); } catch (e) { /* noop */ }
  try { if (typeof globalThis !== 'undefined') push(globalThis); } catch (e) { /* noop */ }
  try { if (typeof global !== 'undefined') push(global); } catch (e) { /* noop */ }
  try { if (typeof self !== 'undefined') push(self); } catch (e) { /* noop */ }
  return seen;
}

/** The global object, whatever the host calls it. */
export function getGlobal() {
  return globalCandidates()[0];
}

/**
 * Returns the live ConsentKit API. `src/ck-core.js` assigns it to the global at
 * parse time; under ESM its module namespace is empty, so the global is the
 * contract. Falls back to the stub only if the core is genuinely absent.
 */
export function resolveApi() {
  const candidates = globalCandidates();
  for (let i = 0; i < candidates.length; i++) {
    const api = candidates[i].ConsentKit;
    if (api && typeof api.getState === 'function') return api;
  }
  return createStub();
}
