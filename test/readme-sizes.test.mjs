/* The documented sizes of the prebuilt blocks must match the blocks on disk.
 *
 * WHY THIS EXISTS
 * `ready/*.txt` are generated artifacts: every release rebuilds them and every
 * addition to the tracker database or the dictionaries moves their size. The
 * numbers describing them, however, live in prose in three different files and
 * are retyped by hand — so they rot silently. They were last found ~20% low
 * (a `ru-bar.txt` documented at 271,1 КБ that had grown to 326,5 КБ), which is
 * the kind of figure a site owner uses to decide whether to paste the block at
 * all.
 *
 * WHAT IS ASSERTED
 * Only the on-disk size column, within ±10% of the real file. The tolerance is
 * deliberately loose: this is a guard against rot, not a checksum, and an
 * ordinary edit to a dictionary must not fail the build. The `gzip` and
 * `--no-branding` columns are NOT asserted — neither is a file on disk (gzip
 * depends on the compressor's level, and `--no-branding` would need six builder
 * subprocesses per run). Refresh them by hand in the same edit as the sizes.
 *
 * Also asserted: every `ready/*.txt` has a row in every table. A block added
 * without a row is a block nobody is told about.
 *
 * THE THREE TABLES ARE IN THREE NUMBER FORMATS, ON PURPOSE
 *   README.md        exact bytes, comma-separated  — `275,509`
 *   ready/README.md  KB, one decimal, comma        — `271,1 КБ`
 *   tools/README.md  bytes and KB                  — `264 816 Б (258,6 КБ)`
 * Each is kept in the format its own readers expect (`ready/README.md` is
 * written for non-programmers pasting a block; `README.md` is a developer
 * reference where the byte count is the point). Since the assertion is ±10%,
 * the precision cannot decide whether the test passes — so preserve each
 * table's existing precision rather than unifying them.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const READY = join(REPO, 'ready');

const TOLERANCE = 0.10;

/** Every generated block, as `<name>.txt` -> byte size on disk. */
function blocksOnDisk() {
  const out = new Map();
  for (const name of readdirSync(READY)) {
    if (!name.endsWith('.txt')) { continue; }
    out.set(name, statSync(join(READY, name)).size);
  }
  assert.ok(out.size > 0, 'ready/ holds no .txt blocks — did `npm run build` run?');
  return out;
}

/* ------------------------------------------------------------- table parsing */

/* Each table is a markdown pipe table whose first cell names a block. The
   parsers below return `<name>.txt` -> documented bytes; the KB-based tables
   are converted to bytes here so the comparison is one shape.

   Numbers are written for humans: `275,509` (comma thousands), `264 816`
   (space thousands, including U+00A0), `258,6` (decimal comma). Normalising is
   therefore per-table and not a shared helper — a shared one would have to
   guess whether a comma separates thousands or decimals. */

/** `README.md`: `| `ready/en-bar.txt` | en | 275,509 | 86,249 | 249,096 |` */
function parseRootReadme(text) {
  const rows = new Map();
  const re = /^\|\s*`ready\/([\w-]+\.txt)`\s*\|[^|]*\|\s*([\d,  ]+)\s*\|/gm;
  let m;
  while ((m = re.exec(text))) {
    rows.set(m[1], Number(m[2].replace(/[, \s]/g, '')));
  }
  return rows;
}

/** `ready/README.md`: `| **`ru-bar.txt`** | … | 271,1 КБ |` */
function parseReadyReadme(text) {
  const rows = new Map();
  const re = /^\|\s*\*{0,2}`([\w-]+\.txt)`\*{0,2}\s*\|[^|]*\|\s*([\d  ]+,\d+)\s*КБ\s*\|/gm;
  let m;
  while ((m = re.exec(text))) {
    const kb = Number(m[2].replace(/[ \s]/g, '').replace(',', '.'));
    rows.set(m[1], Math.round(kb * 1024));
  }
  return rows;
}

/** `tools/README.md`: `| `ready/en-bar.txt` | en | 264 816 Б (258,6 КБ) | … |`
    The byte figure is the authoritative one; the KB in parentheses is checked
    against it separately, so the two halves of one cell cannot disagree. */
function parseToolsReadme(text) {
  const rows = new Map();
  const re = /^\|\s*`ready\/([\w-]+\.txt)`\s*\|[^|]*\|\s*([\d  ]+)\s*Б\s*\(([\d  ]+,\d+)\s*КБ\)\s*\|/gm;
  let m;
  while ((m = re.exec(text))) {
    const bytes = Number(m[2].replace(/[ \s]/g, ''));
    const kb = Number(m[3].replace(/[ \s]/g, '').replace(',', '.'));
    rows.set(m[1], bytes);
    rows.set(m[1] + '::kb', Math.round(kb * 1024));
  }
  return rows;
}

const TABLES = [
  { file: 'README.md', parse: parseRootReadme },
  { file: join('ready', 'README.md'), parse: parseReadyReadme },
  { file: join('tools', 'README.md'), parse: parseToolsReadme },
];

/* ------------------------------------------------------------------- the tests */

for (const { file, parse } of TABLES) {
  test(`${file}: every documented block size is within ±10% of the file`, () => {
    const disk = blocksOnDisk();
    const rows = parse(readFileSync(join(REPO, file), 'utf8'));
    const sizes = [...rows].filter(([k]) => !k.endsWith('::kb'));

    assert.ok(sizes.length > 0,
      `${file}: parsed no size rows at all — has the table's format changed?`);

    for (const [name, documented] of sizes) {
      const actual = disk.get(name);
      assert.ok(actual !== undefined,
        `${file} documents ready/${name}, which does not exist on disk`);

      const drift = Math.abs(documented - actual) / actual;
      assert.ok(drift <= TOLERANCE,
        `${file}: ready/${name} is documented as ${documented} bytes but is ` +
        `${actual} on disk (off by ${(drift * 100).toFixed(1)}%). ` +
        'Run `npm run build`, measure, and update the table — keeping its ' +
        'number format, and refreshing the gzip / --no-branding columns too.');
    }
  });

  test(`${file}: every ready/*.txt block has a row`, () => {
    const disk = blocksOnDisk();
    const rows = parse(readFileSync(join(REPO, file), 'utf8'));
    for (const name of disk.keys()) {
      assert.ok(rows.has(name),
        `${file} has no row for ready/${name} — a block nobody is told about`);
    }
  });
}

test('tools/README.md: the KB in each cell matches the bytes beside it', () => {
  /* The one table that writes the same number twice. A hand edit that updates
     the bytes and forgets the parenthesised KB (or the reverse) is exactly the
     rot this file exists to catch, and ±10% is too loose to see it — so the two
     halves of one cell are held to rounding distance instead. */
  const rows = parseToolsReadme(readFileSync(join(REPO, 'tools', 'README.md'), 'utf8'));
  for (const [key, bytes] of rows) {
    if (key.endsWith('::kb')) { continue; }
    const fromKb = rows.get(key + '::kb');
    assert.ok(fromKb !== undefined, `tools/README.md: ${key} has no KB figure`);
    // One decimal of KB is a 102-byte step; allow a rounding step either way.
    assert.ok(Math.abs(fromKb - bytes) <= 120,
      `tools/README.md: ${key} says ${bytes} Б but the parenthesised KB works ` +
      `out to ~${fromKb} Б — the two halves of the cell disagree`);
  }
});
