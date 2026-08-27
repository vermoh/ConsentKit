/*!
 * consentkit — ESM entry. Side-effect: loads core, locales and UI, then
 * re-exports the public API.
 *
 * Load order is contractual: ck-core.js (blocking starts at parse time) →
 * ck-locales.js (extra language packs) → ck-ui.js (Shadow DOM layer).
 *
 * Only the core is DOM-optional. `src/ck-ui.js` touches `document` at module
 * scope, so it is imported dynamically behind a `typeof document` guard —
 * otherwise `import 'consentkit'` would throw during SSR. Locales are imported
 * dynamically too, so a build that ships without that file still works.
 */

import { resolveApi } from './internal-stub.mjs';

// Static side-effect import: the core is safe in Node and must run first.
import '../src/ck-core.js';

const hasDom = typeof document !== 'undefined' && typeof window !== 'undefined';

if (hasDom) {
  // Optional: ck-locales.js may not be present in a trimmed install.
  try {
    await import('../src/ck-locales.js');
  } catch (e) { /* locales are optional; ck-ui falls back to built-in en/ru */ }

  // Required in the browser, fatal in Node — hence the guard above.
  try {
    await import('../src/ck-ui.js');
  } catch (e) { /* UI is best-effort; the core keeps enforcing consent */ }
}

const ConsentKit = resolveApi();

export default ConsentKit;
export const {
  init,
  allowed,
  getState,
  accept,
  rejectAll,
  withdraw,
  show,
  hide
} = ConsentKit;
export { ConsentKit };
