#!/usr/bin/env node
/* ConsentKit inline builder (Agent H, spec v0.4 section A).
 *
 * Concatenates src/ck-core.js + filtered locales + src/ck-ui.js + an init() call
 * into ONE self-contained <script> block for pasting into a site's <head>.
 * Zero external requests: no CDN, no fonts, nothing hits the network before consent.
 *
 * Node >= 16, ES module, zero dependencies, no bundler.
 * Usage: node tools/build-inline.mjs --help
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const SRC = join(REPO, 'src');

// en/ru live in the builtin dictionary of ck-ui.js; the locale pack never carries them.
const BUILTIN_LANGS = ['en', 'ru'];
const LAYOUTS = ['bar', 'modal', 'box'];
const MODES = ['auto', 'light', 'dark'];
// Per v0.2: bar keeps bottom|top, box sits in a corner.
const DEFAULT_POSITION = { bar: 'bottom', modal: 'bottom', box: 'bottom-left' };
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/* ------------------------------------------------------------------ errors */

// Thrown for anything the user can fix by re-typing the command.
class UserError extends Error {}

function fail(msg) { throw new UserError(msg); }

/* -------------------------------------------------------------------- help */

const HELP = `
ConsentKit — сборщик инлайн-версии (один <script> для вставки в <head>).

  node tools/build-inline.mjs [флаги]

Флаги:
  --langs=en,ru        Языки в сборке. По умолчанию: en,ru.
                       "all" — все доступные. en и ru встроены в ядро UI и
                       не занимают места; если запрошены только они, блок
                       локалей не включается вовсе.
  --language=auto      Язык баннера. По умолчанию: auto — язык браузера
                       посетителя, из тех что вошли в сборку, иначе английский.
                       Можно жёстко задать один язык, например --language=de;
                       он обязан входить в --langs.
  --layout=bar         Вид баннера: bar | modal | box. По умолчанию: bar.
  --position=bottom    Положение. Для bar: bottom | top (по умолчанию bottom).
                       Для box: bottom-left | bottom-right (по умолчанию bottom-left).
  --accent=#2B50D8     Акцентный цвет кнопок, HEX. По умолчанию: #2B50D8.
  --mode=auto          Тема: auto | light | dark. По умолчанию: auto.
  --policy=1           Версия политики. Поднимите её, когда меняете текст
                       политики — баннер покажется посетителям заново.
  --cookies=table.json Файл со списком cookie (JSON-массив) для панели настроек.
  --no-branding        Собрать блок без объекта branding в конфиге. Флаг без
                       значения. По умолчанию сборщик и так не добавляет
                       branding, поэтому флаг ничего не вырезает — он лишь
                       гарантирует это явно для сборок из своих конфигов.
  --out=inline.html    Куда записать результат. Без флага — вывод в stdout.
  --help               Эта справка.

Пример:
  node tools/build-inline.mjs --langs=ru,en,de --layout=box --accent=#2B50D8 --out=inline.html
`.trim();

/* ------------------------------------------------------------------- flags */

function parseArgv(argv) {
  const out = {};
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') { out.help = true; continue; }
    // Bare (valueless) flags. Everything else must be --name=value.
    if (arg === '--no-branding') {
      if (out['no-branding'] !== undefined) {
        fail('Флаг "--no-branding" указан дважды. Оставьте одно упоминание.');
      }
      out['no-branding'] = true;
      continue;
    }
    if (!arg.startsWith('--')) {
      fail(`Не понимаю аргумент "${arg}".\n` +
        `Все параметры задаются в виде --имя=значение, например --layout=bar.\n` +
        `Полный список: node tools/build-inline.mjs --help`);
    }
    const eq = arg.indexOf('=');
    if (eq === -1) {
      fail(`У флага "${arg}" не указано значение.\n` +
        `Пишите через знак равенства, например ${arg}=значение.\n` +
        `Полный список: node tools/build-inline.mjs --help`);
    }
    const name = arg.slice(2, eq);
    const value = arg.slice(eq + 1);
    const known = ['langs', 'language', 'layout', 'position', 'accent', 'mode', 'policy', 'cookies', 'out'];
    if (!known.includes(name)) {
      fail(`Неизвестный флаг "--${name}".\n` +
        `Доступные флаги: ${known.map((k) => '--' + k).join(', ')}, --no-branding, --help.\n` +
        `Проверьте, нет ли опечатки.`);
    }
    if (out[name] !== undefined) {
      fail(`Флаг "--${name}" указан дважды. Оставьте одно значение.`);
    }
    out[name] = value;
  }
  return out;
}

/* ----------------------------------------------------------------- locales */

// The locale pack is an IIFE that writes window.__ckLocales; it was never meant
// to be parsed as text. Execute it in an isolated vm context with a window stub
// and read the object back — the only reliable way to filter it.
function loadLocalePack(source) {
  const stub = { navigator: undefined, document: undefined };
  stub.window = stub;
  stub.globalThis = stub;
  const context = vm.createContext(stub);
  try {
    vm.runInContext(source, context, { filename: 'ck-locales.js', timeout: 5000 });
  } catch (e) {
    fail(`Не удалось выполнить src/ck-locales.js: ${e.message}\n` +
      `Похоже, файл локалей повреждён или несовместим с этой версией сборщика.`);
  }
  const table = stub.window.__ckLocales;
  if (!table || typeof table !== 'object') {
    fail('src/ck-locales.js не определил window.__ckLocales.\n' +
      'Проверьте, что файл локалей на месте и не изменён.');
  }
  return table;
}

function resolveLangs(raw, available) {
  const all = available.concat(BUILTIN_LANGS).sort();
  const listing = () =>
    `Доступные языки: ${all.join(', ')}\n` +
    `(en и ru встроены в ConsentKit и доступны всегда.)\n` +
    `Можно указать "all" — тогда в сборку войдут все ${all.length}.`;

  const input = String(raw == null ? BUILTIN_LANGS.join(',') : raw).trim();
  if (input === '') {
    fail(`Флаг --langs пустой. Укажите хотя бы один язык.\n${listing()}`);
  }
  if (input.toLowerCase() === 'all') return { requested: all.slice(), fromPack: available.slice() };

  const requested = [];
  for (const piece of input.split(',')) {
    const code = piece.trim().toLowerCase();
    if (code === '') continue;
    if (!all.includes(code)) {
      fail(`Язык "${piece.trim()}" недоступен.\n${listing()}`);
    }
    if (!requested.includes(code)) requested.push(code);
  }
  if (requested.length === 0) {
    fail(`Во флаге --langs не нашлось ни одного языка.\n${listing()}`);
  }
  // Builtin languages need no locale section at all. Generalised on purpose:
  // --langs=en, --langs=ru and --langs=en,ru all drop the section.
  const fromPack = requested.filter((c) => !BUILTIN_LANGS.includes(c));
  return { requested, fromPack };
}

/* -------------------------------------------------------------- cookieTable */

function loadCookieTable(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    fail(`Не удалось прочитать файл cookie "${path}": ${e.code === 'ENOENT' ? 'файл не найден' : e.message}\n` +
      `Проверьте путь. Он считается от той папки, где вы запускаете команду.`);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    fail(`Файл "${path}" — не корректный JSON: ${e.message}\n` +
      `Внутри должен быть массив вида:\n` +
      `[{ "name": "_ga", "category": "analytics", "vendor": "Google", "purpose": "…", "expiry": "2 года" }]`);
  }
  if (!Array.isArray(data)) {
    fail(`В файле "${path}" ожидался массив (текст в квадратных скобках []), а там ${
      data === null ? 'null' : typeof data}.\n` +
      `Пример: [{ "name": "_ga", "category": "analytics", "vendor": "Google", "purpose": "…", "expiry": "2 года" }]`);
  }
  const CATS = ['necessary', 'functional', 'analytics', 'marketing'];
  data.forEach((row, i) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      fail(`В файле "${path}", запись №${i + 1}: ожидался объект { "name": …, "category": … }.`);
    }
    if (typeof row.name !== 'string' || row.name.trim() === '') {
      fail(`В файле "${path}", запись №${i + 1}: не хватает поля "name" (имя cookie).`);
    }
    if (typeof row.category !== 'string' || !CATS.includes(row.category)) {
      fail(`В файле "${path}", запись №${i + 1} (cookie "${row.name}"): поле "category" должно быть одним из: ${CATS.join(', ')}.`);
    }
  });
  return data;
}

/* ----------------------------------------------------------------- escaping */

// The whole block ends up inside an HTML <script> element. The HTML tokenizer
// closes that element at the first "</script" it sees, case-insensitively,
// no matter that it sits inside a JS string or comment. Escaping the slash
// keeps the JS meaning identical while making the sequence invisible to HTML.
// U+2028/U+2029 are line terminators for older JS parsers inside string literals.
function escapeForInlineScript(text) {
  return text
    .replace(/<\/(script)/gi, '<\\/$1')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/* ------------------------------------------------------------------ reading */

function readSource(name) {
  const path = join(SRC, name);
  try {
    return readFileSync(path, 'utf8');
  } catch (e) {
    fail(`Не найден исходный файл ${path}.\n` +
      `Запускайте сборщик из папки репозитория ConsentKit — рядом с ним должна лежать папка src/.`);
  }
}

function readCoreVersion(coreSource) {
  const m = coreSource.match(/version:\s*'([^']+)'/);
  return m ? m[1] : 'unknown';
}

/* -------------------------------------------------------------------- build */

function build(flags) {
  const coreSrc = readSource('ck-core.js');
  const uiSrc = readSource('ck-ui.js');
  const localeSrc = readSource('ck-locales.js');
  // Opt-in debug panel: inert unless the visitor opens the page with
  // ?ck_debug=1 (see README «Debug mode»). It ships in the block so the site
  // owner can inspect a live page without editing the block.
  const debugSrc = readSource('ck-debug.js');

  const pack = loadLocalePack(localeSrc);
  const available = Object.keys(pack).sort();
  const { requested, fromPack } = resolveLangs(flags.langs, available);

  const layout = String(flags.layout == null ? 'bar' : flags.layout).trim().toLowerCase();
  if (!LAYOUTS.includes(layout)) {
    fail(`Неизвестный вид баннера "--layout=${flags.layout}".\n` +
      `Допустимые значения: ${LAYOUTS.join(' | ')}\n` +
      `  bar   — полоса снизу или сверху страницы\n` +
      `  modal — окно по центру\n` +
      `  box   — компактная карточка в углу`);
  }

  const mode = String(flags.mode == null ? 'auto' : flags.mode).trim().toLowerCase();
  if (!MODES.includes(mode)) {
    fail(`Неизвестная тема "--mode=${flags.mode}".\n` +
      `Допустимые значения: ${MODES.join(' | ')}\n` +
      `  auto  — как настроено у посетителя в системе\n` +
      `  light — всегда светлая\n` +
      `  dark  — всегда тёмная`);
  }

  const accent = String(flags.accent == null ? '#2B50D8' : flags.accent).trim();
  if (!HEX_RE.test(accent)) {
    fail(`Цвет "--accent=${flags.accent}" не похож на HEX-код.\n` +
      `Нужен вид #RRGGBB или #RGB, например --accent=#2B50D8 или --accent=#0a7.\n` +
      `Решётка обязательна. В некоторых оболочках её нужно взять в кавычки: --accent="#2B50D8"`);
  }

  const ALLOWED_POS = {
    bar: ['bottom', 'top'],
    modal: ['bottom'],
    box: ['bottom-left', 'bottom-right']
  };
  let position = DEFAULT_POSITION[layout];
  if (flags.position != null) {
    const p = String(flags.position).trim().toLowerCase();
    if (!ALLOWED_POS[layout].includes(p)) {
      fail(`Положение "--position=${flags.position}" не подходит для --layout=${layout}.\n` +
        (layout === 'modal'
          ? `Окно modal всегда по центру — флаг --position для него не нужен.`
          : `Допустимые значения для ${layout}: ${ALLOWED_POS[layout].join(' | ')}`));
    }
    position = p;
  }

  const policy = String(flags.policy == null ? '1' : flags.policy).trim();
  if (policy === '') {
    fail(`Флаг --policy пустой.\n` +
      `Укажите версию политики, например --policy=1.\n` +
      `Меняйте её (2, 3, …), когда правите текст политики: тогда посетители,\n` +
      `уже давшие согласие, увидят баннер заново и решат ещё раз.`);
  }

  // --language must name a locale that actually shipped in this build, otherwise
  // ck-ui would silently fall back to en and the site owner would never know why.
  const language = String(flags.language == null ? 'auto' : flags.language).trim().toLowerCase();
  if (language !== 'auto' && !requested.includes(language)) {
    const known = available.concat(BUILTIN_LANGS).includes(language);
    fail(`Язык "--language=${flags.language}" не входит в эту сборку.\n` +
      (known
        ? `Такой язык у ConsentKit есть, но вы его не включили.\n` +
          `Добавьте его в --langs, например: --langs=${requested.concat(language).join(',')} --language=${language}`
        : `Такого языка у ConsentKit нет вовсе.\n` +
          `Доступные: ${available.concat(BUILTIN_LANGS).sort().join(', ')}`) +
      `\nСейчас в сборке: ${requested.join(', ')}.`);
  }

  const cookieTable = flags.cookies == null ? [] : loadCookieTable(flags.cookies);

  const version = readCoreVersion(coreSrc);
  const stamp = new Date().toISOString().slice(0, 10);

  // Branding ships by default; --no-branding drops the object entirely.
  //
  // Only the attribution line is emitted, deliberately — not the logo. The
  // shipped brand/ecom-consult-logo.svg is a white wordmark authored for dark
  // backgrounds (fill="white" plus a #FF4242 mark), and .ck-brand paints no
  // background of its own, so as `branding.logo` it would render invisible on
  // the banner's light surface. src/ck-ui.js says so at buildBrandLogo(): this
  // asset belongs in `logoDark`, with a dark-ink variant in `logo` — and
  // logoDark alone is not an option either, because buildBrandLogo() returns
  // null when `logo` is missing, which would drop the logo AND keep the 9 КБ of
  // config. Shipping a recoloured variant is an authoring decision for the
  // brand owner, not something to invent here. ck-ui.js's own restraint rule
  // asks for one logo OR one line; the line is the part that is unambiguous,
  // and it costs ~130 Б instead of ~9,3 КБ per block.
  const noBranding = flags['no-branding'] === true;

  // Which language the visitor actually gets first: an explicit --language, or
  // for --language=auto the first bundled language (ck-ui falls back to en when
  // the browser matches nothing). Keeps ru-* blocks Russian and en/eu English.
  const primaryLang = language === 'auto' ? requested[0] : language;
  const branding = {
    poweredBy: {
      text: primaryLang === 'ru' ? 'Сделано в E-COM Consult' : 'Made by E-COM Consult',
      url: 'https://ecomconsult.net'
    }
  };

  const config = {
    policyVersion: policy,
    // 'auto' -> visitor's browser language among the bundled ones, else en.
    // A fixed code must be one that actually shipped in this build.
    language,
    layout: { type: layout, position },
    theme: { accent, radius: '10px', mode },
    cookieTable
  };
  if (!noBranding) config.branding = branding;

  // Reconstruct the exact command for the header, so a future maintainer can rebuild.
  const cmdParts = ['node tools/build-inline.mjs', `--langs=${requested.join(',')}`,
    `--language=${language}`, `--layout=${layout}`, `--position=${position}`,
    `--accent=${accent}`, `--mode=${mode}`, `--policy=${policy}`];
  if (flags.cookies != null) cmdParts.push(`--cookies=${flags.cookies}`);
  if (noBranding) cmdParts.push('--no-branding');
  if (flags.out != null) cmdParts.push(`--out=${flags.out}`);
  const command = cmdParts.join(' ');

  const header = [
    '/* ConsentKit — инлайн-сборка. Вставьте весь этот блок в <head> сайта.',
    ' *',
    ` * Версия ConsentKit: ${version}`,
    ` * Дата сборки:      ${stamp}`,
    ` * Языки:            ${requested.join(', ')}${fromPack.length === 0 ? ' (встроенные, пакет локалей не нужен)' : ''}`,
    ` * Язык баннера:     ${language === 'auto' ? 'auto (по языку браузера посетителя)' : language + ' (задан жёстко)'}`,
    ` * Вид:              ${layout} / ${position}, тема ${mode}, акцент ${accent}`,
    ` * Версия политики:  ${policy}`,
    ` * Брендинг:         ${noBranding ? 'нет (--no-branding)' : 'строка «' + branding.poweredBy.text + '»'}`,
  ].concat([
    ' *',
    ' * Ноль внешних запросов: до согласия посетителя ничего никуда не отправляется.',
    ' * Файл собран автоматически — правьте не его, а исходники и пересоберите:',
    ` *   ${command}`,
    ' */'
  ]).join('\n');

  const pieces = [header, coreSrc];

  let localeBytes = 0;
  if (fromPack.length > 0) {
    const subset = {};
    for (const code of fromPack) subset[code] = pack[code];
    const localeBlock =
      '/* ConsentKit locales (' + fromPack.join(', ') + ') — filtered subset of src/ck-locales.js */\n' +
      '(function(){if(typeof window==="undefined")return;' +
      'window.__ckLocales=Object.assign(window.__ckLocales||{},' +
      JSON.stringify(subset) + ');})();';
    localeBytes = Buffer.byteLength(localeBlock, 'utf8');
    pieces.push(localeBlock);
  }

  pieces.push(uiSrc);

  // After the UI (the panel measures the banner) and before init(), so the
  // panel's ck:init listener is attached when init() fires.
  pieces.push(debugSrc);

  // Safety net: init() is called once the DOM is ready, regardless of where the
  // block is pasted. ck-ui.js already defers its own mount() when document.body
  // is missing, so this is belt-and-braces rather than a requirement. The core's
  // blocking engine is armed at parse time and is unaffected by the delay.
  const initBlock = [
    '/* ConsentKit init — config from build flags */',
    '(function(){',
    '  var CFG = ' + JSON.stringify(config, null, 2).split('\n').join('\n  ') + ';',
    '  function start(){',
    '    try { window.ConsentKit.init(CFG); }',
    '    catch (e) { if (window.console && console.error) console.error("[ConsentKit] init failed", e); }',
    '  }',
    '  if (document.readyState === "loading") {',
    '    document.addEventListener("DOMContentLoaded", start);',
    '  } else { start(); }',
    '})();'
  ].join('\n');
  pieces.push(initBlock);

  // Each source is an IIFE; the explicit semicolon between them rules out ASI traps.
  const body = pieces.join('\n;\n');
  const escaped = escapeForInlineScript(body);

  // Belt and braces: if anything above ever slips through, refuse to write a
  // broken/unsafe block rather than hand the user something that breaks the page.
  if (/<\/script/i.test(escaped)) {
    throw new Error('internal: "</script" survived escaping — refusing to emit');
  }

  const html = '<script>\n' + escaped + '\n</script>\n';

  return {
    html,
    escaped,
    stats: {
      version, stamp, command, langs: requested, fromPack, language, layout, position, mode, accent, policy, noBranding,
      brandingText: noBranding ? '' : 'строка «' + branding.poweredBy.text + '»',
      cookieRows: cookieTable.length,
      coreBytes: Buffer.byteLength(coreSrc, 'utf8'),
      uiBytes: Buffer.byteLength(uiSrc, 'utf8'),
      debugBytes: Buffer.byteLength(debugSrc, 'utf8'),
      localeBytes,
      totalBytes: Buffer.byteLength(html, 'utf8')
    }
  };
}

/* --------------------------------------------------------------------- main */

function kb(bytes) { return (bytes / 1024).toFixed(1) + ' КБ'; }

function main() {
  const flags = parseArgv(process.argv.slice(2));
  if (flags.help) { process.stderr.write(HELP + '\n'); return 0; }

  const { html, stats } = build(flags);

  const target = flags.out == null || flags.out === '-' ? null : flags.out;
  if (target) {
    const dir = dirname(resolve(target));
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(resolve(target), html, 'utf8');
    } catch (e) {
      fail(`Не удалось записать файл "${target}": ${e.message}\n` +
        `Проверьте, что путь существует и есть права на запись.`);
    }
  } else {
    process.stdout.write(html);
  }

  // Summary goes to stderr only, so `--out=-` stays pipeable.
  const lines = [
    'ConsentKit — инлайн-сборка готова.',
    `  версия ядра   ${stats.version}   (собрано ${stats.stamp})`,
    `  вид           ${stats.layout} / ${stats.position}, тема ${stats.mode}, акцент ${stats.accent}`,
    `  политика      ${stats.policy}`,
    `  языки         ${stats.langs.join(', ')} — всего ${stats.langs.length}` +
      (stats.fromPack.length === 0
        ? ' (только встроенные, пакет локалей не подключён)'
        : ` (${stats.fromPack.length} из пакета локалей)`),
    `  язык баннера  ${stats.language === 'auto' ? 'auto — по языку браузера посетителя' : stats.language + ' — задан жёстко'}`,
    `  cookie в таблице  ${stats.cookieRows}`,
    `  брендинг      ${stats.noBranding ? 'нет (--no-branding)' : stats.brandingText}`,
    '  ---',
    `  ядро          ${kb(stats.coreBytes)}`,
    `  локали        ${stats.localeBytes === 0 ? '— (не нужны)' : kb(stats.localeBytes)}`,
    `  интерфейс     ${kb(stats.uiBytes)}`,
    `  отладка       ${kb(stats.debugBytes)} (панель ?ck_debug=1, выключена по умолчанию)`,
    `  ИТОГО         ${kb(stats.totalBytes)}${target ? ' → ' + target : ' → stdout'}`,
    '',
    '  Вставьте содержимое файла целиком в <head> сайта, как можно выше.',
    `  Пересобрать: ${stats.command}`
  ];
  process.stderr.write(lines.join('\n') + '\n');
  return 0;
}

try {
  process.exitCode = main();
} catch (e) {
  if (e instanceof UserError) {
    process.stderr.write('\nОшибка: ' + e.message + '\n\n');
    process.exitCode = 1;
  } else {
    throw e;
  }
}
