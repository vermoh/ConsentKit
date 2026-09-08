/* What the tracker database actually classifies a URL as.
 *
 * Sections are added per release; this one covers the 0.5.9 wave.
 *
 * 0.5.9 adds 37 hosts to HOST_DB and 5 to INFRA_DB — embedded players and
 * social plugins, chat/CRM widgets, payment and error reporting, and two more
 * hosting platforms. A host database is data, and data is exactly what rots
 * silently: an entry typed into the wrong block, or shadowed by a broader key
 * inserted above it, changes what a real site holds back and nothing else in
 * the suite would notice.
 *
 * lookupHostMap returns the FIRST matching key, not the longest (see the
 * stat.tildaapi.one note in src/ck-core.js), so a table-driven check of one
 * sample URL per host is the only thing that pins insertion order down.
 *
 * Loaded the way version.test.mjs loads the core: a window stub plus
 * vm.runInThisContext, then the API is read back off the global.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadCore() {
  global.window = global;
  global.self = global;
  vm.runInThisContext(readFileSync(join(REPO, 'src', 'ck-core.js'), 'utf8'),
    { filename: 'src/ck-core.js' });
  const api = global.ConsentKit;
  assert.ok(api, 'src/ck-core.js did not attach window.ConsentKit');
  return api;
}

/* ---------------------------------------------------- 0.5.9 additions */

/* One realistic URL per host added in 0.5.9, with the category it must get.
   Realistic on purpose: a bare https://<host>/ would pass even if the entry
   only ever matched the apex, and every one of these is embedded through a
   subdomain or a deep path in the wild. */
const CASES = [
  // --- marketing: players and social plugins that feed an ad profile -------
  ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'marketing'],
  ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'marketing'],
  ['https://www.facebook.com/plugins/like.php?href=x', 'marketing'],
  ['https://www.instagram.com/p/Cabc123/embed/', 'marketing'],
  ['https://scontent.cdninstagram.com/v/t51/photo.jpg', 'marketing'],
  // Owner's finding 06.09.2026 (admin «Трекеры»): the Bing pixel UET and
  // Clarity fire, seen on a customer site as c.bing.com /c.gif.
  ['https://c.bing.com/c.gif?RD=1', 'marketing'],
  // Owner's findings 07.09.2026 (admin «Трекеры», estheticlab.pro audit).
  ['https://static.xx.fbcdn.net/rsrc.php/v4/yB/r/an7UzX-0acj.js', 'marketing'],
  ['https://scontent.fvno8-1.fna.fbcdn.net/v/t1.30497-1/453178253.png', 'marketing'],
  ['https://cdn.sendpulse.com/js/push/sdk.js', 'marketing'],
  // Owner's findings 08.09.2026 (audit): the TikTok video embed, host by host —
  // the loader, the asset/video CDNs, the monitoring endpoint, the web security
  // SDK and the embed library. Each regional twin is a separate registrable
  // domain, so each needs its own entry to be covered at all.
  ['https://www.tiktok.com/embed.js', 'marketing'],
  ['https://www.tiktok.com/embed/v2/7359587340014079237', 'marketing'],
  ['https://v45.tiktokcdn-eu.com/abc/mp4/main.mp4', 'marketing'],
  ['https://p16-common-sign.tiktokcdn-eu.com/tos-maliva-avt-0068/img~tplv.jpeg', 'marketing'],
  ['https://mon16-normal-no1a.tiktokv.eu/monitor_web/settings/browser-settings', 'marketing'],
  ['https://webmssdk16-normal-no1a.tiktokw.eu/web/resource', 'marketing'],
  ['https://sf16-website-login.neutral.ttwstatic.com/obj/tiktok_web_login_static/tiktok/falcon/embed/embed_lib_v1.0.13.js', 'marketing'],
  ['https://sf16-website-login.neutral.tiktokcdn-eu.com/obj/tiktok_web_login_static_eu/loader/core.js', 'marketing'],
  // Meta's client-side CAPI Parameter Builder, delivered from an S3 bucket. It
  // reads fbclid/_fbp/_fbc and feeds the server-side Conversions API — the same
  // ad profile as the Pixel, so the same category.
  ['https://capi-automation.s3.us-east-2.amazonaws.com/public/client_js/capiParamBuilder/clientParamBuilder.bundle.js', 'marketing'],

  // --- functional by PATH: a self-hosted Bitrix24 CRM form ------------------
  // The finding was rdp.ecosanteh.md; any host works, because that is the point
  // of naming this by path — see the PATH_DB comment.
  ['https://rdp.example.md/bitrix/js/crm/site/form/dist/app.bundle.min.js', 'functional'],
  ['https://rdp.example.md/upload/crm/form/loader_7_vrx27s.js', 'functional'],
  ['https://rdp.example.md/upload/crm/form/app.js', 'functional'],

  // --- functional: features the owner chose --------------------------------
  ['https://vimeo.com/api/oembed.json?url=x', 'functional'],
  ['https://player.vimeo.com/video/76979871', 'functional'],
  ['https://f.vimeocdn.com/p/4.6.0/js/player.js', 'functional'],
  ['https://bubble.aichat.md/apif/serve/chatbot-script.js', 'functional'],
  ['https://aichat.md/api/v1/widget/loader.js', 'functional'],
  ['https://widget.freshworks.com/widgets/1.js', 'functional'],
  ['https://wchat.freshchat.com/js/widget.js', 'functional'],
  ['https://euc-widget.freshdesk.com/widgets/1.js', 'functional'],
  ['https://button.viber.com/static/chat.js', 'functional'],
  ['https://telegram.org/js/telegram-widget.js', 'functional'],
  ['https://t.me/js/widget.js', 'functional'],
  ['https://mycompany.bitrix24.ru/upload/crm/site_button/loader.js', 'functional'],
  ['https://mycompany.bitrix24.com/upload/crm/site_button/loader.js', 'functional'],
  ['https://mycompany.bitrix24.eu/upload/crm/site_button/loader.js', 'functional'],
  ['https://forms.amocrm.ru/forms/assets/js/amoforms.js', 'functional'],
  ['https://forms.amocrm.com/forms/assets/js/amoforms.js', 'functional'],
  ['https://assets.calendly.com/assets/external/widget.js', 'functional'],
  ['https://embed.typeform.com/next/embed.js', 'functional'],
  ['https://999.md/js/widget.js', 'functional'],
  ['https://ex.simpalsmedia.com/banner/loader.js', 'functional'],
  // Owner's finding 08.09.2026 (audit): GrowthBook's SDK fetches the flag
  // payload that decides which variant of the page the visitor is shown.
  ['https://cdn.growthbook.io/api/features/sdk-AbC123XyZ', 'functional'],

  // --- necessary: named, never held ----------------------------------------
  ['https://browser.sentry-cdn.com/7.0.0/bundle.min.js', 'necessary'],
  ['https://o123456.ingest.sentry.io/api/1/envelope/', 'necessary'],
  ['https://sentry.io/api/1/store/', 'necessary'],
  ['https://www.paypal.com/sdk/js?client-id=x', 'necessary'],
  ['https://www.paypalobjects.com/js/external/api.js', 'necessary'],
  ['https://paynet.md/acquiring/pay', 'necessary'],
  ['https://maib.md/ecomm/ClientHandler', 'necessary'],
  ['https://maibank.md/api/payment', 'necessary'],
  ['https://js.stripe.com/v3/', 'necessary'],
  ['https://api.stripe.com/v1/tokens', 'necessary'],
  ['https://m.stripe.network/inner.html', 'necessary'],
  ['https://my-site.elementor.com/assets/js/frontend.js', 'necessary'],
  // Owner's findings 08.09.2026 (audit): the Simpals group's sign-in service
  // and its self-hosted Sentry, both plumbing rather than a decision.
  ['https://v2.simpalsid.com/graphql', 'necessary'],
  ['https://newsentry.simpals.md/api/13/envelope/', 'necessary'],

  // --- analytics ------------------------------------------------------------
  ['https://vercel-insights.com/v1/vitals', 'analytics']
];

test('every host added in 0.5.9 classifies as intended', () => {
  const CK = loadCore();
  for (const [url, want] of CASES) {
    assert.equal(CK._categoryForUrl(url), want,
      `${url} should be ${want}, got ${CK._categoryForUrl(url)}`);
  }
});

test('the 0.5.9 infrastructure hosts carry no category and are waved through', () => {
  /* The §8 invariant blocking.test.mjs enforces over the whole list, asserted
     here on the five new entries by name so a mis-filed addition says which
     one it was. ytimg.com is the interesting case: the PLAYER is marketing on
     youtube.com, while the thumbnail host beside it must stay infrastructure —
     a held placeholder still wants its poster image. */
  const CK = loadCore();
  for (const host of ['vercel.app', 'vercel.com', 'netlify.app', 'netlify.com', 'ytimg.com', 'challenges.cloudflare.com', 'i.imgur.com']) {
    assert.ok(CK._infra().includes(host), `${host} is missing from _infra()`);
    assert.equal(CK._categoryForUrl('https://' + host + '/x.js'), null,
      `${host} is infrastructure but the database also gives it a category`);
    assert.ok(CK._isInfra(host), `_isInfra(${host}) should be true`);
  }
  assert.ok(CK._isInfra('hagen.challenges.cloudflare.com'), 'a challenge subdomain is infrastructure too');
  assert.equal(CK._categoryForUrl('https://i.ytimg.com/vi/abc/hqdefault.jpg'), null,
    'the YouTube thumbnail host must stay uncategorised');
  assert.equal(CK._categoryForUrl('https://www.youtube.com/embed/abc'), 'marketing',
    '…while the player itself stays marketing');
});

test('Vercel Web Analytics is analytics, and the platform around it is not', () => {
  /* The same split §8 already makes for Cloudflare: the platform is
     infrastructure, the measurement product beside it is not. They are separate
     registrable domains, so neither shadows the other — this is the guard
     against someone "tidying" them into one entry. */
  const CK = loadCore();
  assert.equal(CK._categoryForUrl('https://vercel-insights.com/v1/vitals'), 'analytics');
  assert.ok(!CK._isInfra('vercel-insights.com'),
    'the analytics beacon must not be waved through as infrastructure');
  assert.ok(!CK._infra().includes('vercel-insights.com'));
  assert.equal(CK._categoryForUrl('https://my-app.vercel.app/main.js'), null,
    'the hosting platform itself carries no category');
});

/* --------------------------------------------------- 08.09.2026 additions */

test('the Simpals necessary hosts do not leak onto the rest of the group', () => {
  /* hostMatches is plain suffix matching, so the EXACT host newsentry.simpals.md
     cannot match simpals.md — and that is the whole point of naming it that way:
     the group runs consumer sites on the parent domain, and calling those
     `necessary` would wave a real decision through unseen. 999.md is the group's
     classifieds platform and must keep the `functional` it has carried since
     0.5.9, not inherit `necessary` from a sibling entry. */
  const CK = loadCore();
  assert.equal(CK._categoryForUrl('https://simpals.md/'), null,
    'the parent domain of the self-hosted Sentry must stay unclassified');
  assert.equal(CK._categoryForUrl('https://www.simpals.md/news/'), null,
    'a sibling subdomain must stay unclassified too');
  assert.equal(CK._categoryForUrl('https://newsentry.simpals.md/api/13/envelope/'), 'necessary',
    '…while the exact Sentry host is still named');
  assert.equal(CK._categoryForUrl('https://999.md/js/widget.js'), 'functional',
    '999.md keeps its own category and does not become necessary');
  assert.ok(!CK._isInfra('simpals.md'), 'simpals.md must not be waved through either');
});

test('the 08.09.2026 infrastructure host carries no category and is waved through', () => {
  /* csp.withgoogle.com receives Content-Security-Policy violation reports from
     Google-hosted frames. Named as the exact subdomain, because withgoogle.com
     carries a long tail of unrelated Google microsites. */
  const CK = loadCore();
  assert.ok(CK._infra().includes('csp.withgoogle.com'),
    'csp.withgoogle.com is missing from _infra()');
  assert.equal(CK._categoryForUrl('https://csp.withgoogle.com/csp/frame-ancestors/1234'), null,
    'a CSP report endpoint is infrastructure and must carry no category');
  assert.ok(CK._isInfra('csp.withgoogle.com'), '_isInfra(csp.withgoogle.com) should be true');
  assert.ok(!CK._isInfra('withgoogle.com'),
    'the bare parent must not be waved through — it hosts unrelated Google sites');
});

/* --------------------------------------------------- 0.5.19 additions */

test('the Meta CAPI parameter builder is named as the exact bucket, and nothing broader', () => {
  /* This is the entry most likely to be "tidied" into something shorter, and
     shortening it would be the single most destructive edit in the table:
     amazonaws.com carries an enormous share of the internet's OWN assets, so a
     bare suffix would rule `marketing` on all of them at once and hold a shop's
     product images behind the marketing toggle. lookupHostMap returns the FIRST
     match rather than the longest, so this must also never be shadowed from
     above. */
  const CK = loadCore();
  assert.equal(CK._categoryForUrl('https://capi-automation.s3.us-east-2.amazonaws.com/public/client_js/capiParamBuilder/clientParamBuilder.bundle.js'), 'marketing',
    'the CAPI parameter builder feeds the same ad profile as the Meta Pixel');
  assert.equal(CK._categoryForUrl('https://example-bucket.s3.us-east-2.amazonaws.com/img/product.jpg'), null,
    'a neighbouring bucket in the same region must stay unclassified');
  assert.equal(CK._categoryForUrl('https://amazonaws.com/x.js'), null,
    'the bare registrable domain must never carry a category');
  assert.equal(CK._categoryForUrl('https://s3.us-east-2.amazonaws.com/some/object.js'), null,
    'nor the regional S3 endpoint the bucket hangs off');
});

test('the TikTok embed is covered on every one of its hosts', () => {
  /* hostMatches is plain suffix matching with no pattern form, so the regional
     twins are not variants of one entry — tiktokcdn-eu.com is a different
     registrable domain from tiktokcdn.com and is covered only because it is
     written out. This is the guard against someone collapsing the block back
     into a single "tiktokcdn.com" and silently losing the EU traffic, which is
     the half the finding actually observed. */
  const CK = loadCore();
  for (const host of ['tiktok.com', 'tiktokcdn.com', 'tiktokcdn-eu.com', 'tiktokcdn-us.com',
    'tiktokv.eu', 'tiktokv.com', 'tiktokw.eu', 'tiktokw.com', 'ttwstatic.com']) {
    assert.equal(CK._categoryForUrl('https://sub.' + host + '/x.js'), 'marketing',
      `${host} should be marketing on a subdomain too`);
    assert.ok(!CK._isInfra(host),
      `${host} must not be waved through as infrastructure — the embed is a decision`);
  }
  assert.equal(CK._categoryForUrl('https://analytics.tiktok.com/i18n/pixel/events.js'), 'marketing',
    'the Pixel host stays marketing under the bare entry that now also covers it');
});

test('the self-hosted Bitrix24 form is caught by path, on any host', () => {
  /* The cloud form is covered by the bitrix24.* hosts; an on-premise Bitrix
     serves the same widget from the company's own domain, where no host entry
     can reach it. These fragments lead with a path, so they match every host
     including the site's own — intended here, and the reason both keys stay
     specific to Bitrix's own layout rather than a bare '/upload/crm/form/'. */
  const CK = loadCore();
  assert.equal(CK._categoryForUrl('https://rdp.example.md/bitrix/js/crm/site/form/dist/app.bundle.min.js'), 'functional',
    'the on-premise CRM form bundle is the same lead form as the cloud one');
  assert.equal(CK._categoryForUrl('https://rdp.example.md/upload/crm/form/loader_7_vrx27s.js'), 'functional',
    'and so is its generated loader');
  assert.equal(CK._categoryForUrl('https://rdp.example.md/upload/crm/form/app.js'), 'functional',
    'and the runtime that loader pulls in');
  assert.equal(CK._categoryForUrl('https://rdp.example.md/upload/images/x.jpg'), null,
    'an ordinary upload on the same site must stay unclassified');
  assert.equal(CK._categoryForUrl('https://rdp.example.md/bitrix/js/main/core/core.js'), null,
    'and so must the rest of a Bitrix site that is not the CRM form');
  assert.equal(CK._categoryForUrl('https://mycompany.bitrix24.ru/upload/crm/site_button/loader.js'), 'functional',
    'the cloud site-button loader keeps the category its host already gave it');
});
