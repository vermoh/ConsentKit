=== ConsentKit ===
Contributors: consentkit
Tags: gdpr, cookie banner, consent, privacy, consent mode
Requires at least: 6.0
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.5.23
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A GDPR cookie banner that blocks trackers before they load. Prototype — not yet production-hardened.

== Description ==

ConsentKit is a zero-dependency cookie consent banner. Unlike banners that only
record a choice, it actually prevents tracker scripts from executing until the
matching category is granted.

**This is a prototype.** It implements the consent flow end to end and is useful
for evaluation and development, but it has not been through a legal review, a
security audit, or large-scale production testing. Do not treat it as a
compliance guarantee for your site.

How the blocking works:

* Scripts marked up manually as `<script type="text/plain" data-ck="analytics" data-src="...">`
  are only materialized after consent for that category.
* Tracker tags written directly into the page are rewritten into that same
  markup **on the server**, before the HTML is sent, so the browser never
  requests them. This is on by default and covers 148 known tracker hosts and
  14 path rules.
* Scripts injected by other code are intercepted automatically when their URL
  matches the same built-in database of known tracker domains (Google
  Analytics, Facebook, Yandex Metrica, Hotjar, TikTok, chat widgets).
* Google Consent Mode v2 signals are sent as `denied` at parse time and updated
  after the visitor decides. Note that Consent Mode is not by itself a block: a
  Google tag running under denied signals sets no cookies, but still sends
  cookieless pings carrying the page address, referrer and browser type. The
  blocking above is what stops a tag from running at all.

Other features:

* Three layouts: bar, compact box, centered modal.
* Light, dark and automatic theme modes.
* 34 built-in locales; unknown languages fall back to English.
* Preferences panel with per-category toggles and a cookie table.
* Keyboard accessible: focus trap, Esc to close, ARIA roles on toggles.

= Limitations =

* The server-side markup only knows the hosts in the built-in database, and it
  does not rewrite inline scripts — an inline tracker snippet still needs
  manual markup or a GTM trigger.
* The tracker database is a snapshot (148 hosts, 14 path rules) and matches by
  domain. Trackers served from your own domain or from an unlisted vendor need
  manual `data-ck` markup.
* Scripts that already executed cannot be unloaded. After a withdrawal the page
  must be reloaded for a clean state — this is a browser limitation and applies
  to every consent tool.
* Consent is stored in a first-party cookie plus localStorage. There is no
  server-side consent log, so it does not by itself satisfy record-keeping
  obligations.
* The plugin does not scan your site to discover cookies; the cookie table is
  filled in by hand.

== Installation ==

1. Copy the `consentkit` folder into `wp-content/plugins/`.
2. Activate the plugin through the Plugins screen.
3. Go to Settings → ConsentKit and configure categories, layout, theme and the
   cookie table.

The banner scripts are printed directly into `<head>` at the earliest available
hook, because the blocking engine has to install itself before any other script
on the page can inject a tracker.

== Frequently Asked Questions ==

= How do I let visitors change their choice later? =

Place the shortcode `[consentkit_settings]` in a footer widget or a page. It
renders a link that reopens the preferences panel. Custom label:
`[consentkit_settings text="Manage cookies"]`.

Where a shortcode is not available — a theme menu, an external page — a plain
link to `#ck-settings` does the same thing without any code: any address on the
site ending in that fragment opens the preferences panel, and the fragment is
removed afterwards so a reload does not reopen it. A small round button in the
corner of the screen also appears on its own once a choice has been made.

= How do I check that the blocking actually works? =

Open any page of your site with `?ck_debug=1` appended to the address. A debug
panel appears in the corner listing what the engine is holding back, which
tracker requests actually left the page (each marked before or after consent),
and the Consent Mode signals that were sent. It is local to your browser,
sends nothing anywhere, and reports cookie names without their values. Turn it
off with `?ck_debug=0`.

The panel itself is not shipped to visitors: the plugin enqueues a small loader
that fetches it only when someone opens a page with that flag.

= I updated my privacy policy. How do I ask for consent again? =

Raise the "Policy version" value in the settings. Every stored consent that
carries a different version is discarded and the banner is shown again.

= What is "server-side tracker markup" and should I leave it on? =

Leave it on. The browser engine has always caught trackers *injected* by other
JavaScript. What it could never catch is a tracker tag written straight into
the page's HTML: the browser starts downloading it before the first line of
ConsentKit runs, and that gap cannot be closed from the browser at all. The
server runs before the parser by definition, so the plugin rewrites those tags
in the finished HTML instead. Turn it off only if it interferes with a page
builder — there is also a separate option to skip logged-in editors.

= Does it work with a caching plugin? =

Yes, and in the right order. The rewriting happens at the PHP level while the
page is generated, so the caching plugin stores the already-rewritten HTML and
every cache hit is served with the trackers blocked.

= How do I exclude one specific tag from the server-side markup? =

Add `data-ck-ignore` to it. Tags you already marked up by hand
(`type="text/plain"` with `data-ck`) and ConsentKit's own scripts are skipped
automatically. The GTM container (`gtm.js`) is deliberately never blocked: the
tags inside it obey Consent Mode, and blocking the container breaks that.

= Why does my tracker still load? =

It is probably not in the automatic database. Convert its tag to manual markup:
change `type="text/javascript"` to `type="text/plain"`, add
`data-ck="analytics"` (or `marketing` / `functional`) and move the `src` value
into `data-src`.

= Does this make my site GDPR compliant? =

No. It is one technical building block. Compliance also depends on your privacy
policy, your legal basis, your processors and your record keeping.

== Screenshots ==

1. Consent banner in bar layout.
2. Preferences panel with per-category toggles and the cookie table.
3. Settings → ConsentKit admin screen.

== Changelog ==

= 0.5.23 =
* Tracker database: Yandex Maps -> functional, on api-maps.yandex.ru (the JS
  API, and its own telemetry log.api-maps.yandex.ru through the same entry),
  maps.yandex.net (the tile servers) and yastatic.net. A map the owner embedded
  is a feature: declining functional costs the visitor the map and nothing else.
  yastatic.net is NOT infrastructure — it is never a site's own asset host, it
  serves the maps API bundle and the Yandex share buttons, so it is held with
  the widget whose code it is. yandex.ru is never named: mc.yandex.ru stays
  analytics in its own entry, and yandex.ru itself is a normal site.
* Tracker database: the Druid chatbot -> functional — druidplatform.com (the
  bot's configuration API) and the exact host prod-druid-apc.azureedge.net (the
  widget's bundle). azureedge.net must never be named bare: it carries half of
  Azure's customers' own assets.
* Tracker database: convia.dofollow.md -> analytics (the DoFollow agency's
  visitor tracker, convia.js and /v1/track; the agency's own site dofollow.md
  stays unlisted), monolytics.app -> analytics (session replay and product
  analytics, the hotjar class) and googleoptimize.com -> analytics (Google
  sunset the A/B tool in 2023, but sites still reference optimize.js and it
  still loads GA identifiers, so it is classified rather than ignored).
* Infrastructure: media.ecom.md and admin.ecom.md — the ECOM.md shop platform
  serving a shop its own media and its own content. Exact hosts; ecom.md itself
  is the platform's marketing site and is not added.
* cdn.polyfill.io stays deliberately unclassified and is documented as such in
  the database. The domain changed hands in 2024 and served malicious code to
  visitors; it must never be waved through as infrastructure, and leaving it
  uncategorised is what keeps the audit reporting it to the owner.

= 0.5.22 =
* Google Consent Mode: url_passthrough and ads_data_redaction are now set by
  default, alongside the existing wait_for_update. They matter when a visitor
  DECLINES: with ad storage denied there is no cookie to carry a Google click
  id, so without url_passthrough the click id is lost between one page and the
  next and the ad campaign that paid for the visit is credited to nobody.
  ads_data_redaction is the other half — while ad storage is denied, Google
  strips identifiers out of its ad requests. Neither stores anything and
  neither weakens a refusal. If your tag manager already sets these values,
  it still wins: these are defaults, and later consent updates leave them be.

= 0.5.21 =
* Banner language: a new "Same as the page (lang attribute)" option. The banner
  takes its language from the page's own <html lang> first, and only falls back
  to the visitor's browser language when the page sets none or names a language
  ConsentKit has no locale for. This is the setting for a multilingual site: a
  Romanian page now greets a visitor with a Russian browser in Romanian.
* "Auto (browser language)" is unchanged and still ignores the lang attribute.
  Many themes and builders mis-tag it, so reading it automatically would change
  the language on sites that are correct today. The new option is opt-in.
* The debug panel reports which language the banner resolved to and where it
  came from: the page's lang attribute, the browser, or the settings.

= 0.5.20 =
* Tracker database: maestra.io and maestra-static.io -> marketing, with
  mindbox.ru and mindbox.cloud beside them. Maestra is the international brand
  of Mindbox, a customer-data platform: its tracker.js and
  /v1.1/customer/track-visit build a visitor profile for personalised offers and
  mailings, and /geo/ and /client-stats are the same product's plumbing. The
  static host and both Mindbox TLDs are named in full, because matching is by
  suffix with no pattern form.
* Tracker database: w.soundcloud.com and api-widget.soundcloud.com -> marketing,
  subdomains only. The embedded player sets SoundCloud's own anonymous-id cookie
  on render, which its privacy policy ties to advertising measurement — the same
  decision a YouTube player asks for. soundcloud.com itself stays unclassified:
  a link to a track is not an embed.
* Tracker database: trustindex.io -> functional (the reviews widget rendered on
  the shop's own page; declining functional costs the visitor the reviews block
  and nothing else, and it builds no advertising profile).
* Tracker database: sentry.asbis.io -> necessary, the exact host only. A
  self-hosted Sentry belonging to the ASBIS group — crash reports, never a
  visitor profile. asbis.io itself must never be named, as it carries the
  group's own sites.
* Infrastructure: code.iconify.design and api.iconify.design (the icon CDN and
  its on-demand icon API, the page's own icons) and prod-cdn.prod.asbis.io (the
  ASBIS group's image and asset CDN). Not consent decisions, so no category.

= 0.5.19 =
* Tracker database: the TikTok video embed -> marketing, host by host
  (tiktok.com plus the tiktokcdn/tiktokcdn-eu/tiktokcdn-us asset and video
  hosts, tiktokv.eu/.com monitoring, tiktokw.eu/.com security SDK and
  ttwstatic.com). Rendering the embed sets TikTok's own advertising cookies,
  the same decision as a YouTube player; each regional twin is named in full
  because matching is by suffix with no pattern form.
  capi-automation.s3.us-east-2.amazonaws.com -> marketing, the exact bucket host
  only (Meta's client-side CAPI Parameter Builder, which reads fbclid/_fbp/_fbc
  and feeds the server-side Conversions API; amazonaws.com itself must never be
  named, as it serves ordinary site assets everywhere).
* Tracker database, by path: /bitrix/js/crm/site/form/ and
  /upload/crm/form/loader_ -> functional. A self-hosted Bitrix24 serves the same
  CRM lead form as the bitrix24.* cloud, but from the company's own domain,
  where no host entry can reach it.

= 0.5.18 =
* Tracker database: growthbook.io -> functional (GrowthBook feature flags and
  A/B testing; the flag fetch decides which variant the page renders, and builds
  no advertising profile). simpalsid.com -> necessary (Simpals ID, the sign-in
  service of the Simpals group). newsentry.simpals.md -> necessary, the exact
  host only (a self-hosted Sentry; simpals.md itself carries the group's
  consumer sites and stays unclassified, and 999.md stays functional).
  csp.withgoogle.com -> infrastructure, never held (Content-Security-Policy
  violation reports from Google-hosted frames; not a visitor, so not a consent
  decision).

= 0.5.17 =
* Geo rules: geo = { mode: 'list', countries: ['MD','DE'] } shows the banner
  only to visitors from those countries. Everyone else gets an all-granted page
  load that is deliberately NOT saved — no cookie, no localStorage — so the same
  person visiting later from a listed country is asked properly. An unknown
  country always sees the banner. One journal record per session, method 'geo'.
* One consent across subdomains: consent.shareSubdomains writes the consent
  cookie on the registrable domain, so shop.example.com and blog.example.com
  share a decision. Off by default; with it off the cookie is written exactly as
  0.5.16 wrote it.
* One consent across separate domains: consent.linkedDomains (up to 10 hosts)
  carries the decision in the link the visitor clicks and adopts it on arrival
  as method 'linked' — only when it is under 10 minutes old, validates, and
  comes from a linked referrer or none. Anything else is ignored silently.
* Debug panel: a country / banner-decision row and a linked-domains count.

= 0.5.16 =
* Cookie purposes in the visitor's language: cookieTable[].purpose accepts
  { ru, ro, en, ... } as well as a plain string. Resolved by banner language,
  then its two-letter base, then en, then the first language present — a
  declared cookie is never hidden for want of a translation.
* Cookie lifetimes as a number: cookieTable[].expiryDays is a count of days, so
  the "Expires" column is written in the banner's language. null or 0 reads
  "session"; a positive number takes the right plural form. Rows with no
  expiryDays still show their old expiry string.
* Two new dictionary keys, expirySession and expiryDays, in all 34 languages.

= 0.5.15 =
* Your own texts per language: texts.<lang> overrides the banner title and copy,
  the panel title and intro, and any category's title or description. An empty
  field means "take the standard text".
* New "Additional information" block in the settings panel (texts.<lang>.extraText):
  operator details, where to write, how long an answer takes, where to complain.
  Small markup subset — paragraphs, **bold**, links, auto-linked e-mail — and no
  HTML: built with createElement/createTextNode, never innerHTML.
* Up to three of your own links under the banner buttons and at the foot of the
  settings panel (texts.links), each with a per-language label, http(s) only,
  opened with target="_blank" rel="noopener". "Learn more" is unaffected.
* The debug panel reports which language received text overrides.

= 0.5.14 =
* The loader tolerates a second snippet with a dead site id: the page is
  driven by the snippet whose config loads; strict fallback only when every
  snippet fails.
* A second copy of the script on the same page no longer replaces the first:
  the second core kept overwriting window.ConsentKit with a fresh, uninitialised
  engine and the second UI layer mounted a second banner from the built-in
  defaults. The second copy now stands down and the page mounts exactly one
  banner, driven by the config the first engine was given.

= 0.5.13 =
* Host database: fbcdn.net (Facebook SDK chunks and plugin images) is marketing,
  aichat.md and bubble.aichat.md (chat widget) are functional,
  challenges.cloudflare.com (Cloudflare challenge / Turnstile) and i.imgur.com
  are infrastructure and never held.

= 0.5.12 =
* Services in the preferences panel are collapsed by default and compact: the
  group's "N services / M cookies" line is now a disclosure button, and each
  service row is one line (name, vendor, switch) with its purpose, privacy link
  and cookie list behind a small "Details" disclosure.
* A service in the "necessary" group has no switch at all - it carries the
  "always on" badge instead, and a refusal for such a service is never stored.
* Tracker database: c.bing.com.

= 0.5.11 =
* The preferences panel now follows the banner's buttons: "Save choice" is
  styled as "Accept all", the panel's other buttons as "Customize", and the
  floating button takes the "Accept all" colours.

= 0.5.10 =
* A colour set by the site owner is painted as set: the 4.5:1 text rule (and
  3:1 for borders) no longer repaints chosen colours, only derived ones.
* The debug panel warns about low contrast and reports the measured ratio
  instead of claiming the value was corrected automatically.

= 0.5.9 =
* Tracker database: +42 entries - YouTube, Vimeo, Facebook and Instagram, chats
  and CRM (Freshworks, Viber, Telegram, Bitrix24, amoCRM), forms and scheduling
  (Calendly, Typeform), payments (Stripe, PayPal, paynet.md, MAIB), Sentry,
  999.md. Vercel and Netlify are treated as infrastructure.
* The debug panel is more honest about Consent Mode: "no cookies, but the page
  address and browser type are sent".
* The preferences panel's close button is aligned with the toggles.

= 0.5.8 =
* Services in the preferences panel: inside each category group, a list of
  services (name, vendor, purpose, privacy link) with its own toggle and its
  own cookies; the group header shows "N services, M cookies".
* A visitor can switch off one service while leaving its category on: its
  requests are held back and its cookies are deleted.
* The debug panel no longer jumps to the top on refresh, and explains each
  "before consent" row in words.

= 0.5.7 =
* Placeholders in place of blocked videos and maps, with an "Allow and show"
  button; a `#ck-settings` link opens the preferences panel; "Learn more" can
  point at a cookie declaration page.

= 0.5.6 =
* The "Made by ..." line follows the banner's language: the server can supply
  `poweredBy.texts` per language.

= 0.5.5 =
* Banner and preferences texts rewritten in plain language (ru, ro, en).

= 0.5.4 =
* Database: Google Maps is functional; Tilda platform services
  (feeds/geo/members.tildaapi.one, tildacdn.one) and fonts.google.com are
  infrastructure; Google Ads pings (/pagead/1p-user-list, /ads/ga-audiences)
  are marketing.

= 0.5.3 =
* The banner re-resolves the page font after the page has fully loaded (on
  Tilda a reload from cache left the banner in Times).
* When the page font cannot be determined, the banner uses the system font
  rather than inheriting from body.

= 0.5.2 =
* The banner takes its font from the page's real text rather than from body
  (sites that set fonts per block were getting Times).

= 0.5.1 =
* Database: general CDNs (gstatic.com, aspnetcdn.com, kxcdn.com, jsdelivr,
  cdnjs, unpkg, cloudfront and others) are infrastructure, not trackers;
  Google reCAPTCHA is necessary; Searchanise (site search) and iuteCredit are
  functional.

= 0.5.0 =
* Client 0.5.0: banner appearance. `theme.font` - the banner takes the site's
  font by default (`inherit`), with the previous system stack available as
  `font: 'system'`. `theme.radius: { card, button }` in pixels (0-32, default
  16 and 8). `theme.buttons` - variant, background, text, border and border
  width separately for "Accept all", "Reject all" and "Customize"; accept and
  reject are always identical in size, weight and variant. Contrast is checked
  automatically: text below 4.5:1 against its background becomes white or dark,
  and a border is brought to 3:1 against the card, so an unreadable pair of
  buttons cannot be configured.
* New `texts.policyUrl` and `texts.detailsAction` (`policy` / `settings` /
  `hide`): "Learn more" opens the policy in a new tab, opens the cookie
  settings, or is not shown at all. Previously this link led nowhere
  (`href="#"`).
* The corner card gained its reference geometry: up to 540px wide, 24px
  padding, 20/700 heading, buttons in a row with an 8px gap and stacked on
  narrow screens.

= 0.4.1 =
* Client 0.4.1: the infrastructure list (`ConsentKit._infra()`) - CDNs and
  static hosts of site builders (Tilda, Wix, Shopify, Squarespace, Webflow),
  Google Fonts and captcha. Strict mode never holds these back, so builders'
  dynamic modules keep working. `static.cloudflareinsights.com` is deliberately
  excluded: it is Cloudflare's analytics and is blocked as analytics.

= 0.4.0 =
* Client 0.4.0: strict blocking mode (`blocking.mode: 'strict'`) - before
  consent, every third-party script and iframe is held back except same-site,
  allowed hosts and the built-in list; whatever is intercepted is filed as
  marketing. Such rows are labelled `strict` in the debug panel.
* Client 0.4.0: `ConsentKit._extendHostDb()` - the tracker database can be
  extended at runtime (in SaaS mode from the site's settings, before init).
* The core now intercepts `<iframe>` as well as scripts.
* Server-side markup (`includes/rewrite.php`) still marks up known hosts only:
  strict mode applies to tags the page inserts dynamically.

= 0.3.6 =
* Client 0.3.6: the branding code moved to a separate file, ck-ui-branding.js
  (enqueued by the plugin before ck-ui.js).

= 0.3.5 =
* **Server-side tracker markup (on by default).** The plugin now rewrites
  `<script src>` tags of known trackers in the page HTML into
  `type="text/plain" data-ck="<category>" data-ck-src="…"`, and `<iframe src>`
  of known hosts into `data-src`, before the page is sent. This closes the one
  case the browser engine could not cover — tags written directly into the
  HTML, which the parser requests before any script of ours runs. Skips
  ConsentKit's own assets, tags carrying `data-ck-ignore`, tags already marked
  up by hand, inline scripts, and anything inside comments, `<pre>` or
  `<textarea>` — note that a real tag written in `<pre>` is left untouched in
  the HTML but may still be intercepted by the browser engine at runtime, since
  the browser parses it as a script regardless. On any error the page is
  returned unchanged.
* New settings: "Серверная разметка трекеров" (on by default) and an option to
  skip logged-in editors, for page builders.
* The tracker database shipped to PHP (`includes/hostdb.php`, ~70 hosts) is
  generated from `src/ck-core.js` by `tools/export-hostdb.mjs`, so the server
  and the browser always classify a host identically.
* Client updated to 0.3.5: the debug panel is now lazily loaded — the plugin
  ships a ~5 KB loader that fetches the panel only when a page is opened with
  `?ck_debug=1`, instead of shipping the ~33 KB panel to every visitor.
* Banner attribution line ("Сделано в E-COM Consult" / "Made by E-COM Consult").

= 0.3.0 =
* First WordPress packaging of the ConsentKit prototype.
* Settings page: categories, language, layout, banner position, theme mode,
  accent, policy version, cookie table.
* Banner position is selectable per layout: bottom or top for the bar, bottom
  left or bottom right for the box. "Automatic" leaves the choice to the core.
* `[consentkit_settings]` shortcode.
* dataLayer events per granted category for Google Tag Manager triggers.

== Upgrade Notice ==

= 0.5.10 =
Colours you set in the settings are now applied exactly as entered. If you had
picked a colour that the previous version silently corrected for contrast, the
banner will now show your colour and report the measured ratio in the debug
panel instead.

= 0.5.0 =
The banner now takes your site's font by default instead of a fixed system
stack, so it may look different after updating. The previous behaviour is
available as `theme.font: 'system'`.

= 0.3.5 =
Adds server-side tracker markup, on by default: tracker tags written into your
theme are now blocked before the browser can request them. Review Settings →
ConsentKit after updating.

= 0.3.0 =
Initial release of the prototype.
