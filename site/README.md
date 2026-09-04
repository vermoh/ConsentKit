# `site/` — the public page, consentkit.ecomconsult.net

A single static page: offer, a **live banner demo**, how it works, features,
pricing, who it is for, FAQ. No framework, no build step, and **only our own
API** — a page arguing for privacy must not itself load a third-party font,
script or beacon. The single request it makes off its own origin is
`GET {API_BASE}/v1/public/pricing`, our API, for the prices; there is no
third-party font, script, beacon or analytics of any kind.

```
site/
  src/                       THE SOURCE — edit these
    index.template.html      page structure, with {{PLACEHOLDERS}} and data-i18n
    i18n/en.json             the copy, one file per language …
    i18n/ru.json
    i18n/ro.json
  index.html      GENERATED — English, canonical /
  ru/index.html   GENERATED — Russian, canonical /ru
  ro/index.html   GENERATED — Romanian, canonical /ro
  sitemap.xml     GENERATED — all three URLs
  styles.css      all styling (system font stack only)
  app.js          pricing render, demo wiring, owner constants
  vendor/         the client the demo runs on — generated, do not edit
    ck-core.js
    ck-locales.js
    ck-ui-branding.js
    ck-ui.js
    ck-debug.js
  og.png          1200x630 Open Graph card
  favicon.svg
  robots.txt      indexing allowed
  vercel.json     static serving + security headers
```

The four **GENERATED** entries are written by `tools/build-site.mjs` and are
committed so the Vercel project (which has no build step) can serve them
directly. Never edit them by hand — `test/site-build.test.mjs` fails when they
drift from `site/src/`, and the next build silently reverts the edit anyway.

## Deployment

A **separate** Vercel project from the dashboard:

| Setting | Value |
|---|---|
| Framework preset | Other |
| Root Directory | `site` |
| Build Command | *(empty — the pages are built in the repo, not here)* |
| Output Directory | `.` |
| Install Command | *(empty)* |

The three pages are rendered by `node tools/build-site.mjs` and **committed**, so
Vercel still deploys a plain static directory with no build step of its own.
`cleanUrls: true` and `trailingSlash: false` in `vercel.json` mean Vercel serves
`site/ru/index.html` at `/ru` and redirects `/ru/` → `/ru` — which is why the
canonical URLs, the `hreflang` alternates, the sitemap and the switcher links are
all written without a trailing slash.

DNS: a `CNAME` record `consentkit` → the Vercel target, added as a domain on
that project. `vercel.json` sets the security headers. Unlike the dashboard's
config it deliberately carries **no** `X-Robots-Tag: noindex` — this page is
meant to be found.

Headers mirror the dashboard's `vercel.json`, with two deliberate differences:

- **No `X-Robots-Tag: noindex`** — this page is meant to be found.
- `Referrer-Policy` is `strict-origin-when-cross-origin` rather than the
  dashboard's `same-origin`, because this page links out (GitHub, npm, the
  dashboard) and those targets should still see the referring origin.

There is deliberately **no Content-Security-Policy**. A `style-src` policy
without `'unsafe-inline'` would block the banner: `ck-ui.js` styles its shadow
root by creating `<style>` elements and setting their text, which CSP's inline
check does cover. If a CSP is added later it needs `style-src 'self'
'unsafe-inline'` and a `connect-src` that admits `API_BASE` (otherwise the
pricing request is blocked and the page silently falls back to the constants),
and it must be verified on a Vercel preview deployment — a
plain local static server does not apply these headers, so the failure mode
(an unstyled banner on the page whose selling point is the banner) is invisible
locally.

## Changing the contact email

One constant, at the top of `app.js`:

```js
var CONTACT_EMAIL = 'CONTACT_EMAIL';
```

Replace the placeholder with the real address. The Agency card's «Написать» /
«Get in touch» button is a `mailto:` built from it, and it appears nowhere else
in the repository.

## Changing prices

Prices and limits come from the API at runtime:

```js
var API_BASE = 'https://consent.ecomconsult.net';
```

`app.js` requests `GET {API_BASE}/v1/public/pricing` (SPEC-V1.4 §2) once at
boot, with a **2-second timeout**. So the place to change a price is the
dashboard's `#/admin/plans`, not this repository — the page picks it up within
the endpoint's five-minute cache. Plans the admin marks non-public are absent
from the response and so from the page.

The constants immediately below `API_BASE` in `app.js` are the **fallback**,
rendered whenever the API is unreachable, slow, or answers with something
malformed:

```js
var PRICES      = { free: 0, starter: 9, business: 69 };   // EUR per month
var SITE_LIMITS = { free: 1, starter: 1, business: 10, agency: null };
var PRICE_UNITS = { starter: 'site_month', ... };
var PLAN_LIMITS = { free: { scansManualPerDay: 1, journalRetentionDays: 30, ... }, ... };
```

Both sources are normalised into the same plan descriptors *before* anything is
drawn, and validation is **all-or-nothing**: one malformed plan discards the
whole response and the constants stay. That is what guarantees the section is
never empty and never shows a mix of live and fallback numbers. The constants
paint on the first frame; a good response replaces the block wholesale.

Every word around a number lives in the `I18N` dictionary — `perSitePerMonth`,
`perMonth`, `byAgreement`, the `scans*` and `log*` templates (`{n}` is
substituted) and the `unitDay*` / `unitMonth*` plural forms, which Russian
needs in three variants. The comparison rows are the `PLAN_ROWS` table, whose
second element is a function from a descriptor to a string.

One deliberate special case: the API sends `limits.sites: null` for Starter
(per `src/domain/plans.ts`, the real ceiling is `orgs.paid_sites`, not the plan
table). `sitesText()` therefore checks `priceUnit === 'site_month'` **before**
treating `null` as "unlimited" — otherwise the card would advertise unlimited
sites at a per-site price.

Keep the fallback in step with `PLAN-V1.3.md` §1 and with `src/domain/plans.ts`
on the server — this page is marketing copy, the server is the enforcement
point.

## Re-syncing the vendored client

`site/vendor/` is a **copy** of `src/`, because the Vercel project's root is
`site` and the deployment cannot reach `../src/`. After any change to
`src/ck-core.js`, `src/ck-ui.js`, `src/ck-ui-branding.js` or `src/ck-locales.js`:

```sh
node tools/sync-site.mjs          # copy src/ -> site/vendor/
node tools/sync-site.mjs --check  # verify only, exits 1 on drift
npm test                          # test/site-vendor.test.mjs asserts sha256 equality
```

`test/site-vendor.test.mjs` fails the build when the copy goes stale, so the
demo on the marketing page can never quietly run an older client than the one
the page is selling. `src/ck-saas.js` is deliberately **not** vendored: the demo
runs on a static config and never talks to the SaaS API.

## Translations

Three languages, three URLs, **no runtime language switching**:

| Language | URL | Source of the copy |
|---|---|---|
| English (default) | `/` | `site/src/i18n/en.json` |
| Russian | `/ru` | `site/src/i18n/ru.json` |
| Romanian | `/ro` | `site/src/i18n/ro.json` |

`tools/build-site.mjs` renders `site/src/index.template.html` once per language
and writes the whole dictionary into a `<script>` block on the page, so each URL
is static HTML with its own `<html lang>`, `<title>`, meta description, `og:`
pair, canonical and `hreflang` alternates (plus `x-default` → `/`). The
switcher is three plain links. `app.js` reads
`document.documentElement.lang` for the plural rules and the demo banner's
language, and nothing else.

### Editing copy

1. Edit the JSON — **all three files**, or the key-parity test fails.
2. Rebuild and verify:

```sh
node tools/build-site.mjs          # render site/{,ru/,ro/}index.html + sitemap.xml
node tools/build-site.mjs --check  # verify only, exits 1 on drift
npm test                           # test/site-build.test.mjs
```

Markup carries `data-i18n="key"` (element text) and `data-i18n-aria-label="key"`;
the pricing table, the FAQ and the demo selects are rendered from the same
dictionary in JavaScript. The build **fails loudly** on a key the dictionary does
not carry, so a typo cannot ship as another language's text.

Every string is inserted with `textContent`, never `innerHTML` — several strings
legitimately contain `<script src>` and must not be parsed as markup. For the
same reason the inlined dictionary escapes `<` as `\u003c`: a raw
`JSON.stringify` would end the `<script>` block at the first `</script` the HTML
parser saw.

### Plural forms

Every dictionary carries `One` / `Few` / `Many` for each unit, even where a
language does not need all three — that is what keeps the key sets identical and
the parity test meaningful.

| | Rule | `unitDay*` |
|---|---|---|
| `en` | 1 / everything else (`Few` = `Many`) | 1 day, 2 days |
| `ru` | last digit, with the 11–19 exception | 1 день, 2 дня, 5 дней |
| `ro` | 1 / 2–19 / 20+ takes «de» | 1 zi, 2 zile, 20 de zile |

### ⚠️ Romanian needs a native review

`site/src/i18n/ro.json` was translated from the Russian and English copy by the
author of this change, who is **not a native Romanian speaker**. The grammar and
the plural rules were written deliberately (including the «de» linker from 20
up), but idiom, marketing tone and terminology choices — «urmăritori» for
trackers, «panou de control» for the dashboard, «consimțământ» throughout —
have not been checked by a native speaker. Have one read it before treating
`/ro` as finished marketing copy.

## Local preview

```sh
npx --yes http-server site -p 8790
```

Then open <http://localhost:8790/>, <http://localhost:8790/ru/> and
<http://localhost:8790/ro/>. Add `-c-1` to disable caching while editing, and
re-run `node tools/build-site.mjs` after every change to `site/src/` — the server
serves the generated files, not the template.

Two caveats, both invisible locally:

- `vercel.json` headers are **not** applied by a plain static server, so anything
  header-dependent has to be checked on a Vercel preview deployment.
- A plain static server resolves `/ru` and `/ru/` alike, while Vercel's
  `cleanUrls` + `trailingSlash: false` redirects one to the other. The canonical
  form is the one without the slash.
