/* The branding split (debt Д11): src/ck-ui-branding.js is OPTIONAL.
 *
 * Two properties have to hold at once, and only one of them is obvious:
 *
 *   1. With the file loaded, branding renders exactly as it did when the code
 *      lived inside ck-ui.js.
 *   2. WITHOUT it, ck-ui.js draws no branding and throws nothing. That is the
 *      property a --no-branding build depends on, and it is the one that
 *      breaks silently — a missing null-guard shows up as a blank banner on a
 *      site that never asked for branding in the first place, which no other
 *      test would notice.
 *
 * There is no jsdom here (the repository has zero dependencies), so the DOM is
 * stubbed to the handful of methods the branding builders actually touch.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BRANDING_SRC = readFileSync(join(REPO, 'src', 'ck-ui-branding.js'), 'utf8');
const UI_SRC = readFileSync(join(REPO, 'src', 'ck-ui.js'), 'utf8');

/* ------------------------------------------------------------- DOM stub */

function makeNode(tag) {
  return {
    nodeName: tag, tagName: tag, className: '', childNodes: [], attributes: [],
    style: {}, dataset: {}, _text: '',
    classList: {
      _s: new Set(),
      add(...c) { c.forEach((x) => this._s.add(x)); },
      remove(...c) { c.forEach((x) => this._s.delete(x)); },
      contains(c) { return this._s.has(c); },
      toggle() {}
    },
    set textContent(v) { this._text = v; this.childNodes = []; },
    get textContent() {
      return this._text || this.childNodes.map((c) => c.textContent || c.nodeValue || '').join('');
    },
    appendChild(c) { this.childNodes.push(c); return c; },
    setAttribute(k, v) { this['_a_' + k] = v; },
    getAttribute(k) { return this['_a_' + k]; },
    addEventListener() {}, removeEventListener() {}
  };
}

function makeContext() {
  const doc = {
    createElement: makeNode,
    createElementNS: (ns, t) => makeNode(t),
    createTextNode: (t) => ({ nodeType: 3, nodeValue: t, textContent: t }),
    addEventListener() {}, removeEventListener() {},
    documentElement: makeNode('html'),
    body: makeNode('body'),
    querySelector: () => null,
    querySelectorAll: () => [],
    readyState: 'complete'
  };
  const win = {
    document: doc,
    navigator: { language: 'en' },
    setTimeout: () => 0,
    clearTimeout: () => {},
    DOMParser: class { parseFromString() { return null; } },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    console
  };
  win.window = win;
  win.globalThis = win;
  win.self = win;
  return vm.createContext(win);
}

// What ck-ui.js hands the extension on every DOM-producing call.
function makeHost() {
  return {
    el: (t, c, x) => { const n = makeNode(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; },
    str: (v) => (typeof v === 'string' && v.trim()) ? v.trim() : null,
    T: { poweredBy: 'Powered by ConsentKit' }
  };
}

function loadBranding() {
  const ctx = makeContext();
  vm.runInContext(BRANDING_SRC, ctx, { filename: 'src/ck-ui-branding.js' });
  return ctx;
}

/* ------------------------------------------------------- registration */

test('the branding file registers itself on the core namespace', () => {
  const ctx = loadBranding();
  const ext = ctx.window.ConsentKit && ctx.window.ConsentKit._uiExtensions;
  assert.ok(ext && ext.branding, 'ck-ui-branding.js did not register _uiExtensions.branding');
  assert.equal(ctx.window.ConsentKitBranding, ext.branding,
    'the documented flat name and the extension slot must be the same object');
});

test('the extension publishes the whole contract ck-ui.js calls', () => {
  const b = loadBranding().window.ConsentKitBranding;
  for (const fn of ['buildBrandLogo', 'buildPoweredBy', 'buildBrandCss',
                    'brandSignature', 'sanitizeSvg', 'css']) {
    assert.equal(typeof b[fn], 'function', `the extension is missing ${fn}()`);
  }
});

/* ------------------------------------------------------------ rendering */

test('buildPoweredBy renders the localised default for poweredBy: true', () => {
  const b = loadBranding().window.ConsentKitBranding;
  const node = b.buildPoweredBy({ branding: { poweredBy: true } }, makeHost());
  assert.ok(node, 'poweredBy: true rendered nothing');
  assert.equal(node.textContent, 'Powered by ConsentKit',
    'the extension must take its default text from the host T, not a private copy');
});

test('buildPoweredBy renders a caller-supplied line', () => {
  const b = loadBranding().window.ConsentKitBranding;
  const node = b.buildPoweredBy(
    { branding: { poweredBy: { text: 'Made by E-COM Consult', url: 'https://ecomconsult.net' } } },
    makeHost());
  assert.equal(node.textContent, 'Made by E-COM Consult');
});

test('no branding config renders nothing at all', () => {
  const b = loadBranding().window.ConsentKitBranding;
  const host = makeHost();
  assert.equal(b.buildPoweredBy({}, host), null);
  assert.equal(b.buildBrandLogo({}, host), null);
  assert.equal(b.buildBrandCss({}), '');
  assert.equal(b.brandSignature({}), '-',
    'an unbranded config must keep the old signature, or every mount churns');
});

test('the static stylesheet carries the branding rules', () => {
  const css = loadBranding().window.ConsentKitBranding.css();
  for (const sel of ['.ck-brand{', '.ck-foot{', '.ck-powered', '.ck-brand__has-dark',
                     ':has(.ck-brand)']) {
    assert.ok(css.includes(sel), `the extension stylesheet is missing ${sel}`);
  }
  // The bar layout's foot ordering is viewport-scoped and must stay so.
  assert.match(css, /@media \(max-width:560px\)\{[\s\S]*\.ck-foot\{order:3/,
    'the narrow-bar foot rule lost its media query');
});

/* --------------------------------------------------- ck-ui without the file */

test('ck-ui.js evaluates with no branding extension present', () => {
  const ctx = makeContext();
  ctx.window.ConsentKit = {
    config: { layout: { type: 'bar' } },
    version: '0.0.0',
    getState: () => ({ decided: false, categories: {} })
  };
  assert.doesNotThrow(
    () => vm.runInContext(UI_SRC, ctx, { filename: 'src/ck-ui.js' }),
    'ck-ui.js threw when the branding extension was absent');
  assert.ok(!ctx.window.ConsentKit._uiExtensions,
    'ck-ui.js must not invent an extensions object of its own');
});

/* ck-ui's own hook layer, exercised directly: the block is lifted out of the
   file and run against a stub api()/el()/str()/T, once with an extension and
   once without. This is what proves absence is a no-op rather than a throw. */
function runHooks(extension) {
  const start = UI_SRC.indexOf('function brandingExt()');
  const end = UI_SRC.indexOf('/* ----------------------------------------------------------------- state */');
  assert.ok(start > 0 && end > start, 'could not locate the branding hook block in ck-ui.js');

  const ctx = vm.createContext({ console, EXT: extension });
  vm.runInContext(`
    var _ext = ${extension ? 'EXT' : 'null'};
    function api(){ return { _uiExtensions: _ext ? { branding: _ext } : undefined }; }
    function el(t,c,x){ return { tag: t, cls: c, txt: x }; }
    function str(v){ return (typeof v === 'string' && v.trim()) ? v.trim() : null; }
    var T = { poweredBy: 'PB' };
  ` + UI_SRC.slice(start, end) + `
    globalThis.OUT = {
      logo: buildBrandLogo({ branding: { logo: 'x' } }),
      pb: buildPoweredBy({ branding: { poweredBy: true } }),
      css: brandingCss(),
      brandCss: buildBrandCss({}),
      sig: brandSignature({ branding: { logo: 'x' } })
    };
  `, ctx);
  return ctx.OUT;
}

test('ck-ui.js draws no branding when the extension is absent', () => {
  const out = runHooks(null);
  assert.equal(out.logo, null, 'a logo was built with no extension loaded');
  assert.equal(out.pb, null, 'an attribution line was built with no extension loaded');
  assert.equal(out.css, '', 'branding CSS leaked into a build without the extension');
  assert.equal(out.brandCss, '', 'per-mount branding CSS leaked in');
  assert.equal(out.sig, '-', 'the mount signature changed with no extension loaded');
});

test('ck-ui.js delegates to the extension when it is present, passing its helpers', () => {
  const calls = [];
  const out = runHooks({
    buildBrandLogo: (cfg, h) => { calls.push('logo'); return { hasEl: typeof h.el === 'function', hasT: !!h.T }; },
    buildPoweredBy: (cfg, h) => { calls.push('pb'); return { t: h.T.poweredBy }; },
    buildBrandCss: () => ':host{--ck-logo-h:18px}',
    brandSignature: () => 'SIG',
    css: () => '.ck-brand{}'
  });

  assert.deepEqual(calls, ['logo', 'pb']);
  // ck-ui owns the dictionary and the DOM helpers; the extension must receive
  // them rather than keeping duplicates of its own.
  assert.equal(out.logo.hasEl, true, 'the extension was not handed el()');
  assert.equal(out.logo.hasT, true, 'the extension was not handed the string table');
  assert.equal(out.pb.t, 'PB', 'the extension did not read poweredBy from the host table');
  assert.equal(out.css, '\n.ck-brand{}');
  assert.equal(out.brandCss, ':host{--ck-logo-h:18px}');
  assert.equal(out.sig, 'SIG');
});

/* ------------------------------------------------------------ separation */

test('ck-ui.js no longer carries the branding implementation', () => {
  // The point of the split: these must live in exactly one file.
  for (const marker of ['SVG_TAGS', 'rebuildSvgNode', 'safeAttrValue', 'clampLogoHeight',
                        'safeImgSrc', '.ck-brand{display:flex']) {
    assert.ok(!UI_SRC.includes(marker),
      `src/ck-ui.js still contains "${marker}" — it belongs in ck-ui-branding.js`);
  }
  assert.ok(BRANDING_SRC.includes('SVG_TAGS') && BRANDING_SRC.includes('rebuildSvgNode'),
    'src/ck-ui-branding.js is missing the SVG sanitiser it is supposed to own');
});

test('the branding file does not reach into ck-ui internals', () => {
  // It is loaded BEFORE ck-ui.js, so anything it referenced from ck-ui's
  // closure would be undefined at call time. Comments may name those internals
  // (they explain where the strings come from), so strip comments first —
  // otherwise the check would forbid documenting the contract.
  const code = BRANDING_SRC
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  for (const name of ['DICT', 'STR_KEYS', 'localeTable', 'buildStrings']) {
    assert.ok(!new RegExp(`\\b${name}\\b`).test(code),
      `ck-ui-branding.js references ${name}, which lives in ck-ui.js's closure`);
  }
  // T (the localised string table) is reassigned per mount inside ck-ui, so it
  // can only ever be read from the injected host — every use of it must be
  // preceded by binding it out of `host` in the same function.
  const usesT = (code.match(/\bT\.\w+/g) || []).length;
  const bindsT = (code.match(/\bT\s*=\s*host\.T\b/g) || []).length;
  assert.ok(usesT === 0 || bindsT > 0,
    `ck-ui-branding.js reads T ${usesT} time(s) but never binds it from the host`);
});

/* ------------------------------------------------ in-repo script-tag consumers */

/* Every page in the repository that loads ck-ui.js with plain <script> tags and
   passes a `branding` config must also load ck-ui-branding.js, and must load it
   FIRST. Getting this wrong is silent by construction — the banner renders
   perfectly, just without the logo and the attribution line — so it needs a test
   rather than review. demo/index.html is the case that actually caught it. */
test('every page that configures branding also loads the branding file, before ck-ui.js', () => {
  const pages = [
    join(REPO, 'demo', 'index.html'),
    join(REPO, 'demo', 'saas.html'),
    join(REPO, 'site', 'src', 'index.template.html')
  ];

  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    const label = page.slice(REPO.length + 1);

    const ui = html.search(/<script src="[^"]*ck-ui\.js"/);
    if (ui === -1) continue;                       // page does not use the UI at all

    const branding = html.search(/<script src="[^"]*ck-ui-branding\.js"/);
    assert.notEqual(branding, -1,
      `${label} loads ck-ui.js but not ck-ui-branding.js — any branding config it ` +
      'sets would silently render nothing');
    assert.ok(branding < ui,
      `${label} loads ck-ui-branding.js after ck-ui.js; it must register before the ` +
      'first mount()');
  }
});
