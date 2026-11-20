/* The live first screen — SPEC V1.30.1 B1.
 *
 * The composition is markup the build rendered (site/src/index.template.html,
 * .hl): a shop, a static replica of our banner, the dashboard's answers card.
 * As served it is already the finished frame — banner shown — which is what a
 * visitor without JavaScript or with prefers-reduced-motion keeps.
 *
 * This file only does three things:
 *   1. adds .hl--live, which attaches the CSS timeline (styles.css, step B,
 *      gated on prefers-reduced-motion: no-preference);
 *   2. on each cycle's «accept» beat — the animationstart / animationiteration
 *      of the total's own tick animation, so it stays in step with the CSS and
 *      pauses with it — adds one to the card's total and grows today's bar;
 *   3. pauses everything while the tab is hidden or the stage is off screen.
 *
 * It never touches the consent client, cookies, storage or the network: the
 * replica is spans, not the real banner, so nothing here can write ck_consent
 * or send a consent beacon (test/site-v1301b.test.mjs holds it to that).
 */
(function () {
  'use strict';

  var root = document.querySelector('[data-hero-live]');
  if (!root || !window.matchMedia) return;
  if (!window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return;

  var count = root.querySelector('[data-hl-count]');
  var today = root.querySelector('[data-hl-today]');
  if (!count || !today) return;

  var start = parseInt(count.textContent, 10) || 0;
  var base = parseInt(today.getAttribute('data-hl-today'), 10) || 1;
  var total = start;
  var day = base;
  // Today's bar never outgrows the busiest day of the chart (three times
  // today's start, 18). When it would, the card starts over from the served
  // numbers, so the total and the bar never tell two different stories.
  var cap = base * 3;

  function tick() {
    if (day >= cap) {
      total = start;
      day = base;
    }
    total += 1;
    day += 1;
    count.textContent = String(total);
    today.style.transform = 'scaleY(' + (day / base).toFixed(3) + ')';
  }
  count.addEventListener('animationstart', tick);
  count.addEventListener('animationiteration', tick);

  var onScreen = true;
  function sync() {
    root.classList.toggle('hl--paused', document.hidden || !onScreen);
  }
  document.addEventListener('visibilitychange', sync);
  if (typeof IntersectionObserver === 'function') {
    new IntersectionObserver(function (entries) {
      onScreen = entries[entries.length - 1].isIntersecting;
      sync();
    }).observe(root);
  }

  sync();
  root.classList.add('hl--live');
})();
