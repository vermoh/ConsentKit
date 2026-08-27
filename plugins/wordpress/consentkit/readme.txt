=== ConsentKit ===
Contributors: consentkit
Tags: gdpr, cookie banner, consent, privacy, consent mode
Requires at least: 6.0
Tested up to: 6.6
Requires PHP: 7.4
Stable tag: 0.3.0
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
* Scripts injected by other code are intercepted automatically when their URL
  matches a small built-in database of known tracker domains (Google Analytics,
  Google Tag Manager, Facebook, Yandex Metrica, Hotjar, TikTok).
* Google Consent Mode v2 signals are sent as `denied` at parse time and updated
  after the visitor decides.

Other features:

* Three layouts: bar, compact box, centered modal.
* Light, dark and automatic theme modes.
* 30+ built-in locales; unknown languages fall back to English.
* Preferences panel with per-category toggles and a cookie table.
* Keyboard accessible: focus trap, Esc to close, ARIA roles on toggles.

= Limitations =

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

= 0.3.0 =
* First WordPress packaging of the ConsentKit prototype.
* Settings page: categories, language, layout, theme mode, accent, policy
  version, cookie table.
* `[consentkit_settings]` shortcode.
* dataLayer events per granted category for Google Tag Manager triggers.

== Upgrade Notice ==

= 0.3.0 =
Initial release of the prototype.
