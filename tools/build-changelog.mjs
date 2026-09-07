#!/usr/bin/env node
/* ConsentKit — generate CHANGELOG.md from the release notes in README.md.
 *
 * WHY THIS EXISTS
 * The release notes have always lived in README.md, under «## Changelog», as
 * `### <semver>` sections. That is the right place to WRITE them — they sit
 * next to the documentation of the very features they announce, so a note and
 * the reference text for the same option are edited in one pass. It is the
 * wrong place to READ them from: a CHANGELOG.md at the repo root is what npm,
 * GitHub's release UI and anyone skimming the repo look for, and its absence
 * is why «what changed in 0.5.x?» currently means scrolling an 84 KB README.
 *
 * So the file is GENERATED, and README.md stays the single source of truth.
 * The header line says so, in the file itself, because the first instinct on
 * finding a stale CHANGELOG is to fix the CHANGELOG.
 *
 * WHERE A SECTION ENDS
 * At the next heading of ANY level, not at the next `### <semver>`. The last
 * release section is followed by «## Project status», which itself contains
 * `### Verified` and `### Not verified` — terminating on semver headings alone
 * would swallow all of it into 0.3.2.
 *
 * NOT TOUCHED: plugins/wordpress/consentkit/readme.txt. The WordPress plugin
 * keeps its own changelog in the WordPress.org format (`= 1.2.3 =` headings,
 * its own wording and its own release cadence for the PHP side). Generating it
 * from the same source would mean asserting the two histories are identical,
 * which they are not.
 *
 * Usage:
 *   node tools/build-changelog.mjs           # write CHANGELOG.md
 *   node tools/build-changelog.mjs --check   # exit 1 if it is out of date
 *   node tools/build-changelog.mjs --stdout  # print, write nothing
 *
 * test/changelog.test.mjs runs --check inside `npm test`, and `npm run build`
 * writes the file — so a README that gained a section without a rebuild fails
 * the suite instead of shipping a changelog that is quietly one release behind.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const README = join(REPO, 'README.md');
const OUT = join(REPO, 'CHANGELOG.md');

export const HEADER = '<!-- Generated from README.md — edit there, not here. ' +
  'Run `node tools/build-changelog.mjs` (or `npm run build`). -->';

/* A silent extraction failure would write an empty changelog that still looks
   like a file, the way an empty HOST_DB export would look like a working
   plugin. The floor is well under the count at the time of writing (23) so
   ordinary pruning of ancient sections does not trip it. */
const MIN_SECTIONS = 10;

const SEMVER_HEADING = /^### (\d+\.\d+\.\d+)\s*$/;
const ANY_HEADING = /^#{1,6}\s/;

/* ---------------------------------------------------------------- extraction */

/**
 * Every `### <semver>` section of README.md, in the order the README lists them
 * (newest first — the README's own order is the one readers expect, so it is
 * preserved rather than re-sorted; a hand-written note about an out-of-band
 * release stays where its author put it).
 *
 * @returns {{ version: string, body: string }[]}
 */
export function extractSections(readme) {
  const lines = readme.split('\n');
  const sections = [];

  for (let i = 0; i < lines.length; i++) {
    const m = SEMVER_HEADING.exec(lines[i]);
    if (!m) { continue; }

    const body = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (ANY_HEADING.test(lines[j])) { break; }
      body.push(lines[j]);
    }
    sections.push({ version: m[1], body: body.join('\n').replace(/\s+$/, '') });
  }

  return sections;
}

/** The full CHANGELOG.md text for a README. */
export function render(readme) {
  const sections = extractSections(readme);

  if (sections.length < MIN_SECTIONS) {
    throw new Error(
      `extracted only ${sections.length} release sections from README.md ` +
      `(expected at least ${MIN_SECTIONS}) — the «### x.y.z» format has ` +
      'changed and the extractor is broken; refusing to write');
  }

  const seen = new Set();
  for (const { version } of sections) {
    if (seen.has(version)) {
      throw new Error(`README.md has two «### ${version}» sections — ` +
        'one release, one section');
    }
    seen.add(version);
  }

  const parts = [
    '# Changelog',
    '',
    HEADER,
    '',
    'Client versions. The WordPress plugin tracks the same numbers and keeps',
    'its own notes in `plugins/wordpress/consentkit/readme.txt`.',
    '',
  ];

  for (const { version, body } of sections) {
    parts.push(`## ${version}`, '');
    if (body) { parts.push(body, ''); }
  }

  return parts.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s*$/, '\n');
}

/* --------------------------------------------------------------------- main */

export function build() {
  return render(readFileSync(README, 'utf8'));
}

const isMain = process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const args = process.argv.slice(2);
  let text;
  try {
    text = build();
  } catch (e) {
    console.error(`tools/build-changelog.mjs: ${e.message}`);
    process.exit(1);
  }

  if (args.includes('--stdout')) {
    process.stdout.write(text);
  } else if (args.includes('--check')) {
    const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : null;
    if (current === text) {
      console.log(`CHANGELOG.md is up to date (${extractSections(readFileSync(README, 'utf8')).length} releases).`);
    } else {
      console.error(current === null
        ? 'CHANGELOG.md is missing — run `node tools/build-changelog.mjs`.'
        : 'CHANGELOG.md is out of date with README.md — run `node tools/build-changelog.mjs` (or `npm run build`).');
      process.exit(1);
    }
  } else {
    writeFileSync(OUT, text, 'utf8');
    const n = extractSections(readFileSync(README, 'utf8')).length;
    console.log(`CHANGELOG.md written (${n} releases).`);
  }
}
