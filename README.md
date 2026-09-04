# ConsentKit

![status: prototype v0.3](https://img.shields.io/badge/status-prototype%20v0.3-orange)
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
  button, light/dark, 30+ locales
- **SSR-safe:** importing on the server never touches the DOM
- **Equal-weight buttons, no pre-ticked boxes** — the consent invariants are
  fixed by design, see [CONTRIBUTING.md](CONTRIBUTING.md)

> **Status: prototype (v0.3).** The core, the UI and the demo are verified in a
> browser; several distribution paths are not yet tested against live systems.
> See [Project status](#project-status) before shipping this to production.

**Не программист?** Пошаговая инструкция по-русски, с картинками и разбором по
кликам: **[INSTALL.ru.md](INSTALL.ru.md)**.

## Install

Four ways to add ConsentKit to a site, from simplest to most integrated.

| # | Method | Best for | Docs |
|---|---|---|---|
| 1 | **Script tags** — copy `src/` to your server, three `<script>` tags in `<head>` | Any site you control | [Quickstart below](#quickstart--script-tags) |
| 2 | **npm** — `npm install @ecomconsult/consentkit` | Bundled apps, React | [Quickstart below](#quickstart--npm) |
| 3 | **WordPress plugin** — copy the plugin folder to `wp-content/plugins/`; rewrites static tracker tags server-side | WordPress / WooCommerce | [`plugins/wordpress/consentkit/`](plugins/wordpress/consentkit/) |
| 4 | **Google Tag Manager** — import the container, trigger tags on consent events | Sites already running GTM | [`integrations/gtm/README.md`](integrations/gtm/README.md) |

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
| `language` | `string` | `"auto"` | `"auto"` reads `navigator.language`. Falls back `pt-BR` → `pt` → `en` |
| `layout.type` | `"bar" \| "modal" \| "box"` | `"bar"` | `box` is a compact ~360px card |
| `layout.position` | `string` | per type | `bar`: `bottom` (default) / `top`. `box`: `bottom-left` (default) / `bottom-right`. `modal` is always centred. A position that does not belong to the chosen type falls back to that type's default; the type itself is unaffected |
| `theme.accent` | `string` | `"#2B50D8"` | Exposed as `--ck-accent` |
| `theme.radius` | `string` | `"10px"` | Exposed as `--ck-radius` |
| `theme.mode` | `"auto" \| "light" \| "dark"` | `"auto"` | `auto` follows `prefers-color-scheme` |
| `theme.dark` | `{ bg, ink, accent }` | built-in | Overrides the dark palette |
| `categories.*.enabled` | `boolean` | `true` | Per category: `functional`, `analytics`, `marketing`. Hides the toggle when `false` |
| `consentTtlDays` | `number` | `365` | Lifetime of the stored decision |
| `integrations.gcm` | `boolean` | `true` | Google Consent Mode v2 signals |
| `integrations.gtmDataLayer` | `boolean` | `true` | Push consent events to `window.dataLayer` |
| `cookieTable` | `CkCookieTableEntry[]` | `[]` | Declared cookies, listed per category in the panel |

`cookieTable` entries:

```js
{ name: '_ga', category: 'analytics', vendor: 'Google', purpose: 'Visit statistics', expiry: '2 years' }
```

## API

All methods are safe to call at any time and never throw.

| Method | Returns | Description |
|---|---|---|
| `init(config?)` | `CkState` | Idempotent. Restores stored consent, then dispatches `ck:init`. Calling again merges config only |
| `allowed(category)` | `boolean` | `necessary` is always `true` |
| `getState()` | `CkState` | A fresh object on every call |
| `accept('all')` | `CkState` | Grants everything. `method: 'accept_all'` |
| `accept({ ... })` | `CkState` | Per-category choice. `method: 'custom'`. Omitted categories stay denied |
| `rejectAll()` | `CkState` | Denies every opt-in category. `method: 'reject_all'` |
| `withdraw()` | `CkState` | Clears storage and known cookies, sends GCM `denied`, resets to `decided: false` |
| `show()` | `void` | Opens the preferences panel |
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
  method: null             // 'accept_all' | 'reject_all' | 'custom'
}
```

Already-loaded scripts are not unloaded by `withdraw()` — cookies are cleared
and the next page load is clean.

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
granting consent later loads them without a reload. Recognised hosts include
Google Analytics, Google Tag Manager, Facebook, Yandex Metrica, Hotjar, TikTok
and DoubleClick.

Because the patches install at parse time, `ck-core.js` must load before any
tracker — put it first in `<head>` and do not add `defer`.

### Static tags: what the browser cannot catch

Runtime injection is covered by the patches above. A tracker tag written
**directly into the HTML** is not: the parser starts that request before the
first line of `ck-core.js` runs. The gap was measured (debt Д9: request at
14 ms, our script at 18 ms) and it is negative — no client-side technique
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

With `integrations.gcm` (default), the core pushes `consent: default` with every
signal `denied` at parse time, then `consent: update` after each choice:
`analytics` → `analytics_storage`; `marketing` → `ad_storage`, `ad_user_data`,
`ad_personalization`.

## Storage

The decision is stored in a `ck_consent` cookie (base64 JSON, `path=/`,
`SameSite=Lax`, `consentTtlDays`) and mirrored to `localStorage`. It is
discarded — and the banner shown again — when `policyVersion` changes or the TTL
expires.

## Branding

By default the banner shows a small "Made by E-COM Consult" attribution line,
linking to ecomconsult.net. It is emitted as a `branding` object in the config,
and the prebuilt blocks in `ready/` carry it.

Removing it is a supported, first-class option — no obligation, no nag:

```sh
node tools/build-inline.mjs --langs=en,ru --no-branding   # block without it
```

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
[`tools/README.md`](tools/README.md)); each block's header records the exact
command that produced it.

ConsentKit 0.3.5, rebuilt 2026-09-04, uncompressed — gzip on the server cuts
this roughly three- to fourfold. Every block includes the attribution line;
`--no-branding` takes ~200 bytes back off:

| Block | Languages | Bytes |
|---|---|---|
| `ready/en-bar.txt` | en | 111,664 |
| `ready/ru-bar.txt` | ru, ro, en | 113,285 |
| `ready/ru-box.txt` | ru, ro, en | 113,300 |
| `ready/ru-box-right.txt` | ru, ro, en | 113,309 |
| `ready/ru-modal.txt` | ru, ro, en | 113,293 |
| `ready/eu-bar.txt` | 34 languages | 161,939 |

Size is driven almost entirely by the bundled languages: `en` and `ru` are
built into the UI and cost nothing extra, while layout, position, theme and
accent change only a few bytes of config.

The debug panel is **not** in these numbers. Blocks carry a ~5.1 KB loader
(`src/ck-debug-loader.js`) which fetches the 33 KB panel only when someone opens
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

The panel is ~33 KB, and on any given page exactly one person will ever open
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

To try it locally, a mock API is included:

```sh
node demo/mock-api.mjs          # http://localhost:8788
# serve the repo root, then open demo/saas.html
```

## Project status

**This is a prototype (v0.3), not a released product.** It is honest about what
has been verified and what has not.

### Verified

- Consent core, blocking engine and storage, exercised in a browser against the
  demo shop: no tracker runs and no non-necessary cookie is set before a choice;
  selective consent loads only the matching tracker; `withdraw()` clears cookies.
- Banner, preferences panel and floating button across `bar` / `box` / `modal`,
  light and dark, with keyboard and ARIA checks.
- `dataLayer` event trace for consent restore, upgrade and withdrawal.
- npm entry points and TypeScript types: syntax and import smoke tests in Node
  without a DOM.
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
- **Translations beyond `en`, `ru`, `de` and `fr` are drafts.** They are usable
  but have not been reviewed by native speakers. Legal wording — "Reject all",
  "always active" — should be checked by someone who knows the local regulator's
  language before you rely on it.
- **There is no server-side consent log.** Consent lives only in the visitor's
  browser (cookie plus `localStorage`). GDPR accountability may require you to
  be able to *demonstrate* that consent was given; that record-keeping is not
  part of this prototype and you would have to build it yourself.
- No automated test suite and no CI beyond the Pages deployment; verification is
  the manual smoke checklist in [CONTRIBUTING.md](CONTRIBUTING.md).
- Not audited by a lawyer. ConsentKit is a technical building block, not legal
  advice, and it cannot make a site compliant on its own — your privacy policy,
  your cookie inventory and your record-keeping are still yours.

### Contributing

Structure of the repository, the GDPR invariants that must not change, and how
to run the checks: [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Copyright (c) 2026 E-COM CONSULT PLUS.

| Part | Licence |
|---|---|
| Client (`src/`), npm package, inline builder, demo | [MIT](LICENSE) |
| WordPress plugin (`plugins/wordpress/consentkit/`) | [GPL-2.0-or-later](plugins/wordpress/consentkit/LICENSE) |

The client is MIT so it can be embedded anywhere without licence friction. The
WordPress plugin ships under GPLv2+ because the WordPress ecosystem effectively
requires it; MIT permits the plugin to bundle copies of the client in its
`assets/` directory.

Contributions require a `Signed-off-by` line (DCO) — see
[CONTRIBUTING.md](CONTRIBUTING.md).
