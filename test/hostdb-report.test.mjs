/* tools/hostdb-report.mjs — the monthly «what does the database not know?» pass.
 *
 * The tool reads the cabinet admin's «без категории» export and prints the
 * hosts src/ck-core.js has nothing to say about, grouped by vendor. It is a
 * worklist, so the two things that make it worth reading are the two things
 * asserted here: a host the database ALREADY knows must not appear (a report
 * that lists everything is one nobody works through), and a host it does not
 * know must appear with a paste-ready line.
 *
 * Driven as a SUBPROCESS, like test/hostdb.test.mjs drives export-hostdb and
 * test/changelog.test.mjs drives build-changelog. The tool loads src/ck-core.js
 * into the running realm with vm.runInThisContext and stubs `global.window`;
 * importing it here would do that to the test process itself, and every other
 * test in this file's run would then execute against a realm carrying a live
 * ConsentKit. The subprocess is also the only way to observe the exit code,
 * which is the tool's one hard contract.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOOL = join('tools', 'hostdb-report.mjs');

/** Run the tool with `input` on stdin. Never throws — the exit code is data. */
function run(input, args = []) {
  const r = spawnSync(process.execPath, [TOOL, ...args], {
    cwd: REPO, input, encoding: 'utf8',
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

/* Hosts the shipped database answers for, verified against the core rather
   than assumed: mc.yandex.ru and www.google-analytics.com are analytics in
   HOST_DB, fonts.gstatic.com is infrastructure (§8). All three are "covered"
   and none may be printed.

   NOT used as a known host: googletagmanager.com. The GTM container is
   deliberately absent from HOST_DB — it must load so the tags inside it can
   see Consent Mode — and only '/gtag/js' is path-scoped, which a bare host
   cannot match. The tool correctly reports it as uncovered, so it would be
   exactly the wrong fixture for this. */
const KNOWN = ['mc.yandex.ru', 'www.google-analytics.com', 'fonts.gstatic.com'];
const UNKNOWN = ['cdn.example-tracker.io', 'pixel.example-tracker.io'];

test('a host the database already knows is not reported', () => {
  const { status, stdout } = run(KNOWN.join('\n') + '\n');
  assert.equal(status, 0);

  for (const host of KNOWN) {
    assert.ok(!stdout.includes(host),
      `${host} is already in the database but the report listed it — ` +
      'the worklist must only carry hosts somebody still owes a decision on');
  }
  assert.match(stdout, /Not covered: 0/);
  assert.match(stdout, /Every host in this list is already known/);
});

test('an unknown host is reported with a paste-ready HOST_DB line', () => {
  const { status, stdout } = run(UNKNOWN.join('\n') + '\n');
  assert.equal(status, 0);

  for (const host of UNKNOWN) {
    assert.ok(stdout.includes(host), `${host} is unknown but was not reported`);
    assert.ok(stdout.includes(`'${host}': '?',`),
      `${host} got no suggested HOST_DB line`);
  }
  assert.match(stdout, /Not covered: 2/);
});

test('the category is left as ? for a human to decide', () => {
  /* Never a guess. The four categories are a legal classification, and
     export-hostdb.mjs refuses anything outside them — so a '?' pasted in
     without a decision stops the build instead of shipping a wrong one. */
  const { stdout } = run('cdn.example-tracker.io\n');
  assert.ok(!/'cdn\.example-tracker\.io':\s*'(necessary|functional|analytics|marketing)'/
    .test(stdout), 'the tool invented a category instead of asking');
  assert.ok(stdout.includes("'cdn.example-tracker.io': '?',"));
});

test('known and unknown hosts in one list are separated', () => {
  const { status, stdout } = run([...KNOWN, ...UNKNOWN].join('\n') + '\n');
  assert.equal(status, 0);
  assert.match(stdout, /Hosts read: 5/);
  assert.match(stdout, /Already covered by the database: 3/);
  assert.match(stdout, /Not covered: 2/);
  for (const host of KNOWN) { assert.ok(!stdout.includes(host)); }
  for (const host of UNKNOWN) { assert.ok(stdout.includes(host)); }
});

test('unknown hosts are grouped by registrable domain, biggest group first', () => {
  /* The grouping is the point of the tool: six subdomains of one vendor are
     ONE decision, and the list is ordered so the decision that settles the
     most observed hosts is read first. */
  const { stdout } = run([
    'lonely.solo-vendor.io',
    'a.big-vendor.example',
    'b.big-vendor.example',
    'c.big-vendor.example',
  ].join('\n') + '\n');

  assert.match(stdout, /big-vendor\.example {2}\(3 hosts\)/);
  assert.match(stdout, /solo-vendor\.io {2}\(1 host\)/);
  assert.ok(stdout.indexOf('big-vendor.example  (3 hosts)') <
    stdout.indexOf('solo-vendor.io  (1 host)'),
    'the group settling three hosts should be read before the group of one');
});

test('a two-level TLD groups on three labels, not two', () => {
  /* `co.uk` is a public suffix, so grouping widget.some-chat.co.uk on the last
     two labels would file every unrelated British vendor under one heading. */
  const { stdout } = run('widget.some-chat.co.uk\nstats.some-chat.co.uk\n');
  assert.match(stdout, /some-chat\.co\.uk {2}\(2 hosts\)/);
  assert.ok(!/^co\.uk /m.test(stdout), 'grouped on the public suffix itself');

  /* `com.au` is the other suffix the routine actually meets in exports. */
  const au = run('analytics.newvendor.com.au\n');
  assert.match(au.stdout, /newvendor\.com\.au {2}\(1 host\)/);
  assert.ok(!/^com\.au /m.test(au.stdout));
});

test('URLs, ports, comments, blanks and duplicates in the export are tolerated', () => {
  /* The input is a spreadsheet column, not a hand-checked file. */
  const { status, stdout } = run([
    '# «без категории», export 01.09.2026',
    '',
    'https://cdn.example-tracker.io/pixel.js?id=42',
    'cdn.example-tracker.io:443',
    '  CDN.Example-Tracker.IO  ',
    'cdn.example-tracker.io.',
    'not a host at all',
  ].join('\n') + '\n');

  assert.equal(status, 0);
  assert.match(stdout, /Hosts read: 1/,
    'one host written five ways should collapse to one');
  assert.match(stdout, /Not covered: 1/);
  assert.ok(!stdout.includes('not a host at all'));
});

test('the file-path argument and stdin agree', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ck-hostdb-report-'));
  const file = join(dir, 'hosts.txt');
  const input = [...KNOWN, ...UNKNOWN].join('\n') + '\n';
  writeFileSync(file, input, 'utf8');

  const viaFile = run('', [file]);
  const viaStdin = run(input);
  assert.equal(viaFile.status, 0);
  assert.equal(viaFile.stdout, viaStdin.stdout,
    'reading the list from a file and from stdin gave different reports');
});

test('the exit code is 0 even when there is nothing to read', () => {
  /* The hard contract. This is a reporting tool inside a monthly routine, and
     unknown hosts are the normal state of the world — a non-zero exit would
     mean «the routine ran» and would break any pipeline around it. */
  for (const [label, r] of [
    ['empty input', run('')],
    ['only comments and blanks', run('# nothing\n\n\n')],
    ['junk', run('!!! not hosts !!!\n@@@\n')],
    ['a missing file', run('', ['/definitely/not/a/real/file.txt'])],
  ]) {
    assert.equal(r.status, 0, `${label} should still exit 0`);
  }
});

test('an empty list says so instead of printing an empty worklist', () => {
  const { status, stdout } = run('# nothing here\n\n');
  assert.equal(status, 0);
  assert.match(stdout, /Hosts read: 0/);
  assert.match(stdout, /Nothing to report/);
  assert.ok(!stdout.includes("': '?',"), 'suggested no entries for no hosts');
});

test('the report is deterministic', () => {
  /* Two runs over one export must produce the same file, or the routine's
     output cannot be diffed against last month's. */
  const input = [...UNKNOWN, 'a.big-vendor.example', 'b.big-vendor.example'].join('\n');
  assert.equal(run(input).stdout, run(input).stdout);
});
