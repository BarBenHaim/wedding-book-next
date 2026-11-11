/* Wedding Tales — site behaviour. GSAP (assets/js) drives the motion; without it the page still works. */
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

  /* ── motion: GSAP when it arrived in time, plain when it did not ── */
  var root = d.documentElement, gsap = window.gsap, ST = window.ScrollTrigger;
  var motion = !reduce && !!gsap;
  var staged = motion && root.classList.contains('wt-anim');   // the page was painted in its "before" state
  if (motion) { if (ST) gsap.registerPlugin(ST); window.__wtMotion = 1; }
  if (!staged) root.classList.remove('wt-anim');
  function landed(el) { el.classList.add('is-in'); if (gsap) gsap.set(el, { clearProps: 'transform,opacity,visibility,clipPath' }); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* ── the book ──
     One number, p, says how far the book is turned: 0 is closed, 1 is the first spread, and so on.
     Everything on screen is drawn from p and nothing else, so a click, a drag, a second click halfway
     or a reversed direction can never leave two pages disagreeing about where they are. */
  $$('[data-book]').forEach(function (box) {
    var book = $('.book', box), holder = $('.book-holder', box) || book;
    var leaves = $$('.leaf', book), n = leaves.length, max = n - 1;   // the last leaf never turns
    var castL = $('.book__cast--l', book), castR = $('.book__cast--r', book);
    var st = { p: 0, peek: 0 }, target = 0, tw = null, peekTw = null, raf = 0, touched = false, drag = null, swallow = false;
    var caps = [];
    try { caps = JSON.parse($('[data-book-caps]', box).textContent); } catch (e) {}
    var q = $('.book-cap__q', box), by = $('.book-cap__by', box), pos = $('.book-nav__pos', box);
    var prev = $('[data-book-prev]', box), next = $('[data-book-next]', box), capI = 0;
    var last = [];

    function draw() {
      var p = clamp(st.p + st.peek, 0, max), w = holder.offsetWidth / 2 || 300;
      var e = clamp(p, 0, 1), moving = -1, mt = 0;
      book.style.setProperty('--e', e.toFixed(4));
      book.style.setProperty('--eb', clamp(e * 5, 0, 1).toFixed(3));
      book.style.setProperty('--tl', (1 - .72 * p / max).toFixed(3));
      book.style.setProperty('--tr', (p < 1 ? 0 : .28 + .72 * (p - 1) / Math.max(1, max - 1)).toFixed(3));
      box.style.setProperty('--q', (p / max).toFixed(4));
      for (var i = 0; i < max; i++) {
        var t = clamp(p - i, 0, 1);
        if (t > 0 && t < 1) { moving = i; mt = t; }
        if (last[i] === t) continue;
        last[i] = t;
        var leaf = leaves[i];
        leaf.style.transform = 'perspective(' + Math.round(w * 8) + 'px) rotateY(' + (t * 180).toFixed(2) + 'deg)';
        leaf.style.zIndex = t > 0 && t < 1 ? 50 : (t === 1 ? i + 1 : n - i);
        leaf.style.setProperty('--sh', (Math.sin(t * Math.PI) * .38).toFixed(3));
        leaf.classList.toggle('is-flipped', t >= .5);
      }
      var lift = moving < 0 ? 0 : Math.sin(mt * Math.PI);
      if (castL) castL.style.opacity = (lift * (1 - mt) * .9).toFixed(3);
      if (castR) castR.style.opacity = (moving <= 0 ? 0 : lift * mt * .9).toFixed(3);
    }
    function label() {
      book.setAttribute('data-open', target === 0 ? '0' : '1');
      if (pos) pos.textContent = target === 0 ? 'כריכה' : 'כפולה ' + target + ' מתוך ' + max;
      if (prev) prev.disabled = target === 0;
      if (next) next.disabled = target === max;
      if (target === capI) return;
      capI = target;
      var c = caps[target] || {};
      var put = function () {
        if (q) { q.textContent = c.q || ''; q.classList.toggle('is-plain', !c.hand); }
        if (by) by.textContent = c.by || '';
      };
      if (!motion || !q) { put(); return; }
      gsap.killTweensOf([q, by]);
      gsap.to([q, by], { opacity: 0, duration: .14, ease: 'power1.in', onComplete: function () {
        put();
        gsap.set([q, by], { clearProps: 'clipPath' });
        if (c.hand) {
          // real handwriting arrives the way it was written: from the right
          gsap.set(q, { opacity: 1 });
          gsap.fromTo(q, { clipPath: 'inset(-20% 0% -20% 100%)' }, { clipPath: 'inset(-20% 0% -20% 0%)', duration: .95, ease: 'power2.out', clearProps: 'clipPath' });
          gsap.to(by, { opacity: 1, duration: .5, delay: .35, ease: 'power2.out' });
        } else {
          gsap.to([q, by], { opacity: 1, duration: .4, ease: 'power2.out' });
        }
      } });
    }
    function stop() {
      if (tw) { tw.kill(); tw = null; }
      if (peekTw) { peekTw.kill(); peekTw = null; }
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      st.p = clamp(st.p + st.peek, 0, max); st.peek = 0;
    }
    function turn(to, opts) {
      to = clamp(Math.round(to), 0, max);
      var moving = !!tw || !!raf;
      stop();
      target = to; label();
      var dist = Math.abs(to - st.p);
      if (dist < .0005) { st.p = to; draw(); return; }
      if (reduce) { st.p = to; draw(); return; }
      var dur = (opts && opts.dur) || clamp(.92 * Math.pow(dist, .8), .38, 1.9);
      var ease = (opts && opts.ease) || (moving || dist < .95 ? 'power2.out' : 'power2.inOut');
      if (gsap) {
        tw = gsap.to(st, { p: to, duration: dur, ease: ease, onUpdate: draw, onComplete: function () { tw = null; st.p = to; draw(); } });
      } else {
        var from = st.p, t0 = performance.now();
        var step = function (now) {
          var k = clamp((now - t0) / (dur * 1000), 0, 1), s = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
          st.p = from + (to - from) * s; draw();
          raf = k < 1 ? requestAnimationFrame(step) : 0;
        };
        raf = requestAnimationFrame(step);
      }
    }
    function peek(v) {
      if (!motion || drag || tw || st.peek === v || (peekTw && peekTw.vars.peek === v)) return;
      if (peekTw) peekTw.kill();
      peekTw = gsap.to(st, { peek: v, duration: .45, ease: 'power2.out', onUpdate: draw, onComplete: function () { peekTw = null; } });
    }
    function spineX() { var r = book.getBoundingClientRect(); return target === 0 ? r.right + 1 : r.left + r.width / 2; }

    draw(); label();
    // Pages further in are lazy; fetch them as soon as the page is idle so a turn never shows a blank leaf.
    var warm = function () { $$('img[loading="lazy"]', book).forEach(function (im) { im.loading = 'eager'; }); };
    if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 900 }); else setTimeout(warm, 500);
    window.addEventListener('resize', function () { last = []; draw(); });

    if (next) next.addEventListener('click', function () { touched = true; turn(target + 1); });
    if (prev) prev.addEventListener('click', function () { touched = true; turn(target - 1); });
    box.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { touched = true; turn(target + 1); e.preventDefault(); }
      if (e.key === 'ArrowRight') { touched = true; turn(target - 1); e.preventDefault(); }
    });

    /* click a side to turn it, or take the page and pull */
    book.addEventListener('click', function (e) {
      if (swallow) { swallow = false; e.preventDefault(); e.stopPropagation(); return; }
      if (e.target.closest('a')) return;
      touched = true;
      turn(e.clientX < spineX() ? target + 1 : target - 1);
    });
    book.addEventListener('pointerdown', function (e) {
      if (e.button || e.target.closest('a')) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, on: false, base: 0, dx: 0 };
    });
    book.addEventListener('pointermove', function (e) {
      if (!drag) {
        if (e.pointerType === 'mouse') peek(e.clientX < spineX() ? (target < max ? .055 : 0) : (target > 0 ? -.055 : 0));
        return;
      }
      if (e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.on) {
        if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
        drag.on = true; touched = true; stop(); drag.base = st.p;
        try { book.setPointerCapture(e.pointerId); } catch (x) {}
        book.classList.add('is-drag');
      }
      var b = drag.base, whole = Math.abs(b - Math.round(b)) < .002;
      var lo = whole ? Math.round(b) - 1 : Math.floor(b), hi = whole ? Math.round(b) + 1 : Math.ceil(b);
      drag.dx = dx;
      st.p = clamp(b + dx / ((holder.offsetWidth / 2 || 300) * 1.55), Math.max(0, lo), Math.min(max, hi));
      draw();
    });
    var release = function (e) {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      var was = drag; drag = null;
      book.classList.remove('is-drag');
      if (!was.on) return;
      swallow = true; setTimeout(function () { swallow = false; }, 80);
      turn(Math.abs(was.dx) > 22 ? (was.dx > 0 ? Math.ceil(st.p - .001) : Math.floor(st.p + .001)) : Math.round(st.p));
    };
    book.addEventListener('pointerup', release);
    book.addEventListener('pointercancel', release);
    book.addEventListener('pointerleave', function (e) { if (!drag && e.pointerType === 'mouse') peek(0); });
    $$('[data-book-goto]').forEach(function (b) {
      b.addEventListener('click', function () { if (target === 0) { touched = true; turn(1); } });
    });

    /* the one orchestrated moment: the cover opens by itself, once */
    if (!reduce && 'IntersectionObserver' in window && box.hasAttribute('data-book-auto')) {
      var io = new IntersectionObserver(function (en) {
        if (en[0].isIntersecting && en[0].intersectionRatio >= .5) {
          io.disconnect();
          setTimeout(function () { if (!touched && target === 0 && !drag) turn(1, { dur: 1.5, ease: 'power3.inOut' }); }, 1250);
        }
      }, { threshold: [.5] });
      io.observe(holder);
    }
  });

  /* ── entrance and scroll: one pass, each thing once ── */
  if (staged) {
    $$('.hero .ln').forEach(function (ln, i) {
      gsap.fromTo(ln.firstElementChild, { yPercent: 112, y: 0 }, { yPercent: 0, y: 0, duration: 1.05, ease: 'power4.out', delay: .1 + i * .11, onComplete: function () { landed(ln); gsap.set(ln.firstElementChild, { clearProps: 'transform' }); } });
    });
    $$('.hero [data-in]').forEach(function (el, i) {
      gsap.fromTo(el, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: .8, ease: 'power3.out', delay: i === 0 ? 0 : .38 + i * .07, onComplete: function () { landed(el); } });
    });
    var rise = function (el, delay) {
      gsap.fromTo(el, { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: .9, ease: 'power3.out', delay: delay, onComplete: function () { landed(el); } });
      var obj = el.classList.contains('step') && $('.step__obj img', el);
      if (obj) gsap.from(obj, { yPercent: 12, scale: .93, duration: 1.15, ease: 'power3.out', delay: delay + .05, clearProps: 'transform' });
      $$('[data-write]', el).forEach(function (w) {
        gsap.fromTo(w, { clipPath: 'inset(-12% 0% -12% 100%)' }, { clipPath: 'inset(-12% 0% -12% 0%)', duration: 1.5, ease: 'power2.inOut', delay: delay + .25, onComplete: function () { landed(w); } });
      });
    };
    if (ST) {
      ST.batch('[data-rise]', { start: 'top 90%', once: true, onEnter: function (batch) { batch.forEach(function (el, i) { rise(el, i * .08); }); } });
      $$('[data-lines]').forEach(function (h) {
        ST.create({ trigger: h, start: 'top 86%', once: true, onEnter: function () {
          $$('.ln', h).forEach(function (ln, i) {
            gsap.fromTo(ln.firstElementChild, { yPercent: 112, y: 0 }, { yPercent: 0, y: 0, duration: 1.05, ease: 'power4.out', delay: i * .11, onComplete: function () { landed(ln); gsap.set(ln.firstElementChild, { clearProps: 'transform' }); } });
          });
        } });
      });
    } else {
      $$('[data-rise],[data-write],[data-lines] .ln').forEach(landed);
    }
  }
  if (motion && ST) {
    /* the timeline draws itself as you read down it */
    $$('[data-when]').forEach(function (when) {
      var wrap = $('.when__wrap', when), fill = $('.when__track b', when), items = $$('.when__i', when);
      if (!wrap || !fill) return;
      when.classList.add('is-live');
      var s = { f: 0 }, top = 0;
      var paint = function () {
        top = Math.max(top, s.f);                       // once drawn it stays drawn; scrolling back up does not erase it
        fill.style.setProperty('--f', top.toFixed(4));
        var r = wrap.getBoundingClientRect(), row = getComputedStyle($('.when__row', when)).gridTemplateColumns.split(' ').length > 1;
        items.forEach(function (it) {
          var b = it.getBoundingClientRect();
          var at = row ? (r.right - b.right) / r.width : (b.top - r.top + 12) / r.height;
          it.classList.toggle('is-on', top >= at - .002 && top > 0);
        });
      };
      paint();
      gsap.to(s, { f: 1, ease: 'none', onUpdate: paint, scrollTrigger: { trigger: wrap, start: 'top 82%', end: 'bottom 58%', scrub: .5 } });
    });
    /* large photographs drift a little inside their frame */
    $$('[data-drift]').forEach(function (fr) {
      var im = $('img', fr); if (!im) return;
      gsap.set(im, { scale: 1.1 });
      gsap.fromTo(im, { yPercent: -4.2 }, { yPercent: 4.2, ease: 'none', scrollTrigger: { trigger: fr, start: 'top bottom', end: 'bottom top', scrub: true } });
    });
    window.addEventListener('load', function () { ST.refresh(); });
  }

  /* ── questions open and close at reading speed ── */
  if (motion) {
    $$('.faq details').forEach(function (dt) {
      var sm = $('summary', dt), a = $('.faq__a', dt);
      if (!sm || !a) return;
      var want = dt.open;
      sm.addEventListener('click', function (e) {
        e.preventDefault();
        want = !want;
        dt.classList.toggle('is-closing', !want);
        if (want) {
          dt.open = true;
          gsap.fromTo(a, { height: a.offsetHeight && gsap.isTweening(a) ? a.offsetHeight : 0, opacity: 0 }, { height: 'auto', opacity: 1, duration: .42, ease: 'power3.out', overwrite: true, clearProps: 'height,opacity' });
        } else {
          gsap.to(a, { height: 0, opacity: 0, duration: .3, ease: 'power2.inOut', overwrite: true, onComplete: function () { dt.open = false; dt.classList.remove('is-closing'); gsap.set(a, { clearProps: 'height,opacity' }); } });
        }
      });
    });
  }

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
        if (motion) {
          var shown = vols.filter(function (v) { return !v.hidden; });
          shown.forEach(landed);
          gsap.killTweensOf(shown);
          gsap.fromTo(shown, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: .5, ease: 'power3.out', stagger: .045, clearProps: 'transform,opacity' });
        }
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
