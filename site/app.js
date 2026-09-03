/* ConsentKit public page — language switch, pricing render, live demo.
 *
 * No frameworks, no build step, no external requests: the page that argues for
 * privacy must not itself load a third-party font, script or beacon.
 *
 * Load order matters. index.html loads vendor/ck-core.js, ck-locales.js and
 * ck-ui.js before this file, so ConsentKit.init() below runs before the UI's
 * setTimeout(...,0) fallback mount — the first render already uses the demo
 * config instead of the core's parse-time defaults.
 */
(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════════════
     OWNER-EDITABLE CONSTANTS — the only place each value appears.
     ══════════════════════════════════════════════════════════════════ */

  // Agency enquiries. Replace CONTACT_EMAIL with the real address; the
  // pricing card's mailto: button is built from this and nothing else.
  var CONTACT_EMAIL = 'CONTACT_EMAIL';

  // Monthly price in EUR. Rendered into both the RU and EN pricing tables,
  // so the number itself lives here once and never in the copy.
  var PRICES = { free: 0, starter: 9, business: 29 };

  // Sites included per plan (null = negotiated).
  var SITE_LIMITS = { free: 1, starter: 1, business: 10, agency: null };

  var CABINET_URL = 'https://app.ecomconsult.net';

  /* ══════════════════════════════════════════════════════════════════
     i18n dictionary. One object per language; keys match data-i18n.
     ══════════════════════════════════════════════════════════════════ */

  var I18N = {
    ru: {
      htmlLang: 'ru',
      docTitle: 'ConsentKit — баннер согласия на cookie для сайта',
      docDesc: 'Баннер согласия на cookie, который блокирует трекеры до ответа посетителя. 34 языка, Google Consent Mode v2, сканер cookie и журнал согласий. Открытый код MIT.',

      skip: 'К основному содержанию',
      navSections: 'Разделы',
      pageLanguage: 'Язык страницы',
      navDemo: 'Демо',
      navHow: 'Как это работает',
      navFeatures: 'Что умеет',
      navPricing: 'Тарифы',
      navFaq: 'Вопросы',

      ctaCabinet: 'Открыть кабинет',
      ctaDemo: 'Посмотреть демо',

      heroEyebrow: 'Открытый код · MIT · без зависимостей',
      heroTitle: 'Баннер согласия, который блокирует трекеры до ответа посетителя',
      heroLine1: 'Большинство баннеров — декорация: счётчики срабатывают на первом кадре, какую бы кнопку ни нажал посетитель.',
      heroLine2: 'ConsentKit удерживает динамически вставляемые скрипты (GTM, Метрика, Meta, TikTok, Hotjar) и теги с разметкой type="text/plain" до согласия. Обычный тег <script src>, написанный прямо в HTML, нужно один раз разметить — кабинет показывает, какие именно. 34 языка и Google Consent Mode v2.',
      heroNote: 'Бесплатный тариф навсегда: один сайт, все 34 языка, один скан в день вручную.',

      demoTitle: 'Живое демо',
      demoLede: 'Это настоящий баннер на этой странице — не картинка. Меняйте режим, тему и язык, нажимайте кнопки.',
      fieldLayout: 'Режим',
      layoutBar: 'Полоса',
      layoutBox: 'Уголок',
      layoutModal: 'Окно по центру',
      fieldPosition: 'Положение',
      posTop: 'Сверху',
      posBottom: 'Снизу',
      posBottomLeft: 'Снизу слева',
      posBottomRight: 'Снизу справа',
      fieldTheme: 'Тема',
      themeAuto: 'Как в системе',
      themeLight: 'Светлая',
      themeDark: 'Тёмная',
      fieldBannerLang: 'Язык баннера',
      langAuto: 'Как на странице',
      btnShowAgain: 'Показать снова',
      demoHint: 'Сбрасывает сохранённое согласие и показывает баннер заново.',
      statusUndecided: 'Согласие не дано — баннер показан.',
      statusDecided: 'Выбор сохранён. Разрешено: {cats}.',
      statusNone: 'ничего сверх необходимого',
      statusBroken: 'Демо не загрузилось: клиент недоступен.',

      howTitle: 'Как это работает',
      how1Title: 'Вставьте строку',
      how1Text: 'Одна строка в <head> — на Tilda, WordPress, через Google Tag Manager или в обычный HTML. Сборки нет, зависимостей нет.',
      how2Title: 'Подтвердите домен',
      how2Text: 'Сначала подтверждение владения доменом — meta-тегом или записью DNS. После этого проверка установки показывает, стоит ли баннер на сайте и какие теги остались без разметки.',
      how3Title: 'Скан и таблица cookie',
      how3Text: 'Сканер обходит сайт, находит трекеры и cookie и заполняет таблицу, которую посетитель видит в настройках баннера.',

      featTitle: 'Что умеет',
      feat1Title: 'Блокировка до согласия',
      feat1Text: 'Скрипты, добавленные динамически (официальные сниппеты GTM, Метрики, Meta, TikTok, Hotjar), и теги с разметкой type="text/plain" не отправляют запрос вовсе. Обычный тег <script src>, написанный прямо в HTML, мы не даём выполниться и поставить cookie, но его сетевой запрос может уже уйти — такие теги нужно разметить вручную. Кабинет показывает, какие именно.',
      feat2Title: 'Сканер cookie',
      feat2Text: 'Обходит страницы сайта в настоящем браузере, собирает cookie и запросы к трекерам и раскладывает находки по категориям. Результат — готовая таблица cookie и список тегов, которые стоит разметить.',
      feat3Title: 'Журнал согласий',
      feat3Text: 'Каждое решение посетителя записывается: время, версия политики, выбранные категории, способ. Выгрузка в CSV на платных тарифах — на случай запроса регулятора.',
      feat4Title: '34 языка',
      feat4Text: 'Все языки ЕС и соседей: баннер сам выбирает язык по браузеру посетителя или берёт заданный вами. Тексты можно переопределить своими.',
      feat5Title: 'Google Consent Mode v2',
      feat5Text: 'Сигналы ad_storage, analytics_storage, ad_user_data и ad_personalization выставляются до загрузки тегов и обновляются при выборе. События уходят и в dataLayer для триггеров GTM.',
      feat6Title: 'WordPress, GTM, Tilda',
      feat6Text: 'Плагин для WordPress, готовый контейнер для Google Tag Manager и самодостаточный блок <script> для конструкторов, куда нельзя загружать файлы, — например для бесплатной Tilda.',

      priceTitle: 'Тарифы',
      priceLede: 'Тариф действует на организацию. Понижение тарифа не ломает сайт: баннер продолжает работать, возвращается строка о разработчике, расписание сканов останавливается.',
      priceFoot: 'Цены в евро, без НДС. Юридическое лицо — E-COM CONSULT PLUS, Литва.',
      perMonth: '/ мес',
      perSitePerMonth: 'за сайт / мес',
      byAgreement: 'по договору',
      planFree: 'Free',
      planStarter: 'Starter',
      planBusiness: 'Business',
      planAgency: 'Agency',
      planFreeNote: 'Бесплатно навсегда',
      planStarterNote: 'Каждый сайт — отдельная подписка',
      planBusinessNote: 'До 10 сайтов в организации',
      planAgencyNote: 'Без лимита сайтов',
      planCtaFree: 'Начать бесплатно',
      planCtaPaid: 'Открыть кабинет',
      planCtaAgency: 'Написать',
      recommended: 'Чаще всего берут',

      rowSites: 'Сайтов',
      rowBranding: 'Строка «Сделано в E-COM Consult»',
      rowScans: 'Сканы',
      rowLog: 'Журнал согласий',
      rowAlerts: 'Оповещения о новых трекерах',
      rowLangs: 'Языки баннера',
      rowSupport: 'Поддержка',

      sitesOne: '1',
      sitesOneEach: '1 (каждый отдельно)',
      sitesTen: 'до 10',
      sitesUnlimited: 'без лимита',
      brandingRequired: 'обязательна',
      brandingOptional: 'отключается',
      scansFree: '1 в день вручную, без расписания',
      scansStarter: 'еженедельно + 5 в день вручную',
      scansBusiness: 'еженедельно + 30 в день вручную',
      scansAgency: 'как в Business',
      logFree: '30 дней, без CSV',
      logStarter: '12 месяцев, CSV',
      logBusiness: '24 месяца, CSV',
      logAgency: '36 месяцев, CSV',
      yes: 'да',
      no: 'нет',
      langsAll: 'все 34',
      supportFree: 'документация',
      supportStarter: 'почта',
      supportBusiness: 'почта, ответ за 1 рабочий день',
      supportAgency: 'персональный менеджер',

      whoTitle: 'Для кого',
      who1Title: 'Сайты на Tilda',
      who1Text: 'Файлы загружать некуда — берите самодостаточный блок и вставляйте в «HTML-код для HEAD». Одна вставка, никаких плагинов.',
      who2Title: 'WordPress и WooCommerce',
      who2Text: 'Плагин ставится копированием папки, настройки — в админке. Работает и с кэширующими плагинами: баннер не зависит от PHP.',
      who3Title: 'Интернет-магазины',
      who3Text: 'Реклама и ремаркетинг живут по Consent Mode v2: теги получают корректные сигналы, а не отключаются целиком.',
      who4Title: 'Агентства',
      who4Text: 'Много сайтов клиентов в одном кабинете, сканы по расписанию и оповещения о новых трекерах. Условия — по договору.',

      faqTitle: 'Частые вопросы',
      faq: [
        ['Что такое согласие на cookie и зачем оно нужно?',
         'По правилам ЕС сайт может ставить cookie и запускать счётчики только после того, как посетитель об этом узнал и согласился — кроме тех, без которых сайт не работает. Согласие должно быть добровольным, отзываемым и подтверждаемым. ConsentKit спрашивает согласие, удерживает трекеры до ответа и записывает решение, чтобы его можно было показать при проверке.'],
        ['Правда ли ConsentKit блокирует всё до согласия?',
         'Честно: не всё автоматически. Скрипты, которые страница добавляет динамически (а так работают официальные сниппеты GTM, Яндекс.Метрики, Meta Pixel, TikTok, Hotjar), перехватываются целиком — запрос не уходит. Теги, размеченные вручную как type="text/plain", тоже не срабатывают. Но обычный тег <script src>, написанный прямо в HTML, браузер начинает загружать раньше, чем до него доходит наш код: мы не даём ему выполниться и поставить cookie, однако сетевой запрос может уже уйти. Такие теги нужно разметить вручную — проверка установки в кабинете показывает, какие именно.'],
        ['Где хранятся данные?',
         'На серверах в Литве, то есть в Европейском союзе. Юридическое лицо — E-COM CONSULT PLUS. Сам баннер хранит решение посетителя в его браузере (cookie и localStorage); в журнал на сервере попадают факт и параметры согласия, а не персональные данные посетителя.'],
        ['Можно ли пользоваться без кабинета?',
         'Да. Клиент открыт под лицензией MIT: скачайте файлы, положите к себе, задайте конфиг руками — платить не нужно и регистрироваться тоже. Кабинет нужен тем, кому удобнее настраивать баннер мышкой, сканировать сайт, вести журнал согласий и получать оповещения о новых трекерах.'],
        ['Как отключить строку «Сделано в E-COM Consult»?',
         'На платных тарифах — переключателем в настройках сайта; на Free строка остаётся. В открытом клиенте (MIT) строка есть в примерах конфига и убирается редактированием конфига или флагом --no-branding у генератора инлайн-блоков. Мы берём деньги за хостинг, кабинет, сканы и удобство, а не за скрытие строки.'],
        ['Что со сканированием чужих сайтов?',
         'Сканировать можно только те домены, которыми вы владеете или управляете по поручению владельца, — домен нужно подтвердить в кабинете до первого скана. Сканер уважает robots.txt, ходит с понятным User-Agent и ограничивает нагрузку. Полные условия — в кабинете, в разделе условий сканирования.']
      ],

      footLegal: 'Литва, ЕС. ConsentKit — открытый код под лицензией MIT.',
      footLinksLabel: 'Ссылки',
      footDocs: 'Инструкция по установке',
      footCabinet: 'Кабинет'
    },

    en: {
      htmlLang: 'en',
      docTitle: 'ConsentKit — cookie consent banner for your site',
      docDesc: 'A cookie consent banner that holds trackers until the visitor answers. 34 languages, Google Consent Mode v2, a cookie scanner and a consent log. Open source, MIT.',

      skip: 'Skip to main content',
      navSections: 'Sections',
      pageLanguage: 'Page language',
      navDemo: 'Demo',
      navHow: 'How it works',
      navFeatures: 'Features',
      navPricing: 'Pricing',
      navFaq: 'FAQ',

      ctaCabinet: 'Open the dashboard',
      ctaDemo: 'See the demo',

      heroEyebrow: 'Open source · MIT · zero dependencies',
      heroTitle: 'A consent banner that holds trackers until the visitor answers',
      heroLine1: 'Most banners are decoration: the trackers fire on the first frame no matter which button the visitor presses.',
      heroLine2: 'ConsentKit holds dynamically inserted scripts (GTM, Metrica, Meta, TikTok, Hotjar) and tags marked type="text/plain" until consent. A plain <script src> written straight into the HTML has to be marked once — the dashboard shows which ones. 34 languages and Google Consent Mode v2.',
      heroNote: 'Free forever: one site, all 34 languages, one manual scan per day.',

      demoTitle: 'Live demo',
      demoLede: 'This is a real banner on this page, not a screenshot. Change the layout, theme and language, and press the buttons.',
      fieldLayout: 'Layout',
      layoutBar: 'Bar',
      layoutBox: 'Corner box',
      layoutModal: 'Centred dialog',
      fieldPosition: 'Position',
      posTop: 'Top',
      posBottom: 'Bottom',
      posBottomLeft: 'Bottom left',
      posBottomRight: 'Bottom right',
      fieldTheme: 'Theme',
      themeAuto: 'Follow the system',
      themeLight: 'Light',
      themeDark: 'Dark',
      fieldBannerLang: 'Banner language',
      langAuto: 'Follow the page',
      btnShowAgain: 'Show again',
      demoHint: 'Clears the stored consent and brings the banner back.',
      statusUndecided: 'No consent yet — the banner is showing.',
      statusDecided: 'Choice saved. Allowed: {cats}.',
      statusNone: 'nothing beyond necessary',
      statusBroken: 'The demo did not load: the client is unavailable.',

      howTitle: 'How it works',
      how1Title: 'Paste one line',
      how1Text: 'A single line in <head> — on Tilda, WordPress, through Google Tag Manager or in plain HTML. No build step, no dependencies.',
      how2Title: 'Verify the domain',
      how2Text: 'First you prove you own the domain — with a meta tag or a DNS record. After that the install check shows whether the banner is live on the site and which tags are still unmarked.',
      how3Title: 'Scan and cookie table',
      how3Text: 'The scanner walks the site, finds trackers and cookies, and fills in the table your visitors see in the banner settings.',

      featTitle: 'Features',
      feat1Title: 'Blocking before consent',
      feat1Text: 'Scripts added dynamically (the official GTM, Yandex Metrica, Meta, TikTok and Hotjar snippets) and tags marked type="text/plain" never send a request at all. A plain <script src> tag written straight into the HTML is prevented from executing and setting cookies, but its network request may already be in flight — those tags have to be marked up by hand. The dashboard shows you exactly which ones.',
      feat2Title: 'Cookie scanner',
      feat2Text: 'Walks your pages in a real browser, collects cookies and tracker requests, and sorts the findings into categories. You get a ready cookie table and a list of tags worth marking up.',
      feat3Title: 'Consent log',
      feat3Text: 'Every visitor decision is recorded: timestamp, policy version, chosen categories, method. CSV export on paid plans, for when a regulator asks.',
      feat4Title: '34 languages',
      feat4Text: 'Every EU language and its neighbours: the banner picks the visitor’s browser language or the one you set. All strings can be overridden with your own.',
      feat5Title: 'Google Consent Mode v2',
      feat5Text: 'ad_storage, analytics_storage, ad_user_data and ad_personalization are set before tags load and updated on choice. Events also go to the dataLayer for GTM triggers.',
      feat6Title: 'WordPress, GTM, Tilda',
      feat6Text: 'A WordPress plugin, a ready Google Tag Manager container, and a self-contained <script> block for site builders that will not let you upload files — free Tilda, for instance.',

      priceTitle: 'Pricing',
      priceLede: 'A plan applies to the organisation. Downgrading never breaks your site: the banner keeps working, the attribution line comes back, scheduled scans stop.',
      priceFoot: 'Prices in euro, excluding VAT. Legal entity: E-COM CONSULT PLUS, Lithuania.',
      perMonth: '/ mo',
      perSitePerMonth: 'per site / mo',
      byAgreement: 'by agreement',
      planFree: 'Free',
      planStarter: 'Starter',
      planBusiness: 'Business',
      planAgency: 'Agency',
      planFreeNote: 'Free forever',
      planStarterNote: 'One subscription per site',
      planBusinessNote: 'Up to 10 sites per organisation',
      planAgencyNote: 'No site limit',
      planCtaFree: 'Start free',
      planCtaPaid: 'Open the dashboard',
      planCtaAgency: 'Get in touch',
      recommended: 'Most popular',

      rowSites: 'Sites',
      rowBranding: '“Made by E-COM Consult” line',
      rowScans: 'Scans',
      rowLog: 'Consent log',
      rowAlerts: 'New-tracker alerts',
      rowLangs: 'Banner languages',
      rowSupport: 'Support',

      sitesOne: '1',
      sitesOneEach: '1 (each billed separately)',
      sitesTen: 'up to 10',
      sitesUnlimited: 'unlimited',
      brandingRequired: 'required',
      brandingOptional: 'can be turned off',
      scansFree: '1 manual scan per day, no schedule',
      scansStarter: 'weekly + 5 per day manually',
      scansBusiness: 'weekly + 30 per day manually',
      scansAgency: 'same as Business',
      logFree: '30 days, no CSV',
      logStarter: '12 months, CSV',
      logBusiness: '24 months, CSV',
      logAgency: '36 months, CSV',
      yes: 'yes',
      no: 'no',
      langsAll: 'all 34',
      supportFree: 'documentation',
      supportStarter: 'e-mail',
      supportBusiness: 'e-mail, 1 business day',
      supportAgency: 'dedicated manager',

      whoTitle: 'Who it is for',
      who1Title: 'Tilda sites',
      who1Text: 'Nowhere to upload files — take the self-contained block and paste it into “HTML code for HEAD”. One paste, no plugins.',
      who2Title: 'WordPress and WooCommerce',
      who2Text: 'The plugin installs by copying a folder, settings live in the admin. It works with caching plugins too: the banner does not depend on PHP.',
      who3Title: 'Online shops',
      who3Text: 'Ads and remarketing run on Consent Mode v2: your tags get correct signals instead of being switched off wholesale.',
      who4Title: 'Agencies',
      who4Text: 'Many client sites in one dashboard, scheduled scans and alerts about new trackers. Terms by agreement.',

      faqTitle: 'Frequently asked questions',
      faq: [
        ['What is cookie consent and why is it needed?',
         'Under EU rules a site may set cookies and start analytics only after the visitor has been told and has agreed — except for the ones the site cannot work without. Consent must be freely given, withdrawable and demonstrable. ConsentKit asks for it, holds the trackers back until there is an answer, and records the decision so you can show it if you are asked.'],
        ['Does ConsentKit really block everything before consent?',
         'Honestly: not everything automatically. Scripts the page adds dynamically — and that is how the official GTM, Yandex Metrica, Meta Pixel, TikTok and Hotjar snippets work — are intercepted completely, so no request leaves. Tags marked by hand as type="text/plain" do not run either. But a plain <script src> tag written straight into the HTML is one the browser starts fetching before our code reaches it: we prevent it from executing and setting cookies, yet its network request may already be in flight. Those tags need manual markup — the install check in the dashboard tells you which ones.'],
        ['Where is the data stored?',
         'On servers in Lithuania, that is, in the European Union. The legal entity is E-COM CONSULT PLUS. The banner itself keeps the visitor’s decision in their browser (cookie and localStorage); what reaches the server log is the fact and parameters of the consent, not the visitor’s personal data.'],
        ['Can I use it without the dashboard?',
         'Yes. The client is open source under MIT: download the files, host them yourself, write the config by hand — no payment, no sign-up. The dashboard is for people who would rather configure the banner by clicking, scan the site, keep a consent log and get alerts about new trackers.'],
        ['How do I turn off the “Made by E-COM Consult” line?',
         'On paid plans, with a switch in the site settings; on Free the line stays. In the open-source client the line is present in the config examples and is removed by editing the config or with the --no-branding flag of the inline-block generator. We charge for hosting, the dashboard, scans and convenience — not for hiding a line.'],
        ['What about scanning sites that are not mine?',
         'You may only scan domains you own or manage on the owner’s behalf — a domain has to be verified in the dashboard before the first scan. The scanner respects robots.txt, identifies itself with a clear User-Agent and rate-limits itself. The full terms are in the dashboard, under the scanning terms.']
      ],

      footLegal: 'Lithuania, EU. ConsentKit is open source under the MIT licence.',
      footLinksLabel: 'Links',
      footDocs: 'Installation guide',
      footCabinet: 'Dashboard'
    }
  };

  /* ══════════════════════════════════════════════════════════════════
     Language state
     ══════════════════════════════════════════════════════════════════ */

  var LS_LANG = 'ck_site_lang';
  var lang = pickLang();

  function pickLang() {
    try {
      var saved = localStorage.getItem(LS_LANG);
      if (saved === 'ru' || saved === 'en') return saved;
    } catch (e) { /* private mode: fall through to navigator */ }
    var nav = '';
    try { nav = String(navigator.language || (navigator.languages || [])[0] || ''); } catch (e) {}
    return /^ru\b/i.test(nav) ? 'ru' : 'en';
  }

  function t(key) {
    var d = I18N[lang] || I18N.ru;
    var v = d[key];
    return (typeof v === 'string') ? v : (I18N.ru[key] || key);
  }

  /* ══════════════════════════════════════════════════════════════════
     Small DOM helpers
     ══════════════════════════════════════════════════════════════════ */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    // textContent throughout: every string in the dictionary is plain text and
    // some of them legitimately contain "<script src>", which must never be
    // parsed as markup.
    if (text != null) n.textContent = text;
    return n;
  }

  /* ══════════════════════════════════════════════════════════════════
     Pricing — built from PRICES / SITE_LIMITS, never from the copy
     ══════════════════════════════════════════════════════════════════ */

  function priceCell(plan) {
    var box = el('p', 'plan-price');
    if (plan === 'agency') {
      box.appendChild(el('span', 'plan-price__agreement', t('byAgreement')));
      return box;
    }
    var amount = el('span', 'plan-price__num', '€' + PRICES[plan]);
    box.appendChild(amount);
    var unit = plan === 'free' ? '' : (plan === 'starter' ? t('perSitePerMonth') : t('perMonth'));
    if (unit) box.appendChild(el('span', 'plan-price__unit', unit));
    return box;
  }

  var PLAN_ROWS = [
    ['rowSites',    { free: 'sitesOne', starter: 'sitesOneEach', business: 'sitesTen', agency: 'sitesUnlimited' }],
    ['rowBranding', { free: 'brandingRequired', starter: 'brandingOptional', business: 'brandingOptional', agency: 'brandingOptional' }],
    ['rowScans',    { free: 'scansFree', starter: 'scansStarter', business: 'scansBusiness', agency: 'scansAgency' }],
    ['rowLog',      { free: 'logFree', starter: 'logStarter', business: 'logBusiness', agency: 'logAgency' }],
    ['rowAlerts',   { free: 'no', starter: 'yes', business: 'yes', agency: 'yes' }],
    ['rowLangs',    { free: 'langsAll', starter: 'langsAll', business: 'langsAll', agency: 'langsAll' }],
    ['rowSupport',  { free: 'supportFree', starter: 'supportStarter', business: 'supportBusiness', agency: 'supportAgency' }]
  ];

  function renderPricing() {
    var host = $('#plans');
    if (!host) return;
    host.textContent = '';

    ['free', 'starter', 'business', 'agency'].forEach(function (plan) {
      var card = el('article', 'plan' + (plan === 'business' ? ' plan--featured' : ''));

      if (plan === 'business') {
        card.appendChild(el('p', 'plan-flag', t('recommended')));
      }
      card.appendChild(el('h3', 'plan-name', t('plan' + plan.charAt(0).toUpperCase() + plan.slice(1))));
      card.appendChild(priceCell(plan));
      card.appendChild(el('p', 'plan-note', t('plan' + plan.charAt(0).toUpperCase() + plan.slice(1) + 'Note')));

      var dl = el('dl', 'plan-rows');
      PLAN_ROWS.forEach(function (row) {
        dl.appendChild(el('dt', null, t(row[0])));
        dl.appendChild(el('dd', null, t(row[1][plan])));
      });
      card.appendChild(dl);

      var a = el('a', 'btn btn--sm ' + (plan === 'business' ? 'btn--primary' : 'btn--ghost'));
      if (plan === 'agency') {
        a.href = 'mailto:' + CONTACT_EMAIL;
        a.textContent = t('planCtaAgency');
      } else {
        a.href = CABINET_URL;
        a.textContent = plan === 'free' ? t('planCtaFree') : t('planCtaPaid');
      }
      card.appendChild(a);

      host.appendChild(card);
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     FAQ — native <details>, so it works with the keyboard for free
     ══════════════════════════════════════════════════════════════════ */

  function renderFaq() {
    var host = $('#faq-list');
    if (!host) return;
    host.textContent = '';
    var items = (I18N[lang] && I18N[lang].faq) || I18N.ru.faq;
    items.forEach(function (qa, i) {
      var d = el('details', 'qa');
      if (i === 0) d.open = true;
      var s = el('summary', null, qa[0]);
      d.appendChild(s);
      d.appendChild(el('p', null, qa[1]));
      host.appendChild(d);
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     Live demo
     ══════════════════════════════════════════════════════════════════ */

  var CK = null;
  try { CK = window.ConsentKit || null; } catch (e) { CK = null; }

  // 32 external locales from ck-locales.js + the two built into ck-ui.js.
  // Read at runtime so adding a locale to the client shows up here with no edit.
  function bannerLanguages() {
    var ext = [];
    try { ext = Object.keys(window.__ckLocales || {}); } catch (e) { ext = []; }
    var all = ['en', 'ru'].concat(ext).filter(function (v, i, a) { return a.indexOf(v) === i; });
    all.sort();
    return all;
  }

  // Endonyms, so the option list is readable in the language it names.
  var LANG_NAMES = {
    bg: 'Български', ca: 'Català', cs: 'Čeština', da: 'Dansk', de: 'Deutsch',
    el: 'Ελληνικά', en: 'English', es: 'Español', et: 'Eesti', fi: 'Suomi',
    fr: 'Français', ga: 'Gaeilge', hr: 'Hrvatski', hu: 'Magyar', is: 'Íslenska',
    it: 'Italiano', lt: 'Lietuvių', lv: 'Latviešu', mk: 'Македонски', mt: 'Malti',
    nb: 'Norsk bokmål', nl: 'Nederlands', no: 'Norsk', pl: 'Polski',
    pt: 'Português', ro: 'Română', ru: 'Русский', sk: 'Slovenčina',
    sl: 'Slovenščina', sq: 'Shqip', sr: 'Српски', sv: 'Svenska',
    tr: 'Türkçe', uk: 'Українська'
  };

  // resolveLayout() in ck-ui.js accepts only these; anything else silently
  // falls back, so the option list is driven off the layout rather than being
  // a free-form four-way.
  var POSITIONS = {
    bar: [['bottom', 'posBottom'], ['top', 'posTop']],
    box: [['bottom-right', 'posBottomRight'], ['bottom-left', 'posBottomLeft']],
    modal: []
  };

  var demo = {
    layout: 'bar',
    position: 'bottom',
    theme: 'auto',
    bannerLang: 'auto'
  };

  function brandingFor(l) {
    // PLAN-V1.3, owner decision 5: the Russian line for ru, English otherwise.
    var ru = l === 'ru';
    return {
      poweredBy: {
        text: ru ? 'Сделано в E-COM Consult' : 'Made by E-COM Consult',
        url: 'https://ecomconsult.net'
      }
    };
  }

  function demoConfig() {
    var l = demo.bannerLang;
    // 'auto' means "follow the visitor" in a real installation. In the demo it
    // would let the banner speak the browser's language while the page and the
    // branding line speak another — visibly inconsistent on the same screen —
    // so here 'auto' resolves to the page language and the option is labelled
    // accordingly.
    var effective = (l === 'auto') ? lang : l;
    return {
      language: effective,
      layout: { type: demo.layout, position: demo.position },
      theme: { mode: demo.theme, accent: '#2B50D8', radius: '10px' },
      branding: brandingFor(effective),
      // Off, so the demo emits no further Consent Mode updates or GTM events as
      // you click around. Note the core still writes ONE all-denied Consent Mode
      // default into window.dataLayer at parse time — that happens before
      // init() can read this flag. It is an in-memory array on a page with no
      // Google tags, so nothing is sent anywhere; the page still makes exactly
      // six same-origin requests and no external ones.
      integrations: { gcm: false, gtmDataLayer: false },
      cookieTable: cookieTable()
    };
  }

  function cookieTable() {
    var ru = lang === 'ru';
    return [
      { name: 'ck_consent', category: 'necessary', provider: 'ConsentKit',
        purpose: ru ? 'Хранит выбор посетителя, чтобы не спрашивать снова.' : 'Stores the visitor’s choice so the banner does not ask again.',
        expiry: ru ? '12 месяцев' : '12 months' },
      { name: '_ga', category: 'analytics', provider: 'Google Analytics',
        purpose: ru ? 'Пример: различает посетителей в статистике.' : 'Example: distinguishes visitors in analytics.',
        expiry: ru ? '2 года' : '2 years' },
      { name: '_fbp', category: 'marketing', provider: 'Meta',
        purpose: ru ? 'Пример: связывает визит с рекламной кампанией.' : 'Example: links the visit to an ad campaign.',
        expiry: ru ? '3 месяца' : '3 months' }
    ];
  }

  /* Re-render the banner with a new config.
   *
   * ConsentKit.init() is idempotent: after the first call it merges the config
   * into ConsentKit.config and returns WITHOUT dispatching ck:init, so the UI
   * never hears about the change. The UI's remount path is driven purely by the
   * ck:init document event, so we dispatch it ourselves with the merged config.
   * ck-ui.js then compares signature(cfg) and either remounts (layout, position,
   * language, branding, cookie table) or restyles (palette only).
   */
  function applyDemo() {
    if (!CK) return;
    try {
      CK.init(demoConfig());
      document.dispatchEvent(new CustomEvent('ck:init', {
        detail: { config: CK.config, state: CK.getState() }
      }));
    } catch (e) { /* the demo must never break the page */ }
    updateStatus();
  }

  function updateStatus() {
    var out = $('#d-status');
    if (!out) return;
    if (!CK) { out.textContent = t('statusBroken'); return; }
    var s;
    try { s = CK.getState(); } catch (e) { out.textContent = t('statusBroken'); return; }

    if (!s || !s.decided) { out.textContent = t('statusUndecided'); return; }
    var cats = s.categories || {};
    var on = ['functional', 'analytics', 'marketing'].filter(function (c) { return cats[c] === true; });
    out.textContent = t('statusDecided').replace('{cats}', on.length ? on.join(', ') : t('statusNone'));
  }

  function fillPositionSelect() {
    var sel = $('#d-position');
    var field = $('#d-position-field');
    if (!sel || !field) return;

    var opts = POSITIONS[demo.layout] || [];
    // A centred modal has no position; hiding the control is honest, and
    // [hidden] keeps it out of the accessibility tree too.
    field.hidden = opts.length === 0;
    sel.textContent = '';
    opts.forEach(function (o) {
      var n = el('option', null, t(o[1]));
      n.value = o[0];
      sel.appendChild(n);
    });
    if (opts.length) {
      var valid = opts.some(function (o) { return o[0] === demo.position; });
      if (!valid) demo.position = opts[0][0];
      sel.value = demo.position;
    }
  }

  function fillLanguageSelect() {
    var sel = $('#d-lang');
    if (!sel) return;
    var prev = demo.bannerLang;
    sel.textContent = '';

    var auto = el('option', null, t('langAuto'));
    auto.value = 'auto';
    sel.appendChild(auto);

    bannerLanguages().forEach(function (code) {
      var n = el('option', null, (LANG_NAMES[code] || code) + ' (' + code + ')');
      n.value = code;
      sel.appendChild(n);
    });
    sel.value = prev;
    if (sel.value !== prev) { sel.value = 'auto'; demo.bannerLang = 'auto'; }
  }

  function wireDemo() {
    var layout = $('#d-layout'), pos = $('#d-position'),
        theme = $('#d-theme'), dlang = $('#d-lang'), again = $('#d-again');

    if (layout) layout.addEventListener('change', function () {
      demo.layout = layout.value;
      fillPositionSelect();
      applyDemo();
    });
    if (pos) pos.addEventListener('change', function () { demo.position = pos.value; applyDemo(); });
    if (theme) theme.addEventListener('change', function () { demo.theme = theme.value; applyDemo(); });
    if (dlang) dlang.addEventListener('change', function () { demo.bannerLang = dlang.value; applyDemo(); });

    if (again) again.addEventListener('click', function () {
      if (!CK) return;
      try {
        // withdraw() clears the stored record and dispatches ck:change; the UI's
        // syncFromState() un-hides the banner. No page reload needed.
        CK.withdraw();
      } catch (e) { /* noop */ }
      updateStatus();
    });

    // The client tells us when the visitor decides, so the status line stays true.
    document.addEventListener('ck:change', updateStatus);
    document.addEventListener('ck:consent', updateStatus);
  }

  /* ══════════════════════════════════════════════════════════════════
     Page language application
     ══════════════════════════════════════════════════════════════════ */

  function setMeta(sel, value) {
    var n = $(sel);
    if (n) n.setAttribute('content', value);
  }

  function applyLang() {
    document.documentElement.lang = t('htmlLang');
    document.title = t('docTitle');
    setMeta('meta[name="description"]', t('docDesc'));
    setMeta('meta[property="og:title"]', t('docTitle'));
    setMeta('meta[property="og:description"]', t('docDesc'));
    setMeta('meta[property="og:locale"]', lang === 'ru' ? 'ru_RU' : 'en_US');
    setMeta('meta[property="og:locale:alternate"]', lang === 'ru' ? 'en_US' : 'ru_RU');

    $$('[data-i18n]').forEach(function (n) {
      var v = I18N[lang][n.getAttribute('data-i18n')];
      if (typeof v === 'string') n.textContent = v;
    });
    $$('[data-i18n-aria-label]').forEach(function (n) {
      var v = I18N[lang][n.getAttribute('data-i18n-aria-label')];
      if (typeof v === 'string') n.setAttribute('aria-label', v);
    });

    $$('.lang-btn').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === lang));
    });

    renderPricing();
    renderFaq();
    fillPositionSelect();
    fillLanguageSelect();
    // The demo's cookie table and branding line follow the page language.
    applyDemo();
  }

  function wireLangSwitch() {
    $$('.lang-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        var next = b.getAttribute('data-lang');
        if (next === lang) return;
        lang = next;
        try { localStorage.setItem(LS_LANG, lang); } catch (e) { /* private mode */ }
        applyLang();
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     Boot
     ══════════════════════════════════════════════════════════════════ */

  wireLangSwitch();
  wireDemo();

  // First init before the UI's setTimeout(...,0) fallback mount, so the very
  // first render already uses the demo layout and language.
  if (CK) { try { CK.init(demoConfig()); } catch (e) { /* noop */ } }

  applyLang();
})();
