# ConsentKit — контракт прототипа (v0.1)

Прототип ядра GDPR cookie-баннера. Три модуля с жёсткими границами файлов.
Язык кода: vanilla JS (ES2020), ноль зависимостей, без сборки. Комментарии в коде — по-английски, лаконичные.

## Файлы и владельцы

| Файл | Владелец | Содержимое |
|---|---|---|
| `src/ck-core.js` | Агент A | Consent Core + Blocking Engine + Storage + бутстрап |
| `src/ck-ui.js` | Агент B | UI-слой (Shadow DOM): баннер, панель настроек, плавающая кнопка |
| `demo/index.html`, `demo/trackers/*.js` | Агент C | Демо-магазин с фейковыми трекерами и панелью статуса |

Порядок подключения на странице (контрактный):
```html
<script src="../src/ck-core.js"></script>
<script src="../src/ck-ui.js"></script>
<script> ConsentKit.init({ ...config }) </script>
```
`ck-core.js` при parse-time НЕМЕДЛЕННО активирует блокировку (до init).

## Категории

`necessary` (всегда true, тумблер заблокирован в UI), `functional`, `analytics`, `marketing`. Все opt-in по умолчанию `false`.

## Публичный API (window.ConsentKit) — реализует Агент A

```js
ConsentKit.init(config)        // идемпотентен; сохраняет config в ConsentKit.config
ConsentKit.allowed(cat)        // -> boolean
ConsentKit.getState()          // -> { decided:boolean, id, ts, policyVersion, categories:{...}, method }
ConsentKit.accept('all')       // согласие на всё
ConsentKit.accept({functional:true, analytics:false, marketing:false}) // выбор; method:'custom'
ConsentKit.rejectAll()         // отказ от всех opt-in; method:'reject_all'
ConsentKit.withdraw()          // полный отзыв: чистит storage, известные cookie, шлёт denied в GCM, ставит decided:false
ConsentKit.show()              // событие 'ck:ui:open-preferences'
ConsentKit.hide()              // событие 'ck:ui:close'
```

События на `document` (все — `CustomEvent`, данные в `detail`):
- `ck:init` — detail: `{ state, config }`. Диспатчится из `init()` ПОСЛЕ восстановления состояния из storage.
- `ck:consent` — первый выбор пользователя, detail: `{ state }`
- `ck:change` — любое изменение выбора (включая withdraw), detail: `{ state }`
- `ck:ui:open-preferences`, `ck:ui:close` — команды для UI-слоя.

Core НЕ знает про DOM UI ничего, кроме диспатча этих событий. UI вызывает только публичный API.

## Config (значения по умолчанию)

```js
{
  policyVersion: "1",
  language: "auto",              // 'auto' -> navigator.language, поддерживаем 'ru' | 'en', fallback 'en'
  layout: { type: "bar", position: "bottom" },   // 'bar' | 'modal'
  theme: { accent: "#2B50D8", radius: "10px" },  // прокидывается в CSS-переменные --ck-accent, --ck-radius
  categories: { functional:{enabled:true}, analytics:{enabled:true}, marketing:{enabled:true} },
  consentTtlDays: 365,
  integrations: { gcm: true, gtmDataLayer: true },
  cookieTable: [ /* Агент C передаёт сюда описания cookie демо-трекеров */
    // { name:"_ga", category:"analytics", vendor:"Google", purpose:"...", expiry:"2 years" }
  ]
}
```

## Storage — Агент A

- Cookie `ck_consent` = base64(JSON), path=/, SameSite=Lax, срок = consentTtlDays. Дубль в `localStorage['ck_consent']`.
- Схема JSON: `{ id (uuid), ts (ISO), policyVersion, categories:{necessary,functional,analytics,marketing}, method:'accept_all'|'reject_all'|'custom' }`.
- При восстановлении: если `policyVersion` не совпадает с config или срок истёк → состояние сбрасывается, `decided:false` (баннер покажется снова).

## Blocking Engine — Агент A

1. **Ручная разметка.** При старте и через MutationObserver:
   - `script[type="text/plain"][data-ck]`: после согласия на категорию — пересоздать script с настоящим type и `src` из `data-src` (или inline-текстом).
   - `iframe[data-ck][data-src]`: до согласия src не ставится; после согласия проставить src. (Плейсхолдер поверх iframe рисует UI-слой? НЕТ — для прототипа плейсхолдер НЕ нужен, достаточно пустого iframe с серым фоном через inline-стиль от Агента C.)
2. **Автоблокировка.** Патч `Element.prototype.setAttribute` + сеттера `HTMLScriptElement.prototype.src` + `document.createElement`: если URL скрипта попадает в базу доменов и категория не разрешена — скрипт нейтрализуется (src не ставится, элемент помечается `data-ck-blocked`, URL запоминается) и будет загружен после согласия. База доменов (маппинг домен→категория), минимум: `google-analytics.com`, `googletagmanager.com`→analytics; `connect.facebook.net`→marketing; `mc.yandex.ru`, `static.hotjar.com`→analytics; `analytics.tiktok.com`→marketing; **`localhost:8742/demo/trackers/ga.js`-подобные пути демо**: база должна матчиться и по подстроке пути `/trackers/ga.js`→analytics, `/trackers/pixel.js`→marketing (чтобы демо показывало автоблок).
3. **Отзыв/отказ**: удалить известные cookie по маске: `_ga`, `_ga_*`, `_gid`, `_fbp`, `_fbc`, `_ym_*`, `_hj*`, `_ttp`, `demo_*` (cookie демо-трекеров). Loaded-скрипты не выгружаем; после withdraw диспатчится `ck:change`, повторная загрузка страницы — чистая.
4. **Google Consent Mode v2** (если `integrations.gcm`): при parse-time — `gtag('consent','default', {ad_storage:'denied', analytics_storage:'denied', ad_user_data:'denied', ad_personalization:'denied'})` через dataLayer; после выбора — `gtag('consent','update', ...)` по категориям (analytics→analytics_storage; marketing→ad_*).

## UI-слой — Агент B (`src/ck-ui.js`)

Слушает `ck:init` (и командные события), рендерит в `<div id="ck-root">` с Shadow DOM (mode:'open').

**Слой 1 — баннер** (layout.type: bar = полоса внизу; modal = центрированная карточка с приглушённым фоном, БЕЗ блокировки скролла):
- Заголовок, короткий текст, ссылка «Подробнее» (якорь `#`), три кнопки РАВНОГО размера и веса: «Принять всё», «Отклонить всё», «Настроить». Первые две — одинаковый стиль (filled), «Настроить» — outline того же размера.
- Показывается только если `state.decided === false`.

**Слой 2 — панель настроек** (открывается по «Настроить» и по `ck:ui:open-preferences`):
- Тумблер на категорию; `necessary` — тумблер on + disabled с подписью «всегда активны».
- Под каждой категорией — раскрывающийся (details/summary) список cookie из `config.cookieTable` этой категории: имя, поставщик, цель, срок.
- Кнопки: «Сохранить выбор», «Принять всё», «Отклонить всё».
- Если согласие уже дано — тумблеры отражают текущее состояние.

**После выбора** — плавающая круглая кнопка (fingerprint/cookie-иконка inline-SVG) в левом нижнем углу, открывает панель настроек.

**Требования:**
- Тексты RU + EN во встроенном словаре, выбор по `config.language` ('auto' → navigator.language).
- Стили только внутри Shadow DOM; кастомизация через CSS-переменные `--ck-accent`, `--ck-radius`, `--ck-bg`, `--ck-ink` (дефолты: bg #fff, ink #1B2437). Тёмную тему прототип не делает.
- A11y: role="dialog", aria-modal на панели, ловушка фокуса в панели/modal, Esc закрывает панель, полная навигация Tab, focus-visible видим, у тумблеров role="switch" + aria-checked.
- Никаких внешних шрифтов/ресурсов: font: system-ui.
- Вызовы API: только `ConsentKit.accept/rejectAll/getState/config`, диспатч `ck:*` не дублирует.

## Демо — Агент C (`demo/`)

`demo/index.html` — мини-магазин («Кофейня ConsentKit», 2–3 карточки товара, чистый инлайн-CSS, без внешних ресурсов) + **панель статуса** (fixed справа сверху, id="status-panel", обычный DOM, не shadow):
- строки: GA (analytics) / Pixel (marketing) / Chat (functional) — статус «⛔ заблокирован / ✅ загружен»; live-список cookie документа (обновление раз в 1с); текущее состояние согласия (`ConsentKit.getState()`), обновляется по `ck:change`/`ck:consent`.

Фейковые трекеры (`demo/trackers/`): каждый при загрузке ставит cookie и сообщает о себе:
- `ga.js`: cookie `demo_ga=1`, `window.__loaded.ga = true`
- `pixel.js`: cookie `demo_fbp=1`, `window.__loaded.pixel = true`
- `chat.js`: cookie `demo_chat=1`, `window.__loaded.chat = true`

Подключение в demo (демонстрирует ОБА механизма):
- `ga.js` — динамическая вставка обычным кодом `var s=document.createElement('script'); s.src='trackers/ga.js'; ...` → должен поймать автоблок по пути `/trackers/ga.js`.
- `pixel.js` — ручная разметка `type="text/plain" data-ck="marketing" data-src="trackers/pixel.js"`.
- `chat.js` — ручная разметка, категория functional.
- iframe YouTube-заглушка: `iframe[data-ck="marketing"][data-src="about:blank"]` с подписью.
- Кнопка «Сбросить всё» в панели статуса: `ConsentKit.withdraw()` + перезагрузка.
- `ConsentKit.init({...})` с cookieTable, описывающим demo_* cookie.

Пути в demo — относительные (`../src/ck-core.js`), страница обслуживается статикой с корня `consentkit/`.

## Definition of Done (проверяет архитектор)

1. До выбора: ни один трекер не загружен, ни одного `demo_*` cookie (кроме `ck_consent` после выбора).
2. «Принять всё» → все три загрузились, cookie появились, панель статуса зелёная.
3. «Отклонить всё» → ничего не грузится; после «Принять» и последующего withdraw → `demo_*` cookie удалены.
4. Выборочно (только analytics) → грузится только ga.js.
5. Повторная загрузка страницы сохраняет выбор; смена `policyVersion` в init — баннер снова.
6. Панель: Esc, Tab-ловушка, aria-атрибуты на месте.

---

# Дополнение v0.2 (принято архитектором после приёмки v0.1)

Три пакета работ. Инварианты GDPR из v0.1 неизменны и перепроверяются на приёмке.

## A. Тёмная тема + режим box — зона Агента B (`src/ck-ui.js`)

Config расширяется (обратная совместимость обязательна — старые конфиги работают без правок):
```js
theme: {
  accent:"#2B50D8", radius:"10px",
  mode: "auto" | "light" | "dark",   // default "auto" → prefers-color-scheme внутри Shadow DOM
  dark: { bg:"#1A202D", ink:"#E6EAF4", accent:"#7B96F0" }  // опциональный override тёмной палитры
}
layout: { type: "bar" | "modal" | "box", position: ... }
// box: компактная карточка ~360px, position: "bottom-right" (default) | "bottom-left";
// для bar позиция по-прежнему bottom|top. Неизвестные комбинации — деградация к bar/bottom.
```
Требования: обе палитры определяются токенами внутри shadow-стилей; mode:"auto" через `@media (prefers-color-scheme: dark)` + возможность форс-класса на host; контраст текста/кнопок в тёмной теме ≥ AA; инварианты кнопок и тумблеров без изменений; никаких новых обязательных ключей словаря (если добавляешь строку — добавь её в en и ru и сообщи в отчёте список новых ключей).

## B. Локали — новый Агент D (`src/ck-locales.js`)

- Файл определяет `window.__ckLocales = { de:{...}, fr:{...}, ... }` — самодостаточный IIFE, ноль зависимостей. Подключается МЕЖДУ ck-core.js и ck-ui.js (но ck-ui читает словарь в момент рендера, так что порядок с ui некритичен).
- Ключи каждой локали — РОВНО тот же набор, что во встроенном словаре ck-ui.js (прочитать из файла, ничего не выдумывать). Неполная локаль допустима — ck-ui добирает недостающее из en.
- Состав (≥30): все 24 официальных языка ЕС + uk, ru, tr, no, is, sr, ca, sq, mk.
- ck-ui.js (Агент B) мержит: builtin(en,ru) ← window.__ckLocales (если есть). Разрешение языка: точное совпадение в нижнем регистре → первые 2 буквы (pt-BR → pt) → en. Реализация резолва — на стороне Агента B.
- Качество перевода: короткие естественные фразы, обращение вежливое, без машинного канцелярита; юридический смысл («Отклонить всё» = отказ, «всегда активны») сохранён точно.

## C. npm-обёртка — новый Агент E (корень `consentkit/`)

- `package.json` в корне consentkit: name "consentkit" (placeholder), version 0.2.0, type "module", exports:
  - `.` → npm/index.mjs (+ require → npm/index.cjs), side-effect: подключает core, locales, ui; re-export публичного API.
  - `./react` → npm/react.mjs: хук `useConsent()` → { state, allowed(cat), accept, rejectAll, withdraw, show }, подписка на ck:init/ck:consent/ck:change, отписка в cleanup; react — peerDependency (>=17), НЕ dependency.
  - `./core` → только ядро без UI.
- `npm/index.d.ts` — типы публичного API, конфига и хука (module declarations для '.', './react', './core').
- `README.md` в корне consentkit: краткий quickstart (script-тег и npm/React), таблица config, API, — на английском.
- SSR-безопасность: импорт модулей в Node без window не должен падать (ядро уже guard'ится — проверить и не сломать), хук на сервере возвращает decided:false и no-op действия.
- Никаких bundler'ов: файлы как есть; index.mjs/cjs могут импортировать ../src/*.js как side-effect модули.

## D. Демо-переключатель — Агент C (`demo/index.html`)

В панель статуса добавить компактный блок «Dev»: три select (theme mode: auto/light/dark; layout: bar/box/modal; language: en/ru/de/fr/pl/es/it + произвольный ввод) + кнопка «Применить» → сохранить в localStorage['demo_cfg'] и location.reload(); при старте demo мержит demo_cfg поверх базового init-конфига. Подключить `../src/ck-locales.js` между core и ui.

## DoD v0.2 (приёмка архитектора)

1. box: компактная карточка справа снизу, все три кнопки на месте, равнозначность сохранена; bar и modal не изменились.
2. mode:dark — тёмная палитра, контраст AA; mode:auto следует prefers-color-scheme (проверяется эмуляцией); theme.dark override работает.
3. ≥30 локалей; переключение de/fr/pl в демо меняет все тексты баннера и панели; отсутствующий ключ добирается из en; неизвестный язык (`xx`) падает в en.
4. npm: `node --check`/import-смоук проходят в Node без DOM; типы согласованы с фактическим API; react-хук синтаксически валиден и отписывается.
5. Регресс: DoD v0.1 пункты 1–4 повторяются и проходят.

## Приёмка v0.2 — ПРИНЯТО (27.08.2026)

Все 5 пунктов DoD v0.2 подтверждены архитектором в браузере и Node. Утверждённые решения:
- en/ru не входят в ck-locales.js — встроенный словарь ck-ui.js является эталоном (отклонение Агента D одобрено).
- Светлый theme.accent не наследуется тёмной темой: в dark действует theme.dark.accent либо встроенный #7B96F0 (контраст AA важнее непрерывности брендового цвета).
- Контраст произвольного СВЕТЛОГО акцента — ответственность интегратора; в v1 конфигуратор обязан валидировать контраст выбранного акцента в обеих темах (внесено в бэклог v1).
- npm/internal-stub.mjs — внутренний общий модуль вне exports, допустим.
- Ограничение node10-резолюции для consentkit/react задокументировано в README, исправление не требуется.

---

# Дополнение v0.3 — Плагины (принято архитектором)

Три пакета. Инварианты GDPR неизменны.

## A. Ядро: события для GTM-триггеров — Агент A (`src/ck-core.js`)

При `integrations.gtmDataLayer !== false`, дополнительно к существующему `ck_consent_update`:
- пушить в dataLayer событие `{ event: "ck_consent_<category>" }` для КАЖДОЙ разрешённой opt-in категории — и после решения пользователя (commit), и при восстановлении согласия на новой странице (init). Дедупликация в рамках загрузки страницы: одна категория — не больше одного события, повторный commit с той же категорией события не дублирует; категория, ставшая granted позже в рамках той же страницы, событие получает.
- отзыв/reject событий не генерируют (теги в GTM просто не стартуют без события; выгрузку уже сработавших тегов GTM не поддерживает).
- Версия ядра → 0.3.0. Смоук дополнить: трасса dataLayer на сценарии accept(analytics) → accept(all) → withdraw → accept(all) и на init-restore.

## B. Плагин WordPress — новый Агент F (`plugins/wordpress/consentkit/`)

Самодостаточная папка плагина (копируемая в wp-content/plugins/): consentkit.php (заголовок плагина, PHP ≥7.4, WP ≥6.0), admin-страница (Settings API, capability manage_options), uninstall.php (чистит опции), readme.txt (формат WP.org), assets/ = копии src/ck-core.js, ck-locales.js, ck-ui.js (+ комментарий о синхронизации из корня репо).
Настройки: включение категорий (functional/analytics/marketing), language (auto/select), layout (bar/box/modal), theme mode (auto/light/dark), accent (color picker), policyVersion (текст с пояснением «поднимите при изменении политики»), cookieTable (textarea JSON с валидацией при сохранении).
Вывод: скрипты в `<head>` МАКСИМАЛЬНО РАНО (wp_print_scripts/wp_head с минимальным приоритетом или прямой вывод тегов в wp_head приоритет 0 — обосновать выбор), порядок core → locales → ui → inline init с конфигом из настроек (wp_json_encode, экранирование). Шорткод `[consentkit_settings]` → ссылка, открывающая ConsentKit.show(). Никакого вывода в админке/REST/фидах. Все строки админки — через esc_*, textdomain 'consentkit'.
Безопасность: nonce на форме настроек, санитизация каждого поля, никакого eval/динамического PHP.

## C. GTM-пакет — новый Агент G (`integrations/gtm/`)

- `container-import.json` — импортируемый экспорт контейнера GTM (exportFormatVersion 2): Custom Event триггеры `ck_consent_analytics`, `ck_consent_marketing`, `ck_consent_functional`; dataLayer-переменные `ck_consent.*`; пример тега GA4 Config, привязанного к триггеру analytics, с built-in consent checks; тег-пример для marketing (Custom HTML заглушка с комментарием).
- `README.md` (RU): пошаговый импорт, схема «ConsentKit → dataLayer → триггеры → теги», таблица событий/переменных, раздел про Consent Mode v2 (ядро шлёт default/update само; в GTM включить consent overview), ограничения (выгрузка тегов при отзыве невозможна — чистая загрузка).
- JSON обязан быть синтаксически валиден и структурно соответствовать формату экспорта GTM (публичный формат: containerVersion { container, tag[], trigger[], variable[] } с accountId/containerId-заглушками "0").

## DoD v0.3 (приёмка архитектора)

1. Трасса dataLayer: на восстановленном согласии (analytics) новая страница даёт ровно один `ck_consent_analytics`; после доп. согласия на всё — добавляются marketing/functional без дублей analytics; withdraw → новых событий нет.
2. PHP: php -l чист (или эквивалентная проверка), санитизация/экранирование на месте (ревью), конфиг из настроек корректно сериализуется в init.
3. GTM JSON парсится, структура полей соответствует формату импорта, имена событий совпадают с ядром.
4. Регресс DoD v0.1 п.1–4 на демо.

## Приёмка v0.3 — ПРИНЯТО (27.08.2026)

Все 4 пункта DoD v0.3 подтверждены. Ключевые факты приёмки:
- Трасса dataLayer в браузере: restore → ровно один ck_consent_analytics; accept('all') добавляет functional+marketing без дублей; withdraw и повторный accept на той же странице событий не дают; ck_consent_update — на каждое изменение состояния.
- Исправлен дефект гейтов (найден приёмкой GTM-пакета, подтверждён негативным контролем): сигналы GCM — под integrations.gcm, событие ck_consent_update — под integrations.gtmDataLayer, независимо.
- Дедуп категорийных событий не сбрасывается до новой загрузки страницы — утверждено (защита от двойного срабатывания тегов GTM).
- WP-плагин: php -l чист на 7.4/8.5 (Docker), вывод через wp_head приоритет 0 (обоснование в коде: parse-time патчи ядра должны встать раньше любых сторонних скриптов), полная карта санитайзер→эскейпер, найден и исправлен баг двойного wp_unslash в cookieTable.
- assets/ плагина побайтово синхронны src/ (sha256).
- GTM: имена событий контейнера совпадают с ядром; известные места неуверенности формата перечислены в отчёте Агента G (главное — measurementId vs tagId у gaawc), проверка реальным импортом — на этапе V1.

---

# Дополнение v0.4 — Инлайн-сборка и публикация (принято архитектором)

## A. Сборщик инлайн-версии — новый Агент H (`tools/build-inline.mjs`, `tools/`)

Проблема: жёсткие конструкторы (бесплатная Тильда и т.п.) не дают загрузить файлы, а внешний CDN до согласия шлёт IP посетителя на чужой хост — это само по себе нарушение (см. дела о Google Fonts). Решение: один самодостаточный `<script>`-блок, вставляемый в HEAD. Нулевые внешние запросы.

Скрипт на Node (ES module, ноль зависимостей, без сборщиков):
`node tools/build-inline.mjs --langs=ru,en,de --layout=bar --accent=#2B50D8 --mode=auto --policy=1 --out=dist/inline.html`

- Склеивает src/ck-core.js + отфильтрованные локали + src/ck-ui.js + вызов init(конфиг из флагов) в ОДИН `<script>…</script>`, готовый к копипасту. Порядок склейки = контрактный порядок подключения.
- `--langs` (default `en,ru`): в сборку попадают только указанные локали. `en`/`ru` встроены в ck-ui.js, поэтому для них ck-locales не нужен вовсе; при `--langs=en,ru` секция локалей опускается целиком. `all` — все 32.
- Фильтрация локалей: НЕ regex по тексту файла. Загрузить ck-locales.js в изолированном контексте (node:vm с заглушкой window), взять window.__ckLocales, отобрать нужные ключи, сериализовать через JSON.stringify в компактный `window.__ckLocales = {...};`. Это единственный надёжный способ — файл не предназначен для парсинга.
- Экранирование: результат вставляется в HTML, поэтому в итоговом тексте не должно остаться последовательности `</script` (заменять на `<\/script`). Проверить и на исходниках, и на JSON локалей.
- `--cookies=path/to/table.json` (опционально) — cookieTable из файла.
- Вывод: `--out` в файл + печать сводки в stderr (размер, число локалей, что вошло). Сам HTML — только в файл/stdout, чтобы можно было пайпить.
- Валидация флагов: неизвестный язык — ошибка со списком доступных; неизвестный layout/mode — ошибка; accent — проверка hex.
- В шапку сгенерированного блока — комментарий: что это, версия ConsentKit, дата генерации, команда, которой пересобрать.
- Обязательно: `tools/README.md` (RU) — зачем, примеры вызова, как обновлять после смены версии ядра.

Самопроверка: сгенерировать 3 варианта (en,ru / de,fr,pl / all), каждый — проверить node --check на извлечённом JS, отсутствие `</script`, и прогнать в headless-проверке (или хотя бы через vm с DOM-заглушкой), что ConsentKit определяется и getState() работает.

## B. Подготовка репозитория к публикации — новый Агент I (корень)

- `.gitignore`: .DS_Store, *.zip, node_modules, dist/, .env, служебные macOS/IDE файлы.
- `LICENSE`: **GPL-2.0-or-later** для всего репозитория (решение архитектора: плагин WordPress уже заявляет GPLv2+, а распространение WP-плагинов практически требует GPL; единая лицензия важнее гибкости MIT). Соответственно `package.json`: license → "GPL-2.0-or-later".
- `.github/workflows/pages.yml`: публикация демо на GitHub Pages (actions/configure-pages + upload-pages-artifact + deploy-pages, на push в main; артефакт — корень репозитория, чтобы работали относительные пути demo → ../src).
- `README.md` (корневой, английский, уже существует — Агент E): добавить сверху бейдж-строку/описание проекта, ссылку на INSTALL.ru.md, раздел Install (4 способа кратко) и Project status (прототип, что не проверено вживую). Не переписывать существующие технические разделы, только дополнить.
- `CONTRIBUTING.md` — коротко: структура репо, что где лежит, требование не ломать инварианты GDPR из SPEC.md, как гонять смоуки.

## DoD v0.4
1. Инлайн-сборка: три варианта генерируются, вставленные в тестовую страницу — баннер работает, блокировка работает, локали переключаются; `</script` в выводе отсутствует.
2. Размер сборки en+ru заметно меньше полной (ожидаемо ~70 КБ против ~125 КБ).
3. Лицензия единая и непротиворечивая во всех файлах; .gitignore покрывает мусор; workflow синтаксически валиден.

## Приёмка v0.4 — ПРИНЯТО (27.08.2026)

DoD v0.4 подтверждён архитектором:
1. Инлайн-сборка проверена вживую: блок в <head> тестовой страницы, рядом вызов google-analytics.com — до согласия 0 запросов и скрипт помечен data-ck-blocked, после «Принять всё» оживает (data-ck-restored, 1 запрос), GCM default denied уходит при parse-time. Локали в сборке ровно запрошенные; `</script` в выводе отсутствует (экранирование проверено враждебным cookieTable).
2. Размеры: en,ru — 69.0 КБ; de,fr,pl — 73.6 КБ; all(34) — 118.1 КБ.
3. Лицензия единая GPL-2.0-or-later (LICENSE = грант or-later + канонический текст GPLv2, скопированный побайтово с эталона, не набранный по памяти); package.json 0.3.0; .gitignore покрывает мусор; workflow Pages валиден.

Утверждённые решения и правки архитектора:
- Флаги --position и --language добавлены сверх исходной спецификации (спецификация была неполна: без них режим box и одноязычные сайты недостижимы).
- Отклонён вывод Агента H о падении ck-ui.js в <head>: гард `if (!document.body)` в mount() (ck-ui.js:806) уже существует. Обёртка по readyState оставлена как безвредная страховка, дезинформация из README и комментариев удалена.
- Добавлен корневой index.html (иначе GitHub Pages отдаёт 404, т.к. публикуется корень репозитория ради относительных путей demo → ../src).
- Комментарий в шапке ck-locales.js исправлен: 32 локали (было 31), копия в assets плагина пересинхронизирована.

Открытые вопросы на V1: лицензионное решение (GPL) требует подтверждения владельца, если планируется закрытая коммерческая версия; живой тест WP-плагина; реальный импорт GTM-контейнера; вычитка переводов носителями.

## Решение о лицензировании — ПЕРЕСМОТРЕНО (27.08.2026)

Владелец подтвердил: коммерческая версия будет СЕРВЕРНОЙ (кабинет, Consent Log API,
конфигуратор, Config CDN). Это меняет расклад, зафиксированный в приёмке v0.4:

- GPLv2 не имеет сетевого копилефта: закрытый сервер, общающийся с открытым клиентом
  по HTTP, — отдельная программа, не производная работа. Конфликта с закрытым бэкендом нет.
- Но по той же причине GPL не защищает от конкурента, строящего закрытый SaaS на нашем
  клиенте. Защиты не даёт, а распространение клиента тормозит — при том что массовая
  установка бесплатного клиента и есть воронка в платный сервис.

Итоговое разделение:
- `src/`, npm-пакет, `tools/`, `demo/` → **MIT** (максимум установок, ноль трения у юристов интеграторов).
- `plugins/wordpress/consentkit/` → **GPL-2.0-or-later** (требование экосистемы WordPress).
  MIT позволяет плагину включать копии клиента в assets/.
- Apache-2.0 отклонён: его патентная оговорка несовместима с GPLv2, а плагин заявляет GPLv2+.

Правообладатель консолидирован: **E-COM CONSULT PLUS** (было размытое «ConsentKit
contributors», из-за которого будущая смена лицензии требовала бы согласия каждого автора).
Введён DCO: коммиты без `Signed-off-by` не принимаются.

Репозиторий публичный (github.com/vermoh/ConsentKit) — лицензия и копирайт зафиксированы
ДО следующей отправки, пока нет сторонних коммитов и форков.

ВАЖНО: схема двойного лицензирования и разделение клиент/сервер должны быть проверены
юристом до первого платящего клиента. Настоящая запись — инженерное решение, не юридическое
заключение.

## Дополнение v0.5 — сторона карточки (принято 27.08.2026)

По запросу владельца: у layout.type = "box" сторона выбирается явно, а умолчание — ЛЕВЫЙ
нижний угол (справа внизу на сайтах обычно уже стоят виджет чата и кнопка «наверх»).

- `src/ck-ui.js`: resolveLayout для box отдаёт 'bottom-left', если позиция не 'bottom-right'.
- `tools/build-inline.mjs`: DEFAULT_POSITION.box = 'bottom-left'.
- `demo/index.html`: POSITION_BY_LAYOUT.box = 'bottom-left'.
- Плагин WordPress: новая опция consentkit_position (auto|bottom|top|bottom-left|bottom-right),
  выпадающий список в админке; несовместимая с видом позиция не передаётся в конфиг вовсе,
  чтобы применился корректный дефолт ядра. Опция добавлена в uninstall.php.
- `ready/ru-box-right.txt` — новый готовый блок для правого угла; все блоки пересобраны.

УТОЧНЕНИЕ К СТРОКЕ 149 (неточность прежнего контракта, выявлена Агентом F):
неизвестная позиция НЕ деградирует весь макет к bar/bottom. resolveLayout разрешает type и
position независимо: bar + 'bottom-left' даёт {type:'bar', position:'bottom'} — вид сохраняется,
сбрасывается только позиция. Формулировка исправлена в README.md.

Проверено архитектором в браузере: карточка слева — отступ 37px от левого края, справа —
зеркально 37px от правого; ConsentKit.config.layout.position соответствует в обоих случаях.

## Дополнение v0.6 — брендирование (принято 27.08.2026)

Опциональная секция `branding` в конфиге: `logo`, `logoDark`, `logoAlt`, `logoHeight`,
`logoUrl`, `poweredBy`. Без неё баннер идентичен прежнему (проверено инструментально).

ПРИНЦИП СДЕРЖАННОСТИ (решение владельца, зафиксировано как правило дизайна):
баннер согласия видят ВСЕ посетители сайта-клиента, и он задаёт юридический вопрос от
имени этого сайта. Марка агентства не должна переигрывать содержание:
- логотип НЕ в шапке баннера, а в подписи ВНИЗУ, под кнопками, вместе со строкой
  атрибуции (в панели настроек — допустим в шапке: это служебное окно);
- дефолтная высота логотипа снижена 24 → 18 px, потолок 48 → 32 px;
- theme.accent должен соответствовать САЙТУ-КЛИЕНТУ, а не палитре агентства;
- всё в branding выключено по умолчанию.

Безопасность: `logo` может прийти из админки WP или серверного конфига, т.е. недоверенный
ввод. Санитизация — разбор через DOMParser('image/svg+xml') и ПЕРЕСБОРКА дерева через
createElementNS по белому списку тегов/атрибутов (не усыновление разобранного дерева:
importNode активирует инлайновые обработчики при вставке). Запрещены script, foreignObject,
use/image, a, style, SMIL, любые href/xlink:href и on*. Архитектор проверил 6 атак
(svg onload, script, animate onbegin, foreignObject img onerror, xlink javascript:,
use data:) — window.__pwned не появился, опасной разметки в DOM нет, баннер работает.

ТЕХДОЛГ: брендинг увеличил все инлайн-блоки с 69 до 89 КБ, включая сборки без брендинга.
В v1 вырезать неиспользуемый код брендинга на этапе сборки (флаг --no-branding или
автоопределение по отсутствию секции в конфиге).
