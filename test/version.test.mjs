/* Version equality guard.
 *
 * package.json and src/ck-core.js carried different versions through 0.3.2/0.3.3
 * because nothing checked them. The core is the version a site actually runs
 * (it is what ends up in ready/*.txt and in the WordPress assets), while
 * package.json is what npm publishes — they must agree.
 *
 * The core is a classic side-effect script, not a module: it attaches its API to
 * `window` (or globalThis). Load it the way the SaaS scanner does — install a
 * window stub, evaluate the IIFE, then read the global back.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadCore() {
  // The core guards every document/window access, so a bare stub is enough.
  global.window = global;
  global.self = global;
  const src = readFileSync(join(REPO, 'src', 'ck-core.js'), 'utf8');
  vm.runInThisContext(src, { filename: 'src/ck-core.js' });
  const api = global.ConsentKit;
  assert.ok(api, 'src/ck-core.js did not attach window.ConsentKit');
  return api;
}

const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));

test('ConsentKit.version equals package.json version', () => {
  const ConsentKit = loadCore();
  assert.equal(
    ConsentKit.version,
    pkg.version,
    `src/ck-core.js says ${ConsentKit.version}, package.json says ${pkg.version} — ` +
    'bump both together.'
  );
});

test('the npm stub fallback reports the same version', async () => {
  // npm/internal-stub.mjs is only reached when the real core failed to attach,
  // so nothing else would ever notice it drifting.
  const { createStub } = await import('../npm/internal-stub.mjs');
  assert.equal(createStub().version, pkg.version);
});

test('ready/*.txt blocks were rebuilt against the current core', () => {
  // The blocks are generated copies; a core bump without a rebuild silently
  // leaves every inline user on the old code (debt Д8).
  for (const name of ['en-bar', 'eu-bar', 'ru-bar', 'ru-box', 'ru-box-right', 'ru-modal']) {
    const text = readFileSync(join(REPO, 'ready', name + '.txt'), 'utf8');
    const m = text.match(/\* Версия ConsentKit: (\S+)/);
    assert.ok(m, `ready/${name}.txt has no version header`);
    assert.equal(m[1], pkg.version, `ready/${name}.txt is stale — rebuild it`);
  }
});

/* --------------------------------------------------- branding in built blocks */

/* Branding ships by default and --no-branding removes it. build() is not
   exported, so the builder is driven as a subprocess the way a user runs it:
   without --out the block goes to stdout and the summary to stderr. */
function runBuilder(args) {
  return execFileSync(process.execPath, [join('tools', 'build-inline.mjs'), ...args], {
    cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
  });
}

test('the default build carries a branding object', () => {
  const out = runBuilder(['--langs=ru,en']);
  assert.match(out, /"branding"/, 'default build lost its branding object');
  assert.match(out, /Сделано в E-COM Consult/, 'ru-first build should carry the Russian line');
});

test('--no-branding drops the branding object entirely', () => {
  const out = runBuilder(['--langs=ru,en', '--no-branding']);
  assert.doesNotMatch(out, /"branding"/, '--no-branding still emitted a branding object');
  assert.doesNotMatch(out, /Сделано в E-COM Consult/);
  assert.doesNotMatch(out, /Made by E-COM Consult/);
});

test('the attribution language follows the build, not the machine', () => {
  // --language=auto takes the first bundled language; ck-ui falls back to en.
  assert.match(runBuilder(['--langs=en', '--language=en']), /Made by E-COM Consult/);
  assert.doesNotMatch(runBuilder(['--langs=en', '--language=en']), /Сделано в/);
  assert.match(runBuilder(['--langs=ru,en', '--language=ru']), /Сделано в E-COM Consult/);
});

test('every ready/*.txt block ships the attribution line', () => {
  const ru = ['ru-bar', 'ru-box', 'ru-box-right', 'ru-modal'];
  for (const name of ru.concat(['en-bar', 'eu-bar'])) {
    const text = readFileSync(join(REPO, 'ready', name + '.txt'), 'utf8');
    assert.match(text, /"branding"/, `ready/${name}.txt has no branding`);
    assert.match(text, ru.includes(name) ? /Сделано в E-COM Consult/ : /Made by E-COM Consult/,
      `ready/${name}.txt carries the wrong attribution language`);
  }
});
