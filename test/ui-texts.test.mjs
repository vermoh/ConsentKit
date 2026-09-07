/* SPEC V1.16 §1 — свои тексты, блок «Дополнительно» и ссылки в баннере (0.5.15).
 *
 * Four things are proved here, and only the first is a pure-string question:
 *
 *   §1.1  buildStrings() merges a THIRD layer, config.texts[lang], over the
 *         dictionary and __ckLocales. The interesting cases are the ones that
 *         must NOT happen: an empty override falling through instead of
 *         blanking the banner, a key that is not a language tag (policyUrl,
 *         links) being read as a dictionary, and a key outside the whitelist
 *         reaching a button label.
 *
 *   §1.2  renderRich() — the markup subset the operator block accepts. This is
 *         the CONTRACT the server's validator mirrors, so every rule has a test
 *         and so does every rule's refusal: javascript: is not a link, «<b>» is
 *         five characters of text, and nothing anywhere goes through innerHTML.
 *
 *   §1.3  texts.links — at most three, http(s) only, label resolved through the
 *         same fallback chain branding's poweredBy.texts uses.
 *
 *   §1.4  the debug panel's «Тексты» row exists in all three panel languages.
 *
 * Two loading styles, for two different questions — the ui-settings.test.mjs
 * pattern. load() evaluates ck-ui.js in a BARE context (no document at all),
 * which is where the pure string merging is exercised; loadDom() gives it the
 * stubbed DOM of ui-branding.test.mjs, because renderRich() BUILDS nodes and
 * the whole point of it is that it builds them with createElement rather than
 * with innerHTML.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const UI_SRC = readFileSync(join(REPO, 'src', 'ck-ui.js'), 'utf8');
const LOCALES_SRC = readFileSync(join(REPO, 'src', 'ck-locales.js'), 'utf8');
const DEBUG_SRC = readFileSync(join(REPO, 'src', 'ck-debug.js'), 'utf8');

/* ------------------------------------------------------------- bare context */

/** ck-ui.js with no DOM; returns the pure export surface. */
function load({ withLocales = true } = {}) {
  const win = { console, ConsentKit: {} };
  win.window = win;
  win.globalThis = win;
  win.self = win;
  const ctx = vm.createContext(win);
  if (withLocales) vm.runInContext(LOCALES_SRC, ctx, { filename: 'src/ck-locales.js' });
  vm.runInContext(UI_SRC, ctx, { filename: 'src/ck-ui.js' });
  const C = ctx.window.ConsentKit._contrast;
  assert.ok(C, 'ck-ui.js did not publish ConsentKit._contrast');
  return C;
}

/** The strings ck-ui would build for one banner language and one config. */
function stringsFor(C, lang, cfg) {
  const table = C.localeTable();
  return C.buildStrings(C.resolveLang(lang, table), table, cfg);
}

/* --------------------------------------------------------------- DOM stub */

/* The handful of methods renderRich() touches. `innerHTML` is deliberately
   ABSENT from the node: a setter that silently accepted a string would let the
   very bug this feature exists to avoid pass the suite. Assigning to a missing
   property on a plain object does not throw, so the innerHTML guard is asserted
   on the SOURCE further down instead — belt and braces. */
function makeNode(tag) {
  return {
    nodeName: tag, tagName: tag, className: '', childNodes: [],
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

function loadDom() {
  const doc = {
    createElement: makeNode,
    createElementNS: (ns, t) => makeNode(t),
    createTextNode: (t) => ({ nodeType: 3, nodeValue: t, textContent: t }),
    addEventListener() {}, removeEventListener() {},
    documentElement: makeNode('html'),
    body: null,                       // no body: mount() defers and draws nothing
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    readyState: 'loading'
  };
  const win = {
    document: doc,
    navigator: { language: 'en' },
    setTimeout: () => 0,
    clearTimeout: () => {},
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    console,
    ConsentKit: {}
  };
  win.window = win;
  win.globalThis = win;
  win.self = win;
  const ctx = vm.createContext(win);
  vm.runInContext(LOCALES_SRC, ctx, { filename: 'src/ck-locales.js' });
  vm.runInContext(UI_SRC, ctx, { filename: 'src/ck-ui.js' });
  const C = ctx.window.ConsentKit._contrast;
  assert.ok(C, 'ck-ui.js did not publish ConsentKit._contrast');
  return C;
}

/* Values that cross the vm boundary are the OTHER realm's arrays and objects,
   so `deepEqual` fails them on identity even when the structure matches. Same
   round-trip services.test.mjs uses for exactly this reason. */
const plain = (v) => JSON.parse(JSON.stringify(v));

/** ck-debug.js in a bare context; returns its pure API. */
function loadDebug() {
  const g = { console };
  g.window = g;
  g.self = g;
  g.globalThis = g;
  const ctx = vm.createContext(g);
  vm.runInContext(DEBUG_SRC, ctx, { filename: 'src/ck-debug.js' });
  assert.ok(g.__ckDebug, 'ck-debug.js did not publish __ckDebug');
  return g.__ckDebug;
}

/** The <a> nodes anywhere in a rendered tree, as {text, href, target, rel}. */
function links(nodes) {
  const out = [];
  (function walk(list) {
    for (const n of list) {
      if (n.tagName === 'a') {
        out.push({ text: n.textContent, href: n.href, target: n.target, rel: n.rel });
      }
      if (n.childNodes) walk(n.childNodes);
    }
  })(nodes);
  return out;
}

/* ========================================================== §1.1 buildStrings */

test('config.texts.<lang> overrides the dictionary for that language', () => {
  const C = load();
  const cfg = { texts: { ru: { bannerTitle: 'Cookie на сайте INTERSTEPCOM' } } };
  assert.equal(stringsFor(C, 'ru', cfg).bannerTitle, 'Cookie на сайте INTERSTEPCOM');
  // …and only for that language: en is untouched.
  assert.equal(stringsFor(C, 'en', cfg).bannerTitle, 'Cookies on this site');
});

test('every whitelisted key is overridable, and nothing else is', () => {
  const C = load();
  const cfg = {
    texts: {
      en: {
        bannerTitle: 'T', bannerText: 'X', panelTitle: 'P', panelIntro: 'I',
        extraTitle: 'E', extraText: 'B',
        // Outside the whitelist: an operator writing their own banner copy has
        // no business rewriting the button a visitor recognises across sites.
        acceptAll: 'HIJACKED', more: 'HIJACKED', save: 'HIJACKED',
        // An unknown key is simply ignored, never copied through.
        nonsense: 'HIJACKED'
      }
    }
  };
  const T = stringsFor(C, 'en', cfg);
  assert.equal(T.bannerTitle, 'T');
  assert.equal(T.bannerText, 'X');
  assert.equal(T.panelTitle, 'P');
  assert.equal(T.panelIntro, 'I');
  assert.equal(T.extraTitle, 'E');
  assert.equal(T.extraText, 'B');
  assert.equal(T.acceptAll, 'Accept all', 'acceptAll must not be overridable');
  assert.equal(T.more, 'Learn more', 'more must not be overridable');
  assert.equal(T.save, 'Save choices', 'save must not be overridable');
  assert.equal(T.nonsense, undefined, 'an unknown key must not be copied into the strings');
});

test('cat.<name>.title and .desc are overridable, one level deeper', () => {
  const C = load();
  const cfg = {
    texts: {
      ru: {
        cat: {
          analytics: { title: 'Статистика', desc: 'Считаем посещения.' },
          marketing: { title: 'Реклама' }                 // desc left to the dictionary
        }
      }
    }
  };
  const T = stringsFor(C, 'ru', cfg);
  assert.equal(T.cat.analytics.title, 'Статистика');
  assert.equal(T.cat.analytics.desc, 'Считаем посещения.');
  assert.equal(T.cat.marketing.title, 'Реклама');
  assert.match(T.cat.marketing.desc, /Подбирают рекламу/, 'an absent desc keeps the dictionary');
  // Untouched categories are exactly what they were.
  assert.equal(T.cat.necessary.title, 'Необходимые');
});

test('an empty override falls through to the dictionary instead of blanking', () => {
  /* This is what makes an empty field in the cabinet mean «take the standard
     text». Getting it backwards renders a banner with no title at all. */
  const C = load();
  const cfg = { texts: { ru: { bannerTitle: '', bannerText: '   ' } } };
  const T = stringsFor(C, 'ru', cfg);
  assert.equal(T.bannerTitle, 'Cookie на этом сайте');
  assert.equal(T.bannerText, '   ', 'a non-empty string of spaces is still the author’s text');
  // A non-string is not a text either.
  const T2 = stringsFor(C, 'ru', { texts: { ru: { bannerTitle: 42, panelTitle: null } } });
  assert.equal(T2.bannerTitle, 'Cookie на этом сайте');
  assert.equal(T2.panelTitle, 'Настройки cookie');
});

test('the exact language code wins over its two-letter base', () => {
  const C = load();
  const cfg = {
    texts: {
      'pt-br': { bannerTitle: 'BR' },
      pt: { bannerTitle: 'PT', bannerText: 'PT text' }
    }
  };
  // The locale pack carries `pt`, so a `pt-BR` banner resolves to `pt`, which
  // has no exact override of its own — this documents the resolution actually
  // in force rather than a hypothetical one.
  const table = C.localeTable();
  assert.equal(C.resolveLang('pt-BR', table), 'pt');
  assert.equal(C.buildStrings('pt', table, cfg).bannerTitle, 'PT');
  // Asked for the exact code directly, the exact override wins and the base
  // still fills what the exact one leaves out.
  const T = C.buildStrings('pt-br', table, cfg);
  assert.equal(T.bannerTitle, 'BR', 'the exact code must win');
  assert.equal(T.bannerText, 'PT text', 'the base code must fill what the exact one omits');
});

test('a key under texts that is not a language tag is never read as a dictionary', () => {
  /* texts has carried policyUrl/detailsAction/declarationUrl since 0.5.0 and
     gains `links` in 0.5.15. The language-tag regex is the whole separation. */
  const C = load();
  const cfg = {
    texts: {
      policyUrl: 'https://example.com/p',
      detailsAction: 'policy',
      declarationUrl: 'https://example.com/d',
      cabinetUrl: 'https://example.com/c',
      links: [{ id: 'a', url: 'https://example.com', label: { en: 'A' } }],
      // Three-letter and mixed-case shapes are not language tags either.
      eng: { bannerTitle: 'HIJACKED' },
      'en_US': { bannerTitle: 'HIJACKED' }
    }
  };
  const T = stringsFor(C, 'en', cfg);
  assert.equal(T.bannerTitle, 'Cookies on this site');
  // …and resolveDetails still reads the same object exactly as it did.
  assert.deepEqual(plain(C.resolveDetails(cfg)), { kind: 'policy', href: 'https://example.com/p' });
});

test('buildStrings still works with no config at all — 0.5.14 behaviour', () => {
  /* The third argument is optional on purpose: placeholderText() and the
     cabinet call it with two, and three test files already do. */
  const C = load();
  const table = C.localeTable();
  const two = C.buildStrings('ru', table);
  const three = C.buildStrings('ru', table, undefined);
  assert.deepEqual(plain(two), plain(three));
  assert.equal(two.bannerTitle, 'Cookie на этом сайте');
  // A config with no `texts` at all, and a hostile-shaped one, change nothing.
  assert.deepEqual(plain(C.buildStrings('ru', table, {})), plain(two));
  assert.deepEqual(plain(C.buildStrings('ru', table, { texts: 'nope' })), plain(two));
  assert.deepEqual(plain(C.buildStrings('ru', table, { texts: ['nope'] })), plain(two));
});

test('an override reaches a language that comes from ck-locales, not just ru/en', () => {
  const C = load();
  const cfg = { texts: { ro: { panelTitle: 'Setări proprii' } } };
  const T = stringsFor(C, 'ro', cfg);
  assert.equal(T.panelTitle, 'Setări proprii');
  // Everything else in that locale is still the locale's own.
  assert.equal(T.acceptAll, 'Acceptă tot');
});

/* ================================================== §1.2 dictionary key set */

test('extraTitle is translated in every locale and extraText is empty in all of them', () => {
  /* The completeness rule: a DICT key missing from a locale falls back to en,
     which is fine for a heading — but a locale that never gained the key at all
     would ALSO be caught here if STR_KEYS were wrong, because the string would
     be the literal «undefined». extraText is the deliberate opposite: '' every-
     where, so the block renders only from what the site itself supplies. */
  const C = load();
  const table = C.localeTable();
  const codes = Object.keys(table);
  assert.ok(codes.length >= 32, `expected the full locale pack, got ${codes.length}`);
  for (const code of codes) {
    const T = C.buildStrings(code, table);
    assert.equal(typeof T.extraTitle, 'string', `${code}.extraTitle is not a string`);
    assert.ok(T.extraTitle.length > 0 && T.extraTitle !== 'undefined',
      `${code}.extraTitle is empty or literally "undefined"`);
    assert.equal(T.extraText, '', `${code}.extraText must default to empty`);
  }
});

test('extraTitle carries a real translation, not the English fallback, where it matters', () => {
  const C = load();
  const table = C.localeTable();
  assert.equal(C.buildStrings('en', table).extraTitle, 'Additional information');
  assert.equal(C.buildStrings('ru', table).extraTitle, 'Дополнительно');
  assert.equal(C.buildStrings('ro', table).extraTitle, 'Informații suplimentare');
  assert.equal(C.buildStrings('de', table).extraTitle, 'Weitere Informationen');
});

test('the 0.5.15 keys are listed in STR_KEYS', () => {
  const keys = UI_SRC.slice(UI_SRC.indexOf('var STR_KEYS'), UI_SRC.indexOf('// Plural-form keys'));
  for (const k of ['extraTitle', 'extraText']) {
    assert.match(keys, new RegExp(`'${k}'`), `${k} is missing from STR_KEYS`);
  }
});

/* ===================================================== §1.2 renderRich rules */

test('a blank line splits paragraphs, a single newline is a <br>', () => {
  const C = loadDom();
  const out = C.renderRich('First line\nsecond line\n\nSecond paragraph');
  assert.equal(out.length, 2, 'a blank line must split paragraphs');
  assert.equal(out[0].tagName, 'p');
  assert.equal(out[1].tagName, 'p');
  const kids = out[0].childNodes.map((n) => n.tagName || '#text');
  assert.deepEqual(kids, ['#text', 'br', '#text'], 'a single newline must become a <br>');
  assert.equal(out[1].textContent, 'Second paragraph');
});

test('**bold** becomes <strong> and nothing else', () => {
  const C = loadDom();
  const out = C.renderRich('write to **mail** now');
  const kids = out[0].childNodes;
  assert.deepEqual(kids.map((n) => n.tagName || '#text'), ['#text', 'strong', '#text']);
  assert.equal(kids[1].textContent, 'mail');
  assert.equal(out[0].textContent, 'write to mail now', 'the asterisks must not survive');
});

test('an unclosed ** is two literal asterisks, not a bold tail', () => {
  const C = loadDom();
  const out = C.renderRich('one **two three');
  assert.equal(out[0].textContent, 'one **two three');
  assert.equal(out[0].childNodes.filter((n) => n.tagName === 'strong').length, 0);
});

test('[label](https://…) and mailto: become links in a new tab', () => {
  const C = loadDom();
  const out = C.renderRich(
    'See [the Centre](https://datepersonale.md) or write to [us](mailto:a@b.md).');
  const a = links(out);
  assert.equal(a.length, 2);
  assert.deepEqual(a[0], {
    text: 'the Centre', href: 'https://datepersonale.md', target: '_blank', rel: 'noopener'
  });
  assert.deepEqual(a[1], {
    text: 'us', href: 'mailto:a@b.md', target: '_blank', rel: 'noopener'
  });
  assert.equal(out[0].textContent, 'See the Centre or write to us.',
    'the markup itself must not be visible');
  assert.doesNotMatch(out[0].textContent, /[\[\]()]/, 'no bracket or paren may survive');
});

test('http:// is allowed alongside https://', () => {
  const C = loadDom();
  assert.equal(links(C.renderRich('[x](http://example.com)'))[0].href, 'http://example.com');
});

test('javascript: and data: in a link stay plain text, whole literal and all', () => {
  /* Rule 5 of the contract. The WHOLE literal is rendered, not just the label:
     visibly wrong to whoever wrote it, rather than a label that still looks
     like a link with the address silently dropped. */
  const C = loadDom();
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd',
                     'JavaScript:alert(1)']) {
    const src = `click [here](${bad}) now`;
    const out = C.renderRich(src);
    assert.equal(links(out).length, 0, `${bad} must not become a link`);
    assert.equal(out[0].textContent, src, `${bad} must render as the literal text`);
  }
});

test('a bare https:// URL and a bare e-mail become links', () => {
  const C = loadDom();
  const out = C.renderRich('See https://example.md or write to office@example.md today.');
  const a = links(out);
  assert.equal(a.length, 2);
  assert.equal(a[0].href, 'https://example.md');
  assert.equal(a[1].href, 'mailto:office@example.md');
  assert.equal(a[1].text, 'office@example.md');
  // Trailing punctuation belongs to the sentence, not to the address.
  assert.equal(out[0].textContent, 'See https://example.md or write to office@example.md today.');
});

test('a bare URL rule never eats the address inside a [label](url)', () => {
  /* Links are tokenised BEFORE the bare-URL and bare-e-mail rules run. Get the
     order wrong and «[Центр](https://datepersonale.md)» renders as a stray
     bracket, a link on the raw URL and a stray paren. */
  const C = loadDom();
  const out = C.renderRich('[Центр](https://datepersonale.md)');
  const a = links(out);
  assert.equal(a.length, 1, 'exactly one link, not one per URL form');
  assert.equal(a[0].text, 'Центр');
  assert.equal(a[0].href, 'https://datepersonale.md');
  assert.equal(out[0].textContent, 'Центр', 'no stray brackets or parens');
  assert.doesNotMatch(out[0].textContent, /https?:/, 'the raw address must not be left in the text');
});

test('the bare e-mail rule never fires inside a mailto: link', () => {
  const C = loadDom();
  const out = C.renderRich('[write](mailto:office@example.md)');
  const a = links(out);
  assert.equal(a.length, 1);
  assert.equal(a[0].text, 'write');
  assert.equal(a[0].href, 'mailto:office@example.md');
});

test('bold applies between links, and a link label is not re-parsed for bold', () => {
  /* One pass, no nesting — the contract the README documents and the server
     mirrors. Bold outside a link works; «**» inside a label is left alone. */
  const C = loadDom();
  const out = C.renderRich('**Оператор:** «FIRM» SRL — [сайт](https://firm.md) **тут**');
  const strongs = out[0].childNodes.filter((n) => n.tagName === 'strong');
  assert.equal(strongs.length, 2, 'bold must work on both sides of a link');
  assert.deepEqual(strongs.map((n) => n.textContent), ['Оператор:', 'тут']);
  assert.equal(links(out).length, 1);

  const nested = C.renderRich('[**bold label**](https://x.md)');
  const a = links(nested);
  assert.equal(a.length, 1);
  assert.equal(a[0].text, '**bold label**',
    'a link label is not re-parsed: the asterisks stay literal inside it');
});

test('«<b>» is text, never a tag — there is no HTML in this markup at all', () => {
  const C = loadDom();
  const out = C.renderRich('a <b>bold</b> and <script>alert(1)</script> and <img src=x>');
  assert.equal(out.length, 1);
  assert.equal(out[0].textContent,
    'a <b>bold</b> and <script>alert(1)</script> and <img src=x>');
  // Not one element was built for any of it.
  const tags = out[0].childNodes.map((n) => n.tagName).filter(Boolean);
  assert.deepEqual(tags, [], 'no element may be created from author angle brackets');
});

test('renderRich builds nodes and never touches innerHTML', () => {
  /* Asserted on the source as well as on the tree: the stub node has no
     innerHTML setter, and assigning to a missing property on a plain object
     does not throw — so the tree alone could not catch a regression here. */
  const from = UI_SRC.indexOf('var MD_LINK_RE');
  const to = UI_SRC.indexOf('/* ------------------------------------------ banner links');
  assert.ok(from > 0 && to > from, 'the renderRich block moved — fix this test');
  const block = UI_SRC.slice(from, to);
  assert.doesNotMatch(block, /innerHTML/, 'renderRich must never assign innerHTML');
  assert.match(block, /createTextNode/, 'renderRich must build text with createTextNode');
});

test('empty, blank and non-string input renders no block at all', () => {
  const C = loadDom();
  for (const v of ['', '   ', '\n\n', null, undefined, 42, {}, []]) {
    assert.deepEqual(plain(C.renderRich(v)), [], `${JSON.stringify(v)} must render nothing`);
  }
});

test('\\r\\n from a Windows textarea splits into the same paragraphs', () => {
  const C = loadDom();
  const out = C.renderRich('One\r\n\r\nTwo');
  assert.equal(out.length, 2);
  assert.equal(out[0].textContent, 'One');
  assert.equal(out[1].textContent, 'Two');
});

test('the operator block from the spec renders as three paragraphs with two links', () => {
  /* The real thing the feature exists for — the INTERSTEPCOM operator block. */
  const C = loadDom();
  const text =
    'Оператор: «FIRM» SRL, IDNO 1234567890123, мун. Кишинёв, ул. Примерная 1.\n\n' +
    'По вопросам обработки персональных данных пишите на **office@firm.md** — ' +
    'отвечаем не позднее одного месяца (ст. 12 ч. (3) Закона № 195/2024).\n\n' +
    'Вы вправе подать жалобу в ' +
    '[Национальный центр по защите персональных данных](https://datepersonale.md).';
  const out = C.renderRich(text);
  assert.equal(out.length, 3);
  const a = links(out);
  assert.equal(a.length, 2, 'the bold e-mail is still auto-linked, plus the Centre');
  assert.equal(a[0].href, 'mailto:office@firm.md');
  assert.equal(a[1].href, 'https://datepersonale.md');
  assert.match(out[0].textContent, /IDNO 1234567890123/);
  /* What the href assertions above do NOT catch, and what a first cut of this
     function got wrong: the markup must be CONSUMED, not merely recognised. A
     pass order that linked the address before reading `**` left the asterisks
     on screen around a perfectly good link. */
  for (const p of out) {
    assert.doesNotMatch(p.textContent, /\*\*/, 'the asterisks must not survive');
    assert.doesNotMatch(p.textContent, /[\[\]]/, 'the link brackets must not survive');
  }
});

test('a bare address inside **bold** is bolded AND linked, asterisks consumed', () => {
  /* «пишите на **mail@example.com**» is the spec's own example, and it is the
     case that forces the pass order: markdown links, THEN bold, THEN bare
     addresses inside each span. Linking the address first would split the run
     and leave BOLD_RE looking at two lone «**». */
  const C = loadDom();
  const out = C.renderRich('Пишите на **office@firm.md** — ответ в месяц.');
  assert.equal(out[0].textContent, 'Пишите на office@firm.md — ответ в месяц.',
    'the asterisks must be consumed');
  const strong = out[0].childNodes.filter((n) => n.tagName === 'strong');
  assert.equal(strong.length, 1, 'the run must still be bold');
  const inner = strong[0].childNodes.filter((n) => n.tagName === 'a');
  assert.equal(inner.length, 1, 'the address inside bold must still be a link');
  assert.equal(inner[0].href, 'mailto:office@firm.md');

  // The same for a bare URL inside bold.
  const url = C.renderRich('см. **https://example.md** там');
  assert.equal(url[0].textContent, 'см. https://example.md там');
  const s2 = url[0].childNodes.filter((n) => n.tagName === 'strong');
  assert.equal(s2.length, 1);
  assert.equal(s2[0].childNodes.filter((n) => n.tagName === 'a')[0].href, 'https://example.md');
});

/* ================================================= §1.2 the block is conditional */

test('the extra block renders only when extraText resolves to something', () => {
  /* buildExtra() is DOM-side, so the condition is proved through the pair that
     decides it: the resolved string and what renderRich makes of it. Nothing
     configured -> '' -> no nodes -> no block. */
  const C = loadDom();
  const table = C.localeTable();
  const empty = C.buildStrings('ru', table, {});
  assert.equal(empty.extraText, '');
  assert.deepEqual(plain(C.renderRich(empty.extraText)), [], 'no text must mean no block');

  const filled = C.buildStrings('ru', table, { texts: { ru: { extraText: 'Оператор: X.' } } });
  assert.equal(filled.extraText, 'Оператор: X.');
  assert.equal(C.renderRich(filled.extraText).length, 1, 'text must produce a block');
});

test('buildExtra draws nothing when there is no text, and a card when there is', () => {
  // The guard itself, on the source: an early return before any node is built.
  const from = UI_SRC.indexOf('function buildExtra');
  const body = UI_SRC.slice(from, UI_SRC.indexOf('function buildPanel'));
  assert.match(body, /renderRich\(T\.extraText\)/, 'buildExtra must read the resolved extraText');
  assert.match(body, /if\s*\(!nodes\.length\)\s*return null/,
    'buildExtra must return null rather than an empty card');
  assert.match(body, /T\.extraTitle/, 'the heading comes from the dictionary key');
});

test('the extra block sits after the categories and inside the scrolling body', () => {
  /* «после категорий и списка сервисов, перед кнопками». Inside
     .ck-panel__body, which is the region that scrolls — between body and foot
     a long operator block would be clipped with no way to reach its end. */
  const from = UI_SRC.indexOf('function buildPanel');
  const body = UI_SRC.slice(from, from + 3000);
  const catLoop = body.indexOf('body.appendChild(buildCategory');
  const extra = body.indexOf('body.appendChild(extra)');
  const bodyIn = body.indexOf('p.appendChild(body)');
  const foot = body.indexOf("el('div', 'ck-panel__foot')");
  assert.ok(catLoop > 0 && extra > catLoop, 'the extra block must follow the categories');
  assert.ok(bodyIn > extra, 'the extra block must be appended INSIDE .ck-panel__body');
  assert.ok(foot > extra, 'the extra block must come before the panel buttons');
});

/* ======================================================== §1.3 texts.links */

test('links resolve their label through the poweredBy fallback chain', () => {
  const C = load();
  const cfg = {
    texts: {
      links: [
        { id: 'privacy', url: 'https://a.md', label: { ru: 'Политика', ro: 'Politica', en: 'Policy' } },
        { id: 'cookie', url: 'https://b.md', label: { en: 'Cookies' } }
      ]
    }
  };
  assert.deepEqual(plain(C.resolveLinks(cfg, 'ru').map((l) => l.label)), ['Политика', 'Cookies']);
  assert.deepEqual(plain(C.resolveLinks(cfg, 'ro').map((l) => l.label)), ['Politica', 'Cookies']);
  // A language nobody translated falls back to en, exactly as poweredBy does.
  assert.deepEqual(plain(C.resolveLinks(cfg, 'de').map((l) => l.label)), ['Policy', 'Cookies']);
  // ru-RU -> ru, the two-letter base step.
  assert.deepEqual(plain(C.resolveLinks(cfg, 'ru-ru').map((l) => l.label)), ['Политика', 'Cookies']);
});

test('a link with no label in any reachable language is skipped, not faked', () => {
  const C = load();
  const cfg = {
    texts: {
      links: [
        { id: 'a', url: 'https://a.md', label: { fr: 'Politique' } },   // no ru, no en
        { id: 'b', url: 'https://b.md', label: { en: 'Kept' } }
      ]
    }
  };
  assert.deepEqual(plain(C.resolveLinks(cfg, 'ru').map((l) => l.id)), ['b']);
  // …while a French banner does reach the first one.
  assert.deepEqual(plain(C.resolveLinks(cfg, 'fr').map((l) => l.id)), ['a', 'b']);
});

test('a non-http(s) address is skipped, and never costs a good link its place', () => {
  /* The cap is applied to the SURVIVORS: three valid rows after two bad ones
     still yield three links. */
  const C = load();
  const cfg = {
    texts: {
      links: [
        { id: 'js', url: 'javascript:alert(1)', label: { en: 'X' } },
        { id: 'rel', url: '/policy', label: { en: 'X' } },
        { id: 'mail', url: 'mailto:a@b.md', label: { en: 'X' } },
        { id: 'one', url: 'https://1.md', label: { en: 'One' } },
        { id: 'two', url: 'http://2.md', label: { en: 'Two' } },
        { id: 'three', url: 'https://3.md', label: { en: 'Three' } }
      ]
    }
  };
  assert.deepEqual(plain(C.resolveLinks(cfg, 'en').map((l) => l.id)), ['one', 'two', 'three']);
});

test('at most three links are ever rendered', () => {
  const C = load();
  const links4 = [1, 2, 3, 4, 5].map((n) => ({
    id: 'l' + n, url: 'https://' + n + '.md', label: { en: 'L' + n }
  }));
  assert.equal(C.resolveLinks({ texts: { links: links4 } }, 'en').length, 3);
});

test('a malformed links value renders no row and throws nothing', () => {
  const C = load();
  for (const v of [null, undefined, 'nope', 42, {}, [null, 'x', 7, {}]]) {
    assert.deepEqual(plain(C.resolveLinks({ texts: { links: v } }, 'en')), []);
  }
  assert.deepEqual(plain(C.resolveLinks({}, 'en')), []);
  assert.deepEqual(plain(C.resolveLinks(null, 'en')), []);
});

test('a link label read from a prototype is not a label', () => {
  /* The same guard branding's pickPoweredByText carries: `label` is author
     JSON, and an inherited key would hand str() a function. */
  const C = load();
  assert.equal(C.linkLabel({}, 'constructor'), null);
  assert.equal(C.linkLabel({}, 'en'), null);
  assert.equal(C.linkLabel({ en: 'A' }, 'en'), 'A');
  assert.equal(C.linkLabel(null, 'en'), null);
  assert.equal(C.linkLabel(['A'], 'en'), null);
});

test('the link row is built for the banner in every layout and for the panel', () => {
  /* Three DOM sites, and the bar layout is the one that needs watching: its
     banner is a flex row, and its mobile media query orders every child
     explicitly. Asserted on the source, because the layouts differ only in
     where the row is appended. */
  const banner = UI_SRC.slice(UI_SRC.indexOf('function buildBanner'),
                              UI_SRC.indexOf('function buildExtra'));
  const actionsAt = banner.indexOf('b.appendChild(actions)');
  const linksAt = banner.indexOf('buildLinksRow(cfg');
  assert.ok(actionsAt > 0 && linksAt > actionsAt,
    'the link row must be appended AFTER the buttons, in every layout');
  assert.match(banner, /b\.appendChild\(blinks\)/,
    'the row goes on the banner itself, so box and modal get it too');

  const panel = UI_SRC.slice(UI_SRC.indexOf('function buildPanel'),
                             UI_SRC.indexOf('function buildFab'));
  assert.match(panel, /buildLinksRow\(cfg, 'ck-links--panel'\)/,
    'the panel foot must carry the same row');

  // The bar's mobile column orders its children explicitly; the row needs one.
  assert.match(UI_SRC, /\.ck-banner--bar \.ck-links\{order:3\}/,
    'without an order the row jumps above the buttons in the bar’s mobile column');
});

test('every rendered link opens in a new tab with rel=noopener', () => {
  const from = UI_SRC.indexOf('function buildLinksRow');
  const body = UI_SRC.slice(from, from + 700);
  assert.match(body, /a\.target = '_blank'/);
  assert.match(body, /a\.rel = 'noopener'/,
    'never hand the linked page window.opener');
});

test('links do not change what «Подробнее» does', () => {
  /* §1.3 is explicit: detailsAction behaviour is untouched — resolveDetails()
     answers exactly what it answered in 0.5.14, and a site that adds a link
     row keeps whatever «Подробнее» already did. The ONE exception is the
     duplicate-address rule below, which is applied on top of this answer at
     render time rather than inside resolveDetails. */
  const C = load();
  const withLinks = {
    texts: {
      policyUrl: 'https://example.md/p',
      links: [{ id: 'a', url: 'https://a.md', label: { en: 'A' } }]
    }
  };
  assert.deepEqual(plain(C.resolveDetails(withLinks)), { kind: 'policy', href: 'https://example.md/p' });
  assert.deepEqual(plain(C.resolveDetails({ texts: { links: withLinks.texts.links } })),
    { kind: 'settings', href: null });
  assert.deepEqual(plain(C.resolveDetails({ texts: { detailsAction: 'hide' } })),
    { kind: 'hide', href: null });
});

/* ------------------------------- §1.3 «Подробнее» duplicating a link row */

/* The last sentence of §1.3: when the address «Подробнее» points at is already
   one of the rows under the buttons, the banner would print it twice. The
   in-text link is the copy that goes — the row keeps the address AND the label
   the operator wrote for it. */

const dupCfg = (policyUrl, url) => ({
  texts: {
    policyUrl,
    links: [{ id: 'cookies', url, label: { en: 'Cookie policy', ru: 'Политика cookie' } }]
  }
});

test('«Подробнее» is hidden when it repeats an address the link row already shows', () => {
  const C = load();
  const cfg = dupCfg('https://shop.md/cookies', 'https://shop.md/cookies');
  // resolveDetails itself is untouched — it still answers 'policy'…
  assert.deepEqual(plain(C.resolveDetails(cfg)), { kind: 'policy', href: 'https://shop.md/cookies' });
  // …and the duplicate rule is what the banner applies on top of it.
  assert.equal(C.detailsDuplicatesLink(C.resolveDetails(cfg), C.resolveLinks(cfg, 'en')), true);
  assert.equal(C.detailsKind(cfg, 'en'), 'hide');
});

test('a different address keeps «Подробнее» exactly where it was', () => {
  const C = load();
  const cfg = dupCfg('https://shop.md/privacy', 'https://shop.md/cookies');
  assert.equal(C.detailsDuplicatesLink(C.resolveDetails(cfg), C.resolveLinks(cfg, 'en')), false);
  assert.equal(C.detailsKind(cfg, 'en'), 'policy');
  // A path that differs only in case is a DIFFERENT page on a case-sensitive
  // server, and suppressing a real link over that guess is the worse error.
  const cased = dupCfg('https://shop.md/Cookies', 'https://shop.md/cookies');
  assert.equal(C.detailsKind(cased, 'en'), 'policy');
  // No links at all, and a links value that resolves to nothing: unchanged.
  assert.equal(C.detailsKind({ texts: { policyUrl: 'https://shop.md/cookies' } }, 'en'), 'policy');
});

test('a trailing slash, surrounding space and host case do not make two addresses', () => {
  const C = load();
  const same = [
    ['https://shop.md/cookies', 'https://shop.md/cookies/'],
    ['https://shop.md/cookies/', 'https://shop.md/cookies'],
    ['  https://shop.md/cookies  ', 'https://shop.md/cookies'],
    ['https://SHOP.MD/cookies', 'https://shop.md/cookies'],
    ['https://shop.md/cookies', 'HTTPS://Shop.Md/cookies'],
    ['https://shop.md', 'https://shop.md/'],
    ['https://shop.md/cookies?lang=ru', 'https://shop.md/cookies?lang=ru']
  ];
  for (const [policyUrl, url] of same) {
    assert.equal(C.detailsKind(dupCfg(policyUrl, url), 'en'), 'hide',
      `${policyUrl} and ${url} are the same page`);
  }
  // …but the query string itself is part of the address.
  assert.equal(C.detailsKind(dupCfg('https://shop.md/c?lang=ru', 'https://shop.md/c?lang=ro'), 'en'),
    'policy');
});

test('an explicit detailsAction: "settings" is unaffected by the rule', () => {
  /* «Подробнее» opens the panel: there is no address on it to duplicate, and
     dropping the control would leave the visitor no way into the settings from
     the banner text. */
  const C = load();
  const cfg = {
    texts: {
      detailsAction: 'settings',
      policyUrl: 'https://shop.md/cookies',
      links: [{ id: 'c', url: 'https://shop.md/cookies', label: { en: 'Cookie policy' } }]
    }
  };
  assert.equal(C.detailsDuplicatesLink(C.resolveDetails(cfg), C.resolveLinks(cfg, 'en')), false);
  assert.equal(C.detailsKind(cfg, 'en'), 'settings');
  // The same is true of the 'settings' a URL-less config falls back to.
  assert.equal(C.detailsKind({ texts: { links: cfg.texts.links } }, 'en'), 'settings');
  // …and of a config that already asked for 'hide'.
  assert.equal(C.detailsKind({ texts: { detailsAction: 'hide', links: cfg.texts.links } }, 'en'),
    'hide');
});

test('a duplicated DECLARATION address is dropped the same way', () => {
  const C = load();
  const cfg = {
    texts: {
      detailsAction: 'declaration',
      declarationUrl: 'https://shop.md/cookie-declaration',
      links: [{ id: 'd', url: 'https://shop.md/cookie-declaration/', label: { en: 'Cookies' } }]
    }
  };
  assert.deepEqual(plain(C.resolveDetails(cfg)),
    { kind: 'declaration', href: 'https://shop.md/cookie-declaration' });
  assert.equal(C.detailsKind(cfg, 'en'), 'hide');
  // A declaration that points somewhere else survives.
  assert.equal(C.detailsKind({
    texts: {
      detailsAction: 'declaration',
      declarationUrl: 'https://shop.md/cookie-declaration',
      links: [{ id: 'p', url: 'https://shop.md/privacy', label: { en: 'Privacy' } }]
    }
  }, 'en'), 'declaration');
});

test('only the links that SURVIVE for this language can silence «Подробнее»', () => {
  /* A row with no label in the banner's language is not on screen, so it is
     not a second copy of anything and must not cost the visitor their link. */
  const C = load();
  const cfg = {
    texts: {
      policyUrl: 'https://shop.md/cookies',
      links: [{ id: 'c', url: 'https://shop.md/cookies', label: { fr: 'Cookies' } }]
    }
  };
  assert.equal(C.detailsKind(cfg, 'ru'), 'policy', 'the row is invisible in ru');
  assert.equal(C.detailsKind(cfg, 'fr'), 'hide', 'the row IS on screen in fr');
});

test('the duplicate helper throws nothing on rubbish', () => {
  const C = load();
  for (const d of [null, undefined, {}, { kind: 'policy' }, { kind: 'policy', href: null },
                   { kind: 'policy', href: 'javascript:alert(1)' }]) {
    assert.equal(C.detailsDuplicatesLink(d, [{ url: 'https://a.md' }]), false);
  }
  const det = { kind: 'policy', href: 'https://a.md' };
  for (const l of [null, undefined, 'nope', 42, {}, [], [null, 7, {}, { url: null }]]) {
    assert.equal(C.detailsDuplicatesLink(det, l), false);
  }
});

test('the banner asks for the duplicate-aware kind, not the raw one', () => {
  /* The rule is only real if buildBanner applies it. Asserted on the source,
     the way the link-row placement above is: the stubbed document in this file
     has no body, so mount() defers and draws no banner to inspect. */
  const banner = UI_SRC.slice(UI_SRC.indexOf('function buildBanner'),
                              UI_SRC.indexOf('function buildExtra'));
  const askedAt = banner.indexOf('detailsKind(cfg, LANG)');
  const hideAt = banner.indexOf("det.kind === 'hide'");
  assert.ok(askedAt > 0, 'buildBanner must consult detailsKind()');
  assert.ok(hideAt > askedAt,
    'the duplicate check must run BEFORE the hide branch it feeds');
  assert.match(banner, /detailsKind\(cfg, LANG\)/,
    'the links must be resolved for the language this render is painting');
});

test('the duplicate rule is structural: the signature sees it appear', () => {
  /* mount() is one-shot. A SaaS config arriving afterwards can turn a link
     into a duplicate (or back) while resolveDetails still answers 'policy' and
     textsSignature still answers the same string — so the signature has to
     read the EFFECTIVE kind or the stale banner never rebuilds. */
  const C = load();
  const dup = dupCfg('https://shop.md/cookies', 'https://shop.md/cookies');
  const not = dupCfg('https://shop.md/cookies', 'https://shop.md/privacy');
  assert.equal(C.resolveDetails(dup).kind, C.resolveDetails(not).kind, 'the raw kind is the same…');
  assert.notEqual(C.signature(dup), C.signature(not), '…but the DOM shape is not');
});

/* ============================================================ §1 remounting */

test('a texts change is structural: the signature sees it', () => {
  /* The «Дополнительно» card and the link row are DOM nodes that appear and
     disappear, and mount() is one-shot. Without this a SaaS config arriving
     after the first render would leave a panel with no operator block on a site
     that has one. */
  const C = load();
  /* A scalar under `texts` contributes nothing to the TEXTS half of the
     signature. policyUrl does move the signature — but through resolveDetails,
     which it has done since 0.5.0 — so the texts half is asserted directly. */
  assert.equal(C.textsSignature({ texts: { policyUrl: 'https://x.md' } }),
    C.textsSignature({}),
    'a scalar under texts must not be mistaken for a language override');
  assert.notEqual(C.signature({}), C.signature({ texts: { ru: { bannerTitle: 'X' } } }));
  assert.notEqual(C.signature({}),
    C.signature({ texts: { links: [{ id: 'a', url: 'https://a.md', label: { en: 'A' } }] } }));
  // A REWORDED sentence inside a block that is already on screen is not
  // structural — it must not tear the panel down mid-decision.
  assert.equal(C.signature({ texts: { ru: { bannerTitle: 'A' } } }),
    C.signature({ texts: { ru: { bannerTitle: 'B', extraText: 'longer' } } }));
});

test('textsSignature reports «0» for a config with nothing of its own', () => {
  const C = load();
  assert.equal(C.textsSignature({}), '0');
  assert.equal(C.textsSignature(null), '0');
  assert.equal(C.textsSignature({ texts: { policyUrl: 'https://x.md' } }), '0');
  assert.equal(C.textsSignature({ texts: { ru: {} } }), 'ru/');
});

/* ========================================================= §1.4 debug panel */

test('the debug panel has the «Тексты» row in all three panel languages', () => {
  const D = loadDebug();
  for (const lang of ['ru', 'en', 'ro']) {
    for (const key of ['textsOverride', 'textsFor', 'textsNone']) {
      assert.equal(typeof D.strings[lang][key], 'string', `${lang}.${key} is missing`);
      assert.ok(D.strings[lang][key].length > 0, `${lang}.${key} is empty`);
    }
  }
  assert.equal(D.strings.ru.textsOverride, 'Тексты');
  assert.equal(D.strings.ru.textsNone, 'нет');
  assert.match(D.strings.ru.textsFor, /переопределения для/);
});

test('the three debug dictionaries still carry exactly the same keys', () => {
  /* The guard that catches a key added to two tables and forgotten in the
     third — which is how a panel ends up rendering «undefined» in ro. */
  const D = loadDebug();
  const en = Object.keys(D.strings.en).sort();
  assert.deepEqual(Object.keys(D.strings.ro).sort(), en, 'ro must carry exactly the keys en does');
  assert.deepEqual(Object.keys(D.strings.ru).sort(), en, 'ru must carry exactly the keys en does');
});

test('the debug row reads the RESOLVED language, through ck-ui’s own resolver', () => {
  /* «один код — одни числа»: the panel must not reimplement resolveLang and
     drift from the banner it is reporting on. */
  const from = DEBUG_SRC.indexOf('function textsRow');
  const body = DEBUG_SRC.slice(from, DEBUG_SRC.indexOf('// Resolved lazily'));
  assert.match(body, /C\.resolveLang\(cfg\.language, C\.localeTable\(\)\)/,
    'the row must ask ck-ui which language the banner resolved to');
  assert.match(body, /\^\[a-z\]\{2\}\(-\[a-z\]\{2\}\)\?\$/,
    'the row must apply the same language-tag rule buildStrings does');
  assert.match(body, /lang\.slice\(0, 2\)/, 'the base-code lookup must be reported too');
  assert.match(body, /T\.textsNone/, 'a config with no overrides must read «нет»');
});

test('the appearance section renders the texts row', () => {
  assert.match(DEBUG_SRC, /\[T\.textsOverride, textsRow\(T\)\]/,
    'the row must be in the panel’s defs() list');
});
