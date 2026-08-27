// Fake support-chat widget for the ConsentKit demo.
// Sets a demo_* cookie and reports itself via window.__loaded.
(function () {
  document.cookie = 'demo_chat=1; path=/; max-age=3600; SameSite=Lax';
  window.__loaded = Object.assign({}, window.__loaded, { chat: true });
  console.log('[demo tracker] loaded: chat');
})();
