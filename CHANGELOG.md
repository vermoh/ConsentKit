# Changelog

<!-- Generated from README.md — edit there, not here. Run `node tools/build-changelog.mjs` (or `npm run build`). -->

Client versions. The WordPress plugin tracks the same numbers and keeps
its own notes in `plugins/wordpress/consentkit/readme.txt`.

## 0.5.23

- Tracker database: **Yandex Maps and the Druid chatbot.**
  `api-maps.yandex.ru`, `maps.yandex.net` and
  `yastatic.net` → functional, the Google Maps decision made the same way: a map
  the owner embedded is a feature, and a visitor who declines functional loses
  the map and nothing else. The JS API's own telemetry
  (`log.api-maps.yandex.ru/services/logging/…`) needs no entry of its own — it
  is covered by `api-maps.yandex.ru` through suffix matching, and it is the map
  reporting about the map. `maps.yandex.net` carries the tile servers
  (`core-renderer-tiles.maps.yandex.net`) on a domain dedicated to maps.
  `yastatic.net` is the entry most likely to be mistaken for infrastructure and
  is deliberately **not** in `INFRA_DB`: unlike `tildacdn.*` it is never a
  *site's own* asset host — it serves the maps API bundle
  (`s3/front-maps-static/…/full.js`) and the cursor images, i.e. the widget's own
  code, so it is held with the widget. The same host serves Yandex share
  buttons, a feature of the same kind. There is no bare `yandex.ru`:
  `mc.yandex.ru` stays analytics in its own entry, and yandex.ru is a normal
  site.
  `druidplatform.com` and `prod-druid-apc.azureedge.net` → functional, a chat
  widget beside tawk and crisp. The bare domain covers
  `druidapi.druidplatform.com/api/services/app/Bot/LoadConfiguration`; the
  bundle host is named as the **exact host** because `azureedge.net` carries half
  of Azure's customers' own assets, and nothing broader may ever sit above it —
  `lookupHostMap` returns the first match, not the longest.
- Tracker database, measurement: `convia.dofollow.md` → analytics, a visitor
  tracker the DoFollow marketing agency runs for its clients (`convia.js` and
  `/v1/track` on `t.convia.dofollow.md`, covered by suffix); `dofollow.md` is the
  agency's own site and stays unlisted. `monolytics.app` → analytics — session
  replay and product analytics, the same class as hotjar and smartlook.
  `googleoptimize.com` → analytics: Google sunset the A/B testing tool in 2023,
  but sites still reference `optimize.js` and it still loads GA identifiers when
  they do, so it is classified rather than ignored — a dead product left in a
  page is exactly what an audit exists to surface.
- Infrastructure (§8): `media.ecom.md` and `admin.ecom.md`, the ECOM.md shop
  platform («платформа для интернет-магазина и B2B в Молдове») serving a shop
  its own media (`/swift/v1/AUTH_…/ecom_prod/media/…`) and its own content
  (`/base/gallery/all_images`, `/base/vacancies`, `/general/promotions`) — the
  same claim `forms.tildaapi.one` carries. Exact hosts; `ecom.md` itself is the
  platform's marketing site and is not added.
- **`cdn.polyfill.io` is deliberately left unclassified**, and the database now
  says so where a reader would look for it. It looks exactly like an asset CDN
  and for years it was one; the domain changed hands in 2024 and served
  malicious code to the visitors of the sites embedding it, and Google Ads
  blocks pages that load it. A host that has been used to attack visitors must
  never be waved through as infrastructure — and it gets no category either, so
  the audit keeps listing it as an unnamed third party and the owner is told it
  is there.
- **Linked domains: a site never links to itself.** An entry in
  `consent.linkedDomains` that is the page's own host, or a parent of it, is
  ignored — seen on a cabinet that listed itself: every in-page `#/…` link got
  `&ck_consent=…` appended and the hash router read it as part of the route.
  Subdomains of one site are what `consent.shareSubdomains` is for.

## 0.5.22

- **Consent Mode: `url_passthrough` and `ads_data_redaction` are on by
  default.** Both now travel with the `consent default` push the core makes at
  parse time, beside `wait_for_update: 500`. The reason is the refusal case,
  which is the case a consent tool exists for: with `ad_storage` denied there
  is no cookie to carry a Google click id, so without `url_passthrough` a
  visitor who declined loses their `gclid` the moment they follow a link to
  another page — the campaign that paid for the visit is credited to nobody,
  and the site owner concludes that asking for consent cost them their
  advertising. It did not; the default did. `ads_data_redaction` is the other
  half of the same refusal: while `ad_storage` is denied, Google strips
  identifiers out of the ad requests themselves, so a visitor who said no is
  counted in aggregate rather than followed. Neither flag stores anything, and
  neither weakens a refusal — they are what an honest refusal is supposed to
  look like on Google's side, and they ship on because the site that most
  needs them is the one that will never open the container's settings. A tag
  manager that sets its own values still wins: this is a `default`, and every
  later `update` leaves both untouched.
- **The site measures itself under its own rule.** consentkit.ecomconsult.net
  gains an analytics layer (`site/analytics.js`) built to the same standard
  the product sells: the Google Tag Manager container is not requested until
  the visitor has answered the banner — accept or decline, either is an
  answer — and until then the page asks Google for nothing at all. Campaign
  tags (`gclid`, `fbclid`, `utm_*` and the rest) are held in memory and
  appended to links leaving for the dashboard, which carries attribution
  across the domain boundary without storing anything; they reach
  `localStorage` only once consent to analytics or marketing actually
  arrives, and the first source a visitor ever came from is never overwritten
  by a later one. `window.dataLayer` is declared by the first statement on the
  page, so the events that happen before the container loads queue up rather
  than vanish. The «Разработчикам» block now says this out loud, in all three
  languages.

## 0.5.21

- **A banner language that follows the page: `language: 'page'`.** The page's
  own `<html lang>` is read first, then `navigator.language`, then `en` — each
  step through the same exact → two-letter → nothing lookup, so `<html
  lang="pt-BR">` is a Portuguese banner and the legacy Moldovan tag `mo` is
  Romanian. A `lang` that is missing, empty or names a language ConsentKit has
  no locale for is not an answer and falls through to the browser, rather than
  dropping the visitor to English.
  This is the mode for a site with real per-language URLs: on `/ro/` a visitor
  whose browser says `ru-RU` now reads a Romanian banner, which is what every
  other word on that page already said.
- **`auto` is unchanged, on purpose.** It still reads only `navigator.language`
  and still never looks at `<html lang>`. On builder-made sites that attribute
  is routinely wrong — Tilda writes one template `lang` onto every page — so
  teaching `auto` to read it would silently change the language on every
  installation already running, including the ones that are correct today. A
  third mode is opt-in; a redefined `auto` would not have been.
  Note that `'page'` sent to a client older than 0.5.21 is not recognised as a
  mode at all: it is read as a language code, matches no locale and renders
  English.
- The **debug panel** gains the same mode and a new «Language» row that names
  both the code the banner resolved to and where it came from — the page's
  `lang` attribute, the browser, or the config — which is the whole diagnosis
  for «why is this banner in the wrong language». Translated in ru, ro and en.
- `tools/build-inline.mjs` accepts `--language=page`; the WordPress plugin's
  language selector gains «Same as the page (lang attribute)».
- The **site demo** now runs `language: 'page'`, so consentkit.ecomconsult.net
  demonstrates the mode on its own `/ru/` and `/ro/` pages.

## 0.5.20

- Tracker database: **Maestra/Mindbox, the SoundCloud player, Trustindex, a
  second self-hosted Sentry.** `maestra.io` and `maestra-static.io` → marketing,
  with `mindbox.ru` and `mindbox.cloud` beside them: Maestra is the
  international brand of Mindbox, a customer-data platform whose
  `/scripts/v1/tracker.js` and `/v1.1/customer/track-visit` build a visitor
  profile for personalised offers and mailings, while `/geo/` and
  `/client-stats` are the same product's plumbing. `maestra-static.io` is the
  tracker's own script and asset host and is a separate registrable domain, so
  it is named in full — matching is plain suffix matching with no pattern form,
  which is also why both Mindbox TLDs are written out.
  `w.soundcloud.com` and `api-widget.soundcloud.com` → marketing, **subdomains
  only**: rendering the embedded player sets SoundCloud's own anonymous-id
  cookie, which its privacy policy ties to advertising measurement, so it is
  the YouTube decision rather than the Vimeo one — while `soundcloud.com`
  itself stays unclassified, because a link to a track is not an embed.
  `trustindex.io` → functional: `cdn.trustindex.io/loader.js` is the reviews
  widget an owner puts on the shop's page, and a visitor who declines
  functional loses the reviews block and nothing else.
  `sentry.asbis.io` → necessary, the **exact host only** — a self-hosted Sentry
  belonging to the ASBIS group, carrying crash reports and never a visitor
  profile. `asbis.io` is never named, because it carries the group's own sites.
- Infrastructure (§8): `code.iconify.design` and `api.iconify.design` (the icon
  CDN and its on-demand icon API — the page's own icons, the same class of asset
  as a font CDN), and `prod-cdn.prod.asbis.io`, the ASBIS group's image and
  asset CDN. None of them is a decision the visitor makes, so none carries a
  category.

## 0.5.19

- Tracker database: **the TikTok embed, Meta's CAPI parameter builder, a
  self-hosted Bitrix24 form.** `tiktok.com` → marketing, alongside the embed's
  own hosts — `tiktokcdn.com`, `tiktokcdn-eu.com`, `tiktokcdn-us.com` (assets
  and the video file), `tiktokv.eu`/`tiktokv.com` (the monitoring endpoint),
  `tiktokw.eu`/`tiktokw.com` (the web security SDK) and `ttwstatic.com` (the
  embed library). Rendering `www.tiktok.com/embed.js` sets TikTok's own
  advertising cookies before anything is played, which is the same decision a
  YouTube player asks for; every regional twin is written out in full because
  matching is plain suffix matching with no pattern form.
  `capi-automation.s3.us-east-2.amazonaws.com` → marketing, the **exact bucket
  host only**: it is Meta's client-side «CAPI Parameter Builder», which reads
  `fbclid`, `_fbp` and `_fbc` off the page for the server-side Conversions API —
  the same advertising profile as the Meta Pixel, delivered from S3.
  `amazonaws.com` is never named, because it serves ordinary site assets
  everywhere.
- Tracker database, **by path**: `/bitrix/js/crm/site/form/`,
  `/upload/crm/form/loader_` and `/upload/crm/form/app.js` → functional. An
  on-premise Bitrix24 serves the
  same CRM lead form the `bitrix24.*` cloud hosts serve, but from the company's
  own domain, where no host entry can reach it — so it is named by path, which
  matches every host including the site's own.

## 0.5.18

- Tracker database: **GrowthBook, Simpals ID, a self-hosted Sentry, Google CSP
  reports.** `growthbook.io` → functional — the SDK fetches a flag payload and
  the page renders one variant rather than another, which tailors what the
  visitor sees without building an ad profile. `simpalsid.com` → necessary
  (Simpals ID, the sign-in service of the Simpals group) and
  `newsentry.simpals.md` → necessary, the **exact host only**: it is a
  self-hosted Sentry, while `simpals.md` itself carries the group's consumer
  sites and stays unclassified — `999.md` keeps its own `functional`.
  `csp.withgoogle.com` → infrastructure, never held: it receives
  Content-Security-Policy violation reports from Google-hosted frames, which
  carry a policy, not a visitor.

## 0.5.17

- **Geo rules.** `geo: { mode: 'list', countries: ['MD', 'DE'] }` shows the
  banner only to visitors from those countries. Everyone else gets an
  all-granted page load that is deliberately **not saved** — no cookie, no
  `localStorage`, `decided: false` — so the same person visiting later from a
  country on the list is asked properly. The country comes from the
  `x-ck-country` header of the config request, read before the banner would
  render and cached alongside the config, and an unknown country always shows
  the banner. The journal gets one `method: 'geo'` record per session.
  `ConsentKit._geo` reports `{ country, inScope }`.
- **One consent across subdomains.** `consent.shareSubdomains: true` writes the
  consent cookie on the registrable domain, found by probing candidate parents
  shortest-first and keeping the first the browser accepts — which is what gets
  `.example.co.uk` right instead of stopping at the unusable `.co.uk`. Cookie
  and `localStorage` are then reconciled by the newer `ts`. Off by default, and
  with it off the cookie is written exactly as 0.5.16 wrote it.
- **One consent across separate domains.** `consent.linkedDomains: [...]` (up to
  10 hosts) appends the decision to links pointing at your other domains as a
  `#ck_consent=` fragment, and adopts one on arrival as `method: 'linked'` when
  the timestamp is within 10 minutes, the payload validates and the referrer is
  a linked host (or empty). Anything else is ignored silently; the fragment is
  stripped with `history.replaceState`, leaving the rest of the hash alone.
- The debug panel gained a country / banner-decision row and a linked-domains
  count, in all three languages.

## 0.5.16

- **Cookie purposes in the visitor's language.** `cookieTable[].purpose` now
  accepts `{ ru, ro, en, … }` as well as a plain string, resolved with the same
  chain the banner links use — language, base code, `en` — and then, unlike a
  link, falling back to the first language the object actually carries, because
  a declared cookie must not vanish for want of a translation.
- **Cookie lifetimes as a number.** `cookieTable[].expiryDays` is a count of
  days, so the «Expires» column is now written in the banner's language instead
  of quoting one fixed string: `null` or `0` reads «session», a positive number
  takes the right plural form («1 дн.», «2 zile», «20 de zile», «5 days»). The
  old `expiry` string still renders for rows that have no `expiryDays`.
- Two new dictionary keys, `expirySession` and `expiryDays`, translated in all
  34 languages.

## 0.5.15

- **Your own texts, per language.** `texts.<lang>` overrides the banner title
  and copy, the panel title and intro, and any category's title or description,
  for one language at a time. An empty field means «take the standard text», so
  a partly filled form is not a partly blank banner — see
  [Custom texts and links](#custom-texts-and-links).
- **An «Additional information» block in the settings panel.** `texts.<lang>.extraText`
  renders as a card under the categories: who the operator is, where to write,
  how long an answer takes, where to complain. It accepts a small, precisely
  defined markup subset — paragraphs, `**bold**`, links and auto-linked e-mail
  addresses — and no HTML at all: the block is built with `createElement` and
  `createTextNode`, never `innerHTML`.
- **Up to three of your own links under the banner buttons** and at the foot of
  the settings panel, via `texts.links`. Each carries a per-language label, is
  `http(s)`-only, and opens with `target="_blank" rel="noopener"`. «Learn more»
  is unaffected: a site that adds links keeps whatever `detailsAction` already
  did — except that the in-text link is dropped when it would repeat an address
  already on screen in the link row, so the same page is never linked twice.
- **The debug panel reports which language got overrides**, so «I filled in the
  text and the banner still shows the standard one» has an answer on screen —
  usually that the override is filed under a language code the banner did not
  resolve to.

## 0.5.14

- **The loader tolerates a second snippet with a dead site id.** A page that
  carries two `data-ck-id` blocks — a migration that left the old one in place —
  is driven by the snippet whose config loads; the failing one only warns. The
  strict fallback is raised solely when *every* snippet fails, never while
  another is still in flight. The same id twice (Tilda duplicates the head
  block) initialises once and warns about nothing.
- **A second copy of the script on the same page no longer replaces the first.**
  Each snippet loads the whole bundle, so a two-snippet page ran the client
  twice: the second core published a fresh, uninitialised engine over
  `window.ConsentKit` and the second UI layer mounted its own banner, leaving
  the real config applied to an engine nothing pointed at any more — a banner
  drawn from the built-in defaults. The second copy now stands down: the first
  engine keeps its state, its DOM patches and its observer, and the page mounts
  exactly one banner.

## 0.5.13

- Host database: `fbcdn.net` → marketing (Facebook SDK chunks and plugin images); `aichat.md`, `bubble.aichat.md` → functional (chat widget); `challenges.cloudflare.com` (Cloudflare challenge / Turnstile) and `i.imgur.com` → infrastructure, never held.

## 0.5.12

- **Services in the preferences panel are collapsed by default and compact.**
  The group's «N services · M cookies» line became a disclosure button; opening
  it reveals the services and the group's cookie table. Each service row is one
  line — name, vendor, switch — with the purpose, the privacy link and its
  cookie list behind a small «Details» disclosure inside the row.
- **A service in the «necessary» group has no switch.** It carries the «always
  on» badge instead, `allowedService()` is unconditionally `true` for it, and a
  refusal for such a service is stripped from the denial map on read and write.
- Tracker database: `c.bing.com`.

## 0.5.11

- The preferences panel and the floating button follow the **banner's** buttons
  by role, with no theme settings of their own: «save choice» is styled as
  `accept`, the panel's own accept and reject as `settings`, and the floating
  button takes the `accept` fill (its border colour when `accept` is `outline`).

## 0.5.10

- **A colour the site owner set is painted as set.** The 4.5:1 text rule and the
  3:1 border rule now correct only *derived* colours; an explicit `fg`, `border`
  or `onAccent` is left alone however low it measures.
- `theme.light.onAccent` — the light-mode mirror of `theme.dark.onAccent`.
- The debug panel reports the measured ratio and warns, instead of claiming a
  value was fixed automatically.

## 0.5.9

- Tracker database: +42 entries — YouTube, Vimeo, Facebook and Instagram embeds,
  chats and CRM (Freshworks, Viber, Telegram, Bitrix24, amoCRM), forms and
  scheduling (Calendly, Typeform), payments (Stripe, PayPal, paynet.md, MAIB),
  Sentry, 999.md. Vercel and Netlify are classified as infrastructure.
- The debug panel is honest about Consent Mode: "no cookies, but the page
  address and browser type are sent".

## 0.5.8

- **Services** (`services`): a site declares individual third parties, each of
  which gets its own toggle inside its category group in the panel, with its own
  vendor, purpose, privacy link and cookies. A visitor can accept a category and
  still refuse one service; the refusal survives the group being switched off
  and on again. Refusals are stored in `ck_consent` as `services: { id: false }`
  and, in SaaS mode, reported in the beacon's `services` field.
- `ConsentKit.allowedService(id)`.

## 0.5.7

- Placeholders for blocked embeds: a card in place of a held-back video or map,
  with an "Allow and show" button that grants just that category
  (`blocking.placeholders`, on by default).
- `#ck-settings` in a page address opens the preferences panel;
  `ConsentKit.openSettings()` is safe to call before the UI has mounted.
- `texts.detailsAction: "declaration"` and `texts.declarationUrl`.

## 0.5.6

- The attribution line follows the banner's language
  (`branding.poweredBy.texts`).

## 0.5.5

- Banner and panel texts rewritten in plain language (ru, ro, en).

## 0.5.4

- Database: Google Maps is `functional`; Tilda platform services and
  `fonts.google.com` are infrastructure; Google Ads pings
  (`/pagead/1p-user-list`, `/ads/ga-audiences`) are `marketing`.

## 0.5.3

- The banner re-resolves the page font after full load (on Tilda a reload from
  cache left the banner in Times), and falls back to the system stack when the
  page font cannot be determined.

## 0.5.2

- The banner takes its font from the page's real text rather than from `body`.

## 0.5.1

- Database: general CDNs (gstatic.com, aspnetcdn.com, kxcdn.com, jsDelivr,
  cdnjs, unpkg, CloudFront and others) are infrastructure, not trackers; Google
  reCAPTCHA is `necessary`; Searchanise and iuteCredit are `functional`.

## 0.5.0

- **The theme engine.** `theme.font` (the banner takes the site's font by
  default, `'system'` restores the old stack), `theme.radius: { card, button }`
  in px, and `theme.buttons` — variant, background, text, border and border
  width per button. Accept and reject are always equal in size, weight and
  variant, by construction. Contrast is checked automatically: text below 4.5:1
  and borders below 3:1 are corrected.
- `texts.policyUrl` and `texts.detailsAction` (`policy` / `settings` / `hide`):
  «Learn more» now does something. Before 0.5.0 it was `<a href="#">` with no
  handler — any site on 0.4.x or earlier has a dead link.
- The corner card gained its reference geometry: up to 540px wide, 24px padding,
  buttons in a row with an 8px gap and stacked on narrow screens.

## 0.4.1

- Infrastructure list (`ConsentKit._infra()`): builder CDNs, Google Fonts and
  captcha, never intercepted by strict mode.
  `static.cloudflareinsights.com` is deliberately excluded — it is analytics.

## 0.4.0

- **Strict mode** (`blocking.mode: 'strict'`): before consent, any third-party
  script or iframe that is not same-site, allow-listed or in the built-in
  allowlist is held back and filed as `marketing`.
- `ConsentKit._extendHostDb()` and the `hostdb` config key.
- `<iframe src>` is intercepted, not just scripts.

## 0.3.6

- Branding moved to `src/ck-ui-branding.js`, so `--no-branding` drops the code
  as well as the config (~26 KB off a block).

## 0.3.5

- **Server-side tracker markup in the WordPress plugin, on by default** — the
  one case the browser engine cannot cover. The database shipped to PHP is
  generated from `src/ck-core.js`, and a test fails when the two drift.
- The debug panel became a lazily-loaded file behind a ~5 KB loader.

## 0.3.2

- The GTM container is no longer blocked: tags inside it obey Consent Mode, and
  blocking the container breaks that. `/gtag/js` is still blocked by path.
