/* The WordPress plugin's tracker database must equal the client's.
 *
 * plugins/wordpress/consentkit/includes/hostdb.php is GENERATED from HOST_DB and
 * PATH_DB in src/ck-core.js by tools/export-hostdb.mjs. Nothing at runtime keeps
 * the two in step: a plugin whose table has drifted classifies a host one way on
 * the server and another way in the browser engine running on the very same
 * page — a tag marked `data-ck="marketing"` that the client then treats as
 * unknown, or a tracker the server leaves alone because its copy is a release
 * behind.
 *
 * Same shape of guard as test/wp-assets.test.mjs (sha256 over the shipped copy),
 * and the same fix: re-run the generator.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readDbs, renderPhp, digest } from '../tools/export-hostdb.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PHP = join(REPO, 'plugins', 'wordpress', 'consentkit', 'includes', 'hostdb.php');

const CATEGORIES = ['necessary', 'functional', 'analytics', 'marketing'];

test('includes/hostdb.php exists', () => {
  assert.ok(existsSync(PHP),
    'plugins/wordpress/consentkit/includes/hostdb.php is missing — run `node tools/export-hostdb.mjs`');
});

test('the exporter still finds both tables in src/ck-core.js', () => {
  const { hosts, paths } = readDbs();
  // A silent extraction failure would write an empty table, i.e. a plugin that
  // blocks nothing while every test still passes.
  assert.ok(Object.keys(hosts).length >= 40,
    `HOST_DB extraction returned only ${Object.keys(hosts).length} hosts`);
  assert.ok(Object.keys(paths).length >= 2,
    `PATH_DB extraction returned only ${Object.keys(paths).length} fragments`);
  for (const [k, v] of Object.entries({ ...hosts, ...paths })) {
    assert.ok(CATEGORIES.includes(v), `"${k}" has unknown category "${v}"`);
  }
});

test('includes/hostdb.php is in sync with src/ck-core.js', () => {
  const dbs = readDbs();
  const want = renderPhp(dbs);
  const have = readFileSync(PHP, 'utf8');
  assert.equal(have, want,
    'plugins/wordpress/consentkit/includes/hostdb.php is stale — run `node tools/export-hostdb.mjs`');
});

test('the PHP file carries exactly the client data (digest over the parsed values)', () => {
  /* Comparing the rendered text catches formatting drift; this compares the
     DATA, by parsing the PHP back out. If the two ever disagree, the renderer
     is losing entries — which text equality alone would not reveal. */
  const php = readFileSync(PHP, 'utf8');

  function section(name) {
    const start = php.indexOf(`'${name}' => array(`);
    assert.ok(start > -1, `section '${name}' not found in hostdb.php`);
    const body = php.slice(start, php.indexOf('\n\t),', start));
    const out = {};
    for (const m of body.matchAll(/'((?:[^'\\]|\\.)*)'\s*=>\s*'((?:[^'\\]|\\.)*)'/g)) {
      out[m[1].replace(/\\(['\\])/g, '$1')] = m[2].replace(/\\(['\\])/g, '$1');
    }
    return out;
  }

  const { hosts, paths } = readDbs();
  assert.equal(digest(section('hosts'), section('paths')), digest(hosts, paths),
    'the generated PHP does not carry the same entries as src/ck-core.js');
});

test('the generated file is marked as generated and carries no ABSPATH guard', () => {
  const php = readFileSync(PHP, 'utf8');
  assert.match(php, /GENERATED FILE, DO NOT EDIT/,
    'hostdb.php lost its "do not edit" header — someone will hand-edit it');
  assert.match(php, /tools\/export-hostdb\.mjs/,
    'the header must name the generator so the fix is discoverable');
  /* Deliberate exception to the plugin-wide guard convention: the file is pure
     data loaded with require(), including by tests/rewrite.test.php, which runs
     without WordPress and so cannot define ABSPATH before loading it. */
  assert.doesNotMatch(php, /defined\(\s*'ABSPATH'\s*\)/,
    'hostdb.php must stay loadable from the PHP CLI test — no ABSPATH guard (the header may mention it, the code may not)');
  assert.match(php, /^\s*return array\(/m,
    'hostdb.php must be a bare data file returning an array');
});

test('the GTM container is absent from the exported hosts (v0.3.2 decision)', () => {
  /* The container delivers tags that themselves obey Consent Mode; blocking it
     breaks that model for every GTM site, so only /gtag/js is blocked, by path.
     If it ever reappears in HOST_DB, the plugin would start blocking containers
     server-side — where nobody would notice until a site's tags went silent. */
  const { hosts, paths } = readDbs();
  assert.ok(!('googletagmanager.com' in hosts),
    'googletagmanager.com is back in HOST_DB — see the decision block in SPEC.md');
  assert.ok('/gtag/js' in paths, 'PATH_DB lost /gtag/js');
});
