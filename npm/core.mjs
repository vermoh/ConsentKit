/*!
 * consentkit/core — ESM entry, core only (no UI, no locales).
 *
 * `src/ck-core.js` is a classic side-effect script: it attaches the public API
 * to the global object and (under CommonJS) to `module.exports`. Because this
 * package declares `"type": "module"`, Node parses it as ESM, so the namespace
 * is empty and the global is the only reliable handle. Read it, never the
 * import result.
 *
 * The core is DOM-optional: it guards every `document` / `window` access and
 * works unchanged in Node, so on the server we export the real thing. The stub
 * below is a last-resort fallback for the case where the core failed to attach.
 */

import { resolveApi } from './internal-stub.mjs';

// Side-effect import: activates blocking at parse time in the browser.
import '../src/ck-core.js';

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
