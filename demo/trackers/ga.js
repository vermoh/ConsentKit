// Fake analytics tracker for the ConsentKit demo.
// Sets a demo_* cookie and reports itself via window.__loaded.
(function () {
  document.cookie = 'demo_ga=1; path=/; max-age=3600; SameSite=Lax';
  window.__loaded = Object.assign({}, window.__loaded, { ga: true });
  console.log('[demo tracker] loaded: ga');
})();
