/* Wedding Tales — site behaviour. No dependencies. */
(function () {
  'use strict';
  var d = document;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function $(s, r) { return (r || d).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); }

  /* ── header border once scrolled ── */
  var head = $('.head');
  if (head && 'IntersectionObserver' in window) {
    var sentinel = d.createElement('div');
    sentinel.style.cssText = 'position:absolute;top:0;height:1px;width:1px';
    d.body.insertBefore(sentinel, d.body.firstChild);
    new IntersectionObserver(function (e) { head.classList.toggle('is-stuck', !e[0].isIntersecting); }).observe(sentinel);
  }

  /* ── mobile menu ── */
  var sheet = $('#menu'), openBtn = $('[data-menu-open]');
  function setMenu(on) {
    if (!sheet) return;
    sheet.classList.toggle('is-open', on);
    d.documentElement.style.overflow = on ? 'hidden' : '';
    if (openBtn) openBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (on) { var c = $('[data-menu-close]', sheet); if (c) c.focus(); } else if (openBtn) openBtn.focus();
  }
  if (openBtn) openBtn.addEventListener('click', function () { setMenu(true); });
  $$('[data-menu-close]').forEach(function (b) { b.addEventListener('click', function () { setMenu(false); }); });
  if (sheet) {
    $$('a', sheet).forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && sheet.classList.contains('is-open')) setMenu(false); });
  }

  /* ── the book ── */
  $$('[data-book]').forEach(function (box) {
    var book = $('.book', box);
    var leaves = $$('.leaf', book);
    var n = leaves.length;            // last leaf never flips
    var max = n - 1;                  // states: 0 (closed) … max
    var state = 0;
    var caps = [];
    try { caps = JSON.parse($('[data-book-caps]', box).textContent); } catch (e) {}
    var q = $('.book-cap__q', box), by = $('.book-cap__by', box), pos = $('.book-nav__pos', box);
    var prev = $('[data-book-prev]', box), next = $('[data-book-next]', box);
    var touched = false;

    function stack(moving) {
      leaves.forEach(function (leaf, i) {
        var flipped = i < state;
        leaf.style.zIndex = leaf === moving ? 100 : (flipped ? i + 1 : n - i);
      });
    }
    function paint() {
      book.setAttribute('data-open', state === 0 ? '0' : '1');
      var c = caps[state] || {};
      if (q) { q.textContent = c.q || ''; q.classList.toggle('is-plain', !c.hand); }
      if (by) by.textContent = c.by || '';
      if (pos) pos.textContent = state === 0 ? 'כריכה' : 'כפולה ' + state + ' מתוך ' + max;
      if (prev) prev.disabled = state === 0;
      if (next) next.disabled = state === max;
    }
    function go(to, user) {
      to = Math.max(0, Math.min(max, to));
      if (to === state) return;
      if (user) touched = true;
      var dir = to > state ? 1 : -1;
      var moving = leaves[dir === 1 ? state : state - 1];
      state += dir;
      stack(moving);
      moving.classList.toggle('is-flipped', dir === 1);
      paint();
      var done = function () { stack(null); if (state !== to) go(to, false); };
      if (reduce) done(); else setTimeout(done, state !== to ? 260 : 870);
    }
    stack(null); paint();
    // Pages further in are lazy; fetch them once the page has settled so a flip never shows a blank leaf.
    var warm = function () { $$('img[loading="lazy"]', book).forEach(function (im) { im.loading = 'eager'; }); };
    if (d.readyState === 'complete') setTimeout(warm, 1200); else window.addEventListener('load', function () { setTimeout(warm, 1200); });

    if (next) next.addEventListener('click', function () { go(state + 1, true); });
    if (prev) prev.addEventListener('click', function () { go(state - 1, true); });
    leaves.forEach(function (leaf, i) {
      leaf.addEventListener('click', function (e) {
        if (e.target.closest('a')) return;
        go(i < state ? state - 1 : state + 1, true);
      });
    });
    box.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { go(state + 1, true); e.preventDefault(); }
      if (e.key === 'ArrowRight') { go(state - 1, true); e.preventDefault(); }
    });
    var sx = null, sy = null;
    book.addEventListener('pointerdown', function (e) { sx = e.clientX; sy = e.clientY; });
    book.addEventListener('pointerup', function (e) {
      if (sx === null) return;
      var dx = e.clientX - sx, dy = e.clientY - sy; sx = null;
      if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        book.__swiped = true; setTimeout(function () { book.__swiped = false; }, 60);
        go(state + (dx > 0 ? 1 : -1), true);
      }
    });
    book.addEventListener('click', function (e) { if (book.__swiped) { e.stopPropagation(); e.preventDefault(); } }, true);
    $$('[data-book-goto]').forEach(function (b) {
      b.addEventListener('click', function () { if (state === 0) go(1, true); });
    });

    /* the one orchestrated moment: the cover opens by itself, once */
    if (!reduce && 'IntersectionObserver' in window && box.hasAttribute('data-book-auto')) {
      var io = new IntersectionObserver(function (en) {
        if (en[0].isIntersecting && en[0].intersectionRatio >= .5) {
          io.disconnect();
          setTimeout(function () { if (!touched && state === 0) go(1, false); }, 1700);
        }
      }, { threshold: [.5] });
      io.observe($('.book-holder', box) || book);
    }
  });

  /* ── real books: filter chips ── */
  $$('[data-shelf]').forEach(function (wrap) {
    var chips = $$('[data-filter]', wrap), vols = $$('.vol', wrap), shelf = $('.shelf', wrap);
    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        var f = chip.getAttribute('data-filter');
        chips.forEach(function (c) { c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'); });
        var first = true;
        vols.forEach(function (v) {
          var show = f === 'all' || v.getAttribute('data-kind') === f;
          v.hidden = !show;
          v.classList.toggle('is-lead', show && first);
          if (show) first = false;
        });
        if (shelf && shelf.scrollTo) shelf.scrollTo({ left: 0, behavior: reduce ? 'auto' : 'smooth' });
      });
    });
  });

  /* ── videos ── */
  $$('[data-film]').forEach(function (frame) {
    var btn = $('.film__play', frame);
    if (!btn) return;
    btn.addEventListener('click', function () {
      var v = d.createElement('video');
      v.src = frame.getAttribute('data-film');
      v.controls = true; v.playsInline = true; v.setAttribute('playsinline', '');
      v.poster = frame.getAttribute('data-poster') || '';
      frame.innerHTML = ''; frame.appendChild(v);
      var p = v.play(); if (p && p.catch) p.catch(function () {});
      v.focus();
    });
  });
  if ('IntersectionObserver' in window) {
    $$('video[data-loop]').forEach(function (v) {
      new IntersectionObserver(function (en) {
        if (en[0].isIntersecting) {
          if (!v.src) v.src = v.getAttribute('data-src');
          if (!reduce) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
        } else if (v.src) v.pause();
      }, { rootMargin: '200px' }).observe(v);
    });
  }

  /* ── sticky buy bar: once the hero button is gone, and never over pricing or the footer ── */
  var bar = $('.buybar');
  if (bar && 'IntersectionObserver' in window) {
    var vis = { past: false, pricing: false, foot: false };
    var update = function () {
      var on = vis.past && !vis.pricing && !vis.foot;
      bar.classList.toggle('is-on', on);
      bar.setAttribute('aria-hidden', on ? 'false' : 'true');
      $$('a', bar).forEach(function (a) { a.tabIndex = on ? 0 : -1; });
    };
    var watch = function (el, key, opts, fn) {
      if (!el) return;
      new IntersectionObserver(function (en) { vis[key] = fn ? fn(en[en.length - 1]) : en[en.length - 1].isIntersecting; update(); }, opts || {}).observe(el);
    };
    watch($('[data-hero-cta]'), 'past', {}, function (e) { return !e.isIntersecting && e.boundingClientRect.top < 0; });
    watch($('#pricing .plans'), 'pricing', { rootMargin: '0px 0px -15% 0px' });
    watch($('footer'), 'foot', { rootMargin: '0px 0px -10% 0px' });
    update();
  }

  /* ── click events for analytics that are already on the page ── */
  d.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-track]');
    if (!a) return;
    var name = a.getAttribute('data-track');
    try { if (window.gtag) window.gtag('event', 'wt_click', { wt_target: name }); } catch (x) {}
    try { if (window.fbq && /^buy/.test(name)) window.fbq('track', 'InitiateCheckout', { content_name: name }); } catch (x) {}
    try { if (window.clarity) window.clarity('event', 'wt_' + name); } catch (x) {}
  });
})();
