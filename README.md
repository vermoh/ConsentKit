# ConsentKit

![status: prototype v0.5](https://img.shields.io/badge/status-prototype%20v0.5-orange)
![license: MIT](https://img.shields.io/badge/license-MIT-blue)
![dependencies: 0](https://img.shields.io/badge/dependencies-0-brightgreen)
![no build step](https://img.shields.io/badge/build-none-lightgrey)

GDPR cookie consent for the web: consent state, a blocking engine that stops
trackers *before* they run, a Shadow DOM banner, and Google Consent Mode v2.

Most cookie banners are decoration — the trackers fire on the first frame no
matter which button you press. ConsentKit blocks at parse time: nothing but
`necessary` runs until the visitor says so. Dynamically injected trackers (the
official Metrika / GTM / Meta / TikTok / Hotjar snippets) and anything marked
`type="text/plain"` never fire a request; a plain `<script src>` tag written
into the HTML is prevented from executing and setting cookies, but its network
request may already be in flight — mark such tags up manually.

Vanilla ES2020, zero dependencies, no build step.

- **Categories:** `necessary` (always on), `functional`, `analytics`, `marketing`
- **Blocking:** manual markup (`type="text/plain"`) plus automatic interception
  of dynamically injected scripts. Plain `<script src>` tags written into the HTML
  (e.g. a direct GA4 `gtag/js` tag) cannot be intercepted before the request
  leaves — mark those up manually; the SaaS install check points at the exact tag
- **UI:** banner (`bar` / `box` / `modal`), preferences panel, floating re-open
  button, light/dark, 34 locales
- **SSR-safe:** importing on the server never touches the DOM
- **Equal-weight buttons, no pre-ticked boxes** — the consent invariants are
  fixed by design, see [CONTRIBUTING.md](https://github.com/vermoh/ConsentKit/blob/main/CONTRIBUTING.md)

> **Status: prototype (v0.5.24).** The core, the UI and the demo are verified in
> a browser and covered by an automated suite (`npm test`); several distribution
> paths are not yet tested against live systems. See
> [Project status](#project-status) before shipping this to production.

**Не программист?** Пошаговая инструкция по-русски, с картинками и разбором по
кликам: **[INSTALL.ru.md](https://github.com/vermoh/ConsentKit/blob/main/INSTALL.ru.md)**.

## Install

Four ways to add ConsentKit to a site, from simplest to most integrated.

| # | Method | Best for | Docs |
|---|---|---|---|
| 0 | **Prebuilt block** — copy one file from `ready/` into `<head>`, nothing to install | Tilda and other site builders; no developer needed | [`ready/README.md`](https://github.com/vermoh/ConsentKit/blob/main/ready/README.md) |
| 1 | **Script tags** — copy `src/` to your server, three `<script>` tags in `<head>` | Any site you control | [Quickstart below](#quickstart--script-tags) |
| 2 | **npm** — `npm install @ecomconsult/consentkit` | Bundled apps, React | [Quickstart below](#quickstart--npm) |
| 3 | **WordPress plugin** — copy the plugin folder to `wp-content/plugins/`; rewrites static tracker tags server-side | WordPress / WooCommerce | [`plugins/wordpress/consentkit/`](https://github.com/vermoh/ConsentKit/tree/main/plugins/wordpress/consentkit) |
| 4 | **Google Tag Manager** — import the container, trigger tags on consent events | Sites already running GTM | [`integrations/gtm/README.md`](https://github.com/vermoh/ConsentKit/blob/main/integrations/gtm/README.md) |

```sh
npm install @ecomconsult/consentkit
```

Or drop the files in directly — no bundler required.

Site builders that will not let you upload files (free Tilda and similar) need a
single self-contained `<script>` block instead; the repository ships a generator
for that, and loading ConsentKit from a third-party CDN is deliberately *not*
recommended — the CDN would receive the visitor's IP before any consent exists.

## Quickstart — script tags

Load order is contractual. `ck-core.js` starts blocking at parse time, so it
must come first and should not be deferred.

```html
<script src="/consentkit/src/ck-core.js"></script>
<script src="/consentkit/src/ck-locales.js"></script><!-- optional: extra languages -->
<script src="/consentkit/src/ck-ui-branding.js"></script><!-- optional: logo / attribution -->
<script src="/consentkit/src/ck-ui.js"></script>
<script>
  ConsentKit.init({
    policyVersion: '1',
    language: 'auto',
    layout: { type: 'box', position: 'bottom-left' },
    theme: { accent: '#2B50D8', mode: 'auto' }
  });
</script>
```

## Quickstart — npm

The main entry is a side-effect import: it loads the core, the locales and the
UI, then re-exports the API.

```js
import ConsentKit from '@ecomconsult/consentkit';

ConsentKit.init({
  policyVersion: '1',
  layout: { type: 'bar', position: 'bottom' },
  theme: { accent: '#2B50D8', mode: 'auto' }
});

if (ConsentKit.allowed('analytics')) {
  // start analytics
}
```

CommonJS works too:

```js
const ConsentKit = require('@ecomconsult/consentkit');
ConsentKit.init({ policyVersion: '1' });
```

Named exports are available alongside the default:

```js
import { init, allowed, getState, accept, rejectAll, withdraw, show } from '@ecomconsult/consentkit';
```

### Core without the UI

`@ecomconsult/consentkit/core` loads the consent engine and blocking only — no banner, no
locales. Use it when you ship your own interface.

```js
import ConsentKit from '@ecomconsult/consentkit/core';

ConsentKit.init({ policyVersion: '1' });
ConsentKit.accept({ analytics: true, marketing: false });
```

### Import it once

`@ecomconsult/consentkit` is a side-effect module and the core is a singleton on the global
object. Import it at your entry point; importing it again elsewhere is harmless
but does not create a second instance.

## React

`react` is an optional peer dependency (`>=17`) — install it yourself.
`useConsent()` subscribes to the event bus and unsubscribes on unmount.

```jsx
import '@ecomconsult/consentkit';   // side effect: core + locales + UI
import { useConsent } from '@ecomconsult/consentkit/react';

function CookieStatus() {
  const { state, allowed, accept, rejectAll, withdraw, show } = useConsent();

  if (!state.decided) return <p>Waiting for a choice…</p>;

  return (
    <div>
      <p>Analytics: {allowed('analytics') ? 'on' : 'off'}</p>
      <button onClick={() => accept('all')}>Accept all</button>
      <button onClick={() => accept({ analytics: true })}>Analytics only</button>
      <button onClick={rejectAll}>Reject all</button>
      <button onClick={withdraw}>Withdraw consent</button>
      <button onClick={show}>Cookie settings</button>
    </div>
  );
}
```

Only mount the analytics-dependent part once consent exists:

```jsx
function Analytics() {
  const { allowed } = useConsent();
  if (!allowed('analytics')) return null;
  return <Tracker />;
}
```

### Server rendering

`useConsent()` returns `decided: false`, all opt-in categories `false`, and
no-op actions on the server, then re-renders with the real state after
hydration. Guard on `state.decided` rather than assuming a value on first paint.

## Configuration

Pass any subset to `init()`. Nested objects merge with the defaults.

| Key | Type | Default | Notes |
|---|---|---|---|
| `policyVersion` | `string \| number` | `"1"` | Bump to invalidate stored consent and re-show the banner |
| `language` | `string` | `"auto"` | `"auto"` reads `navigator.language`; `"page"` (v0.5.21) reads the page — `<html lang>`, then the first path segment, then `og:locale`, then the browser (v0.5.24); or a fixed code. Falls back `pt-BR` → `pt` → `en` — see [Banner language](#banner-language) |
| `layout.type` | `"bar" \| "modal" \| "box"` | `"bar"` | `box` is a corner card, up to 540px wide |
| `layout.position` | `string` | per type | `bar`: `bottom` (default) / `top`. `box`: `bottom-left` (default) / `bottom-right`. `modal` is always centred. A position that does not belong to the chosen type falls back to that type's default; the type itself is unaffected |
| `theme.accent` | `string` | `"#2B50D8"` | Exposed as `--ck-accent` |
| `theme.font` | `"inherit" \| "system"` | `"inherit"` | v0.5.0. `inherit` takes the host page's font family; `system` restores the pre-0.5.0 system stack. Font *sizes* are fixed either way |
| `theme.radius` | `{ card, button }` | `{ card: 16, button: 8 }` | v0.5.0. px, clamped 0–32. A bare string or number is the pre-0.5.0 form and still sets the card radius |
| `theme.buttons` | `{ accept, reject, settings }` | see below | v0.5.0. Per-button appearance. A colour you set is painted as set; contrast rules correct only derived colours (v0.5.10) — see [Button appearance](#button-appearance) |
| `theme.mode` | `"auto" \| "light" \| "dark"` | `"auto"` | `auto` follows `prefers-color-scheme` |
| `theme.dark` | `{ bg, ink, accent, onAccent }` | built-in | Overrides the dark palette |
| `theme.light` | `{ onAccent }` | built-in | v0.5.10. The light mirror of `theme.dark`. An `onAccent` set here is the filled buttons' text colour for light mode, painted as given |
| `texts.policyUrl` | `string` | — | v0.5.0. Cookie policy address. `http(s)` only; anything else is ignored |
| `texts.detailsAction` | `"policy" \| "settings" \| "hide" \| "declaration"` | see notes | v0.5.0, `declaration` in v0.5.7. What «Learn more» does. Defaults to `policy` when `policyUrl` is set, `settings` when it is not. `policy` or `declaration` without a usable URL falls back to `settings` rather than rendering a dead link |
| `texts.declarationUrl` | `string` | — | v0.5.7. Address of the cookie declaration page, used by `detailsAction: "declaration"`. `http(s)` only. Filled by the hosted service; the client only reads it |
| `texts.<lang>` | `object` | — | v0.5.15. Per-language dictionary overrides, keyed by a language tag (`ru`, `ro`, `en`, `pt-br`, …). Overridable keys: `bannerTitle`, `bannerText`, `panelTitle`, `panelIntro`, `extraTitle`, `extraText`, and `cat.<necessary\|functional\|analytics\|marketing>.title` / `.desc`. An empty string falls through to the standard text; every other key is ignored — see [Custom texts and links](#custom-texts-and-links) |
| `texts.links` | `object[]` | `[]` | v0.5.15. Up to 3 links under the banner buttons and at the foot of the settings panel: `{ id, url, label: { ru, ro, en, … } }`. `url` is `http(s)` only; a row with no resolvable label or an unusable address is skipped. Does not affect `detailsAction`, except that «Learn more» is hidden when its `policy` / `declaration` URL repeats one of these links — see [Custom texts and links](#custom-texts-and-links) |
| `categories.*.enabled` | `boolean` | `true` | Per category: `functional`, `analytics`, `marketing`. Hides the toggle when `false` |
| `consentTtlDays` | `number` | `365` | Lifetime of the stored decision |
| `integrations.gcm` | `boolean` | `true` | Google Consent Mode v2 signals |
| `integrations.gtmDataLayer` | `boolean` | `true` | Push consent events to `window.dataLayer` |
| `blocking.mode` | `"known" \| "strict"` | `"known"` | `strict` also holds back unknown third-party scripts and iframes — see [Strict mode](#strict-mode) |
| `blocking.allow` | `string[]` | `[]` | Hosts strict mode must never intercept. Matched by suffix, so `partner.com` also covers `cdn.partner.com` |
| `blocking.placeholders` | `boolean` | `true` | v0.5.7. Draw a card in place of an embed held back before consent — see [Placeholders for blocked embeds](#placeholders-for-blocked-embeds). `false` restores the pre-0.5.7 behaviour: the frame is still blocked, just invisible |
| `consent.shareSubdomains` | `boolean` | `false` | v0.5.17. Write the consent cookie on the registrable domain, so `shop.example.com` and `blog.example.com` share one decision — see [One consent across domains](#one-consent-across-domains) |
| `consent.linkedDomains` | `string[]` | `[]` | v0.5.17. Up to 10 hosts (no scheme) that belong to you. A click on a link to one of them carries the visitor's decision across in the URL fragment — see [One consent across domains](#one-consent-across-domains) |
| `geo.mode` | `"all" \| "list"` | `"all"` | v0.5.17. `list` shows the banner only to visitors from `geo.countries`; everyone else gets an unsaved all-granted page load — see [Geo rules](#geo-rules) |
| `geo.countries` | `string[]` | `[]` | v0.5.17. ISO-3166-1 alpha-2 codes, matched case-insensitively. Only read when `geo.mode` is `"list"` |
| `hostdb` | `Record<string, Category>` | — | Extra `host: category` pairs merged into the tracker database, applied before the initial scan. SaaS mode fills this from the service; `ConsentKit._extendHostDb()` does the same at any later point |
| `cookieTable` | `CkCookieTableEntry[]` | `[]` | Declared cookies, listed per category in the panel. v0.5.16: `purpose` may be a per-language object and `expiryDays` a number of days — see below |
| `services` | `CkService[]` | `[]` | v0.5.8. Third-party services the site declares. Each gets its own toggle inside its category group in the panel, and can be refused individually — see [Services](#services). At most 50 |
| `branding` | `object` | absent | v0.3.5. The attribution line (and optional logo) at the foot of the banner, rendered by `src/ck-ui-branding.js`. Absent from the defaults: omit the key and nothing renders — see [Branding](#branding) |

`cookieTable` entries:

```js
{ name: '_ga', category: 'analytics', vendor: 'Google', purpose: 'Visit statistics', expiry: '2 years' }
```

**Since v0.5.16** two fields on that row can carry the visitor's language
instead of one fixed string:

```js
{
  name: '_ga',
  category: 'analytics',
  vendor: 'Google',
  // A string still works exactly as before. An object is resolved per language.
  purpose: { ru: 'Статистика посещений', ro: 'Statistici de vizitare', en: 'Visit statistics' },
  // Days, as a number. `null` or `0` means a session cookie.
  expiryDays: 730,
  // Kept for clients older than 0.5.16; ignored when `expiryDays` is present.
  expiry: '2 года'
}
```

- **`purpose: string | { ru?, ro?, en?, <lang>? }`.** An object is resolved with
  the same chain `branding.poweredBy.texts` and `texts.links[].label` use, plus
  one extra step: **banner language → its two-letter base (`pt-BR` → `pt`) →
  `en` → the first non-empty value in the object.** That last step is why a
  cookie row differs from a link: a link with no label for this language is
  skipped, but a cookie must still be declared, so the operator's own words are
  shown in whatever language they exist rather than nothing at all. A plain
  string renders as it always did; a number, an array or an object that is empty
  in every language renders an empty cell (`—`).

- **`expiryDays?: number | null`.** A whole number of days. `null` or `0`
  renders the localised word for a session cookie (`сессия` / `sesiune` /
  `session`); a positive number renders localised plural forms (`2 дн.` /
  `2 zile` / `2 days`). When `expiryDays` is **absent** the old `expiry` string
  is shown; when both are present `expiryDays` wins. Anything that is not a
  whole number ≥ 0 is treated as absent.

A row written before 0.5.16 renders as it did, with one deliberate exception: a
cell that resolves to nothing now shows the same `—` an absent field has always
shown. So `purpose: ''`, `expiry: ''` and a non-string `expiry` (a bare number,
say) draw an em dash where 0.5.15 drew a blank or a raw value.

Both keys are translated in all 34 languages. The hosted service writes
`purpose` objects and `expiryDays` into generated configs from 0.5.16 onwards,
and keeps writing `expiry` as well so that an older inline copy of the client
still shows something.

### Banner language

`language` takes one of three values:

- **`"auto"`** (default) — the visitor's browser, from `navigator.language`.
- **`"page"`** (v0.5.21) — the **page** decides. This is the mode for a site
  with real per-language URLs (`/ru/`, `/ro/`): a Romanian page then greets a
  visitor with a Russian browser in Romanian.
- **a language code** — `"de"`, `"pt-BR"`, that language always.

**What `"page"` reads, in order** (v0.5.24):

1. **`<html lang>`** — the explicit declaration, and it always wins.
2. **the first path segment**, when it names a language — `/ru/…`, `/ro`,
   `/en/about`. Only a plain two-letter code (or one the locale table carries
   verbatim, like `pt-br`) counts, so `/ruby/` is not Russian and
   `/engineering/` is not English.
3. **`<meta property="og:locale">`** — `ro_RO` → `ro`.
4. **`navigator.language`**.
5. **`en`**.

Every step is checked against the locales the build actually ships, so a source
naming a language this build has no locale for is no answer at all and falls
through to the **next** source — never straight to English. A page at `/xx/`
with `og:locale` `ro_RO` resolves to Romanian.

**Give each page an `<html lang>` anyway.** Steps 2 and 3 are a safety net for
sites that cannot — they exist because real sites switch language by path and
ship a bare `<html>` — but the attribute is the one signal that is unambiguous,
costs nothing, and is read first by ConsentKit, by screen readers and by search
engines alike.

**`"page"` follows a `lang` that changes later** (v0.5.24). An app that sets
`document.documentElement.lang` from its own language switch after the banner
has rendered — a single-page app, typically — gets a banner that rebuilds in the
new language, with the settings panel reopened in it if it was open. Only in
`"page"` mode; `"auto"` and a fixed code install no observer at all.

In every case the lookup falls back `pt-BR` → `pt` → `en`, and the legacy
Moldovan tag `mo` is read as `ro` — on the path (`/mo/`) as well as everywhere
else.

**`"auto"` deliberately does not look at `<html lang>`.** On builder-made sites
that attribute is routinely wrong — Tilda, for instance, writes one template
`lang` onto every page, so a Romanian page announces itself as Russian — and
teaching `auto` to read it would silently change the banner on every site
already running, including the many where it is correct today. That is why
`page` is a third mode rather than a new meaning for the old one.

> `"page"` needs client **0.5.21 or newer**. An older client does not recognise
> it as a mode, reads it as a language code, matches no locale and renders
> English.

### Services

**v0.5.8.** A `services` row names one third party: where its resources come
from, which cookies it sets and what it is for. The preferences panel lists it
inside its category group with **its own toggle**, so a visitor can accept
analytics in general and still refuse one particular service.

```js
services: [{
  id: 'hotjar',                                   // stable, ^[a-z0-9-]{1,64}$
  name: 'Hotjar',
  vendor: 'Hotjar Ltd',
  category: 'analytics',
  hosts: ['hotjar.com'],                          // suffix-matched, like the tracker database
  paths: ['/hotjar-'],                            // optional, substring-matched
  cookies: ['_hjSession', '_hjSessionUser'],      // names; matched against cookieTable
  privacyUrl: 'https://www.hotjar.com/privacy/',  // http(s) only
  purpose: { ru: '…', ro: '…', en: 'Records how visitors move around the page.' },
  enabled: true                                   // false: not shown, not blocked separately
}]
```

**How the list is laid out (v0.5.12).** A group's «N services · M cookies» line
is a disclosure **button**, and it is **collapsed by default** — eight services
no longer push the switches the visitor came for off the screen. Opening it
reveals the group's services and, at the end, the group's own «Which cookies
(N)» table. Each service is **one line**: name, vendor, and its switch on the
right. Everything else — the purpose, the privacy link, «Cookies it sets (N)» —
lives behind that row's own small «Details» disclosure. Both controls are real
focusable controls with a visible focus ring, and both are translated in ru, ro
and en (every other language falls back to en, as elsewhere).

A group with **no services** is unchanged from 0.5.7: no counter, no disclosure,
and its cookie table sits at the top level where it always did.

**A service in the `necessary` group gets no switch** (v0.5.12). That group
cannot be refused, so a control that could only ever sit at «off» would be
telling the visitor something untrue — the «always on» badge is rendered in its
place. `allowedService(id)` answers `true` for such a service unconditionally,
and a refusal for one is stripped from the denial map on every read and write,
including a record written by hand or by an older client.

What the toggle does:

- **Group off** — every service of that group is off and blocked, as before.
- **Group on** — the services come back, *except* the ones the visitor switched
  off by hand. A refusal survives the group being switched off and on again.
- A refused service's resources are held back exactly as if its category had no
  consent, and its cookies are deleted exactly as on a category withdrawal.
- The «Allow and show» button on a blocked embed's placeholder grants the
  category **and** clears the refusal on that frame's service.

`hosts` need not already be in the tracker database: `init()` folds them into
the block map under the row's own category, so a service host ConsentKit has
never heard of is still held back.

Refusals are stored in `ck_consent` as `services: { '<id>': false }` — denials
only. An id absent from the map is allowed, subject to its category. A
`necessary` service is never in the map.

### Button appearance

Each of the three banner buttons can be styled independently:

```js
theme: {
  accent: '#2B50D8',
  font: 'inherit',
  radius: { card: 16, button: 8 },
  buttons: {
    accept:   { variant: 'filled' },                        // accent fill
    reject:   { variant: 'filled' },                        // always matches accept
    settings: { variant: 'outline', borderWidth: 1 }        // accent border
  }
}
```

Each entry takes `variant` (`"filled"` or `"outline"`), and optionally `bg`,
`fg`, `border` and `borderWidth` (`1` or `2`). Omitted colours come from
`theme.accent`.

**Accept and reject are always equal.** They render at the same size and weight,
and they always share one variant — if the two disagree in the config,
`accept.variant` is used for both. A reject button that looks weaker than
accept is a dark pattern, and consent collected through one is not freely
given, so the config simply cannot express it. `settings` is independent and
may itself be filled.

**A colour you set is painted as you set it; contrast rules decide only the
colours you left to us.** Since v0.5.10 the **4.5:1** text rule and the **3:1**
border rule apply to *derived* values — the automatic text on a filled button,
the border and text an `outline` button takes from `theme.accent`, the link
colour read off the accent. A `fg`, `border` or `onAccent` you wrote yourself
is never repainted, however low it measures: the debug panel reports the ratio
and warns that it is below the recommended floor (for example, "contrast 4.32 —
below the recommended 4.5"), and the choice stays yours. Concretely:

- a `fg` you set is painted as set and only measured against the fill behind
  it; the *derived* text on a filled button still becomes white or `#161616`,
  whichever contrasts more, when it would fall under 4.5:1;
- a `border` you set on an `outline` button is painted as set; a border
  *derived* from `theme.accent` is darkened (light card) or lightened (dark
  card) in small steps until it clears 3:1 against the card, so a default theme
  can never produce a button invisible against its own card;
- an outline button's text, when you did not set one, is that resolved border
  colour put through the same 4.5:1 rule — derived even when the border it came
  from was yours.

The card is `#ffffff` in light mode and `#1c1c1e` in dark. A colour the
arithmetic cannot read — a CSS colour name, an `rgb()` string — is left exactly
as you wrote it rather than being silently replaced.

**The preferences panel follows the banner, with no settings of its own**
(v0.5.11): the panel's «save choice» button is styled as `accept`, the panel's
own accept and reject as `settings`, and the floating button takes the
`accept` button's fill
(its border colour when `accept` is `outline`), while the category and service
switches keep `theme.accent`.

The same arithmetic is exposed as pure functions on `ConsentKit._contrast`
(`relativeLuminance`, `contrastRatio`, `ensureContrast`, `stepToContrast`,
`resolveButtonStyles`, `resolveRadius`, `resolveFont`, `resolveDetails`,
`buildThemeCss`) so a theme editor can show the same numbers the banner paints
instead of reimplementing them. It is present whenever `src/ck-ui.js` is loaded,
and it is safe to call in Node — nothing in it touches the DOM. The debug
panel's **Appearance** section reads it directly and reports each button's
resolved colours, its contrast ratio, and either that a derived value was
adjusted or that a value you set measures below the recommended floor. Each
resolved record carries `ratio` and `adjusted`, plus `low` (painted text under
4.5:1) and, for outline buttons, `borderRatio`, `borderAdjusted` and
`borderLow` (border under 3:1).

### The «Learn more» link

`texts.detailsAction` decides what the link at the end of the banner copy does:

| Value | Renders |
|---|---|
| `"policy"` | A link to `texts.policyUrl`, opened with `target="_blank" rel="noopener"` |
| `"settings"` | A button that opens the preferences panel |
| `"hide"` | Nothing at all |
| `"declaration"` | v0.5.7. A link to `texts.declarationUrl` — the cookie declaration page — opened the same way as `policy` |

The default follows `policyUrl`: `policy` when one is set, `settings` when it
is not — so supplying only a URL does the obvious thing. `declarationUrl`
deliberately does *not* affect that default: a site that gains a declaration
address keeps whatever «Learn more» already did until it asks for the change.

Both link forms accept `http(s)` addresses only. A `javascript:` or `data:` URL
in a control the visitor is invited to click is an XSS vector, so anything else
is refused and the link degrades to `settings`.

Since 0.5.15 both link forms are also dropped for a render whose `texts.links`
already show the same address, so the banner never links one page twice — see
[`texts.links`](#textslinks--your-own-links).

> Before 0.5.0 this control was rendered as `<a href="#">` with no handler at
> all: clicking it jumped to the top of the page and nothing else. Any site
> running 0.4.x or earlier has a dead «Learn more» link.

### Custom texts and links

Since 0.5.15 the banner and the panel can carry your own words, per language,
and up to three of your own links. This exists because a cookie banner in some
jurisdictions has to name the operator and say where a data subject may
complain — that is a legal requirement, not decoration, and it does not fit in
any of the built-in sentences.

#### `texts.<lang>` — dictionary overrides

A key under `texts` is treated as a language dictionary when — and only when —
it looks like a language tag, matching `/^[a-z]{2}(-[a-z]{2})?$/`. That is what
keeps `policyUrl`, `detailsAction`, `declarationUrl` and `links` out of it; no
scalar setting under `texts` is ever two letters.

Overridable keys, and nothing else:

| Key | Where it shows |
|---|---|
| `bannerTitle` | The banner's heading |
| `bannerText` | The banner's paragraph |
| `panelTitle` | The settings panel's heading |
| `panelIntro` | The line under it |
| `extraTitle` | Heading of the «Additional information» block (defaults to a translated «Additional information» in all 32 languages) |
| `extraText` | Body of that block. **Empty in every dictionary** — the block renders only when you supply text |
| `cat.<name>.title` / `.desc` | One category's name and description, for `necessary`, `functional`, `analytics`, `marketing` |

Anything else — `acceptAll`, `more`, `save`, an unknown key — is ignored. The
button labels are what a visitor recognises across sites, and the plural tables
are arrays that a string override would break.

Values are merged in three layers, in this order, each winning over the one
before it:

```
built-in dictionary  ←  window.__ckLocales  ←  config.texts[lang]
```

For the last layer the exact resolved code is tried first, then its two-letter
base: a banner that resolved to `pt-br` reads `texts['pt-br']`, then
`texts['pt']`. **A non-empty string wins; an empty string, a missing key or a
non-string falls through to the layer below.** That is what makes an empty field
in an editor mean «use the standard text» rather than «show nothing».

Every value is treated as **text, never as HTML**, everywhere.

#### The markup subset for `extraText`

`extraText` is the one field with structure, because an operator block genuinely
is two or three paragraphs with an address and a link in them. The rules below
are the whole contract — the hosted service's validator mirrors them exactly,
so what the cabinet previews is what the banner paints:

1. **Paragraphs.** A blank line (two newlines) starts a new paragraph. Each
   paragraph becomes one `<p>`.
2. **Line breaks.** A single newline inside a paragraph becomes a `<br>`.
3. **Three passes, in this exact order.** The order is part of the contract,
   not an implementation detail:
   1. **`[label](url)` links.** Tokenised first, and their pieces are never
      seen by the later passes. This is what stops the bare-URL rule from
      eating the address inside `[label](https://…)`, stops the bare-e-mail
      rule from firing inside a `mailto:` label, and leaves a `**` inside a
      link label literal.
   2. **`**bold**`**, over the text between those links.
   3. **Bare addresses**, inside each bold and each plain span: a bare
      `https://` or `http://` URL, and a bare e-mail address, each becoming its
      own label.
   Bold must come *before* the bare addresses, not after: `**mail@example.md**`
   is one bold run that happens to contain an address, and linking the address
   first would split the run and leave the asterisks visible on screen.
4. **What the passes produce.** Every link — `[label](https://…)`,
   `[label](mailto:…)`, a bare URL, a bare e-mail — is rendered with
   `target="_blank" rel="noopener"`. `**bold**` becomes `<strong>`, and an
   address inside it is bold *and* clickable. There is no nesting the other
   way: `**` inside a `[label](…)` stays literal, because pass 1 removed the
   whole link before pass 2 ran. An unclosed `**` is two literal asterisks,
   never a bold tail that swallows the paragraph.
5. **Any other scheme is not a link.** `[x](javascript:…)`, `data:`, `file:` —
   the *whole literal* `[x](javascript:…)` is rendered as plain text, so a
   mistake is visible to whoever wrote it rather than silently swallowed.
6. **No HTML.** `<b>` is four characters of text. Nothing in this path goes
   through `innerHTML`; the block is built with `createElement` and
   `createTextNode` only. The hosted service refuses `<` in these fields
   outright, at validation time.

The block is drawn after the categories and their service lists, before the
panel's buttons, and only when `extraText` resolves to a non-empty string.

#### `texts.links` — your own links

Up to three, rendered as a row under the banner's buttons (in all three
layouts) and at the foot of the settings panel:

```js
texts: {
  links: [
    { id: 'privacy', url: 'https://shop.md/privacy',
      label: { ru: 'Политика конфиденциальности', ro: 'Politica de confidențialitate', en: 'Privacy policy' } },
    { id: 'cookies', url: 'https://shop.md/cookies',
      label: { ru: 'Политика cookie', ro: 'Politica cookie', en: 'Cookie policy' } }
  ]
}
```

`url` must be `http(s)`; anything else is skipped. `label` is resolved with the
same fallback chain as `branding.poweredBy.texts` — exact code, then the
two-letter base, then `en` — and a row whose label resolves to nothing is
skipped rather than rendered blank. The cap of three is applied to the rows that
*survive* those checks, so one malformed entry never costs a good one its place.

This does not touch `detailsAction`, with one exception that keeps the banner
from printing the same address twice: when `detailsAction` resolves to `policy`
or `declaration` and its URL matches one of the links on screen — compared
trimmed, with a case-insensitive host and any trailing slash ignored — the
in-text «Learn more» link is not rendered and the banner behaves as
`detailsAction: "hide"` for that render, leaving the address to the link row,
which also carries your own label for it. An explicit `detailsAction:
"settings"` is unaffected: it opens the panel and has no address to duplicate.

#### A worked example

```json
{
  "language": "auto",
  "texts": {
    "policyUrl": "https://shop.md/privacy",
    "ru": {
      "bannerTitle": "Cookie на сайте INTERSTEPCOM",
      "extraText": "Оператор: «FIRM» SRL, IDNO 1234567890123, мун. Кишинёв, ул. Примерная 1.\n\nПо вопросам обработки персональных данных пишите на **office@firm.md** — отвечаем не позднее одного месяца (ст. 12 ч. (3) Закона № 195/2024).\n\nВы вправе подать жалобу в [Национальный центр по защите персональных данных](https://datepersonale.md)."
    },
    "links": [
      { "id": "privacy", "url": "https://shop.md/privacy",
        "label": { "ru": "Политика конфиденциальности", "ro": "Politica de confidențialitate" } },
      { "id": "cookies", "url": "https://shop.md/cookies",
        "label": { "ru": "Политика cookie", "ro": "Politica cookie" } }
    ]
  }
}
```

A Russian visitor sees the custom banner title, and a panel whose «Дополнительно»
card carries three paragraphs: the operator's details, a bold auto-linked
address with the statutory answering period, and a link to the supervisory
authority. A Romanian visitor sees the standard Romanian banner title (nothing
was overridden for `ro`), no «Informații suplimentare» card (no `ro.extraText`),
and both links under the buttons in Romanian.

### Reopening the settings

`ConsentKit.openSettings()` opens the preferences panel from anywhere on the
page — a footer link, a menu item, a button in your own cookie policy. It is
safe to call before the banner has mounted: a call that arrives while the UI
file is still loading is remembered and honoured on mount, so a link clicked
during a slow page load still works.

The same panel also has an address. Any link to a page of the site ending in
`#ck-settings` opens the preferences panel — both when the page loads with that
fragment and when the link is followed on an already-open page. The fragment is
then removed from the address with `history.replaceState`, so a reload or a
«back» does not reopen the panel. This is the address the «change your cookie
choice» button on a cookie declaration page points at, and the one to put in a
site footer:

```html
<a href="#ck-settings">Change your cookie choice</a>
```

### Placeholders for blocked embeds

When the engine holds back an `<iframe>` before consent — a known tracker, or
any third-party frame in strict mode — the visitor would otherwise see an empty
hole where a video or a map should be. Since 0.5.7 ConsentKit draws a card in
its place: the name of the service, the category the embed is waiting for, a
primary button ("Allow and show") that grants **that one category** and
loads the embed, and a link to the full settings panel.

The card is sized from the frame's own `width`/`height` (or its computed size),
never shorter than 120px, and never wider than its container. It is rendered in
its own Shadow DOM and takes the banner's theme — the page's font, your accent
colour and corner radius — so it looks like part of the site rather than part of
a third-party widget. Strings ship in ru, ro and en; every other language falls
back to en.

The button grants one category through the ordinary consent path: the decision
is stored and journalled as `method: 'custom'`, the usual `ck:consent` /
`ck:change` events fire, and consent the visitor had already given to *other*
categories is preserved rather than overwritten. The frame itself is restored by
the core's normal revival pass, which is the same code path the panel's switches
and «Accept all» already use.

Frames that are `display:none`, 1×1 tracking pixels, or outside `<body>` are
left alone, and a frame the site allowed never gets a card at all — an allowed
frame is never intercepted in the first place. Set `blocking.placeholders:
false` to restore the pre-0.5.7 behaviour.

### Infrastructure

Some third-party hosts are not a consent decision at all: they are where a site
builder or hosting platform serves the site's **own** markup, styles and
scripts from. A Tilda page loads its layout from `tildacdn.com`, a Wix page
loads its from `parastorage.com`, and a page using Google Fonts loads its
typefaces from `fonts.gstatic.com`. ConsentKit ships these as a separate class
of host — readable as `ConsentKit._infra()`, tested per URL or hostname with
`ConsentKit._isInfra(url)` — covering the CDNs of Tilda, Wix, Shopify,
Squarespace and Webflow, the general asset CDNs (`cdn.jsdelivr.net`,
`unpkg.com`, `cdnjs.cloudflare.com`, `code.jquery.com`, `ajax.googleapis.com`),
Google Fonts, hCaptcha and the endpoint a Google-hosted frame posts its
Content-Security-Policy violation reports to (`csp.withgoogle.com` — a policy
report carries no visitor, so there is nothing to consent to). Strict mode never
intercepts them, because blocking a
builder's own CDN breaks the page without protecting anyone; the hosted service
also leaves them out of scan reports, since there is nothing for a site owner to
decide. Membership is a claim that a host delivers the site's own assets, not
that it is harmless in general — anything that *measures* keeps a real consent
category instead, which is why `static.cloudflareinsights.com` (Cloudflare Web
Analytics) is classified as `analytics` and blocked before consent even though
the rest of Cloudflare's CDN is infrastructure. The list holds **40 entries**.
Both lists are matched by suffix and returned as copies, so reading them cannot
widen what strict mode allows.

## API

All methods are safe to call at any time and never throw.

| Method | Returns | Description |
|---|---|---|
| `init(config?)` | `CkState` | Idempotent. Restores stored consent, then dispatches `ck:init`. Calling again merges config only |
| `allowed(category)` | `boolean` | `necessary` is always `true` |
| `allowedService(id)` | `boolean` | v0.5.8. May this one declared service run? True when its category is granted **and** the visitor has not refused it individually. An id the config does not declare is `true` |
| `getState()` | `CkState` | A fresh object on every call |
| `accept('all')` | `CkState` | Grants everything. `method: 'accept_all'` |
| `accept({ ... })` | `CkState` | Per-category choice. `method: 'custom'`. Omitted categories stay denied. v0.5.8: an optional `services: { '<id>': false }` replaces the stored refusals wholesale; omit it to leave them untouched |
| `rejectAll()` | `CkState` | Denies every opt-in category. `method: 'reject_all'` |
| `withdraw()` | `CkState` | Clears storage and known cookies, sends GCM `denied`, resets to `decided: false` |
| `show()` | `void` | Opens the preferences panel |
| `openSettings()` | `void` | v0.5.7. Opens the preferences panel. Safe before the UI has loaded — the request is remembered and honoured as soon as the banner mounts |
| `hide()` | `void` | Closes the panel |
| `config` | `CkConfig` | The merged, effective config |
| `version` | `string` | Core version string |

### State

```js
{
  decided: false,          // false until the visitor chooses — the banner shows while false
  id: null,                // uuid of the stored decision
  ts: null,                // ISO timestamp
  policyVersion: '1',
  categories: { necessary: true, functional: false, analytics: false, marketing: false },
  services: {},            // v0.5.8. Per-service refusals ONLY: { hotjar: false }
  method: null             // 'accept_all' | 'reject_all' | 'custom' | 'linked' | 'geo'
}
```

Already-loaded scripts are not unloaded by `withdraw()` — cookies are cleared
and the next page load is clean.

### Introspection

Members prefixed with `_` are **not** private-by-convention placeholders: they
are a deliberate read-only surface for tooling — the debug panel, the hosted
cabinet's theme editor, and tests — and they are documented because those
consumers depend on them. They are stable within a minor version, and every one
of them returns a copy, so reading can never widen what the engine allows.

| Member | Returns | Description |
|---|---|---|
| `_blocked()` | `array` | What the engine is currently holding back, plus a sweep of blocked markup. Drives the debug panel's list |
| `_categoryForUrl(url)` | `string \| null` | The category the database gives a URL — the same lookup the engine uses |
| `_categories` | `string[]` | The four category names, as a copy |
| `_services()` | `array` | The normalised service rows from the config |
| `_serviceForUrl(url)` | `object \| null` | Which declared service a URL belongs to |
| `_deniedServices()` | `string[]` | Ids the visitor refused individually |
| `_extendHostDb(map)` | `number` | Merge extra `host: category` pairs; returns how many were accepted — see [Extending the tracker database](#extending-the-tracker-database) |
| `_infra()` | `string[]` | The 40 infrastructure hosts, as a copy |
| `_isInfra(url)` | `boolean` | Is this URL or hostname infrastructure? |
| `_baseAllow` | `object` | The built-in strict-mode allowlist (hosts plus path-scoped entries), as a copy |

`ConsentKit._contrast`, published by `src/ck-ui.js`, exposes the theme
arithmetic as pure functions so a theme editor can show exactly the numbers the
banner paints rather than reimplementing them. Nothing in it touches the DOM, so
it is safe to call in Node:

| Group | Functions |
|---|---|
| Colour maths | `relativeLuminance`, `contrastRatio`, `ensureContrast`, `stepToContrast` |
| Resolution | `resolveButtonStyles`, `resolveRadius`, `resolveFont`, `pickPageFont`, `resolveDetails`, `buildThemeCss` |
| Font probing | `nextProbeDelay`, `shouldReprobe` |
| Placeholders | `placeholderText`, `placeholdersEnabled` |
| Services panel | `cookieRowsForService`, `looseCookies`, `servicePurpose`, `groupCountLabel`, `serviceSignature`, `signature` |
| Wording | `plural`, `pluralIndex`, `buildStrings`, `localeTable`, `resolveLang` |

`ConsentKit._resolvePageFont()` reports the font family the banner resolved from
the page.

## Events

All are `CustomEvent` on `document`, with the payload in `detail`.

| Event | `detail` | When |
|---|---|---|
| `ck:init` | `{ state, config }` | From `init()`, after stored state is restored |
| `ck:consent` | `{ state }` | The visitor's first choice |
| `ck:change` | `{ state }` | Any change, including `withdraw()` |
| `ck:ui:open-preferences` | `{ state, config }` | Command for the UI layer — `show()` dispatches it |
| `ck:ui:close` | `{ state }` | Command for the UI layer — `hide()` dispatches it |

```js
document.addEventListener('ck:change', (e) => {
  const { state } = e.detail;
  if (state.categories.analytics) startAnalytics();
});
```

The core never touches the UI directly; it only dispatches these events, and the
UI layer only calls the public API.

### dataLayer events (GTM)

Separately from the DOM events above, `integrations.gtmDataLayer` (on by
default) pushes to `window.dataLayer`, which is what GTM triggers listen to:

| Push | When |
|---|---|
| `ck_consent_update` with `ck_consent: { necessary, functional, analytics, marketing }` and `ck_method` | Every decision, including `withdraw()` |
| `ck_consent_functional` / `ck_consent_analytics` / `ck_consent_marketing` | Once per granted category, on the decision and again on a return visit when stored consent is restored. Each fires at most once per page |

The per-category events exist so a GTM tag can trigger on exactly the category
it needs without reading the payload. See
[`integrations/gtm/README.md`](https://github.com/vermoh/ConsentKit/blob/main/integrations/gtm/README.md).

## Blocking trackers

### Manual markup

Mark a script as `type="text/plain"` with a `data-ck` category. The browser will
not execute it. Once the category is granted, ConsentKit recreates the element
with its real type and `src`.

```html
<!-- external -->
<script type="text/plain" data-ck="marketing" data-src="https://connect.facebook.net/en_US/fbevents.js"></script>

<!-- inline -->
<script type="text/plain" data-ck="analytics">
  console.log('runs only after analytics is granted');
</script>
```

Iframes use `data-src`, which is applied once the category is allowed:

```html
<iframe data-ck="marketing" data-src="https://www.youtube.com/embed/VIDEO_ID"
        width="560" height="315" style="background:#e9edf5;border:0"></iframe>
```

`data-ck` accepts any category name: `functional`, `analytics`, `marketing`.

> On WordPress this markup is applied **automatically, server-side**, for every
> tracker in the built-in database — see "Server-side markup" below. Manual
> markup is still needed for trackers the database does not know (your own
> domain, an unlisted vendor) and for inline snippets.

### Automatic blocking

Scripts injected at runtime are intercepted without any markup. ConsentKit
patches `document.createElement`, `Element.prototype.setAttribute` and the
`HTMLScriptElement.prototype.src` setter at parse time, matching the URL against
a built-in host list.

```js
// Blocked until analytics is granted, then loaded automatically.
const s = document.createElement('script');
s.src = 'https://www.google-analytics.com/analytics.js';
document.head.appendChild(s);
```

Blocked elements are marked `data-ck-blocked` and their URL is remembered, so
granting consent later loads them without a reload.

The database ships **148 hosts** and **14 path rules**, matched by suffix (a
bare registrable domain also covers its subdomains) and by substring
respectively:

| Table | Entries | By category |
|---|---|---|
| `HOST_DB` | 148 | 50 `marketing`, 48 `functional`, 34 `analytics`, 16 `necessary` |
| `PATH_DB` | 14 | 6 `functional`, 4 `marketing`, 2 `analytics`, 2 `necessary` |
| `INFRA_DB` | 45 | not a category — see [Infrastructure](#infrastructure) |

Recognised hosts include Google Analytics, Facebook, Yandex Metrica, Hotjar,
TikTok and DoubleClick. The GTM **container** is deliberately not blocked (the
tags inside it obey Consent Mode); `/gtag/js` is blocked by path instead. The
same tables are exported to the WordPress plugin, so server and browser
classify a host identically.

Because the patches install at parse time, `ck-core.js` must load before any
tracker — put it first in `<head>` and do not add `defer`.

`<iframe src>` is covered by the same three patches, and a blocked frame keeps
its URL in `data-src` until its category is granted.

### Extending the tracker database

The built-in host list is a snapshot, not an oracle. `_extendHostDb()` merges
extra `host: category` pairs into it at runtime:

```js
ConsentKit._extendHostDb({
  'analytics.vendor.example': 'analytics',
  'pixel.partner.example': 'marketing'
});
```

Matching is the same as for built-in entries — a bare domain also covers its
subdomains — and an override wins over the shipped classification for the same
host. Categories outside `necessary | functional | analytics | marketing` and
malformed hostnames are ignored; the call returns how many pairs were accepted.

It works both **before and after** `init()`. Calling it afterwards does not
re-examine anything already inserted (a script that has loaded cannot be
unloaded), but every later insertion is classified against the extended map.

In SaaS mode this is automatic: `ck-saas.js` applies `config.hostdb` from the
service *before* it calls `init()`, and again when a background revalidation
brings a changed table. At release time `node tools/sync-hostdb.mjs` bakes the
same public table into `src/ck-core.js`, so inline blocks, the npm package and
the WordPress plugin get it too.

### Strict mode

By default ConsentKit blocks what it **recognises**. `blocking.mode: 'strict'`
inverts that for third parties: before consent, any `<script src>` or
`<iframe src>` pointing at a host that is not same-site is intercepted, whether
or not the tracker database has ever heard of it.

```js
ConsentKit.init({
  blocking: { mode: 'strict', allow: ['widgets.partner.example'] }
});
```

Four things are never intercepted:

1. **Same-site URLs** — the page's own host, its subdomains, and anything
   sharing its registrable domain. The check is deliberately conservative: when
   the answer is unclear it says same-site, because wrongly blocking a
   first-party asset breaks the site.
2. **`blocking.allow`** — your own list, matched by suffix.
3. **The built-in allowlist**, readable as `ConsentKit._baseAllow`. Two parts:
   **infrastructure** (`ConsentKit._infra()`, see below) and things a page is
   unusable without (`js.stripe.com`, `pay.google.com`, `checkout.creem.io`,
   and reCAPTCHA — scoped to `www.google.com/recaptcha` and
   `www.gstatic.com/recaptcha`, not to those hosts at large).
4. **Known `necessary` / `functional` hosts** already granted, which keep their
   real category rather than being swept up as marketing.

Anything else is filed under **`marketing`** — the strictest category — and
comes back only when the visitor accepts marketing.

**Read this before switching it on.** Strict mode will block third-party code
your site needs and that ConsentKit has no way to recognise as necessary: a
booking widget, a map, a review embed, a payment provider that is not on the
list. Turn it on, load the site with `?ck_debug=1`, and read the "Blocked until
consent" list in the panel — entries the engine held back only because of strict
mode are labelled `strict`. Everything there that the page genuinely needs
belongs in `blocking.allow`.

Two limits are worth stating plainly:

* **Dynamic insertions only**, exactly as for known trackers. A tag written
  straight into the HTML starts its request before ConsentKit runs (see below).
  The WordPress plugin's server-side rewrite currently marks up *known* trackers
  only; extending it to strict mode is recorded as a follow-up in SPEC.md.
* **Strict starts when the config does.** The mode is read from `config`, so in
  SaaS mode nothing is blocked strictly until the config has arrived. Blocking
  of *known* trackers still begins at parse time, as always.

### Static tags: what the browser cannot catch

Runtime injection is covered by the patches above. A tracker tag written
**directly into the HTML** is not: the parser starts that request before the
first line of `ck-core.js` runs. The gap was measured (debt D9 in SPEC.md:
request at 14 ms, our script at 18 ms) and it is negative — no client-side technique
closes it. Such tags need either manual markup, or a server that rewrites them
before the page is sent.

### Server-side markup (WordPress plugin)

The WordPress plugin does exactly that, and it is **on by default** since 0.3.5.
While the page is generated, it rewrites tracker tags in the finished HTML:

```html
<!-- what the theme wrote -->
<script src="https://mc.yandex.ru/metrika/tag.js"></script>

<!-- what the browser receives -->
<script type="text/plain" data-ck="analytics"
        data-ck-src="https://mc.yandex.ru/metrika/tag.js"></script>
```

`<iframe src>` of a known host becomes `data-ck` + `data-src` with `src`
removed. The categories come from the same HOST_DB/PATH_DB as the browser
engine: `tools/export-hostdb.mjs` generates
`plugins/wordpress/consentkit/includes/hostdb.php` from `src/ck-core.js`, and
`test/hostdb.test.mjs` fails if the two drift.

What it skips: ConsentKit's own assets, tags carrying `data-ck-ignore`, tags
already marked up by hand, inline scripts (there is no URL to defer), the GTM
container, and anything inside comments, `<pre>` or `<textarea>`. On any error
the page is returned unchanged.

The `<pre>` / `<textarea>` skip keeps the *source text* byte-identical, which is
what a page documenting a tracker snippet needs. It does not keep such a tag
alive: the browser parses `<pre><script src=…>` as a real script element
whatever the server did, so the runtime engine may still intercept it. Caching plugins are compatible and get the
already-rewritten HTML, because the rewrite happens at the PHP level before the
page is cached.

Outside WordPress the same idea applies to any server-side template: emit the
`type="text/plain" data-ck` form directly, as in "Manual markup" above.

## Google Consent Mode v2

With `integrations.gcm` (the default), the core pushes `consent: default` at
parse time — before any tag can load — with every signal `denied` and
`wait_for_update: 500`, then `consent: update` after each choice. Seven signals
are set, always as one block:

| Signal | Follows |
|---|---|
| `analytics_storage` | `analytics` |
| `ad_storage`, `ad_user_data`, `ad_personalization` | `marketing` |
| `functionality_storage`, `personalization_storage` | `functional` |
| `security_storage` | always `granted` |

Two page-level flags travel with the `default` push as well (since **0.5.22**),
and only with it — a later `consent: update` never repeats them:

| Flag | Value | What it does |
|---|---|---|
| `url_passthrough` | `true` | With `ad_storage` denied there is no cookie to carry a Google click id, so Google passes `gclid` in the URL instead. Without it a visitor who **declined** loses the click id on the next navigation, and the campaign that paid for the visit is credited to nobody. |
| `ads_data_redaction` | `true` | While `ad_storage` is denied, Google strips identifiers out of the ad requests themselves — a declined visitor is measured in aggregate rather than followed. |

Neither flag stores anything or weakens a refusal; they are what an honest
refusal looks like on Google's side. If your own tag manager sets different
values, it wins — these are defaults, not overrides.

`integrations.gtmDataLayer` (also on by default) is an independent gate: it
pushes a `ck_consent_update` event carrying `ck_consent` (the four categories)
and `ck_method`, so GTM triggers work even with `gcm: false`.

**What "denied" actually means.** Consent Mode is Google's own mechanism, not a
block: a Google tag that runs under denied signals sets **no cookies and no
identifiers**, but it still sends *cookieless pings* to Google, and those pings
carry the **page URL, the referrer and the user agent**, from an IP address
Google necessarily sees. That is enough for Google to see the
visit, and in the EU an IP address is personal data. Consent Mode alone is
therefore not the same as not being measured.

ConsentKit's blocking engine is the part that makes the difference: a tag it
holds back never runs at all, so it sends nothing — no ping, no URL, no IP. The
two work together, and Consent Mode is the fallback for the case the engine
cannot cover (a tag inside a GTM container, or a static `<script src>` the
parser requested before ConsentKit loaded — see
[Static tags](#static-tags-what-the-browser-cannot-catch)). If you need "nothing
reaches Google before consent", rely on the blocking engine and mark such tags
up; do not rely on Consent Mode by itself.

## Storage

The decision is stored in a `ck_consent` cookie (base64 JSON, `path=/`,
`SameSite=Lax`, `consentTtlDays`) and mirrored to `localStorage`. It is
discarded — and the banner shown again — when `policyVersion` changes or the TTL
expires.

## Geo rules

*Since v0.5.17.* By default every visitor sees the banner. `geo` narrows that to
a list of countries:

```js
ConsentKit.init({
  geo: { mode: 'list', countries: ['MD', 'RO', 'DE', 'FR'] }
});
```

The country comes from the `x-ck-country` response header the hosted service
sets on the config request, and is read **before** the banner would render, so
nothing flashes. `ConsentKit._geo` holds `{ country, inScope }` for the page.

For a visitor **outside** the list:

- the banner does not appear (the floating «cookie settings» button still does,
  so they can open the panel and decide for themselves at any time);
- every category is granted **for this page load only** — trackers run and
  Consent Mode receives granted signals;
- **nothing is written down.** No cookie, no `localStorage`. `getState()` keeps
  reporting `decided: false` with `method: 'geo'`, so the same person visiting
  later from a country on the list gets a real banner rather than a consent they
  never gave;
- the journal receives one record with `method: 'geo'` per session, not per page.

If the country is **unknown** — a standalone page with no hosted config, a CORS
setup that does not expose the header — the visitor is treated as in scope and
the banner is shown. Showing a banner to someone who did not need one costs a
click; hiding it from someone who did is a compliance failure, so the default
falls that way deliberately. The same applies to `mode: 'list'` with an empty
`countries` array.

A stored decision always wins: geo never overrides a choice the visitor has
already made.

> Geo rules decide **who is asked**, not what the law requires. Picking a short
> list is a decision for you and your lawyer, not for this library.

## One consent across domains

*Since v0.5.17.* Two independent switches, both off by default.

### Subdomains

```js
ConsentKit.init({ consent: { shareSubdomains: true } });
```

The consent cookie is written on the registrable domain (`.example.com`) instead
of the exact host, so `shop.example.com` and `blog.example.com` read the same
decision and the visitor is asked once.

The registrable domain is found by probing: candidate parent domains are tried
**shortest first** and the first one the browser actually accepts is kept. That
matters for multi-label suffixes — on `a.b.example.co.uk` the browser silently
refuses `.co.uk`, so the first candidate that sticks is `.example.co.uk`, which
is the right answer. `localhost` and IP addresses get no `domain=` at all.

Because a sibling subdomain can now write the cookie, reading changes too: when
the cookie and `localStorage` disagree, the record with the newer `ts` wins.
With the switch off, the old cookie-first order is kept exactly.

### Separate domains

```js
ConsentKit.init({
  consent: { linkedDomains: ['example.ro', 'example-shop.com'] }
});
```

Different registrable domains cannot share a cookie, so the decision travels in
the link the visitor clicks. On a click on an `<a href>` pointing at a linked
host (or any of its subdomains), ConsentKit appends
`#ck_consent=<base64url payload>` to the href just before the navigation. The
payload carries a version, a timestamp and the categories plus any per-service
refusals — no id, no personal data.

On the receiving page the fragment is adopted as the visitor's decision — no
banner, a normal stored record, `method: 'linked'`, one journal row — but only
when **all** of these hold:

- the timestamp is within 10 minutes (in either direction);
- the payload validates: version `1`, all three categories present as booleans,
  services as a denial map;
- `document.referrer` is one of the linked hosts, **or** empty (a strict
  `Referrer-Policy` legitimately sends none).

Anything else is ignored silently and the banner shows as usual. The fragment is
then removed with `history.replaceState`, leaving the rest of the fragment
intact.

At most 10 hosts are honoured, written without a scheme. Only `http`/`https`
links are touched; `mailto:`, `tel:` and the like are left exactly as authored.

Worth being clear about the threat model: a forged fragment can only ever
**grant** consent on the page the visitor is already looking at — the same thing
the «Accept all» button does. It cannot read anything, and it is validated
against the schema above regardless.

## Branding

By default the banner shows a small "Made by E-COM Consult" attribution line,
linking to ecomconsult.net. It is emitted as a `branding` object in the config,
and the prebuilt blocks in `ready/` carry it.

Removing it is a supported, first-class option — no obligation, no nag:

```sh
node tools/build-inline.mjs --langs=en,ru --no-branding   # block without it
```

The line is `branding.poweredBy.text`; with `language: 'auto'` supply
`branding.poweredBy.texts` instead — `{ ru: '…', ro: '…', en: '…' }`, resolved
against the language the banner actually picked (`texts[lang]` → base code →
`texts.en` → `text`), so the attribution matches what the visitor is reading.

If you write the config by hand, simply omit the `branding` object; nothing
renders without it. Either way costs you ~200 bytes, not a licence: the client
is MIT and the line is yours to drop.

Note that only the attribution line ships, not the logo — `brand/ecom-consult-logo.svg`
is a white wordmark authored for dark backgrounds, so it would be invisible on
the banner's light surface. Supply your own `branding.logo` (and `logoDark`) if
you want a mark; see the branding notes in `src/ck-ui.js`.

In the **hosted service** the line is on by default and switching it off is part
of the paid plans. To be clear about what is being charged for: the fee covers
hosting, the cabinet and the scanner — not the line itself.

## Prebuilt inline blocks

For site builders that will not let you upload files, `ready/` holds
ready-to-paste `<script>` blocks — copy one wholesale into `<head>`. Zero
external requests. Rebuild them with `tools/build-inline.mjs` (see
[`tools/README.md`](https://github.com/vermoh/ConsentKit/blob/main/tools/README.md)); each block's header records the exact
command that produced it.

ConsentKit 0.5.24, rebuilt 2026-09-11, uncompressed — gzip on the server cuts
this roughly threefold. Every block includes the branding extension and the
attribution line; `--no-branding` drops both the code and the config and takes
**~26 KB** back off:

| Block | Languages | Bytes | gzip | `--no-branding` |
|---|---|---|---|---|
| `ready/en-bar.txt` | en | 364,162 | 115,187 | 337,877 |
| `ready/ru-bar.txt` | ru, ro, en | 366,346 | 116,137 | 339,875 |
| `ready/ru-box.txt` | ru, ro, en | 366,361 | 116,143 | 339,890 |
| `ready/ru-box-right.txt` | ru, ro, en | 366,370 | 116,149 | 339,899 |
| `ready/ru-modal.txt` | ru, ro, en | 366,354 | 116,143 | 339,883 |
| `ready/eu-bar.txt` | 34 languages | 418,280 | 135,724 | 391,829 |

The blocks are dominated by the core and the UI (roughly 97 KB and 129 KB of
source respectively, comments included — the builder concatenates the sources
as they are and does not minify). Bundled languages account for the rest:
`en` and `ru` are built into the UI and cost nothing extra, while layout,
position, theme and accent change only a few bytes of config.

The debug panel is **not** in these numbers. Blocks carry a ~5.1 KB loader
(`src/ck-debug-loader.js`) which fetches the ~54 KB panel only when someone opens
the page with `?ck_debug=1` — see [Debug mode](#debug-mode). An ordinary visitor
downloads the loader and nothing more.

## Debug mode

A panel that shows what the client actually did on a live page — useful when a
site owner asks "is this thing working?" and screenshots of the banner do not
answer it.

**Open it** by adding `?ck_debug=1` to the page URL (`#ck_debug` works too):

```
https://example.com/?ck_debug=1
```

A dark, monospace panel appears bottom-right in its own Shadow DOM. The flag is
remembered in `localStorage` for that browser, so it survives navigation.

**It shows**, in order: the client version, config source (SaaS or inline),
siteId and policy version / ETag; the consent status, granted categories,
decision time and cookie lifetime; what the blocking engine is holding back
(`ConsentKit._blocked()`); which requests to known trackers actually left the
page, each marked *before* or *after* consent; the recent `ck_*` dataLayer
events and `gtag('consent', …)` calls; and three buttons — reset consent
(withdraw, clear the cookie, reload), open preferences, and copy a JSON report.

The request list carries the same caveat as the blocking engine itself:
requests that left **before** ck-core.js parsed — a plain `<script src>` written
into the HTML — show up there but could not have been blocked. Mark those tags
up manually.

**Turn it off** with `?ck_debug=0`, or the × in the panel's header. The loader
owns the stored flag, so `?ck_debug=0` clears it whether or not the panel is on
the page.

**Privacy.** Nothing is sent anywhere: the panel is local to that browser and
that page. It never renders cookie *values* (names only) and never shows URL
query strings (host and path only), so the copied report is safe to paste into
a support ticket.

### How the panel gets onto the page

The panel is ~54 KB, and on any given page exactly one person will ever open
it. So `ready/*.txt` and the WordPress plugin ship **`src/ck-debug-loader.js`**
(~5.1 KB) instead, and the loader fetches the panel on demand. With no flag set
the loader creates no DOM, installs no observers and makes **no network
request** — it costs its own bytes and nothing else.

When the panel *is* activated, the loader resolves its URL in this order, first
match wins:

1. **`window.ConsentKitDebugUrl`**, if you set it — a self-hosted copy, an
   internal mirror, or a pinned build. Set it before the loader runs.
2. **`<API_BASE>/client/ck-debug.js`**, when `ck-saas.js` is on the page with a
   site id — `API_BASE` is that loader's `data-ck-api` (its `ConsentKit._saas.api`).
   The panel then comes from the same origin as the config, so a locked-down CSP
   needs no extra host. **A SaaS deployment is expected to serve the panel at
   that path**; if yours does not, set `window.ConsentKitDebugUrl` instead.
3. **jsDelivr**, pinned to the running core version:
   `https://cdn.jsdelivr.net/npm/@ecomconsult/consentkit@<version>/src/ck-debug.js`.
   The version comes from `ConsentKit.version`, so the panel can never be newer
   or older than the client it is reporting on. This path is published because
   `package.json` lists `src` in `files`.

The script is injected `async`, and neither jsDelivr nor a ConsentKit API host
is in the blocking engine's tracker list, so the panel loads even while the
visitor has yet to decide.

### Loading the panel directly

If you host the files yourself and would rather have the panel inline, load it
after `ck-ui.js` (and after `ck-saas.js` if you use it) and skip the loader:

```html
<script src="/js/ck-core.js"></script>
<script src="/js/ck-locales.js"></script>
<script src="/js/ck-ui.js"></script>
<script src="/js/ck-debug.js"></script>
```

`ck-debug.js` is self-contained: it repeats the loader's activation check, so it
works with or without the loader. Do **not** add it to a page that already ships
the loader (an inline block from `ready/`, or the WordPress plugin) — the loader
fetches the panel itself, and a second copy would mount a second panel.

From npm it is a deliberate opt-in — `@ecomconsult/consentkit` does not pull
it in for you. Import it yourself, after the UI:

```js
import '@ecomconsult/consentkit';           // core + locales + UI
import '@ecomconsult/consentkit/src/ck-debug.js';
```

**Language.** The panel is Russian or English: it follows the banner's
configured `language`, falls back to `navigator.language` (`ru-*` → Russian),
and otherwise renders English. The JSON report it copies is language-neutral
whichever way the panel reads.

## TypeScript

Types ship with the package; no `@types` needed.

```ts
import ConsentKit from '@ecomconsult/consentkit';
import type { CkConfig, CkState, CkCategory, UseConsentResult } from '@ecomconsult/consentkit';
```

`document.addEventListener('ck:change', …)` is typed through a
`DocumentEventMap` augmentation, so `e.detail.state` resolves.

Requires `moduleResolution` of `node16`, `nodenext` or `bundler` — the package
uses `exports` subpaths, which the legacy `node` resolution cannot read.

## Browser support

Any browser with Shadow DOM and ES2020: Chrome/Edge 79+, Firefox 72+, Safari
13.1+. No polyfills, no external fonts or assets.

## SaaS mode (experimental)

> Not announced, not supported, and not part of any release. The hosted API it
> talks to does not exist publicly yet. Everything below can change without
> notice.

`src/ck-saas.js` is an optional extra file that fetches the configuration from a
server instead of taking it from an inline `init()` call, and (optionally) writes
each consent decision to a journal endpoint. Standalone usage is completely
unaffected: pages that do not load this file behave exactly as documented above,
and the prebuilt inline bundles do not contain it.

```html
<script src="ck-core.js"></script>
<script src="ck-locales.js"></script>
<script src="ck-ui.js"></script>
<script src="ck-saas.js" data-ck-id="YOUR_SITE_ID"></script>
```

`ck-saas.js` calls `ConsentKit.init()` itself once it has a configuration, so the
page must **not** call `init()` as well. `data-ck-api` overrides the API base URL.

| Situation | Behaviour |
|---|---|
| Config cached in `localStorage` | `init()` runs immediately from cache; the config is revalidated in the background with `If-None-Match`. A changed config applies from the **next** page load. |
| No cache | Config is fetched with a 3s timeout, then `init()` runs and the result is cached. |
| Fetch fails, times out, or returns 404 | **Strict fallback**: the banner is shown, every opt-in category stays denied, the journal is disabled, and the reason is logged with `console.warn`. |

When the configuration contains a `log` endpoint, each decision is POSTed with
`fetch(keepalive: true)`, retried once after 2s on a network error, and flushed
via `sendBeacon` on `pagehide`. Withdrawals are sent with `method: "withdraw"`.
No other network requests are made.

The payload is a **closed schema** — anything outside this list is rejected by
the server as a 400:

| Field | Always? | Value |
|---|---|---|
| `siteId`, `key` | yes | The site id and the log key from the config |
| `cfg` | yes | Version of the config the decision was made under |
| `id`, `ts` | yes | uuid and ISO timestamp of the record. A withdrawal gets a fresh pair, and so does a `geo` record — nothing was stored, so there is no id to reuse |
| `categories` | yes | Exactly three booleans: `functional`, `analytics`, `marketing`. `necessary` is not part of the schema |
| `method` | yes | `accept_all` \| `reject_all` \| `custom` \| `withdraw` \| `linked` \| `geo`. v0.5.17: `linked` is a decision adopted from a link on one of your other domains; `geo` is the one-per-session record that a visitor was outside the banner's geo scope — see [Geo rules](#geo-rules) and [One consent across domains](#one-consent-across-domains) |
| `lang`, `layout` | when resolved | The language and layout the visitor actually saw |
| `services` | only on `custom` | v0.5.8. The ids the visitor refused, sent only when the list is non-empty. Capped at 50 ids of at most 64 characters |

The client puts no page URL, referrer or user agent in the body. The request
itself is still an ordinary HTTP request to the API host, so that host sees the
connection's IP address like any server would — what the *payload* carries is
the list above and nothing more.

To try it locally, a mock API is included:

```sh
node demo/mock-api.mjs          # http://localhost:8788
# serve the repo root, then open demo/saas.html
```

## Changelog

Client versions. The WordPress plugin tracks the same numbers and keeps its own
notes in
[`plugins/wordpress/consentkit/readme.txt`](https://github.com/vermoh/ConsentKit/blob/main/plugins/wordpress/consentkit/readme.txt).

### 0.5.24

- **`language: "page"` reads more than `<html lang>`.** Two live sites on
  11.09.2026 showed the 0.5.21 order — attribute, then browser — was not enough,
  and both failures had the same shape: the banner ended up in the visitor's
  browser language on a page that was not in it. So `"page"` now resolves
  through four sources, most deliberate first:

  1. `<html lang>`
  2. the **first path segment** of `location.pathname`, when it names a
     language — `/ru/…`, `/ro`, `/en/about`
  3. `<meta property="og:locale">` — `ro_RO` → `ro`
  4. `navigator.language`
  5. `en`

  The case that forced it: **a site whose pages switch language by path and
  carry no `lang` attribute at all** — a bare `<html>`, one Russian and one
  Romanian page told apart only by the URL. `"page"` fell straight through to
  the browser, so a visitor with a Russian browser got a Russian banner on the
  Romanian page, which is the exact bug the mode exists to prevent.

  Every step goes through the same lookup the configured code does, against the
  locales the build actually ships: a source naming a language this build has no
  locale for is **no answer at all** and falls to the **next** source rather than
  to English. `/xx/` with `og:locale` `ro_RO` is Romanian. The path step is
  gated on a plain two-letter code (or one the table carries verbatim) before
  the lookup ever sees it, because the lookup falls back to the first two
  letters — without the gate `/ruby/` would be Russian and `/engineering/`
  English, an ordinary blog category deciding the banner's language. `mo` → `ro`
  on the path as everywhere else.

  **`<html lang>` per page is still the recommendation.** Steps 2 and 3 are a
  safety net, not a replacement: the attribute is the one signal that is
  unambiguous and is read first.

- **`language: "page"` follows a `lang` attribute that changes after the banner
  mounted.** The second failure: **an SPA that sets `lang` after the banner
  mounted** — it ships `<html lang="ru">` statically and its own language switch
  writes `document.documentElement.lang` once the page is already up. `mount()`
  is one-shot, so the banner kept the language it read at first paint and
  switching the app to Romanian left a Russian banner until a reload.

  In `"page"` mode only, the banner now observes `document.documentElement` for
  `lang` changes and, when the language it would resolve to **differs from the
  one on screen**, rebuilds through the same remount a config change uses — no
  second copy of the mount logic. The settings panel, if open, reopens in the
  new language, so a visitor mid-decision keeps the panel they opened. Debounced
  to one rebuild per tick, and the observer is disconnected on every remount, so
  a page that switches language ten times still has exactly one. A change that
  resolves to the same language rebuilds nothing.

  No observer under `"auto"` or a fixed code: `"auto"` deliberately does not read
  the page at all, and a fixed code cannot be changed by it. Guarded for a
  missing `MutationObserver` — without one the banner renders exactly as before,
  it simply does not follow a later change.

### 0.5.23

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

### 0.5.22

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

### 0.5.21

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

### 0.5.20

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

### 0.5.19

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

### 0.5.18

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

### 0.5.17

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

### 0.5.16

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

### 0.5.15

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

### 0.5.14

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

### 0.5.13

- Host database: `fbcdn.net` → marketing (Facebook SDK chunks and plugin images); `aichat.md`, `bubble.aichat.md` → functional (chat widget); `challenges.cloudflare.com` (Cloudflare challenge / Turnstile) and `i.imgur.com` → infrastructure, never held.

### 0.5.12
- **Services in the preferences panel are collapsed by default and compact.**
  The group's «N services · M cookies» line became a disclosure button; opening
  it reveals the services and the group's cookie table. Each service row is one
  line — name, vendor, switch — with the purpose, the privacy link and its
  cookie list behind a small «Details» disclosure inside the row.
- **A service in the «necessary» group has no switch.** It carries the «always
  on» badge instead, `allowedService()` is unconditionally `true` for it, and a
  refusal for such a service is stripped from the denial map on read and write.
- Tracker database: `c.bing.com`.

### 0.5.11
- The preferences panel and the floating button follow the **banner's** buttons
  by role, with no theme settings of their own: «save choice» is styled as
  `accept`, the panel's own accept and reject as `settings`, and the floating
  button takes the `accept` fill (its border colour when `accept` is `outline`).

### 0.5.10
- **A colour the site owner set is painted as set.** The 4.5:1 text rule and the
  3:1 border rule now correct only *derived* colours; an explicit `fg`, `border`
  or `onAccent` is left alone however low it measures.
- `theme.light.onAccent` — the light-mode mirror of `theme.dark.onAccent`.
- The debug panel reports the measured ratio and warns, instead of claiming a
  value was fixed automatically.

### 0.5.9
- Tracker database: +42 entries — YouTube, Vimeo, Facebook and Instagram embeds,
  chats and CRM (Freshworks, Viber, Telegram, Bitrix24, amoCRM), forms and
  scheduling (Calendly, Typeform), payments (Stripe, PayPal, paynet.md, MAIB),
  Sentry, 999.md. Vercel and Netlify are classified as infrastructure.
- The debug panel is honest about Consent Mode: "no cookies, but the page
  address and browser type are sent".

### 0.5.8
- **Services** (`services`): a site declares individual third parties, each of
  which gets its own toggle inside its category group in the panel, with its own
  vendor, purpose, privacy link and cookies. A visitor can accept a category and
  still refuse one service; the refusal survives the group being switched off
  and on again. Refusals are stored in `ck_consent` as `services: { id: false }`
  and, in SaaS mode, reported in the beacon's `services` field.
- `ConsentKit.allowedService(id)`.

### 0.5.7
- Placeholders for blocked embeds: a card in place of a held-back video or map,
  with an "Allow and show" button that grants just that category
  (`blocking.placeholders`, on by default).
- `#ck-settings` in a page address opens the preferences panel;
  `ConsentKit.openSettings()` is safe to call before the UI has mounted.
- `texts.detailsAction: "declaration"` and `texts.declarationUrl`.

### 0.5.6
- The attribution line follows the banner's language
  (`branding.poweredBy.texts`).

### 0.5.5
- Banner and panel texts rewritten in plain language (ru, ro, en).

### 0.5.4
- Database: Google Maps is `functional`; Tilda platform services and
  `fonts.google.com` are infrastructure; Google Ads pings
  (`/pagead/1p-user-list`, `/ads/ga-audiences`) are `marketing`.

### 0.5.3
- The banner re-resolves the page font after full load (on Tilda a reload from
  cache left the banner in Times), and falls back to the system stack when the
  page font cannot be determined.

### 0.5.2
- The banner takes its font from the page's real text rather than from `body`.

### 0.5.1
- Database: general CDNs (gstatic.com, aspnetcdn.com, kxcdn.com, jsDelivr,
  cdnjs, unpkg, CloudFront and others) are infrastructure, not trackers; Google
  reCAPTCHA is `necessary`; Searchanise and iuteCredit are `functional`.

### 0.5.0
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

### 0.4.1
- Infrastructure list (`ConsentKit._infra()`): builder CDNs, Google Fonts and
  captcha, never intercepted by strict mode.
  `static.cloudflareinsights.com` is deliberately excluded — it is analytics.

### 0.4.0
- **Strict mode** (`blocking.mode: 'strict'`): before consent, any third-party
  script or iframe that is not same-site, allow-listed or in the built-in
  allowlist is held back and filed as `marketing`.
- `ConsentKit._extendHostDb()` and the `hostdb` config key.
- `<iframe src>` is intercepted, not just scripts.

### 0.3.6
- Branding moved to `src/ck-ui-branding.js`, so `--no-branding` drops the code
  as well as the config (~26 KB off a block).

### 0.3.5
- **Server-side tracker markup in the WordPress plugin, on by default** — the
  one case the browser engine cannot cover. The database shipped to PHP is
  generated from `src/ck-core.js`, and a test fails when the two drift.
- The debug panel became a lazily-loaded file behind a ~5 KB loader.

### 0.3.2
- The GTM container is no longer blocked: tags inside it obey Consent Mode, and
  blocking the container breaks that. `/gtag/js` is still blocked by path.

## Project status

**This is a prototype (v0.5.24), not a released product.** It is honest about
what has been verified and what has not.

### Verified

- Consent core, blocking engine and storage, exercised in a browser against the
  demo shop: no tracker runs and no non-necessary cookie is set before a choice;
  selective consent loads only the matching tracker; `withdraw()` clears cookies.
- Banner, preferences panel and floating button across `bar` / `box` / `modal`,
  light and dark, with keyboard and ARIA checks.
- `dataLayer` event trace for consent restore, upgrade and withdrawal.
- npm entry points and TypeScript types: syntax and import smoke tests in Node
  without a DOM.
- An automated suite runs under `npm test` (`node --test test/*.test.mjs`):
  blocking engine, tracker-database classification and its PHP export, services,
  the theme and contrast arithmetic, the settings panel, branding, the debug
  loader and panel, the generated site, and a version guard that fails when
  `package.json`, `src/ck-core.js` and the blocks in `ready/` drift apart.
- PHP files of the WordPress plugin pass `php -l` on 7.4, 8.3 and 8.5.
- The server-side rewriting engine has its own suite of 61 cases
  (`plugins/wordpress/consentkit/tests/rewrite.test.php`), green on PHP 7.4,
  8.3 and 8.5. It is a plain PHP CLI script, so it runs outside `npm test`.

### Not verified — read before production use

- **The WordPress plugin has been verified on a live install, but only one.**
  It was run on WordPress 7.1 / PHP 8.3 in Docker (activation, settings
  round-trip, shortcode, uninstall, server-side markup end to end). The declared
  floor of WordPress 6.0 / PHP 7.4 has not been exercised live — the PHP files
  pass `php -l` and the rewriting test suite on 7.4, 8.3 and 8.5 — and no theme
  conflict or multisite behaviour has been observed.
- **The GTM container has never been through a real import.** The JSON is valid
  and structurally modelled on the documented export format, but Tag Manager has
  not accepted it in practice; some field names (notably GA4 config
  `measurementId` vs `tagId`) may need correction on first import.
- **The 32 locales of the language pack are drafts.** Only `en` and `ru` — the
  two built into the UI — are authored rather than translated. The rest are
  usable but have not been reviewed by native speakers (the weakest are `mt`,
  `ga`, `is`, `sq`, `mk`; `pl` mixes politeness forms). Legal wording — "Reject
  all", "always active" — should be checked by someone who knows the local
  regulator's language before you rely on it.
- **There is no server-side consent log.** Consent lives only in the visitor's
  browser (cookie plus `localStorage`). GDPR accountability may require you to
  be able to *demonstrate* that consent was given; that record-keeping is not
  part of this prototype and you would have to build it yourself.
- **No end-to-end browser tests and no CI beyond the Pages deployment.** The
  `npm test` suite runs in Node against DOM stubs, not a real browser; browser
  verification is still the manual smoke checklist in
  [CONTRIBUTING.md](https://github.com/vermoh/ConsentKit/blob/main/CONTRIBUTING.md).
- Not audited by a lawyer. ConsentKit is a technical building block, not legal
  advice, and it cannot make a site compliant on its own — your privacy policy,
  your cookie inventory and your record-keeping are still yours.

### Contributing

Structure of the repository, the GDPR invariants that must not change, and how
to run the checks: [CONTRIBUTING.md](https://github.com/vermoh/ConsentKit/blob/main/CONTRIBUTING.md).

## License

Copyright (c) 2026 E-COM CONSULT PLUS.

| Part | Licence |
|---|---|
| Client (`src/`), npm package, inline builder, demo | [MIT](https://github.com/vermoh/ConsentKit/blob/main/LICENSE) |
| WordPress plugin (`plugins/wordpress/consentkit/`) | [GPL-2.0-or-later](https://github.com/vermoh/ConsentKit/blob/main/plugins/wordpress/consentkit/LICENSE) |

The client is MIT so it can be embedded anywhere without licence friction. The
WordPress plugin ships under GPLv2+ because the WordPress ecosystem effectively
requires it; MIT permits the plugin to bundle copies of the client in its
`assets/` directory.

Contributions require a `Signed-off-by` line (DCO) — see
[CONTRIBUTING.md](https://github.com/vermoh/ConsentKit/blob/main/CONTRIBUTING.md).
