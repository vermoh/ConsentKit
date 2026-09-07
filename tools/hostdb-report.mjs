#!/usr/bin/env node
/* ConsentKit — which observed hosts does the tracker database not know?
 *
 * WHY THIS EXISTS
 * The cabinet admin lists third-party hosts seen on customer sites under
 * «без категории»: the scanner saw them, and src/ck-core.js has nothing to say
 * about them. That list only shrinks if someone works through it, and working
 * through a raw export by hand is the reason it does not get done — the same
 * host arrives dozens of times across sites, and the interesting unit is not
 * the host but the VENDOR behind it (six `*.rambler.ru` subdomains are one
 * decision, not six).
 *
 * So this groups by registrable domain and counts. What comes out is a short
 * worklist ordered by how much of the observed traffic each decision settles,
 * with a paste-ready `'<host>': '?'` line per unknown host — the '?' is a
 * deliberate non-category, so a line pasted into HOST_DB without a human
 * choosing marketing/analytics/functional/necessary fails export-hostdb.mjs's
 * known-category check rather than shipping a wrong classification.
 *
 * WHAT COUNTS AS COVERED
 * Exactly what the engine does, asked through the core's own public
 * predicates rather than re-implemented here:
 *   _categoryForUrl(url)  HOST_DB + EXTRA_DB + PATH_DB  (a category)
 *   _isInfra(host)        INFRA_DB (§8)                 (waved through, §8)
 * A host either the engine files or the audit hides is not a decision anyone
 * still owes, so both count as covered and neither is printed.
 *
 * Input is HOSTS, so the PATH_DB half of that predicate is only reachable for
 * keys whose fragment matches `https://<host>/` — the host-qualified ones
 * ('www.google.com/recaptcha/'). Path-scoped keys like '/gtag/js' cannot match
 * a bare host, which is correct and not a gap: googletagmanager.com is
 * deliberately uncategorised as a whole host (the GTM container must load; see
 * the PATH_DB comment in src/ck-core.js), so reporting it as "not covered" is
 * the truth. It is a host with no host-level category, and whoever works the
 * list needs to see it in order to decide — the decision being «leave it».
 *
 * Usage:
 *   node tools/hostdb-report.mjs hosts.txt
 *   node tools/hostdb-report.mjs < hosts.txt
 *
 * Input: one host per line. URLs, ports, trailing dots, `#` comments and blank
 * lines are all tolerated — the export is a spreadsheet column, not a
 * hand-checked file.
 *
 * EXIT CODE IS ALWAYS 0. This is a reporting tool, not a gate: unknown hosts
 * are the normal state of the world (the database will never be complete), so
 * a non-zero exit would mean «the routine ran» and would break any pipeline
 * that runs it. Nothing here is wired into `npm test` as a pass/fail check.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

/* ------------------------------------------------------------------ the core */

/* Loaded the way test/hostdb-classify.test.mjs loads it: a window stub plus
   vm.runInThisContext, then the API is read back off the global. No document
   stub — the classifier never touches one, and inventing one here would be a
   second, divergent idea of what the core needs to run. */
export function loadCore() {
  global.window = global;
  global.self = global;
  vm.runInThisContext(readFileSync(join(REPO, 'src', 'ck-core.js'), 'utf8'),
    { filename: 'src/ck-core.js' });
  const api = global.ConsentKit;
  if (!api) { throw new Error('src/ck-core.js did not attach window.ConsentKit'); }
  return api;
}

/* ------------------------------------------------------------------- parsing */

/* Two-level public suffixes, kept SHORT and explicit rather than pulling the
   real Public Suffix List in. Grouping is a presentation choice — it decides
   which lines sit under one heading, never whether a host is covered — so a
   miss costs a slightly odd grouping and nothing else. A PSL dependency (or a
   vendored copy that then goes stale) would be a much larger promise than
   this earns. Extend the list when an export actually shows the need. */
export const TWO_LEVEL_TLDS = new Set([
  'co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'me.uk',
  'com.au', 'net.au', 'org.au',
  'co.nz', 'com.br', 'com.mx', 'com.ar', 'com.tr', 'com.cn', 'com.sg',
  'co.jp', 'co.kr', 'co.za', 'co.il', 'co.in', 'com.ua', 'com.pl',
]);

/**
 * The registrable domain of a host: the last two labels, or three when the
 * last two are a known two-level suffix.
 * @param {string} host
 * @returns {string}
 */
export function registrableDomain(host) {
  const labels = String(host).split('.').filter(Boolean);
  if (labels.length <= 2) { return labels.join('.'); }
  const lastTwo = labels.slice(-2).join('.');
  return TWO_LEVEL_TLDS.has(lastTwo)
    ? labels.slice(-3).join('.')
    : lastTwo;
}

/**
 * One input line -> a bare lowercase host, or '' if the line carries none.
 *
 * Tolerant on purpose: the list is exported from a cabinet admin table, so a
 * cell may hold a full URL, a host with a port, a stray trailing dot, or a
 * quote the spreadsheet added. Anything that still fails the hostname shape
 * after that is dropped rather than reported — a malformed row is a bad
 * export, not a tracker anybody has to categorise.
 */
export function normaliseHost(line) {
  let s = String(line).trim();
  if (!s || s.startsWith('#')) { return ''; }
  s = s.replace(/^["']+|["',;]+$/g, '').trim();
  if (!s) { return ''; }
  s = s.replace(/^[a-z][a-z0-9+.\-]*:\/\//i, '');   // scheme
  s = s.replace(/^[^/@]*@/, '');                     // userinfo
  s = s.split(/[/?#]/)[0];                           // path, query, fragment
  s = s.replace(/:\d+$/, '');                        // port
  s = s.replace(/^\.+|\.+$/g, '').toLowerCase();     // stray dots
  if (!s || s.indexOf('.') === -1) { return ''; }
  if (!/^[a-z0-9.\-]+$/.test(s)) { return ''; }
  return s;
}

/** Every host in the input text, deduped, in first-seen order. */
export function parseHosts(text) {
  const seen = new Set();
  for (const line of String(text).split('\n')) {
    const host = normaliseHost(line);
    if (host) { seen.add(host); }
  }
  return [...seen];
}

/* ------------------------------------------------------------------ the report */

/**
 * Split hosts into what the database already answers for and what it does not.
 * @returns {{ covered: {host,category,infra}[], unknown: string[] }}
 */
export function classify(hosts, CK) {
  const covered = [];
  const unknown = [];

  for (const host of hosts) {
    let category = null;
    let infra = false;
    try {
      category = CK._categoryForUrl('https://' + host + '/');
      infra = CK._isInfra(host);
    } catch (e) { /* a host the core chokes on is one to look at by hand */ }

    if (category || infra) { covered.push({ host, category, infra }); }
    else { unknown.push(host); }
  }

  return { covered, unknown };
}

/**
 * The report text.
 *
 * Covered hosts are counted, never NAMED. The output is a worklist, and a
 * worklist that also lists everything already done is one nobody reads to the
 * bottom — the whole point is that the list is short.
 */
export function report(hosts, CK) {
  const { covered, unknown } = classify(hosts, CK);
  const out = [];

  out.push(`Hosts read: ${hosts.length}`);
  out.push(`Already covered by the database: ${covered.length}`);
  out.push(`Not covered: ${unknown.length}`);

  if (!hosts.length) {
    out.push('');
    out.push('Nothing to report — the input held no hosts.');
    return out.join('\n') + '\n';
  }

  if (!unknown.length) {
    out.push('');
    out.push('Every host in this list is already known. Nothing to add.');
    return out.join('\n') + '\n';
  }

  /* Grouped by registrable domain and ordered by how many hosts one decision
     settles, so the top of the list is where the reading pays off. Ties break
     alphabetically, so two runs over the same export print the same file. */
  const groups = new Map();
  for (const host of unknown) {
    const domain = registrableDomain(host);
    if (!groups.has(domain)) { groups.set(domain, []); }
    groups.get(domain).push(host);
  }

  const ordered = [...groups.entries()].sort((a, b) =>
    b[1].length - a[1].length || a[0].localeCompare(b[0]));

  out.push('');
  out.push('Unknown hosts, grouped by registrable domain');
  out.push('='.repeat(44));

  for (const [domain, list] of ordered) {
    out.push('');
    out.push(`${domain}  (${list.length} host${list.length === 1 ? '' : 's'})`);
    for (const host of [...list].sort()) { out.push(`  ${host}`); }
  }

  /* Paste-ready, with '?' where the category goes. Deliberately not a guess:
     the four categories are a legal classification, and the one thing worse
     than an uncategorised host is a confidently wrong one. export-hostdb.mjs
     refuses a category outside the known four, so a '?' left in place stops
     the build instead of shipping. */
  out.push('');
  out.push('Suggested HOST_DB entries (src/ck-core.js) — replace every ? with');
  out.push("one of 'necessary', 'functional', 'analytics', 'marketing':");
  out.push('');
  for (const [, list] of ordered) {
    for (const host of [...list].sort()) { out.push(`    '${host}': '?',`); }
  }

  return out.join('\n') + '\n';
}

/* --------------------------------------------------------------------- main */

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch (e) {
    return '';
  }
}

const isMain = process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  /* Everything below leaves the exit code at 0, including the failures. The
     one thing this tool must never do is break the monthly routine it exists
     to serve — an unreadable file is a message, not a build failure. */
  try {
    const arg = process.argv.slice(2).find((a) => !a.startsWith('-'));

    let text = '';
    if (arg) {
      try {
        text = readFileSync(resolve(arg), 'utf8');
      } catch (e) {
        console.error(`tools/hostdb-report.mjs: cannot read ${arg}: ${e.message}`);
        text = '';
      }
    } else if (process.stdin.isTTY) {
      /* No file and a terminal on stdin: reading would hang forever with no
         hint as to why. Say what the tool wants instead. */
      console.error('tools/hostdb-report.mjs — report hosts the tracker database does not know.');
      console.error('');
      console.error('  node tools/hostdb-report.mjs hosts.txt');
      console.error('  node tools/hostdb-report.mjs < hosts.txt');
      console.error('');
      console.error('Input: one host (or URL) per line.');
      text = '';
    } else {
      text = readStdin();
    }

    if (text) {
      process.stdout.write(report(parseHosts(text), loadCore()));
    }
  } catch (e) {
    console.error(`tools/hostdb-report.mjs: ${e && e.message ? e.message : e}`);
  }

  /* Not process.exit(0): stdout is a pipe when this runs under a parent that
     captures it, and exiting explicitly can cut a large report off mid-write. */
  process.exitCode = 0;
}
