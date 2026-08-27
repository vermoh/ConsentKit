# ConsentKit → Google Tag Manager

Готовый пакет для GTM: триггеры, переменные и два тега-примера, которые запускаются
только после согласия пользователя на соответствующую категорию.

## Зачем это нужно

ConsentKit сам решает, что можно грузить, но теги внутри GTM ему неподконтрольны —
контейнер GTM исполняет их по своим правилам. Пакет связывает две системы:
ядро ConsentKit пушит события в `dataLayer`, а GTM использует их как условие запуска тегов.

```
Выбор пользователя
        │
        ▼
  ConsentKit (ядро)
        │  push в window.dataLayer
        ├──► gtag('consent','update', …)      → Consent Mode v2 для Google-тегов
        ├──► { event: 'ck_consent_update',    → переменные ck_consent.*
        │      ck_consent: {…}, ck_method }
        └──► { event: 'ck_consent_analytics' } → Custom Event триггер
             { event: 'ck_consent_marketing' }        │
             { event: 'ck_consent_functional' }       ▼
                                                  Ваши теги
```

Порядок пушей гарантирован ядром: при включённом `integrations.gcm` (по умолчанию)
`ck_consent_update` всегда уходит раньше, чем события категорий. Значит, в момент
срабатывания триггера переменные `ck_consent.*` уже заполнены.

## Предусловие

**Сниппет ConsentKit должен стоять ВЫШЕ сниппета GTM** — иначе теги успеют
сработать до того, как ядро выставит `consent default: denied`, и блокировка
потеряет смысл.

```html
<head>
  <!-- 1. Сначала ConsentKit -->
  <script src="/consentkit/ck-core.js"></script>
  <script src="/consentkit/ck-locales.js"></script>
  <script src="/consentkit/ck-ui.js"></script>
  <script>ConsentKit.init({ /* ваш конфиг */ });</script>

  <!-- 2. Только потом GTM -->
  <script>(function(w,d,s,l,i){ /* стандартный сниппет GTM */ })(window,document,'script','dataLayer','GTM-XXXXXXX');</script>
</head>
```

`ck-core.js` включает блокировку и пушит `consent default` ещё на этапе парсинга,
до `init()` — поэтому важен именно порядок тегов `<script>`, а не порядок вызовов.

## Импорт контейнера

1. GTM → **Admin** (Администрирование) → **Import Container**.
2. Выберите файл `container-import.json` из этой папки.
3. Workspace: `Existing` (обычно Default Workspace) или новый.
4. Import option: **Merge** (не Overwrite — иначе сотрёте свои теги),
   при конфликте имён — **Rename conflicting tags, triggers, and variables**.
5. Просмотрите превью изменений и подтвердите импорт.
6. Откройте тег «GA4 Configuration (пример)» и замените `G-XXXXXXX` на свой
   Measurement ID — либо удалите тег, если у вас уже настроен свой GA4.
7. Опубликуйте версию контейнера.

Заглушки `accountId` / `containerId` = `"0"` в файле — норма для импорта:
GTM подставляет реальные идентификаторы вашего контейнера.

## События: что и когда стреляет

| Событие (`event`) | Когда стреляет | Триггер в контейнере |
|---|---|---|
| `ck_consent_analytics` | согласие на категорию `analytics` — сразу после выбора и при восстановлении согласия на новой странице | ConsentKit — Analytics granted |
| `ck_consent_marketing` | согласие на категорию `marketing` — там же | ConsentKit — Marketing granted |
| `ck_consent_functional` | согласие на категорию `functional` — там же | ConsentKit — Functional granted |
| `ck_consent_update` | при любом изменении согласия, включая отзыв и отказ | (триггера в пакете нет — используется для заполнения переменных) |

Событие категории уходит **не более одного раза за загрузку страницы**.
Если пользователь сначала разрешил только analytics, а затем в той же сессии
принял всё — `ck_consent_marketing` и `ck_consent_functional` придут, а
`ck_consent_analytics` повторно не отправится.

Триггер «Functional granted» намеренно не привязан ни к одному тегу в пакете —
он заготовлен для ваших собственных тегов (чат, виджет отзывов и т.п.).

## Переменные: что внутри

Все четыре — Data Layer Variable, версия 2. Заполняются из объекта `ck_consent`
в событии `ck_consent_update`.

| Переменная в GTM | Путь в dataLayer | Значение |
|---|---|---|
| `DLV - ck_consent.necessary` | `ck_consent.necessary` | всегда `true` |
| `DLV - ck_consent.functional` | `ck_consent.functional` | `true` / `false` |
| `DLV - ck_consent.analytics` | `ck_consent.analytics` | `true` / `false` |
| `DLV - ck_consent.marketing` | `ck_consent.marketing` | `true` / `false` |

Рядом в событии приходит `ck_method` — `accept_all`, `reject_all` или `custom`
(при желании заведите для него ещё одну DLV-переменную).

Переменные нужны для **отчётности и дополнительных условий** — например, чтобы
передать статус согласия в аналитику или различить сценарии в других тегах.
Решение «запускать или нет» принимает событие, а не переменная.

## Как привязать свои теги

1. Откройте свой тег → **Triggering** → выберите
   `ConsentKit — <Категория> granted`.
2. Уберите у тега триггер `All Pages` / `Initialization`, иначе он сработает
   до согласия и обойдёт всю схему.
3. Дополнительно в теге: **Advanced Settings → Consent Settings →
   Require additional consent for tag to fire**, укажите нужный тип
   (`analytics_storage` для аналитики, `ad_storage` для рекламы).
   Это второй, независимый рубеж защиты — он работает даже если триггер настроен неверно.

Не добавляйте в Custom Event триггер условие вида
`{{DLV - ck_consent.analytics}} equals true`: событие само по себе уже означает
согласие, а лишнее условие только добавляет точку отказа.

Если тег должен работать при согласии на любую из нескольких категорий —
добавьте ему несколько триггеров, GTM объединит их по «или».

## Consent Mode v2

Ядро ConsentKit управляет Consent Mode самостоятельно:

- при загрузке страницы (parse-time) пушит `consent default` со всеми сигналами
  `denied` и `wait_for_update: 500`;
- после выбора пользователя — `consent update` с актуальными значениями
  (`analytics` → `analytics_storage`; `marketing` → `ad_storage`, `ad_user_data`,
  `ad_personalization`; `functional` → `functionality_storage`,
  `personalization_storage`).

**Для Google-тегов (GA4, Google Ads, Floodlight) ничего дополнительно настраивать
не нужно** — они читают состояние Consent Mode автоматически.

В GTM достаточно включить обзор согласий: **Admin → Container Settings →
Enable consent overview** (значок щита в списке тегов). Это включает колонку
проверки согласий и не меняет поведение тегов.

> **Важно:** не подключайте в GTM шаблон CMP и не добавляйте второй пуш
> `consent default` — Consent Mode принимает `default` только один раз, а второй
> вызов либо игнорируется, либо перетирает состояние. Источник истины один: ядро ConsentKit.

## Ограничения

- **События приходят только при `granted`.** Отказ и отзыв согласия событий не
  генерируют — теги просто не стартуют. Это осознанное решение: «нет события» и
  есть запрет.
- **Отзыв не выгружает уже сработавшие теги.** GTM не умеет останавливать тег,
  который уже отработал. После `ConsentKit.withdraw()` ядро чистит известные
  cookie и шлёт `consent update` со всеми `denied`, но код тега остаётся в
  памяти страницы. Полная чистота наступает **со следующей загрузки страницы**.
- **Одно событие на категорию за загрузку.** Тег с триггером на категорию
  сработает один раз за страницу. Для тегов, которые должны срабатывать
  повторно (например, отслеживание событий), используйте свои триггеры и
  дополнительно проверяйте `{{DLV - ck_consent.analytics}}` (переменная доступна
  при включённом `integrations.gcm` — см. следующий пункт).
- **Событий нет, если `integrations.gtmDataLayer: false`** в конфиге ConsentKit.
- **Переменные `ck_consent.*` заполняются только при `integrations.gcm !== false`.**
  Событие `ck_consent_update` пушится внутри той же ветки, что и Consent Mode, —
  при `gcm: false` оно не уходит, и все четыре переменные остаются `undefined`.
  Триггеры категорий при этом работают как обычно: они зависят только от
  `gtmDataLayer`. Если вы выключили `gcm` и вам нужны переменные — опирайтесь
  на события, а не на `ck_consent.*`.

## Проверка

Убедитесь, что до согласия теги не стреляют:

1. В GTM нажмите **Preview**, введите адрес сайта, дождитесь открытия Tag Assistant.
2. **Откройте страницу в режиме инкогнито** или предварительно выполните в консоли
   `ConsentKit.withdraw()` — иначе сработает сохранённое ранее согласие и баннер не появится.
3. На шаге `Container Loaded` / `DOM Ready` посмотрите вкладку **Tags**:
   теги пакета должны быть в разделе **Tags Not Fired**.
4. Проверьте вкладку **Consent** (нужен включённый consent overview): при загрузке
   должен быть виден `consent default` со всеми `denied`.
5. Нажмите в баннере «Принять всё». В левой колонке Tag Assistant появятся новые
   события: сначала `ck_consent_update`, затем `ck_consent_analytics`,
   `ck_consent_marketing`, `ck_consent_functional`.
6. Выберите событие `ck_consent_analytics` → **Tags** → тег GA4 теперь
   в **Tags Fired**. На вкладке **Variables** значение
   `DLV - ck_consent.analytics` = `true`.
7. Сценарий отказа: перезагрузите страницу, нажмите «Отклонить всё» —
   событий категорий не появится, все теги остаются в **Tags Not Fired**,
   придёт только `ck_consent_update`.

Дополнительно то же самое видно в консоли браузера:

```js
window.dataLayer.filter(function (e) {
  return e && String(e.event || '').indexOf('ck_consent') === 0;
});
```

## Файлы

| Файл | Назначение |
|---|---|
| `container-import.json` | импортируемый экспорт контейнера (exportFormatVersion 2) |
| `README.md` | этот документ |
