/* ConsentKit branding extension — logo + "powered by" line for the banner and panel.

   OPTIONAL BY DESIGN. src/ck-ui.js renders branding only when this file has
   registered itself; with the file absent it draws no logo, no attribution and
   no branding CSS, and nothing errors. That is the whole point of the split:
   an integrator who never sets `config.branding` should not ship ~19 KB of SVG
   sanitiser and brand styling to every visitor, and tools/build-inline.mjs
   --no-branding now drops the code rather than only the config object.

   LOAD ORDER: before ck-ui.js. Registration has to happen before the first
   mount(), and a page that calls ConsentKit.init() straight after ck-ui.js
   mounts during the ck:init dispatch — earlier than any later-loading file
   could register. Loading before ck-ui.js is unconditionally safe.

     <script src="ck-core.js"></script>
     <script src="ck-locales.js"></script>
     <script src="ck-ui-branding.js"></script>   <!-- optional -->
     <script src="ck-ui.js"></script>

   The contract with ck-ui.js is the object published on
   window.ConsentKit._uiExtensions.branding, below. ck-ui.js owns the DOM
   helpers and the localised strings and passes them in per call as `host`
   ({ el, str, T }), so the dictionary, STR_KEYS and the en fallback stay in one
   place and this file never reaches into ck-ui's closure.

   Copyright (c) 2026 E-COM CONSULT PLUS. MIT License — see LICENSE. */
(function () {
  'use strict';

  /* Restraint is the design rule here, not a matter of taste.

     A consent banner is shown to every visitor of the site that installs it,
     and it asks them a legal question. An agency logo, agency colours and an
     attribution line all at once make it read as the agency's dialogue rather
     than the site's own — visitors trust it less, and the banner competes with
     the page it sits on.

     So: everything in `branding` is off unless asked for, and the recommended
     shape is one small logo (16–20px) OR one attribution line — with
     theme.accent left matching the HOST SITE, never the agency's colour.
     Nothing here may outweigh the consent buttons. */

  /* SVG sanitiser.

     branding.logo may be a raw SVG string coming from a server-rendered config
     or a WordPress admin field. That is untrusted input, so it never reaches
     innerHTML: `<svg onload=...>` executes on insertion, and so do SMIL
     `<animate onbegin=...>` and `<foreignObject><img onerror=...>`.

     Approach chosen: parse inert, then REBUILD rather than strip-and-adopt.
     DOMParser with 'image/svg+xml' yields a detached, non-live document where
     nothing runs. We then walk that tree and construct a brand-new tree with
     createElementNS, copying across only allowlisted tags and attributes.

     Rebuilding is what makes this safe rather than merely careful. The rejected
     alternative — importNode/appendChild the parsed tree after deleting bad
     attributes — arms every inline handler at the moment of adoption, so a
     single missed attribute name is live code. Here an attribute we do not
     recognise is simply never written, so the failure mode is a missing
     decoration, not script execution. Allowlists (closed) beat blocklists
     (open-ended) for the same reason.

     Deliberately excluded, each for a concrete reason:
       script                       - obvious
       foreignObject                - escape hatch back into full HTML
       use, image                   - can reference/fetch external documents
       a                            - javascript: navigation inside the logo
       style                        - CSS escapes, and it would leak out of the
                                      logo into our own shadow-root styling
       animate/set/animateTransform - SMIL takes an attributeName and can drive
                                      arbitrary attributes, plus on* timing events

     Anything unexpected bails to null (no logo) rather than partially rendering. */

  /* Local copy of ck-ui's str(): this file is loaded before ck-ui.js and must
     not reach into its closure. Same contract — trimmed string or null. */
  function str(v) {
    return (typeof v === 'string' && v.trim()) ? v.trim() : null;
  }

  var SVG_NS = 'http://www.w3.org/2000/svg';

  var SVG_TAGS = {
    svg: 1, g: 1, path: 1, circle: 1, ellipse: 1, rect: 1, line: 1,
    polyline: 1, polygon: 1, defs: 1, title: 1, desc: 1,
    lineargradient: 1, radialgradient: 1, stop: 1, clippath: 1, mask: 1
  };

  // Presentation/geometry only. No href/xlink:href in any form, no on* events.
  var SVG_ATTRS = {
    viewbox: 'viewBox', preserveaspectratio: 'preserveAspectRatio',
    xmlns: 'xmlns', version: 'version',
    d: 'd', fill: 'fill', 'fill-rule': 'fill-rule', 'fill-opacity': 'fill-opacity',
    'clip-rule': 'clip-rule', 'clip-path': 'clip-path', mask: 'mask',
    stroke: 'stroke', 'stroke-width': 'stroke-width', 'stroke-linecap': 'stroke-linecap',
    'stroke-linejoin': 'stroke-linejoin', 'stroke-dasharray': 'stroke-dasharray',
    'stroke-dashoffset': 'stroke-dashoffset', 'stroke-opacity': 'stroke-opacity',
    'stroke-miterlimit': 'stroke-miterlimit',
    opacity: 'opacity', transform: 'transform',
    x: 'x', y: 'y', x1: 'x1', y1: 'y1', x2: 'x2', y2: 'y2',
    cx: 'cx', cy: 'cy', r: 'r', rx: 'rx', ry: 'ry',
    width: 'width', height: 'height', points: 'points',
    offset: 'offset', 'stop-color': 'stop-color', 'stop-opacity': 'stop-opacity',
    gradientunits: 'gradientUnits', gradienttransform: 'gradientTransform',
    spreadmethod: 'spreadMethod', clippathunits: 'clipPathUnits',
    maskunits: 'maskUnits', maskcontentunits: 'maskContentUnits',
    id: 'id', 'class': 'class'
  };

  /* Every sanitised logo gets a unique id namespace.

     buildBrandLogo() runs twice per mount (banner + panel head), and doubles
     again when logoDark is set — so one shadow root can hold four copies of the
     same asset. A gradient/clipPath/mask id like "g" would then appear four
     times, and url(#g) resolves to the FIRST match in the tree: the dark logo
     would silently paint with the light logo's gradient stops. Prefixing every
     id per instance, and rewriting the url(#…) references in the same pass,
     keeps each copy self-contained. */
  var svgSeq = 0;

  // url(#localRef) and plain values only — no url(http…), no javascript:.
  // `prefix` namespaces id definitions and their url(#…) references together.
  function safeAttrValue(name, value, prefix) {
    var v = String(value == null ? '' : value);
    // Strip nothing; reject outright. Control chars are how javascript: is hidden.
    var probe = v.replace(/[\u0000-\u0020\u007f-\u00a0]/g, '').toLowerCase();
    if (probe.indexOf('javascript:') !== -1) return null;
    if (probe.indexOf('data:text') !== -1) return null;
    if (probe.indexOf('&#') !== -1) return null;
    // Any url() must be a same-document fragment reference.
    if (probe.indexOf('url(') !== -1 && !/^url\(#[a-z0-9_.:-]+\)$/i.test(probe)) return null;
    if (name === 'id') {
      if (!/^[a-zA-Z][\w.:-]*$/.test(v)) return null;
      return prefix + v;
    }
    // Rewrite a reference so it points at THIS instance's namespaced definition.
    var m = /^url\(#([\w.:-]+)\)$/.exec(v);
    if (m) return 'url(#' + prefix + m[1] + ')';
    return v;
  }

  function rebuildSvgNode(src, out, depth, prefix) {
    if (depth > 24) return false;                       // pathological nesting
    var kids = src.childNodes;
    for (var i = 0; i < kids.length; i++) {
      var n = kids[i];
      if (n.nodeType === 3) {                           // text (only inside title/desc)
        var pt = out.nodeName.toLowerCase();
        if (pt === 'title' || pt === 'desc') out.appendChild(document.createTextNode(n.nodeValue));
        continue;
      }
      if (n.nodeType !== 1) continue;                   // drop comments, CDATA, PIs
      var tag = String(n.nodeName || '').toLowerCase();
      if (!Object.prototype.hasOwnProperty.call(SVG_TAGS, tag)) return false;  // bail, don't skip
      var fresh = document.createElementNS(SVG_NS, n.nodeName);
      var attrs = n.attributes || [];
      for (var a = 0; a < attrs.length; a++) {
        var an = String(attrs[a].name || '').toLowerCase();
        if (/^on/i.test(an)) return false;              // event handler present -> reject whole logo
        if (an === 'href' || an === 'xlink:href' || an.indexOf('xlink') === 0) return false;
        if (!Object.prototype.hasOwnProperty.call(SVG_ATTRS, an)) continue;    // unknown -> just omit
        var val = safeAttrValue(an, attrs[a].value, prefix);
        if (val === null) continue;
        try { fresh.setAttribute(SVG_ATTRS[an], val); } catch (e) { /* ignore */ }
      }
      if (!rebuildSvgNode(n, fresh, depth + 1, prefix)) return false;
      out.appendChild(fresh);
    }
    return true;
  }

  // Raw SVG string -> freshly built, safe <svg> element, or null.
  function sanitizeSvg(markup) {
    var s = str(markup);
    if (!s || s.length > 512 * 1024) return null;
    if (!/^\s*<svg[\s>]/i.test(s)) return null;         // must be an SVG root
    var doc;
    try {
      doc = new DOMParser().parseFromString(s, 'image/svg+xml');
    } catch (e) { return null; }
    if (!doc) return null;
    if (doc.getElementsByTagName('parsererror').length) return null;
    var srcRoot = doc.documentElement;
    if (!srcRoot || String(srcRoot.nodeName).toLowerCase() !== 'svg') return null;

    // Unique per sanitised instance, so four copies of one asset never collide.
    var prefix = 'ck' + (++svgSeq) + '-';

    var svg = document.createElementNS(SVG_NS, 'svg');
    var ra = srcRoot.attributes || [];
    for (var i = 0; i < ra.length; i++) {
      var an = String(ra[i].name || '').toLowerCase();
      if (/^on/i.test(an)) return null;
      if (an.indexOf('xlink') === 0 || an === 'href') return null;
      if (!Object.prototype.hasOwnProperty.call(SVG_ATTRS, an)) continue;
      var val = safeAttrValue(an, ra[i].value, prefix);
      if (val === null) continue;
      try { svg.setAttribute(SVG_ATTRS[an], val); } catch (e) {}
    }
    if (!rebuildSvgNode(srcRoot, svg, 0, prefix)) return null;
    return svg;
  }

  /* Image-source logos.
     Only http(s) and image data: URIs. data:text/html is a navigation/XSS
     vector via <img>-adjacent contexts, and any other scheme is rejected.

     NOTE FOR INTEGRATORS: an https:// logo is an external network request that
     fires BEFORE the visitor has consented to anything. It leaks IP, User-Agent
     and Referer to whoever hosts the file. ConsentKit therefore recommends an
     inline SVG string or a data: URI, both of which are entirely local. An
     external URL still works — it is the integrator's call, made knowingly —
     and we send referrerpolicy=no-referrer to reduce what leaks. */
  function safeImgSrc(value) {
    var v = str(value);
    if (!v) return null;
    if (/^https?:\/\//i.test(v)) return v;
    if (/^data:image\/(svg\+xml|png|jpe?g|webp|gif|avif)[;,]/i.test(v)) return v;
    return null;
  }

  // Default 18px and a 32px ceiling: the logo is a signature, not a header.
  // Anything taller starts competing with the banner title.
  function clampLogoHeight(v) {
    var n = (typeof v === 'number') ? v : parseFloat(v);
    if (!isFinite(n)) return 18;
    if (n < 14) return 14;
    if (n > 32) return 32;
    return Math.round(n);
  }

  // Only http(s) links are made clickable; javascript:/data: never become hrefs.
  function safeLinkUrl(value) {
    var v = str(value);
    if (!v) return null;
    return /^https?:\/\//i.test(v) ? v : null;
  }

  function brandingCfg(cfg) {
    var b = cfg && cfg.branding;
    return (b && typeof b === 'object' && !Array.isArray(b)) ? b : null;
  }

  // One logo node (inline SVG or <img>), already sanitised. null when unusable.
  function buildLogoNode(source, alt, decorative, host) {
    var el = host.el, str = host.str;
    if (!source) return null;
    var node = null;
    var s = str(source);
    if (!s) return null;

    if (/^\s*</.test(s)) {
      node = sanitizeSvg(s);                       // raw markup -> rebuilt SVG
      if (node) node.classList.add('ck-brand__logo');
    } else {
      var src = safeImgSrc(s);
      if (!src) return null;
      node = el('img', 'ck-brand__logo');
      node.setAttribute('referrerpolicy', 'no-referrer');
      node.setAttribute('decoding', 'async');
      node.src = src;
      node.alt = decorative ? '' : (alt || '');
    }
    // The SVG carries no accessible name of its own; the wrapper supplies one
    // (or hides it, when a sibling already names the logo).
    if (node && node.nodeName.toLowerCase() === 'svg') {
      node.setAttribute('aria-hidden', 'true');
      node.setAttribute('focusable', 'false');
    }
    return node;
  }

  /* Logo block for a banner/panel header.

     Dark theme: branding.logoDark, when supplied, is rendered as a second node
     and swapped purely in CSS. When it is absent the single main logo shows in
     both themes — which is why the shipped ECOM Consult asset (wordmark
     fill="white", built for dark backgrounds) belongs in logoDark, with a
     dark-ink variant in logo. An <img>/data: logo cannot be recoloured by our
     CSS at all, so two assets are the only route there; an inline SVG could in
     principle inherit currentColor, but only if the asset is authored that way. */
  function buildBrandLogo(cfg, host) {
    var el = host.el, str = host.str;
    var b = brandingCfg(cfg);
    if (!b) return null;

    var alt = str(b.logoAlt) || '';
    var main = buildLogoNode(b.logo, alt, false, host);
    if (!main) return null;                        // no valid logo -> render nothing

    var dark = buildLogoNode(b.logoDark, alt, false, host);

    var wrap = el('div', 'ck-brand');
    if (dark) {
      wrap.classList.add('ck-brand__has-dark');
      main.classList.add('ck-brand__light');
      dark.classList.add('ck-brand__dark');
    }

    var link = safeLinkUrl(b.logoUrl);
    var host_ = wrap;
    if (link) {
      var a = el('a', 'ck-brand__link');
      a.href = link;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      // Links are focusable by nature; the accessible name comes from logoAlt.
      a.setAttribute('aria-label', alt || 'ConsentKit');
      host_ = a;
      wrap.appendChild(a);
    }
    host_.appendChild(main);
    if (dark) host_.appendChild(dark);

    // A non-linked logo must not be a tab stop. The <svg>/<img> is aria-hidden
    // or alt="", so a visually-hidden-free text alternative is supplied here
    // for the image case only when it is not already announced by the <img> alt.
    if (!link && alt && main.nodeName.toLowerCase() === 'svg') {
      wrap.setAttribute('role', 'img');
      wrap.setAttribute('aria-label', alt);
    }
    return wrap;
  }

  // Per-mount CSS for logo height + the dark/light swap. Mirrors buildThemeCss.
  function buildBrandCss(cfg) {
    var b = brandingCfg(cfg);
    if (!b) return '';
    var h = clampLogoHeight(b.logoHeight);
    var out = [':host{--ck-logo-h:' + h + 'px}'];

    var theme = (cfg && cfg.theme) || {};
    var mode = theme.mode;
    if (mode !== 'light' && mode !== 'dark') mode = 'auto';

    // Same cascade shape as buildThemeCss so the logo always agrees with the
    // palette: auto mode follows prefers-color-scheme but a forced .ck-mode-light
    // still wins, and .ck-mode-dark forces the dark asset outright.
    function swap(prefix) {
      return prefix + ' .ck-brand__has-dark .ck-brand__light{display:none}\n' +
             prefix + ' .ck-brand__has-dark .ck-brand__dark{display:block}';
    }
    if (mode === 'auto') {
      out.push('@media (prefers-color-scheme: dark){\n' +
        swap(':host(:not(.ck-mode-light))') + '\n}');
    }
    out.push(swap(':host(.ck-mode-dark)'));
    return out.join('\n');
  }

  /* Powered-by line. true -> localised default; object -> caller's text/url.
     Rendered after the actions in DOM order and styled quiet on purpose. */
  function buildPoweredBy(cfg, host) {
    var el = host.el, str = host.str, T = host.T;
    var b = brandingCfg(cfg);
    if (!b) return null;
    var pb = b.poweredBy;
    if (!pb) return null;                          // false/undefined -> nothing

    var text, url = null;
    if (pb === true) {
      text = T.poweredBy;                          // en fallback guaranteed by STR_KEYS
    } else if (typeof pb === 'object' && !Array.isArray(pb)) {
      text = str(pb.text) || T.poweredBy;
      url = safeLinkUrl(pb.url);
    } else {
      return null;
    }

    var p = el('p', 'ck-powered');
    if (url) {
      var a = el('a', null, text);
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      p.appendChild(a);
    } else {
      p.appendChild(document.createTextNode(text));
    }
    return p;
  }

  /* ------------------------------------------------------- static stylesheet */

  /* The branding rules, returned to ck-ui.js to append to its base sheet. They
     live here rather than in ck-ui.js so a build without this file carries no
     dead .ck-brand / .ck-foot / .ck-powered CSS either. */
  function css() {
    return [
      /* min-width:0 so a wide logo shrinks rather than shoving the close button
         off. Scoped to :has(.ck-brand) — applying it unconditionally changes the
         header block's flex sizing (480px -> 518px) on unbranded panels too, which
         would break byte-for-byte backward compatibility. Browsers without :has()
         simply keep today's sizing; the logo is width-capped at 160px regardless,
         so the close button still has room. */
      '.ck-panel__head>div:first-child:has(.ck-brand){flex:1 1 auto;min-width:0}',
      /* ---- branding: logo + powered-by ----
         The logo sits inline with the title in a flex row. That was chosen over a
         separate band above the heading because .ck-banner--bar is a single
         vertically-centred flex row: a stacked logo adds a height band there and
         nowhere else, so bar/box/modal would drift apart. Inline keeps one rule
         for all three layouts and leaves existing margins untouched — .ck-brand
         carries the whole gap, h2 keeps its own margin. */
      '.ck-brand{display:flex;align-items:center;gap:10px;margin:0 0 8px}',
      /* Attribution foot of the banner: logo + credit on one muted line below
         the buttons. flex-basis 100% keeps it on its own row in the bar layout,
         where the actions sit beside the text.

         The mark is desaturated here rather than shipped as a second grey asset:
         an agency logo in full brand colour reads as a second call to action
         competing with the consent buttons. grayscale() flattens the hue and the
         opacity lifts it off pure black, so it sits at signature weight in both
         themes without the integrator preparing anything. */
      '.ck-foot{display:flex;align-items:center;gap:8px;flex-wrap:wrap;',
      'margin:14px 0 0}',
      '.ck-foot .ck-brand__logo,.ck-foot .ck-brand__logo svg{',
      'filter:grayscale(1);opacity:.55}',
      '.ck-foot .ck-brand__link:hover .ck-brand__logo,',
      '.ck-foot .ck-brand__link:focus-visible .ck-brand__logo{opacity:.8}',
      '.ck-foot .ck-brand{margin:0}',
      /* Beats the flex:1 1 100% the standalone .ck-powered carries (it needs a
         full row of its own when there is no logo beside it). */
      '.ck-foot p.ck-powered,.ck-banner .ck-foot p.ck-powered{margin:0;flex:0 1 auto}',
      /* In the panel the foot shares a flex row with the action buttons, so it
         claims a row of its own below them. */
      '.ck-panel__foot .ck-foot{flex:1 1 100%;margin:2px 0 0}',
      '.ck-brand__logo{display:block;width:auto;max-width:160px;height:var(--ck-logo-h,24px);',
      'flex:none;object-fit:contain}',
      '.ck-brand__logo svg{display:block;width:auto;height:100%;max-width:160px}',
      '.ck-brand a.ck-brand__link{display:inline-flex;align-items:center;text-decoration:none;flex:none}',
      /* Dark-variant swap is CSS-driven, mirroring buildThemeCss()'s cascade
         exactly (same three selectors, same :not(.ck-mode-light) guard). Reading
         the theme in JS would desync in auto mode and would not follow a live
         system theme flip. */
      '.ck-brand__dark{display:none}',
      '.ck-brand__has-dark .ck-brand__light{display:block}',

      /* ---- powered-by ----
         Deliberately quiet: muted colour, 12px, normal weight, and it comes after
         the action row in DOM order. It must not compete with the consent buttons. */
      /* .ck-banner p sets font-size:14px at equal specificity and appears later in
         this sheet, so it would win over a bare .ck-powered. Qualifying the
         selector keeps the attribution smaller than the button text (14px) without
         reaching for !important. */
      '.ck-powered,.ck-banner p.ck-powered{margin:12px 0 0;font-size:12px;line-height:1.4;',
      'color:var(--ck-muted);flex:1 1 100%;font-weight:400}',
      '.ck-powered a{color:var(--ck-muted);text-decoration:underline}',
      '.ck-panel__foot .ck-powered{margin:0;align-self:center}',

      /* Narrow bar stacks into a column, so the foot — which lives at the end of
         the text block for the wide side-by-side layout — would sit between the
         question and the buttons answering it. Lift it out of the text block and
         order it last.

         Its own @media block rather than a line inside ck-ui.js's 560px query:
         the rule only exists when this file does, and a build without branding
         must not carry a dangling selector for an element it never renders. The
         duplicate query costs ~30 bytes and keeps the two sheets separable. */
      '@media (max-width:560px){',
      '.ck-banner--bar .ck-foot{order:3;margin-top:14px}}'
    ].join('\n');
  }

  /* --------------------------------------------------------------- signature */

  /* Part of ck-ui.js's mount signature: branding produces DOM, not just
     styling, so a config that gains a logo after the first ck:init has to
     rebuild rather than restyle. Returns '-' when there is no branding config,
     which is what keeps an unbranded page's signature stable. */
  function brandSignature(cfg) {
    var b = brandingCfg(cfg);
    if (!b) return '-';
    var pb = b.poweredBy;
    var pbSig = (pb && typeof pb === 'object')
      ? 'o:' + String(pb.text || '') + ':' + String(pb.url || '')
      : String(!!pb);
    // Logos are hashed by length + head so a long data: URI does not bloat the key.
    function tag(v) {
      var s = str(v);
      return s ? (s.length + ':' + s.slice(0, 32)) : '-';
    }
    return [
      tag(b.logo), tag(b.logoDark), String(b.logoAlt || ''),
      String(clampLogoHeight(b.logoHeight)), String(b.logoUrl || ''), pbSig
    ].join('~');
  }

  /* ------------------------------------------------------------- registration */

  /* Published on the core's namespace so ck-ui.js finds it however the two
     files were loaded. The core creates window.ConsentKit at parse time; when
     this file somehow runs first, a bare object is created and the core merges
     onto it. */
  if (typeof window === 'undefined') return;

  var CK = window.ConsentKit || (window.ConsentKit = {});
  var ext = CK._uiExtensions || (CK._uiExtensions = {});

  ext.branding = {
    buildBrandLogo: buildBrandLogo,
    buildPoweredBy: buildPoweredBy,
    buildBrandCss: buildBrandCss,
    brandSignature: brandSignature,
    sanitizeSvg: sanitizeSvg,
    css: css
  };

  // Also exposed under the documented flat name, for integrators who reach for
  // the sanitiser directly rather than through the extension slot.
  window.ConsentKitBranding = ext.branding;
})();
