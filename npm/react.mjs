/*!
 * consentkit/react — `useConsent()` hook.
 *
 * React is a peerDependency (>=17), never a dependency: this file imports it,
 * the host app provides it.
 *
 * Two details that are easy to get wrong and are handled here:
 *
 * 1. `ConsentKit.getState()` builds a NEW object on every call. Feeding that
 *    straight to `useSyncExternalStore` makes `Object.is` fail on every render
 *    and loops forever. The snapshot is cached in a module-level variable and
 *    only replaced when a ck:* event actually fires.
 * 2. On the server there is no `document` to subscribe to, so `subscribe`
 *    no-ops and `getServerSnapshot` returns a frozen undecided state.
 */

import { useCallback, useSyncExternalStore } from 'react';

import { resolveApi, undecidedState } from './internal-stub.mjs';

// Side-effect import of the core only. The UI layer is intentionally NOT
// imported here — apps that want the banner import 'consentkit' as well.
import '../src/ck-core.js';

const EVENTS = ['ck:init', 'ck:consent', 'ck:change'];

/**
 * Evaluated per call, never cached at import time: a DOM shim (jsdom, a test
 * harness, a hydration polyfill) may be installed after this module loads, and
 * a captured `false` would strand the hook in its server branch forever.
 */
function hasDom() {
  return typeof document !== 'undefined' && !!document.addEventListener;
}

/** Frozen, referentially stable snapshot for SSR and the first client paint. */
const SERVER_SNAPSHOT = Object.freeze(undecidedState());

function api() {
  return resolveApi();
}

/**
 * Cached snapshot. Replaced only inside the event listener, so `getSnapshot`
 * returns a stable reference between events.
 */
let snapshot = null;

function readSnapshot() {
  // Filled on first read rather than at import time, for the same reason.
  if (snapshot === null) {
    snapshot = hasDom() ? api().getState() : SERVER_SNAPSHOT;
  }
  return snapshot;
}

function readServerSnapshot() {
  return SERVER_SNAPSHOT;
}

/**
 * Subscribes to the consent event bus. Returns the cleanup that removes every
 * listener it added — React calls it on unmount and on re-subscribe.
 */
function subscribe(onStoreChange) {
  if (!hasDom()) return function () {};

  const handler = function () {
    const next = api().getState();
    // Cheap structural compare: skip the re-render when nothing really moved.
    if (!sameState(snapshot, next)) {
      snapshot = next;
      onStoreChange();
    }
  };

  EVENTS.forEach(function (name) {
    document.addEventListener(name, handler, false);
  });

  // Close the render→subscribe gap. React reads the snapshot during render but
  // only attaches this subscription in an effect; consent restored in between
  // (the usual `ConsentKit.init()` in a client effect dispatching ck:init)
  // would otherwise be missed until the next event, leaving a returning
  // visitor rendered as undecided. `sameState` keeps the reference stable when
  // nothing actually changed, so this never forces a spurious render.
  handler();

  return function cleanup() {
    EVENTS.forEach(function (name) {
      document.removeEventListener(name, handler, false);
    });
  };
}

function sameState(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.decided !== b.decided || a.id !== b.id || a.ts !== b.ts) return false;
  if (a.method !== b.method || a.policyVersion !== b.policyVersion) return false;
  const ca = a.categories || {};
  const cb = b.categories || {};
  return ca.necessary === cb.necessary &&
    ca.functional === cb.functional &&
    ca.analytics === cb.analytics &&
    ca.marketing === cb.marketing;
}

/**
 * React binding for the consent state.
 *
 * @returns {{
 *   state: object,
 *   allowed: (cat: string) => boolean,
 *   accept: (choice?: any) => object,
 *   rejectAll: () => object,
 *   withdraw: () => object,
 *   show: () => void
 * }}
 */
export function useConsent() {
  const state = useSyncExternalStore(subscribe, readSnapshot, readServerSnapshot);

  const allowed = useCallback(function (cat) {
    if (!hasDom()) return cat === 'necessary';
    try { return api().allowed(cat); } catch (e) { return false; }
  }, []);

  const accept = useCallback(function (choice) {
    if (!hasDom()) return SERVER_SNAPSHOT;
    return api().accept(choice === undefined ? 'all' : choice);
  }, []);

  const rejectAll = useCallback(function () {
    if (!hasDom()) return SERVER_SNAPSHOT;
    return api().rejectAll();
  }, []);

  const withdraw = useCallback(function () {
    if (!hasDom()) return SERVER_SNAPSHOT;
    return api().withdraw();
  }, []);

  const show = useCallback(function () {
    if (!hasDom()) return;
    api().show();
  }, []);

  return { state, allowed, accept, rejectAll, withdraw, show };
}

export default useConsent;
