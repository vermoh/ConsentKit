# `site/` — the public page, consentkit.ecomconsult.net

A single static page: offer, a **live banner demo**, how it works, features,
pricing, who it is for, FAQ. No framework, no build step, and **only our own
API** — a page arguing for privacy must not itself load a third-party font,
script or beacon. The single request it makes off its own origin is
`GET {API_BASE}/v1/public/pricing`, our API, for the prices; there is no
third-party font, script, beacon or analytics of any kind.

```
site/
  index.html      structure + static RU meta tags
  styles.css      all styling (system font stack only)
  app.js          i18n dictionary, pricing render, demo wiring, owner constants
  vendor/         the client the demo runs on — generated, do not edit
    ck-core.js
    ck-locales.js
    ck-ui.js
  og.png          1200x630 Open Graph card
  favicon.svg
  robots.txt      indexing allowed
  sitemap.xml
  vercel.json     static serving + security headers
```

## Deployment

A **separate** Vercel project from the dashboard:

| Setting | Value |
|---|---|
| Framework preset | Other |
| Root Directory | `site` |
| Build Command | *(empty — there is no build)* |
| Output Directory | `.` |
| Install Command | *(empty)* |

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
`src/ck-core.js`, `src/ck-ui.js` or `src/ck-locales.js`:

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

Both languages live in the `I18N` object in `app.js` — `ru` and `en`, the same
key set. Markup carries `data-i18n="key"` (text) and
`data-i18n-aria-label="key"`; the pricing table and the FAQ are rendered from
the dictionary in JavaScript. The default language follows `navigator.language`
(`ru-*` → RU, otherwise EN) and the visitor's choice is remembered in
`localStorage` under `ck_site_lang`.

Every string is inserted with `textContent`, never `innerHTML` — several strings
legitimately contain `<script src>` and must not be parsed as markup.

**Known SEO limitation:** RU and EN share one URL. `app.js` swaps `<title>`,
`meta[name=description]`, the `og:` pair and `documentElement.lang` on switch,
but crawlers that do not run JavaScript only ever see the static Russian pair in
`index.html`. Per-language routes (`/en/`) would be the fix if English organic
traffic ever matters.

## Local preview

```sh
npx --yes http-server site -p 8790
```

Then open <http://localhost:8790/>. Add `-c-1` to disable caching while editing.
Note that `vercel.json` headers are **not** applied by a plain static server, so
anything header-dependent has to be checked on a Vercel preview deployment.
