/* site/vendor must be byte-identical to src/.
 *
 * The public page (site/) is deployed from a Vercel project whose Root
 * Directory is `site`, so the live demo loads the client from site/vendor/
 * rather than ../src/. Nothing but this test notices when the copy goes stale,
 * and a stale copy means the demo on the marketing page runs a different
 * client than the one the page is selling. Same guard as the WordPress
 * plugin assets.
 *
 * Fix a failure with: node tools/sync-site.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { VENDORED, SRC_DIR, VENDOR_DIR, sha256 } from '../tools/sync-site.mjs';

for (const name of VENDORED) {
  test(`site/vendor/${name} matches src/${name} (sha256)`, () => {
    const to = join(VENDOR_DIR, name);
    assert.ok(existsSync(to), `site/vendor/${name} is missing — run: node tools/sync-site.mjs`);

    const want = sha256(readFileSync(join(SRC_DIR, name)));
    const have = sha256(readFileSync(to));
    assert.equal(
      have, want,
      `site/vendor/${name} is stale (src ${want.slice(0, 12)}, vendor ${have.slice(0, 12)}) — ` +
      'run: node tools/sync-site.mjs'
    );
  });
}

/* All three rendered pages, not just the root one: they are built from one
   template, so a missing script tag would hit every language at once — but a
   test that only reads site/index.html would still pass if someone rendered
   the other two from a different source. */
const PAGES = ['index.html', join('ru', 'index.html'), join('ro', 'index.html')];

for (const page of PAGES) {
  test(`site/${page.replace(/\\/g, '/')} references every vendored file`, () => {
    const html = readFileSync(join(VENDOR_DIR, '..', page), 'utf8');
    for (const name of VENDORED) {
      // Absolute paths: a relative "vendor/…" would 404 from /ru and /ro.
      assert.match(html, new RegExp(`"/vendor/${name.replace('.', '\\.')}"`),
        `site/${page} does not load /vendor/${name}`);
    }
  });
}

test('ck-saas.js is not vendored (the demo runs offline)', () => {
  assert.ok(!existsSync(join(VENDOR_DIR, 'ck-saas.js')),
    'site/vendor/ck-saas.js should not exist — the public demo uses a static config');
});
