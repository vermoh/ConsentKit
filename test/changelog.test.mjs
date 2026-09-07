/* CHANGELOG.md is generated from README.md and must not fall behind it.
 *
 * The release notes are written in README.md, under «## Changelog», as
 * `### <semver>` sections; tools/build-changelog.mjs lifts them into a
 * CHANGELOG.md at the repo root, which is where npm, GitHub and a passing
 * reader look. A generated file with no guard is a file that is one release
 * behind for a year — the exact failure the hostdb PHP export already has a
 * test for, for the same reason.
 *
 * The drift check runs the tool as a SUBPROCESS with --check, the way
 * test/hostdb.test.mjs runs export-hostdb --check. Re-rendering in-process and
 * comparing to what was just rendered would assert nothing at all: it would
 * pass against a CHANGELOG.md that does not exist.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHANGELOG = join(REPO, 'CHANGELOG.md');

const { extractSections, render, HEADER } =
  await import('../tools/build-changelog.mjs');

const readme = () => readFileSync(join(REPO, 'README.md'), 'utf8');

test('CHANGELOG.md is in sync with README.md', () => {
  assert.ok(existsSync(CHANGELOG),
    'CHANGELOG.md is missing — run `node tools/build-changelog.mjs`');

  try {
    execFileSync(process.execPath, [join('tools', 'build-changelog.mjs'), '--check'],
      { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    assert.fail(
      'CHANGELOG.md is out of date with README.md. A release section was added ' +
      'to the README and the build was not run: `npm run build` (or ' +
      '`node tools/build-changelog.mjs`).\n' + (e.stderr || e.message));
  }
});

test('CHANGELOG.md says where it comes from', () => {
  /* The header is the only thing standing between a generated file and someone
     helpfully editing it, so its absence is a real failure and not cosmetics. */
  const text = readFileSync(CHANGELOG, 'utf8');
  assert.ok(text.includes(HEADER), 'CHANGELOG.md lost its «generated from README.md» header');
  assert.match(text, /^# Changelog/, 'CHANGELOG.md should open with its title');
});

test('every release section in README.md reaches CHANGELOG.md', () => {
  const sections = extractSections(readme());
  const text = readFileSync(CHANGELOG, 'utf8');

  assert.ok(sections.length >= 20,
    `only ${sections.length} release sections parsed out of README.md — ` +
    'has the «### x.y.z» heading format changed?');

  for (const { version } of sections) {
    assert.ok(text.includes(`\n## ${version}\n`),
      `CHANGELOG.md has no section for ${version}`);
  }
});

test('the current package version has a release section', () => {
  /* A release that bumps package.json and forgets the note is the common miss;
     version.test.mjs already pins package.json to the core and to ready/*.txt,
     and this is the same guard pointed at the prose. */
  const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));
  const versions = extractSections(readme()).map((s) => s.version);
  assert.ok(versions.includes(pkg.version),
    `package.json is ${pkg.version} but README.md has no «### ${pkg.version}» ` +
    'section — write the release note.');
});

test('a section ends at the next heading, not at the next release', () => {
  /* The last release section is followed by «## Project status», which contains
     `### Verified` and `### Not verified`. An extractor that ran to the next
     `### <semver>` would swallow all of it into the oldest release — it would
     still produce a plausible-looking file, which is why this is pinned. */
  const sections = extractSections(readme());
  const last = sections[sections.length - 1];
  assert.ok(!/Project status|### Verified/.test(last.body),
    `the ${last.version} section swallowed the «Project status» chapter — ` +
    'sections must terminate at the next heading of any level');

  for (const { version, body } of sections) {
    assert.ok(!/^#{1,6}\s/m.test(body),
      `the ${version} section contains a heading; it should have ended there`);
  }
});

test('the WordPress plugin changelog is left alone', () => {
  /* The plugin keeps its own notes in the WordPress.org format («= 1.2.3 =»),
     with its own wording and cadence for the PHP side. It is deliberately NOT
     generated from the same source — this asserts nobody "unified" them. */
  const wp = readFileSync(
    join(REPO, 'plugins', 'wordpress', 'consentkit', 'readme.txt'), 'utf8');
  assert.ok(!wp.includes(HEADER),
    'the WordPress readme.txt picked up the generated-file header — ' +
    'it is hand-maintained and must stay that way');
  assert.match(wp, /^= \d+\.\d+\.\d+ =$/m,
    'the WordPress readme.txt lost its «= x.y.z =» changelog format');
});

test('rendering is deterministic', () => {
  const src = readme();
  assert.equal(render(src), render(src), 'two renders of one README differ');
});
