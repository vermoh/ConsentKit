#!/usr/bin/env node
/* ConsentKit — exporter: src/ck-core.js HOST_DB/PATH_DB -> WordPress PHP array.
 *
 * WHY THIS EXISTS
 * The WordPress plugin rewrites known tracker tags server-side (debt Д10), and
 * it must classify hosts EXACTLY the way the browser client does. Two copies of
 * the same table drift within one release: the whole point of generating the
 * PHP file is that src/ck-core.js stays the single source of truth and nobody
 * ever retypes a domain by hand.
 *
 * WHY EVALUATION AND NOT A REGEX
 * HOST_DB is a private variable inside the core's IIFE — it is never attached
 * to window.ConsentKit, so loading the core (the way test/version.test.mjs does)
 * does not reach it. The literal is therefore located by brace balancing and
 * handed to the JavaScript engine via node:vm. Reading the keys and values with
 * a regex would re-implement JS string parsing badly: the trailing `//` comments
 * on almost every line, and any future quoting change, would break it silently.
 * Evaluation means the exported values are whatever JavaScript itself sees.
 *
 * Usage:
 *   node tools/export-hostdb.mjs            # write the PHP file
 *   node tools/export-hostdb.mjs --check    # exit 1 if it is out of date
 *   node tools/export-hostdb.mjs --stdout   # print, write nothing
 *
 * test/hostdb.test.mjs runs --check inside `npm test`.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const CORE = join(REPO, 'src', 'ck-core.js');
const OUT = join(REPO, 'plugins', 'wordpress', 'consentkit', 'includes', 'hostdb.php');

/* A silent extraction failure would write an empty table, and an empty table is
   a plugin that blocks nothing while reporting success. SPEC records ~68 hosts;
   the floor is deliberately well below that so ordinary pruning does not trip
   it, but a broken parse cannot pass. */
const MIN_HOSTS = 40;
const MIN_PATHS = 2;

/* ----------------------------------------------------------------- extraction */

/**
 * Extracts `var <name> = { ... };` from JavaScript source by balancing braces,
 * then evaluates the object literal.
 *
 * Brace balancing is safe here because the literal contains only string keys,
 * string values and line comments — no braces inside strings. The evaluation
 * step is what actually parses the contents.
 */
function extractObject(source, name) {
  const decl = new RegExp(`var\\s+${name}\\s*=\\s*\\{`);
  const m = decl.exec(source);
  if (!m) { throw new Error(`${name} not found in src/ck-core.js`); }

  const start = m.index + m[0].length - 1; // at the '{'
  let depth = 0;
  let end = -1;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') { depth++; } else if (ch === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) { throw new Error(`${name}: unbalanced braces in src/ck-core.js`); }

  const literal = source.slice(start, end + 1);
  const value = vm.runInNewContext(`(${literal})`, Object.create(null), {
    timeout: 1000,
    filename: `src/ck-core.js:${name}`,
  });

  if (!value || typeof value !== 'object') { throw new Error(`${name} did not evaluate to an object`); }
  return value;
}

const CATEGORIES = ['necessary', 'functional', 'analytics', 'marketing'];

function validate(map, label, min) {
  const keys = Object.keys(map);
  if (keys.length < min) {
    throw new Error(`${label}: extracted only ${keys.length} entries (expected >= ${min}) — the extractor is broken, refusing to write`);
  }
  for (const k of keys) {
    if (typeof k !== 'string' || k === '') { throw new Error(`${label}: empty key`); }
    if (!CATEGORIES.includes(map[k])) {
      throw new Error(`${label}: entry "${k}" has category "${map[k]}", which is not one of ${CATEGORIES.join('/')}`);
    }
  }
  return keys.length;
}

/* -------------------------------------------------------------------- render */

/* Single-quoted PHP strings need only these two escaped, and the keys here are
   hostnames and URL fragments — but escaping is unconditional so an unexpected
   character can never break out of the literal. */
function phpString(s) {
  return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

/** Stable digest of the exported data, so the sync test compares data and not formatting. */
export function digest(hosts, paths) {
  const canonical = JSON.stringify({
    hosts: Object.fromEntries(Object.keys(hosts).sort().map((k) => [k, hosts[k]])),
    paths: Object.fromEntries(Object.keys(paths).sort().map((k) => [k, paths[k]])),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/** Reads HOST_DB and PATH_DB out of src/ck-core.js. */
export function readDbs() {
  const source = readFileSync(CORE, 'utf8');
  const hosts = extractObject(source, 'HOST_DB');
  const paths = extractObject(source, 'PATH_DB');
  validate(hosts, 'HOST_DB', MIN_HOSTS);
  validate(paths, 'PATH_DB', MIN_PATHS);

  const version = (/version:\s*'([^']+)'/.exec(source) || [])[1] || 'unknown';
  return { hosts, paths, version };
}

/**
 * Renders the PHP data file.
 *
 * The file is a bare `return array(...)` with NO ABSPATH guard, deliberately:
 * it carries no logic, it is loaded with `require`, and the PHP CLI test
 * (tests/rewrite.test.php) must be able to load it without WordPress. Every
 * other PHP file in the plugin keeps its guard.
 */
export function renderPhp({ hosts, paths, version }) {
  const lines = [];
  lines.push('<?php');
  lines.push('/**');
  lines.push(' * ConsentKit tracker database — GENERATED FILE, DO NOT EDIT.');
  lines.push(' *');
  lines.push(' * Generated by tools/export-hostdb.mjs from src/ck-core.js of the ConsentKit');
  lines.push(` * client (version ${version}). The client is the single source of truth: edit`);
  lines.push(' * HOST_DB / PATH_DB there and re-run');
  lines.push(' *');
  lines.push(' *     node tools/export-hostdb.mjs');
  lines.push(' *');
  lines.push(' * test/hostdb.test.mjs fails when this file drifts from the client, so a stale');
  lines.push(' * copy cannot ship: the server-side markup would then classify a host');
  lines.push(' * differently from the browser engine that runs on the very same page.');
  lines.push(' *');
  lines.push(' * "hosts" is matched by suffix (host === key, or host ends with "." . key),');
  lines.push(' * "paths" by case-insensitive substring against the whole URL — exactly what');
  lines.push(' * categoryForUrl() does in ck-core.js.');
  lines.push(' *');
  lines.push(' * This file intentionally carries no ABSPATH guard and no side effects: it is');
  lines.push(' * pure data loaded with require(), including by the PHP CLI test that runs');
  lines.push(' * without WordPress.');
  lines.push(' *');
  lines.push(' * @package ConsentKit');
  lines.push(' */');
  lines.push('');
  lines.push('return array(');
  lines.push("\t'hosts' => array(");
  for (const k of Object.keys(hosts).sort()) {
    lines.push(`\t\t${phpString(k)} => ${phpString(hosts[k])},`);
  }
  lines.push('\t),');
  lines.push("\t'paths' => array(");
  for (const k of Object.keys(paths).sort()) {
    lines.push(`\t\t${phpString(k)} => ${phpString(paths[k])},`);
  }
  lines.push('\t),');
  lines.push(');');
  lines.push('');
  return lines.join('\n');
}

/* ---------------------------------------------------------------------- main */

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const argv = process.argv.slice(2);
  const check = argv.includes('--check');
  const toStdout = argv.includes('--stdout');

  let dbs;
  try {
    dbs = readDbs();
  } catch (err) {
    process.stderr.write(`export-hostdb: ${err.message}\n`);
    process.exit(1);
  }

  const php = renderPhp(dbs);
  const counts = `${Object.keys(dbs.hosts).length} hosts, ${Object.keys(dbs.paths).length} path fragments (client ${dbs.version})`;

  if (toStdout) {
    process.stdout.write(php);
    process.stderr.write(`export-hostdb: ${counts}\n`);
    process.exit(0);
  }

  if (check) {
    const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : null;
    if (current === php) {
      process.stderr.write(`export-hostdb: up to date — ${counts}\n`);
      process.exit(0);
    }
    process.stderr.write(
      'export-hostdb: includes/hostdb.php is out of date with src/ck-core.js — run `node tools/export-hostdb.mjs`\n'
    );
    process.exit(1);
  }

  writeFileSync(OUT, php, 'utf8');
  process.stderr.write(`export-hostdb: wrote ${OUT} — ${counts}\n`);
}
