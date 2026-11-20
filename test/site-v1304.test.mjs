/* SPEC V1.30.4 — the owner's answers to V1.30.3, the check panel beside the
 * form, the Tilda and OpenCart marks.
 *
 * Guards that live elsewhere, beside the tests they replaced:
 *   §1.2 the neutral light palette      — test/site-build.test.mjs (tokens)
 *   §2   the ten platform marks         — test/site-v1302.test.mjs (§4.3)
 *
 * This file holds:
 *   §1.4 Romanian in the polite register («dumneavoastră») everywhere;
 *   §3   the panel: authored once with the form, on every law page too; the
 *        real progress and nothing invented; no hosts or paths; the result
 *        printed once; one primary button in view;
 *   §4   the new strings in all three languages, within the tone rules.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  LANGS, SITE_DIR, readDict, readTemplate, renderPage, readPages, renderLawPage
} from '../tools/build-site.mjs';

const CSS = readFileSync(join(SITE_DIR, 'styles.css'), 'utf8');
const LAYER = CSS.slice(CSS.indexOf('SPEC V1.30.4 §3 — the panel beside the check form'));
const APP = readFileSync(join(SITE_DIR, 'app.js'), 'utf8');
const ANALYTICS = readFileSync(join(SITE_DIR, 'analytics.js'), 'utf8');
const CYRILLIC = /[А-Яа-яЁё]/;
const pages = () => LANGS.map(({ code }) => [code, renderPage(readTemplate(), code), readDict(code)]);
const textOf = (html) => html
  .replace(/<script\b[\s\S]*?<\/script>/g, ' ')
  .replace(/<style\b[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ');

/* ----------------------------------------------------------------- §1.4 */

/* «tu» forms: the pronoun and its possessives, the clitics, and the 2nd
   person singular verbs that cannot be read as anything else. Matched as
   whole words with Unicode letter boundaries — JS \b is ASCII-only, so
   \bta\b would fire inside «arătați». */
const TU = /(?<!\p{L})(tu|tău|ta|tale|tăi|tine|ție|îți|iți|poți|vrei|ești|știi|vezi|introdu)(?!\p{L})|(?<=\p{L})-ți(?!\p{L})/iu;
/* Singular imperatives at the head of a sentence or a label. Mid-sentence
   the same words are third person («scanerul verifică»), so only the head
   is checked. */
const TU_HEAD = /^(Adaugă|Apasă|Verifică|Bifează|Încearcă|Reîncarcă|Pornește|Ajustează|Deschide|Trimite|Sari|Arată|Alege|Scrie|Citește|Introdu|Vezi|Lipește|Copiază)(?!\p{L})/u;
/* The banner replica's buttons (mock*) and the cabinet card (heroCard*) quote
   the product's own labels — the client's ro locale, not landing copy. */
const PRODUCT_KEYS = /^(mock|heroCard)/;

function roStrings() {
  const out = [];
  const walk = (v, path) => {
    if (typeof v === 'string') out.push([path, v]);
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === 'object') for (const k of Object.keys(v)) walk(v[k], path ? `${path}.${k}` : k);
  };
  walk(readDict('ro'), '');
  return out.filter(([p]) => !PRODUCT_KEYS.test(p));
}

test('§1.4: the regex itself — catches «tu», leaves «arătați» alone', () => {
  for (const s of ['site-ul tău', 'Verifică-ți site-ul', 'îți arăt', 'Dacă vrei', 'adresa ta', 'Poți lăsa']) {
    assert.match(s, TU, `«${s}» is not caught`);
  }
  for (const s of ['arătați', 'Verificați-vă site-ul', 'site-ul dumneavoastră', 'puteți', 'data', 'vă arăt', 'Tarife']) {
    assert.doesNotMatch(s, TU, `«${s}» is caught by mistake`);
  }
  assert.match('Introdu adresa', TU_HEAD);
  assert.doesNotMatch('Introduceți adresa', TU_HEAD);
});

test('§1.4: ro.json speaks «dumneavoastră» — no «tu» forms anywhere, law articles included', () => {
  for (const [path, s] of roStrings()) {
    assert.doesNotMatch(s, TU, `ro.json ${path} uses a «tu» form: «${s.slice(0, 120)}»`);
    for (const sentence of s.replace(/^[#>\-\s]+/, '').split(/(?<=[.!?])\s+/)) {
      assert.doesNotMatch(sentence.replace(/^[«„"(]/, ''), TU_HEAD,
        `ro.json ${path} opens with a singular imperative: «${sentence.slice(0, 80)}»`);
    }
  }
  // The polite register is actually there, in the places §1.4 names.
  const ro = readDict('ro');
  assert.match(ro.heroCheckPlaceholder, /^site-ul-(dumneavoastră|dvs)\.md$/);
  assert.match(ro.heroCheckTail, /(?<!\p{L})vă arăt(?!\p{L})/u);
  assert.equal(ro.checkEmailLabel, 'E-mailul dumneavoastră');
  assert.match(ro.checkNeedDomain, /^Introduceți /);
  assert.match(ro.how4Text, /doriți, ajustați/);
});

test('§1.4: the built Romanian pages carry no «tu» form either', () => {
  const template = readTemplate();
  const ro = LANGS.find((l) => l.code === 'ro');
  const built = [['/', renderPage(template, 'ro')],
    ...readPages('ro').map((p) => [`/law/${p.slug}`, renderLawPage(template, 'ro', p)])];
  assert.ok(ro && built.length >= 5);
  for (const [where, html] of built) {
    // The banner replica in the first screen quotes the product's buttons.
    const text = textOf(html.replace(/<div class="hl-banner"[\s\S]*?<\/div>/, ''));
    const hit = text.match(new RegExp(TU.source, 'giu'));
    assert.equal(hit, null, `ro ${where} still says ${JSON.stringify(hit)}`);
  }
});

/* ------------------------------------------------------------------- §3 */

const PANEL_KEYS = ['checkAgain', 'panelTitle', 'panelStep1', 'panelStep2', 'panelStep3', 'panelUsual', 'panelPages',
  'panelServicesOne', 'panelServicesFew', 'panelServicesMany', 'panelBefore',
  'panelCookiesOne', 'panelCookiesFew', 'panelCookiesMany', 'panelVerdictSome', 'panelVerdictNone', 'panelMore'];

test('§3: the panel is authored once, with the form, so every law page carries it', () => {
  const template = readTemplate();
  const slice = template.match(/<!--CHECKFORM:start-->([\s\S]*?)<!--CHECKFORM:end-->/)[1];
  assert.match(slice, /<div class="check-run" data-check-run>\s*<form class="check" data-check-form novalidate>/,
    'the form and the panel are not one pair inside the CHECKFORM markers');
  const panel = slice.match(/<div class="check-panel" data-check-panel data-state="idle">([\s\S]*)<\/div>\s*<\/div>\s*$/);
  assert.ok(panel, 'the panel is not inside the CHECKFORM markers, after the form');
  assert.equal((template.match(/data-check-panel(?![-\w])/g) || []).length, 1, 'the panel is authored more than once');
  // Three steps, in order, each from the dictionary.
  const steps = [...panel[1].matchAll(/<li class="check-step" data-check-step="(\d)">[\s\S]*?data-i18n="(panelStep\d)"/g)];
  assert.deepEqual(steps.map((m) => [m[1], m[2]]), [['1', 'panelStep1'], ['2', 'panelStep2'], ['3', 'panelStep3']]);
  // The counter and the bar belong to the pages step only, hidden until a real count arrives.
  assert.match(panel[1], /data-check-step="2">[\s\S]*?<span class="check-step__count" data-check-count hidden><\/span>[\s\S]*?data-check-bar hidden/);
  // One live region in the whole block: the form's status line. The panel is
  // not live (a counter in a live region would be read out every 5 s).
  assert.equal((slice.match(/aria-live=/g) || []).length, 1, 'more than one live region in the check block');
  assert.doesNotMatch(panel[1], /aria-live|role="status"|role="alert"/);
  assert.doesNotMatch(panel[1], /\sid="|class="btn/, 'the panel carries an id or a button');

  for (const { code } of LANGS) {
    for (const p of readPages(code)) {
      const html = renderLawPage(template, code, p);
      assert.match(html, /<div class="check-run" data-check-run>[\s\S]*data-check-panel/,
        `${code}/law/${p.slug} has the form without its panel`);
    }
  }
});

test('§3.2: the result is printed once — no teaser line in the form, the numbers live in the panel', () => {
  const template = readTemplate();
  assert.doesNotMatch(template, /data-check-teaser|check__teaser/, 'the form still has its teaser line');
  assert.doesNotMatch(CSS, /\.check__teaser/, 'styles.css still styles the teaser line');
  // The two states the panel shows are said to a screen reader only.
  assert.match(APP, /var PANEL_STATES = \{ checkRunning: true, checkDone: true \};/);
  assert.match(APP, /\(PANEL_STATES\[key\] \? ' check__state--sr' : ''\)/);
  assert.match(LAYER, /\n\.check__state--sr \{[^}]*clip-path: inset\(50%\);/);
  // Step 1 folds into the address and «Проверить другой сайт» — one primary
  // button in view: «Проверить» is hidden whenever «Прислать» can show.
  const slice = template.match(/<!--CHECKFORM:start-->([\s\S]*?)<!--CHECKFORM:end-->/)[1];
  assert.match(slice, /<p class="check__ran" data-check-ran hidden>[\s\S]*?<button type="button" class="check__again" data-check-again data-i18n="checkAgain">/);
  const setRan = APP.slice(APP.indexOf('function setRan('), APP.indexOf('function stampTeaser('));
  assert.match(setRan, /step1\.hidden = !!on;/);
  const poll = APP.slice(APP.indexOf('function pollCheck('), APP.indexOf('function submitCheck('));
  assert.match(poll, /setRan\(form, true, domain\);/, 'step 1 does not fold while the scan runs');
  assert.ok(poll.indexOf('setRan(form, true') < poll.indexOf("showStep2(form, true)"),
    'step 2 can appear before step 1 folds');
});

test('§3.1: progress is real — phase to step, never backwards, no invented percentage', () => {
  const map = APP.match(/var PHASE_STEP = \{([\s\S]*?)\};/);
  assert.ok(map, 'app.js has no phase-to-step map');
  const steps = Object.fromEntries([...map[1].matchAll(/(\w+): (\d)/g)].map((m) => [m[1], Number(m[2])]));
  assert.deepEqual(steps, {
    start: 1, crawl: 2, accept: 2, reject: 2, reload: 2, policy: 2, install: 2, readiness: 3, finish: 3
  });
  const prog = APP.slice(APP.indexOf('function panelProgress('), APP.indexOf('function panelDone('));
  assert.match(prog, /Math\.max\(run\.step \|\| 1, mapped\)/, 'the step can move backwards');
  assert.match(prog, /if \(!panel \|\| !progress \|\| typeof progress\.phase !== 'string'\) return 0;/,
    'without progress the panel does something other than stay on its step');
  // The bar is pagesDone / pagesTotal and nothing else.
  const count = APP.slice(APP.indexOf('function paintCount('), APP.indexOf('function panelReset('));
  assert.match(count, /progress\.pagesTotal/);
  assert.match(count, /\(Math\.min\(progress\.pagesDone \|\| 0, total\) \/ total\) \* 100/);
  const panelCode = APP.slice(APP.indexOf('SPEC V1.30.4 §3: the panel beside the form'), APP.indexOf('function pollCheck('));
  assert.doesNotMatch(panelCode, /Math\.random|estimat|\beta\b/i, 'the panel guesses');
  // The timer is the visitor's own wait; the step is said once per change.
  assert.match(panelCode, /clock\(Date\.now\(\) - runOf\(form\)\.started\)/);
  const poll = APP.slice(APP.indexOf('function pollCheck('), APP.indexOf('function submitCheck('));
  assert.match(poll, /if \(step > 1 && out && out\.getAttribute\('data-check-state'\) === 'checkRunning'\)/,
    'the step is announced on every poll, or over another message');
  // A second check on the same form cannot be written over by the first.
  assert.match(poll, /if \(runOf\(form\)\.gen !== gen\) return;/);
});

test('§3.1: no host, path or service name reaches the panel — three numbers only', () => {
  const done = APP.slice(APP.indexOf('function panelDone('), APP.indexOf('function panelStop('));
  for (const field of ['services', 'beforeConsent', 'cookies']) assert.match(done, new RegExp(`s\\.${field}`));
  assert.doesNotMatch(APP, /pageUrl|\.hosts\b|\.trackers\b/, 'app.js reads a path or a host list');
  // The address shown is the one the visitor typed.
  assert.match(APP, /site\.textContent = domain;/);
});

test('§3.2: analytics still reports the numbers, from the form rather than the gone teaser line', () => {
  const stamp = APP.slice(APP.indexOf('function stampTeaser('), APP.indexOf('/* Poll one check'));
  for (const a of ['data-check-services', 'data-check-before', 'data-check-cookies']) {
    assert.match(stamp, new RegExp(`setAttribute\\('${a}'`));
    assert.match(ANALYTICS, new RegExp(`getAttribute\\('${a}'\\)`));
  }
  const poll = APP.slice(APP.indexOf('function pollCheck('), APP.indexOf('function submitCheck('));
  assert.ok(poll.indexOf('stampTeaser(form') > -1 && poll.indexOf('stampTeaser(form') < poll.indexOf("'checkDone'"),
    'the numbers are stamped after the state that fires ck_scan_result');
});

test('§3.1: the panel looks like the form and keeps red for the one figure', () => {
  assert.ok(LAYER.length > 1000, 'styles.css has no V1.30.4 layer');
  assert.match(LAYER, /\n\.check-band \.check-panel \{ background: var\(--surface\); border-color: transparent; \}/,
    'on the band the panel is not the form\'s surface');
  assert.match(LAYER, /\n  \.check-band \.check-run \{[^}]*grid-template-columns: minmax\(0, 520px\) minmax\(0, 1fr\);/,
    'the panel is not beside the form at ≥960');
  assert.match(LAYER, /\.check-fig__num \{[^}]*font-size: 40px;[^}]*font-weight: 600;[^}]*font-variant-numeric: tabular-nums;/);
  assert.match(LAYER, /\.check-fig--alert \.check-fig__num \{ color: var\(--accent-ink\); \}/);
  // The only red in the panel is that figure: no accent elsewhere in the layer's panel rules.
  const reds = (LAYER.slice(0, LAYER.indexOf('.check__ran {')).match(/var\(--accent[^)]*\)/g) || []);
  assert.equal(reds.length, 2, `red used in the panel beyond the «до согласия» figure: ${reds.join(', ')}`);
  // The spinner turns only for visitors who did not ask for less motion.
  assert.match(LAYER, /@media \(prefers-reduced-motion: no-preference\) \{\n  \.check-step\.is-active \.check-step__mark \{ animation: check-spin/);
});

/* ------------------------------------------------------------------- §4 */

test('§4: the panel strings exist in all three languages, within the tone rules', () => {
  const BANNED = /штраф|аудит|консультац|amend|audit|consultanț|fine[sd]?\b|penalt|€|\beur\b|лей|lei\b|\d+\s?(?:€|eur)/i;
  for (const [code, , dict] of pages()) {
    for (const k of PANEL_KEYS) {
      assert.ok(typeof dict[k] === 'string' && dict[k].trim(), `${code}.json has no "${k}"`);
      assert.doesNotMatch(dict[k], BANNED, `${code}.json "${k}" breaks a tone rule: ${dict[k]}`);
      if (code !== 'ru') assert.doesNotMatch(dict[k], CYRILLIC, `${code}.json "${k}" has Cyrillic`);
    }
    assert.ok(dict.panelPages.includes('{done}') && dict.panelPages.includes('{total}'), `${code}: panelPages has no counts`);
    assert.doesNotMatch(dict.checkRunningNote, /\d/, `${code}: the running note still promises a duration beside the panel's`);
  }
  // Plural forms that differ where the language has them.
  const ru = readDict('ru');
  assert.notEqual(ru.panelServicesOne, ru.panelServicesMany);
  assert.notEqual(ru.panelServicesFew, ru.panelServicesMany);
  const ro = readDict('ro');
  assert.match(ro.panelServicesMany, /^de /, 'ro: 20+ takes «de»');
  assert.match(ro.panelCookiesMany, /^de /);
  const en = readDict('en');
  assert.notEqual(en.panelCookiesOne, en.panelCookiesMany);
});

test('§3.1: an outcome that stops the scan is stated in the panel beside the form, and printed once', () => {
  const m = APP.match(/var MIRROR_STATES = \{([\s\S]*?)\};/);
  assert.ok(m, 'app.js has no list of the outcomes the panel states');
  for (const key of ['checkScanError', 'checkLimit', 'checkRecent', 'checkRegistered']) {
    assert.match(m[1], new RegExp(`${key}: true`), `the panel does not state ${key}`);
  }
  const template = readTemplate();
  assert.match(template, /<p class="check-panel__state" data-check-panel-state hidden><\/p>/);
  // Beside the form (≥960, on the band) the panel shows it and the form's
  // line goes to screen readers only; elsewhere the panel's copy stays hidden.
  assert.match(LAYER, /\n\.check-panel__state \{ display: none;/);
  const wide = LAYER.match(/@media \(min-width: 960px\) \{\n  \.check-band \.check-panel__state:not\(\[hidden\]\) \{ display: block; \}\n  \.check-band \.check__state--mirrored \{([^}]*)\}/);
  assert.ok(wide, 'the mirrored line is not swapped at ≥960');
  assert.match(wide[1], /clip-path: inset\(50%\);/);
});
