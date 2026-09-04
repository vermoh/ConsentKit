# assets/ — copies from /src

The JavaScript files in this directory are **copies** taken from the
repository root:

| File in `assets/` | Source of truth |
|---|---|
| `ck-core.js` | `/src/ck-core.js` |
| `ck-locales.js` | `/src/ck-locales.js` |
| `ck-ui.js` | `/src/ck-ui.js` |
| `ck-debug-loader.js` | `/src/ck-debug-loader.js` |

**Synchronize these copies at every release.** They are not built, minified or
transformed in any way — a plain `cp` is the entire build step:

```sh
cp -f src/ck-core.js src/ck-locales.js src/ck-ui.js src/ck-debug-loader.js \
      plugins/wordpress/consentkit/assets/
```

`test/wp-assets.test.mjs` asserts sha256 equality against `/src`, so a stale
copy fails CI instead of shipping a plugin that runs an older client than the
demo and the npm package.

Do not edit the files here. Any change made in `assets/` will be silently
overwritten by the next synchronization, and the plugin would then ship behavior
that differs from the demo and the npm package.

`src/ck-debug.js` — the debug panel itself — is deliberately **not** copied
here. It is roughly 30 KB that every visitor of every page would download and
never use. The plugin ships the loader instead; the loader fetches the panel
from the CDN, pinned to the running core version, only when someone opens the
page with `?ck_debug=1`. The same test asserts `assets/ck-debug.js` does not
exist, so a stray copy cannot creep back in and go stale.

## Load order

`consentkit.php` prints the files in this exact order, with no `async` or
`defer`:

1. `ck-core.js` — must run first. It installs the blocking patches at parse time.
2. `ck-locales.js` — defines `window.__ckLocales`.
3. `ck-ui.js` — reads the locale dictionary when it renders.
4. `ck-debug-loader.js` — the opt-in debug switch. It reads
   `ConsentKit.version` (hence: after the core) to pin the panel it fetches.
   Without `?ck_debug=1` it creates no DOM and makes no request.

The URLs are cache-busted with each file's `filemtime()`, so a fresh copy is
picked up by browsers without a plugin version bump.
