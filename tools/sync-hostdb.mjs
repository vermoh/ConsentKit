#!/usr/bin/env node
/* ConsentKit — pull the service's tracker overrides into HOST_DB.
 *
 * WHAT THIS IS FOR
 * The SaaS service keeps a curated table of tracker hosts (SPEC-V1.5 §1.1–1.3):
 * hosts an operator classified by hand in the admin panel, on top of what the
 * shipped database already knows. Sites on the service receive it at runtime as
 * `config.hostdb` and merge it with ConsentKit._extendHostDb(). Sites that are
 * NOT on the service — inline blocks, the npm package, the WordPress plugin —
 * receive nothing at runtime, so the curated hosts reach them only by being
 * baked into src/ck-core.js at release time. That is this tool.
 *
 * WHAT IT WRITES
 * A single delimited block at the END of the HOST_DB literal:
 *
 *     // --- overrides from the service (synced YYYY-MM-DD) ---
 *     'example-tracker.com': 'marketing',
 *
 * Idempotent by construction: the block is REPLACED wholesale on every run, and
 * a host already present in the hand-maintained part of HOST_DB is skipped —
 * the curated table must never silently re-categorise an entry that a human
 * wrote down with a reason next to it. Re-running with an unchanged remote
 * table rewrites the same bytes (apart from the date, which only moves when the
 * data does — see mergeSource()).
 *
 * AFTER RUNNING IT
 * plugins/wordpress/consentkit/includes/hostdb.php is now stale, because
 * tools/export-hostdb.mjs reads the very literal this tool just edited. Run
 *
 *     node tools/export-hostdb.mjs
 *     node tools/sync-site.mjs
 *
 * or `npm test` will tell you so.
 *
 * Usage:
 *   node tools/sync-hostdb.mjs                 # fetch and write
 *   node tools/sync-hostdb.mjs --check         # fetch, report drift, write nothing
 *   node tools/sync-hostdb.mjs --from=file.json  # use a local file instead of the network
 *   node tools/sync-hostdb.mjs --url=https://…   # a different endpoint
 *
 * A network failure is a REFUSAL, not a skip: exit 1, nothing written. Silently
 * carrying on would ship a release whose database is a snapshot of whenever the
 * network last worked, with nothing in the diff to say so.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const CORE = join(REPO, 'src', 'ck-core.js');

export const DEFAULT_URL = 'https://consent.ecomconsult.net/v1/public/hostdb.json';

export const BEGIN = '// --- overrides from the service (synced';
export const END = '// --- end overrides from the service ---';

const CATEGORIES = ['necessary', 'functional', 'analytics', 'marketing'];

/* Same shape as export-hostdb.mjs's floor: a remote table that came back
   enormous is far more likely to be a wrong endpoint (an HTML error page parsed
   as JSON, a whole EasyPrivacy dump) than a real curation run. */
const MAX_OVERRIDES = 2000;

/* ------------------------------------------------------------------ parsing */

/** Locates the `var HOST_DB = { … };` literal by balancing braces. */
export function findHostDb(source) {
  const m = /var\s+HOST_DB\s*=\s*\{/.exec(source);
  if (!m) { throw new Error('HOST_DB not found in src/ck-core.js'); }
  const open = m.index + m[0].length - 1;
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') { depth++; }
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) { return { open, close: i }; }
    }
  }
  throw new Error('HOST_DB: unbalanced braces in src/ck-core.js');
}

/**
 * Hosts written by hand in HOST_DB, i.e. everything OUTSIDE the generated
 * block. These are never overwritten: each carries a human decision (often a
 * trailing comment explaining why a bare domain was or was not used).
 */
export function handMaintainedHosts(source) {
  const { open, close } = findHostDb(source);
  const body = stripGeneratedBlock(source.slice(open + 1, close));
  const hosts = new Set();
  for (const line of body.split('\n')) {
    const hit = /^\s*'([^']+)'\s*:\s*'([^']+)'\s*,?/.exec(line);
    if (hit) { hosts.add(hit[1]); }
  }
  return hosts;
}

/** Removes an existing generated block from a HOST_DB body, if present. */
function stripGeneratedBlock(body) {
  const start = body.indexOf(BEGIN);
  if (start === -1) { return body; }
  const endMark = body.indexOf(END, start);
  if (endMark === -1) { throw new Error(`found "${BEGIN}…" without its closing "${END}" — fix src/ck-core.js by hand`); }
  return body.slice(0, start) + body.slice(endMark + END.length);
}

/* ----------------------------------------------------------------- validation */

/**
 * Filters a remote `{host: category}` table down to what may be written:
 * well-formed hosts, known categories, nothing already hand-maintained.
 * Returns { entries: [[host, category]…] sorted, skipped, rejected }.
 */
export function selectOverrides(remote, handHosts) {
  if (!remote || typeof remote !== 'object' || Array.isArray(remote)) {
    throw new Error('the remote table is not a JSON object of {host: category}');
  }
  const keys = Object.keys(remote);
  if (keys.length > MAX_OVERRIDES) {
    throw new Error(`the remote table has ${keys.length} entries (max ${MAX_OVERRIDES}) — refusing, this looks like the wrong endpoint`);
  }

  const entries = [];
  const rejected = [];
  let skipped = 0;
  for (const raw of keys) {
    const host = String(raw).trim().toLowerCase().replace(/:\d+$/, '').replace(/^\.+|\.+$/g, '');
    const cat = remote[raw];
    // Same validation the client applies in _extendHostDb, plus the exporter's
    // category check — a bad category would break `node tools/export-hostdb.mjs`
    // downstream, and the failure would surface far from its cause.
    if (!host || !host.includes('.') || /[^a-z0-9.\-]/.test(host)) { rejected.push(`${raw} (malformed host)`); continue; }
    if (typeof cat !== 'string' || !CATEGORIES.includes(cat)) { rejected.push(`${raw} (category "${cat}")`); continue; }
    if (handHosts.has(host)) { skipped++; continue; }
    entries.push([host, cat]);
  }
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return { entries, skipped, rejected };
}

/** Index of the `//` that starts a line comment, ignoring any inside quotes. */
function commentStart(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === '\\') { i++; } else if (c === quote) { quote = null; }
    } else if (c === "'" || c === '"') {
      quote = c;
    } else if (c === '/' && line[i + 1] === '/') {
      return i;
    }
  }
  return -1;
}

/* -------------------------------------------------------------------- render */

export function renderBlock(entries, date) {
  if (!entries.length) { return ''; }
  const lines = [];
  lines.push('');
  lines.push(`    ${BEGIN} ${date}) ---`);
  lines.push('    // GENERATED by tools/sync-hostdb.mjs from the service\'s curated table.');
  lines.push('    // Do not edit by hand: the whole block is replaced on the next sync.');
  lines.push('    // Hosts already listed above are deliberately absent — a hand-written');
  lines.push('    // entry carries a reason and always wins.');
  for (const [host, cat] of entries) {
    lines.push(`    '${host}': '${cat}',`);
  }
  lines.push(`    ${END}`);
  return lines.join('\n');
}

/**
 * Produces the new src/ck-core.js text. Pure: no I/O, so the merge is testable
 * against a fixture without touching the network or the repository.
 *
 * The date is only refreshed when the DATA changed: re-running the sync on an
 * unchanged table must be a no-op, or every release would carry a diff that
 * says nothing except that someone ran a tool.
 */
export function mergeSource(source, remote, date) {
  const handHosts = handMaintainedHosts(source);
  const { entries, skipped, rejected } = selectOverrides(remote, handHosts);

  const { open, close } = findHostDb(source);
  const body = source.slice(open + 1, close);
  const cleaned = stripGeneratedBlock(body).replace(/\s+$/, '');

  // Every entry in the generated block ends with a comma, so the last
  // hand-written entry needs one before the block is appended. Two traps here,
  // both of which the fixture in test/hostdb-sync.test.mjs actually hits:
  //   1. HOST_DB entries routinely carry a trailing `// comment`, so testing
  //      for a trailing quote is not enough — the CODE is what must end in a
  //      comma, not the line.
  //   2. The comma must be inserted after the code and BEFORE that comment,
  //      or it lands inside the comment and is not a comma at all.
  const block = renderBlock(entries, date);
  let tail = cleaned;
  if (entries.length > 0) {
    const lines = tail.split('\n');
    const last = lines[lines.length - 1];
    // Split the final line into code and its trailing line comment, if any.
    const cut = commentStart(last);
    const code = (cut === -1 ? last : last.slice(0, cut)).replace(/\s+$/, '');
    const comment = cut === -1 ? '' : last.slice(cut);
    if (code && !/,$/.test(code)) {
      lines[lines.length - 1] = code + ',' + (comment ? '   ' + comment : '');
      tail = lines.join('\n');
    }
  }
  const newBody = tail + block + '\n  ';
  const out = source.slice(0, open + 1) + newBody + source.slice(close);

  // Same data, same bytes: keep whatever date the existing block carries.
  const previous = renderedEntries(source);
  const same = previous.length === entries.length &&
    previous.every(([h, c], i) => entries[i] && entries[i][0] === h && entries[i][1] === c);
  if (same) { return { source, entries, skipped, rejected, changed: false }; }

  return { source: out, entries, skipped, rejected, changed: true };
}

/** The entries currently sitting in the generated block, in file order. */
export function renderedEntries(source) {
  const { open, close } = findHostDb(source);
  const body = source.slice(open + 1, close);
  const start = body.indexOf(BEGIN);
  if (start === -1) { return []; }
  const endMark = body.indexOf(END, start);
  if (endMark === -1) { return []; }
  const out = [];
  for (const line of body.slice(start, endMark).split('\n')) {
    const hit = /^\s*'([^']+)'\s*:\s*'([^']+)'\s*,/.exec(line);
    if (hit) { out.push([hit[1], hit[2]]); }
  }
  return out;
}

/* ---------------------------------------------------------------------- main */

async function fetchRemote(url) {
  if (typeof fetch !== 'function') {
    throw new Error('this Node build has no global fetch — use --from=<file.json> (Node >= 18 has it)');
  }
  let res;
  try {
    res = await fetch(url, { headers: { accept: 'application/json' } });
  } catch (err) {
    throw new Error(`could not reach ${url}: ${err && err.message}`);
  }
  if (!res.ok) { throw new Error(`${url} answered HTTP ${res.status}`); }
  try {
    return await res.json();
  } catch (err) {
    throw new Error(`${url} did not return valid JSON: ${err && err.message}`);
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const argv = process.argv.slice(2);
  const check = argv.includes('--check');
  const from = (argv.find((a) => a.startsWith('--from=')) || '').slice('--from='.length);
  const url = (argv.find((a) => a.startsWith('--url=')) || '').slice('--url='.length) || DEFAULT_URL;

  let remote;
  try {
    remote = from
      ? JSON.parse(readFileSync(resolve(from), 'utf8'))
      : await fetchRemote(url);
  } catch (err) {
    // A refusal, not a skip: writing a stale table without saying so would ship
    // a release whose tracker database is silently out of date.
    process.stderr.write(`sync-hostdb: ${err.message}\n`);
    process.stderr.write('sync-hostdb: nothing written.\n');
    process.exit(1);
  }

  const source = readFileSync(CORE, 'utf8');
  const date = new Date().toISOString().slice(0, 10);

  let result;
  try {
    result = mergeSource(source, remote, date);
  } catch (err) {
    process.stderr.write(`sync-hostdb: ${err.message}\nsync-hostdb: nothing written.\n`);
    process.exit(1);
  }

  const summary = `${result.entries.length} override(s), ${result.skipped} already in HOST_DB` +
    (result.rejected.length ? `, ${result.rejected.length} rejected` : '');
  for (const r of result.rejected) { process.stderr.write(`  rejected: ${r}\n`); }

  if (!result.changed) {
    process.stderr.write(`sync-hostdb: up to date — ${summary}\n`);
    process.exit(0);
  }

  if (check) {
    process.stderr.write(`sync-hostdb: src/ck-core.js is out of date — ${summary}\n`);
    process.stderr.write('sync-hostdb: run `node tools/sync-hostdb.mjs`\n');
    process.exit(1);
  }

  writeFileSync(CORE, result.source, 'utf8');
  process.stderr.write(`sync-hostdb: updated src/ck-core.js — ${summary}\n`);
  process.stderr.write('sync-hostdb: now re-run `node tools/export-hostdb.mjs` and `node tools/sync-site.mjs`.\n');
}
