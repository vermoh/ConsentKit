# assets/ — copies from /src

The three JavaScript files in this directory are **copies** taken from the
repository root:

| File in `assets/` | Source of truth |
|---|---|
| `ck-core.js` | `/src/ck-core.js` |
| `ck-locales.js` | `/src/ck-locales.js` |
| `ck-ui.js` | `/src/ck-ui.js` |

**Synchronize these copies at every release.** They are not built, minified or
transformed in any way — a plain `cp` is the entire build step:

```sh
cp -f src/ck-core.js src/ck-locales.js src/ck-ui.js \
      plugins/wordpress/consentkit/assets/
```

Do not edit the files here. Any change made in `assets/` will be silently
overwritten by the next synchronization, and the plugin would then ship behavior
that differs from the demo and the npm package.

## Load order

`consentkit.php` prints the three files in this exact order, with no `async` or
`defer`:

1. `ck-core.js` — must run first. It installs the blocking patches at parse time.
2. `ck-locales.js` — defines `window.__ckLocales`.
3. `ck-ui.js` — reads the locale dictionary when it renders.

The URLs are cache-busted with each file's `filemtime()`, so a fresh copy is
picked up by browsers without a plugin version bump.
