=== ConsentKit ===
Contributors: consentkit
Tags: gdpr, cookie banner, consent, privacy, consent mode
Requires at least: 6.0
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.3.5
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
  requests them. This is on by default and covers about 70 known tracker hosts.
* Scripts injected by other code are intercepted automatically when their URL
  matches the same built-in database of known tracker domains (Google
  Analytics, Facebook, Yandex Metrica, Hotjar, TikTok, chat widgets).
* Google Consent Mode v2 signals are sent as `denied` at parse time and updated
  after the visitor decides.

Other features:

* Three layouts: bar, compact box, centered modal.
* Light, dark and automatic theme modes.
* 30+ built-in locales; unknown languages fall back to English.
* Preferences panel with per-category toggles and a cookie table.
* Keyboard accessible: focus trap, Esc to close, ARIA roles on toggles.

= Limitations =

* The server-side markup only knows the hosts in the built-in database, and it
  does not rewrite inline scripts — an inline tracker snippet still needs
  manual markup or a GTM trigger.
* The automatic tracker database is small and matches by domain. Trackers served
  from your own domain or from an unlisted vendor need manual `data-ck` markup.
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

= 0.3.5 =
Adds server-side tracker markup, on by default: tracker tags written into your
theme are now blocked before the browser can request them. Review Settings →
ConsentKit after updating.

= 0.3.0 =
Initial release of the prototype.
