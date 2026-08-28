/**
 * ConsentKit mock API — DEMO / ACCEPTANCE ONLY. Not part of the product.
 *
 *   node demo/mock-api.mjs            # port 8788
 *   node demo/mock-api.mjs --fail     # every request fails (strict-mode test)
 *
 * Implements just enough of SPEC §5 to drive demo/saas.html:
 *   GET  /v1/config/:siteId.json   ETag + 304, x-ck-country, CORS
 *   POST /v1/consent               validates the closed field list, logs, 204
 */
import { createServer } from 'node:http';

// Log through stderr: stdout is block-buffered when redirected to a file, which
// hides request lines during acceptance runs (`node demo/mock-api.mjs > log`).
const log = (...a) => process.stderr.write(a.join(' ') + '\n');

const PORT = 8788;
const FAIL = process.argv.includes('--fail');
const COUNTRY = 'DE';

// cfg id doubles as the ETag (SPEC §5: "ETag: cfg id").
const CFG_V = 'cfg_demo_v1';

const CONFIG = {
  v: CFG_V,
  policyVersion: '1',
  language: 'auto',
  layout: { type: 'bar', position: 'bottom' },
  theme: { accent: '#2B50D8', radius: '10px' },
  categories: { functional: { enabled: true }, analytics: { enabled: true }, marketing: { enabled: true } },
  consentTtlDays: 365,
  integrations: { gcm: true, gtmDataLayer: true },
  cookieTable: [
    { name: 'demo_ga', category: 'analytics', vendor: 'Demo GA', purpose: 'Demo analytics cookie', expiry: '1 year' },
    { name: 'demo_fbp', category: 'marketing', vendor: 'Demo Pixel', purpose: 'Demo marketing cookie', expiry: '90 days' },
    { name: 'demo_chat', category: 'functional', vendor: 'Demo Chat', purpose: 'Demo chat widget', expiry: 'session' }
  ],
  log: { endpoint: `http://localhost:${PORT}/v1/consent`, key: 'demo_write_key' },
  geo: { mode: 'all' },
  contentHash: 'sha256-demo'
};

const ALLOWED = new Set(['siteId','key','cfg','id','ts','categories','method','lang','layout']);
const METHODS = new Set(['accept_all','reject_all','custom','withdraw']);
const seen = new Set();   // (id) -> idempotency, mirrors ON CONFLICT DO NOTHING
let n = 0;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-None-Match');
  res.setHeader('Access-Control-Expose-Headers', 'x-ck-country, etag');
}
const err = (res, code, msg, status) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { code, message: msg } }));
};

createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  cors(res);

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (FAIL) {
    log(`  [fail-mode] ${req.method} ${url.pathname} -> 503`);
    return err(res, 'unavailable', 'mock running with --fail', 503);
  }

  const cfgMatch = url.pathname.match(/^\/v1\/config\/(.+)\.json$/);
  if (req.method === 'GET' && cfgMatch) {
    const siteId = decodeURIComponent(cfgMatch[1]);
    if (siteId === 'missing') {
      res.setHeader('Cache-Control', 'public, max-age=60');
      log(`  GET config ${siteId} -> 404`);
      return err(res, 'site_not_found', 'no such site', 404);
    }
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('ETag', CFG_V);
    res.setHeader('x-ck-country', COUNTRY);
    if (req.headers['if-none-match'] === CFG_V) {
      log(`  GET config ${siteId} (If-None-Match) -> 304`);
      res.writeHead(304); res.end(); return;
    }
    log(`  GET config ${siteId} -> 200 (etag ${CFG_V})`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(CONFIG));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/v1/consent') {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1e5) req.destroy(); });
    req.on('end', () => {
      let b;
      try { b = JSON.parse(raw); } catch { return err(res, 'bad_json', 'body is not JSON', 400); }

      const extra = Object.keys(b).filter((k) => !ALLOWED.has(k));
      if (extra.length) {
        log(`  POST consent -> 400 unknown fields: ${extra.join(', ')}`);
        return err(res, 'invalid_body', `unknown fields: ${extra.join(', ')}`, 400);
      }
      if (b.key !== CONFIG.log.key) { log('  POST consent -> 403 bad_key'); return err(res, 'bad_key', 'write key mismatch', 403); }
      if (b.cfg !== CFG_V) { log('  POST consent -> 400 unknown_cfg'); return err(res, 'unknown_cfg', 'cfg not owned by site', 400); }
      if (!METHODS.has(b.method)) { return err(res, 'invalid_body', `bad method ${b.method}`, 400); }
      const cats = b.categories || {};
      const catKeys = Object.keys(cats).sort().join(',');
      if (catKeys !== 'analytics,functional,marketing') {
        log(`  POST consent -> 400 categories keys: [${catKeys}]`);
        return err(res, 'invalid_body', `categories must be exactly functional/analytics/marketing, got [${catKeys}]`, 400);
      }
      if (Math.abs(Date.now() - Date.parse(b.ts)) > 48 * 3600e3) { return err(res, 'invalid_body', 'ts outside 48h', 400); }

      const dup = seen.has(b.id);
      seen.add(b.id);
      n += 1;
      log(
        `  POST consent #${n}${dup ? ' [DUPLICATE id -> no new row]' : ''}\n` +
        `      id=${b.id}\n      ts=${b.ts}  method=${b.method}\n` +
        `      categories=${JSON.stringify(b.categories)}` +
        `${b.lang ? `  lang=${b.lang}` : ''}${b.layout ? `  layout=${b.layout}` : ''}`
      );
      res.writeHead(204); res.end();
    });
    return;
  }

  err(res, 'not_found', 'no such endpoint', 404);
}).listen(PORT, () => {
  log(`ConsentKit mock API on http://localhost:${PORT}${FAIL ? '  [--fail]' : ''}`);
  log(`  GET  /v1/config/<siteId>.json   (siteId "missing" -> 404)`);
  log(`  POST /v1/consent`);
});
