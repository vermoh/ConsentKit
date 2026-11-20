# Platform logos

The marks of the platforms ConsentKit installs on, shown in the «Ставится на
любой сайт» row under the first screen of the site (SPEC V1.30.2 §4.3,
owner's addition of 20.11.2026).

- Source of the eight Simple Icons marks: [Simple Icons](https://simpleicons.org)
  16.38.0, files copied unchanged from `icons/` of the npm package. The collection is released under
  CC0 1.0 Universal; the licence text is `LICENSE.md` beside this file. The
  package's own per-icon licence data names no other licence for these eight.
- The trademarks and logos belong to their owners: WordPress, WooCommerce,
  Shopify, Wix, Webflow, Squarespace, PrestaShop, Google Tag Manager, Tilda
  and OpenCart. They
  are used nominatively, to say what ConsentKit works with. No endorsement or
  partnership is implied.
- `tools/build-site.mjs` inlines the paths into the page (no request is made),
  monochrome in the page's secondary ink, hidden from assistive technology;
  each logo stands beside its platform's name as text. The two wordmarks
  (WooCommerce, Wix) spell the name themselves, so their name is kept for
  screen readers only.
- Tilda and OpenCart have no mark in Simple Icons. Since SPEC V1.30.4 §2 they
  have their own files here, neither covered by the CC0 text in `LICENSE.md`:
  - `tilda.svg` — the Tilda circle-and-T mark from Tilda's own site
    (`https://static.tildacdn.net/tild3864-3136-4261-a561-303435643838/logo.svg`,
    320×320, `fill="#333333"`). The three paths are copied unchanged; the
    colour was removed so the page paints it (currentColor), and the viewBox
    is narrowed to the circle's bounds (`20 20 280 280`) so it sits at the size
    of the other marks. The mark belongs to Tilda Publishing and is used
    nominatively, as the others are.
  - `opencart.svg` — the OpenCart wordmark from Wikimedia Commons, «File:OpenCart
    logo.svg» (author: OpenCart; licence: public domain), 400×78. The path and
    its transform are copied unchanged; the blue gradient and its `<defs>` were
    removed for a single currentColor fill. A wordmark: in the row it stands
    without a separate name, as an image whose accessible name is «OpenCart».
- `tools/build-site.mjs` refuses a brand file that carries a colour, a style,
  a gradient or a reference of its own, so a re-download cannot bring the
  gradient back unnoticed.
