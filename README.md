# ConsentKit

![status: prototype v0.3](https://img.shields.io/badge/status-prototype%20v0.3-orange)
![license: GPL--2.0--or--later](https://img.shields.io/badge/license-GPL--2.0--or--later-blue)
![dependencies: 0](https://img.shields.io/badge/dependencies-0-brightgreen)
![no build step](https://img.shields.io/badge/build-none-lightgrey)

GDPR cookie consent for the web: consent state, a blocking engine that stops
trackers *before* they run, a Shadow DOM banner, and Google Consent Mode v2.

Most cookie banners are decoration — the trackers fire on the first frame no
matter which button you press. ConsentKit blocks at parse time: nothing but
`necessary` runs until the visitor says so, and no request leaves the page
before that, including requests to a CDN or a font host.

Vanilla ES2020, zero dependencies, no build step.

- **Categories:** `necessary` (always on), `functional`, `analytics`, `marketing`
- **Blocking:** manual markup (`type="text/plain"`) plus automatic interception
  of dynamically injected scripts
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
| 2 | **npm** — `npm install consentkit` | Bundled apps, React | [Quickstart below](#quickstart--npm) |
| 3 | **WordPress plugin** — copy the plugin folder to `wp-content/plugins/` | WordPress / WooCommerce | [`plugins/wordpress/consentkit/`](plugins/wordpress/consentkit/) |
| 4 | **Google Tag Manager** — import the container, trigger tags on consent events | Sites already running GTM | [`integrations/gtm/README.md`](integrations/gtm/README.md) |

```sh
npm install consentkit
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
    layout: { type: 'box', position: 'bottom-right' },
    theme: { accent: '#2B50D8', mode: 'auto' }
  });
</script>
```

## Quickstart — npm

The main entry is a side-effect import: it loads the core, the locales and the
UI, then re-exports the API.

```js
import ConsentKit from 'consentkit';

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
const ConsentKit = require('consentkit');
ConsentKit.init({ policyVersion: '1' });
```

Named exports are available alongside the default:

```js
import { init, allowed, getState, accept, rejectAll, withdraw, show } from 'consentkit';
```

### Core without the UI

`consentkit/core` loads the consent engine and blocking only — no banner, no
locales. Use it when you ship your own interface.

```js
import ConsentKit from 'consentkit/core';

ConsentKit.init({ policyVersion: '1' });
ConsentKit.accept({ analytics: true, marketing: false });
```

### Import it once

`consentkit` is a side-effect module and the core is a singleton on the global
object. Import it at your entry point; importing it again elsewhere is harmless
but does not create a second instance.

## React

`react` is an optional peer dependency (`>=17`) — install it yourself.
`useConsent()` subscribes to the event bus and unsubscribes on unmount.

```jsx
import 'consentkit';                       // side effect: core + locales + UI
import { useConsent } from 'consentkit/react';

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
| `layout.position` | `string` | `"bottom"` | `bar`: `bottom`/`top`. `box`: `bottom-right`/`bottom-left`. Unknown combinations degrade to `bar`/`bottom` |
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

## TypeScript

Types ship with the package; no `@types` needed.

```ts
import ConsentKit from 'consentkit';
import type { CkConfig, CkState, CkCategory, UseConsentResult } from 'consentkit';
```

`document.addEventListener('ck:change', …)` is typed through a
`DocumentEventMap` augmentation, so `e.detail.state` resolves.

Requires `moduleResolution` of `node16`, `nodenext` or `bundler` — the package
uses `exports` subpaths, which the legacy `node` resolution cannot read.

## Browser support

Any browser with Shadow DOM and ES2020: Chrome/Edge 79+, Firefox 72+, Safari
13.1+. No polyfills, no external fonts or assets.

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
- PHP files of the WordPress plugin pass `php -l` on 7.4 and 8.5.

### Not verified — read before production use

- **The WordPress plugin has never run on a live WordPress install.** It passes
  linting and review, but no activation, settings round-trip, theme conflict or
  multisite behaviour has been observed in a real installation.
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

[GPL-2.0-or-later](LICENSE). The WordPress plugin already ships as GPLv2+, and
distributing WordPress plugins effectively requires GPL, so the whole repository
uses a single licence.
