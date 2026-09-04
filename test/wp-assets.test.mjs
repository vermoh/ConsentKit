/* plugins/wordpress/consentkit/assets must be byte-identical to src/.
 *
 * The WordPress plugin cannot reach ../../src at runtime — a .zip installed
 * into wp-content/plugins carries its own assets/ and nothing else. The copy
 * is therefore a plain `cp`, and nothing but this test notices when it goes
 * stale. A stale copy means every WordPress site running the plugin executes a
 * different client than the demo, the npm package and the inline blocks.
 *
 * Same guard as test/site-vendor.test.mjs, and the same fix: re-run the `cp`
 * documented in plugins/wordpress/consentkit/assets/README.md.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = join(REPO, 'src');
const ASSETS_DIR = join(REPO, 'plugins', 'wordpress', 'consentkit', 'assets');
const PLUGIN_PHP = join(REPO, 'plugins', 'wordpress', 'consentkit', 'consentkit.php');

/* The enqueue list in consentkit.php is the contract: exactly these files are
   printed, in this order. Keeping the expectation here rather than parsing it
   out of the PHP means a silent edit to the plugin fails the test instead of
   quietly redefining what "in sync" means. */
const COPIED = ['ck-core.js', 'ck-locales.js', 'ck-ui.js', 'ck-debug-loader.js'];

/* The panel is NOT copied: ~30 KB no ordinary visitor would ever use. The
   loader fetches it from the CDN on demand. */
const NOT_COPIED = ['ck-debug.js', 'ck-saas.js'];

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

for (const name of COPIED) {
  test(`assets/${name} matches src/${name} (sha256)`, () => {
    const to = join(ASSETS_DIR, name);
    assert.ok(existsSync(to),
      `plugins/wordpress/consentkit/assets/${name} is missing — see assets/README.md`);

    const want = sha256(readFileSync(join(SRC_DIR, name)));
    const have = sha256(readFileSync(to));
    assert.equal(
      have, want,
      `assets/${name} is stale (src ${want.slice(0, 12)}, assets ${have.slice(0, 12)}) — ` +
      're-run the cp in plugins/wordpress/consentkit/assets/README.md'
    );
  });
}

for (const name of NOT_COPIED) {
  test(`assets/${name} is not shipped`, () => {
    assert.ok(!existsSync(join(ASSETS_DIR, name)),
      `plugins/wordpress/consentkit/assets/${name} should not exist — ` +
      'the plugin ships ck-debug-loader.js, which fetches the panel on demand');
  });
}

test('assets/ contains no JavaScript beyond the copied set', () => {
  const stray = readdirSync(ASSETS_DIR)
    .filter((f) => f.endsWith('.js'))
    .filter((f) => !COPIED.includes(f));
  assert.deepEqual(stray, [],
    `unexpected JavaScript in assets/: ${stray.join(', ')} — ` +
    'every file there must have a source of truth in src/');
});

test('consentkit.php enqueues exactly the copied files, in order', () => {
  const php = readFileSync(PLUGIN_PHP, 'utf8');
  const m = php.match(/\$files\s*=\s*array\(([^)]*)\)/);
  assert.ok(m, 'could not find the $files enqueue list in consentkit.php');

  const listed = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  assert.deepEqual(listed, COPIED,
    'the plugin enqueue list drifted from the files synchronized into assets/');
});

test('the plugin does not enqueue the full debug panel', () => {
  const php = readFileSync(PLUGIN_PHP, 'utf8');
  const m = php.match(/\$files\s*=\s*array\(([^)]*)\)/);
  assert.ok(m);
  assert.ok(!/'ck-debug\.js'/.test(m[1]),
    'consentkit.php enqueues ck-debug.js — it must enqueue ck-debug-loader.js instead');
});
