#!/usr/bin/env node
/* Copy the client sources the public page's live demo runs on into site/vendor/.
 *
 * The Vercel project for consentkit.ecomconsult.net has Root Directory `site`,
 * so nothing above `site/` is deployed — the demo cannot reach `../src/`.
 * Vendoring is therefore a build-free copy, and test/site-vendor.test.mjs
 * asserts sha256 equality so a stale copy fails CI instead of shipping a
 * demo that silently runs an older client than the repository.
 *
 * Usage: node tools/sync-site.mjs [--check]
 *   --check  verify only, exit 1 on drift (no writes)
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ck-saas.js is deliberately NOT vendored: the demo runs on a static config,
// it never talks to the SaaS API.
// ck-debug.js is vendored too: the page documents ?ck_debug=1 on the demo,
// and the panel is inert unless the visitor asks for it.
export const VENDORED = ['ck-core.js', 'ck-ui-branding.js', 'ck-ui.js', 'ck-locales.js', 'ck-debug.js'];

export const SRC_DIR = join(REPO, 'src');
export const VENDOR_DIR = join(REPO, 'site', 'vendor');

export function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function main() {
  const check = process.argv.includes('--check');
  mkdirSync(VENDOR_DIR, { recursive: true });

  let drift = 0;
  for (const name of VENDORED) {
    const from = join(SRC_DIR, name);
    const to = join(VENDOR_DIR, name);
    const src = readFileSync(from);
    const want = sha256(src);
    const have = existsSync(to) ? sha256(readFileSync(to)) : null;

    if (have === want) {
      console.log(`  ok    ${name}  ${want.slice(0, 12)}`);
      continue;
    }
    drift++;
    if (check) {
      console.error(`  DRIFT ${name}  src=${want.slice(0, 12)} vendor=${have ? have.slice(0, 12) : 'missing'}`);
    } else {
      writeFileSync(to, src);
      console.log(`  sync  ${name}  ${want.slice(0, 12)}`);
    }
  }

  if (check && drift) {
    console.error(`\n${drift} file(s) out of date — run: node tools/sync-site.mjs`);
    process.exit(1);
  }
  console.log(check ? '\nsite/vendor is in sync.' : '\nsite/vendor updated.');
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
