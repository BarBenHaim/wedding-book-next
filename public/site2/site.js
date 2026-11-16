/* Wedding Tales — sales page v2.
   One state object (the visitor's book), drawn everywhere it shows:
   the cover preview, the headings that say whose book it is, the order button.
   Nothing here talks to a server. The photo never leaves the device. */
(function () {
  'use strict';
  var d = document, w = window, root = d.documentElement;
  var CFG = w.WT || { buy: {}, events: {}, styles: {} };
  var reduce = w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, c) { return (c || d).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || d).querySelectorAll(s)); };

  var PRICE = { print: '990 ₪', digital: '690 ₪' };
  var ASK = {
    bar: { q: 'מה השם של חתן בר המצווה?', l: 'שם', ph: 'למשל: נועם' },
    bat: { q: 'מה השם של כלת בת המצווה?', l: 'שם', ph: 'למשל: טליה' },
    wedding: { q: 'מה השמות שלכם?', l: 'שם', ph: 'למשל: מיטל' },
    birthday: { q: 'של מי יום ההולדת?', l: 'שם', ph: 'למשל: סבא ג׳רי' }
  };

  var state = { ev: 'bar', n1: '', n2: '', date: '', style: 'gold', pack: 'print', step: 1, photo: false };

  /* ── memory: this browser only ─────────────────────────────── */
  function save() {
    var keep = { ev: state.ev, n1: state.n1, n2: state.n2, date: state.date, style: state.style, pack: state.pack };
    try { w.localStorage.setItem('wt_book', JSON.stringify(keep)); } catch (e) { /* private window */ }
    try {
      // Readable later by the shop and the app (same site), so the brief can follow the order.
      var dom = /(^|\.)weddingtales\.co\.il$/.test(location.hostname) ? ';domain=.weddingtales.co.il' : '';
      d.cookie = 'wt_draft=' + encodeURIComponent(JSON.stringify(keep)) + ';path=/;max-age=2592000;SameSite=Lax' + (location.protocol === 'https:' ? ';Secure' : '') + dom;
    } catch (e) { /* cookies off */ }
  }
  function load() {
    try {
      var raw = w.localStorage.getItem('wt_book');
      if (!raw) return;
      var k = JSON.parse(raw);
      if (k && typeof k === 'object') {
        if (CFG.events[k.ev]) state.ev = k.ev;
        if (typeof k.n1 === 'string') state.n1 = k.n1.slice(0, 24);
        if (typeof k.n2 === 'string') state.n2 = k.n2.slice(0, 24);
        if (/^\d{4}-\d{2}-\d{2}$/.test(k.date || '')) state.date = k.date;
        if (CFG.styles[k.style]) state.style = k.style;
        if (k.pack === 'digital') state.pack = 'digital';
      }
    } catch (e) { /* nothing saved */ }
  }

  /* ── whose book ────────────────────────────────────────────── */
  function clean(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
  function who() {
    var a = clean(state.n1), b = clean(state.n2);
    if (state.ev === 'wedding') {
      if (a && b) return a + ' ו' + b;
      return a || b;
    }
    return a;
  }
  function niceDate(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return '';
    var p = iso.split('-');
    return Number(p[2]) + '.' + Number(p[1]) + '.' + p[0];
  }
  function daysUntil(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return null;
    var p = iso.split('-'), t = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    var n = new Date(); n.setHours(0, 0, 0, 0);
    return Math.round((t - n) / 86400000);
  }
  function dateLine() {
    var n = daysUntil(state.date);
    if (n === null) return '';
    if (n < 0) return 'האירוע כבר עבר? אפשר להתחיל גם עכשיו. שולחים את הקישור לאורחים והם כותבים מהבית.';
    if (n < 3) return 'האירוע ממש קרוב. כתבו לנו בוואטסאפ לפני ההזמנה ונגיד לכם מה אפשר להספיק.';
    return 'האירוע בעוד ' + n + ' ימים. עמוד האורחים ופוסטר ה־QR מוכנים תוך 48 שעות מאישור העיצוב, אז יש זמן.';
  }
  function nameSize(s) {
    var n = s.length;
    return n <= 3 ? 23 : n <= 5 ? 19.5 : n <= 8 ? 15.5 : n <= 12 ? 12 : n <= 18 ? 9.5 : 7.5;
  }

  /* ── draw ──────────────────────────────────────────────────── */
  var cv = $('[data-cv]');
  function draw() {
    var name = who(), ev = CFG.events[state.ev] || { label: '' };
    root.setAttribute('data-ev', state.ev);

    $$('[data-ev-set]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-ev-set') === state.ev)); });
    $$('[data-style-set]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-style-set') === state.style)); });

    if (cv) {
      cv.setAttribute('data-style', state.style);
      var shown = name || 'השם שלכם';
      var nm = $('[data-cv-name]', cv);
      nm.textContent = shown;
      nm.style.setProperty('--name-size', nameSize(shown));
      $('[data-cv-ev]', cv).textContent = ev.label;
      $('[data-cv-date]', cv).textContent = niceDate(state.date);
      cv.setAttribute('aria-label', 'הדמיית כריכה: ספר הברכות של ' + shown + ', ' + ev.label);
    }

    var ask = ASK[state.ev] || ASK.bar;
    var q = $('[data-q-name]'); if (q) q.textContent = ask.q;
    var in1 = $('[data-in="n1"]'); if (in1) in1.placeholder = ask.ph;
    var f2 = $('[data-f="n2"]'); if (f2) f2.hidden = state.ev !== 'wedding';

    var dl = $('[data-date-line]');
    if (dl) { var t = dateLine(); dl.textContent = t; dl.hidden = !t; }

    var echo = {
      hero: name ? 'ספר הברכות של ' + name + '.' : 'ספר הברכות שלכם.',
      book: name ? 'הספר של ' + name : 'הספר שלכם',
      'book-inline': name ? 'הספר של ' + name : 'הספר שלי',
      bar: name ? 'הספר של ' + name : 'ספר מודפס ודיגיטלי'
    };
    $$('[data-echo]').forEach(function (el) { var k = el.getAttribute('data-echo'); if (echo[k] !== undefined) el.textContent = echo[k]; });

    var sum = $('[data-summary]');
    if (sum) {
      var bits = [ev.label];
      if (niceDate(state.date)) bits.push(niceDate(state.date));
      bits.push('סגנון ' + (CFG.styles[state.style] || ''));
      sum.textContent = bits.join(' · ');
    }

    var buy = $('[data-buy]');
    if (buy) {
      buy.href = CFG.buy[state.pack] || buy.href;
      var lab = $('[data-buy-label]', buy);
      if (lab) lab.textContent = 'להזמנת ' + (name ? 'הספר של ' + name : 'הספר') + ' · ' + PRICE[state.pack];
    }
    $$('input[name="wt-pack"]').forEach(function (r) { r.checked = r.value === state.pack; });

    // Once the book is built, the bar on phones goes straight to the order.
    var bb = $('[data-buybar-cta]');
    if (bb) {
      if (state.step === 4) { bb.href = CFG.buy[state.pack] || '#pricing'; bb.textContent = 'להזמנה · ' + PRICE[state.pack]; }
      else { bb.href = '#make'; bb.textContent = 'יוצרים ספר'; }
    }
  }

  /* ── the hero book: real covers, one at a time ─────────────── */
  var stage = $('[data-stage]');
  var covers = stage ? $$('.hb', stage) : [];
  var dots = stage ? $('[data-stage-dots]', stage) : null;
  var cap = stage ? $('[data-stage-cap]', stage) : null;
  var pool = [], at = 0, spin = null, touched = false;
  function showCover(i, animate) {
    if (!pool.length) return;
    var next = (i + pool.length) % pool.length;
    // Never turn to a cover that has not arrived yet: an empty book is worse than a late one.
    var pic = pool[next].querySelector('img');
    if (animate && pic && !pic.complete && next !== at) {
      pic.addEventListener('load', function () { if (pool[next] && pool.indexOf(pool[next]) === next) showCover(next, true); }, { once: true });
      return;
    }
    at = next;
    covers.forEach(function (c) { c.hidden = c !== pool[at]; c.classList.remove('is-in'); });
    if (animate && !reduce) { void pool[at].offsetWidth; pool[at].classList.add('is-in'); }
    if (cap) cap.textContent = pool[at].getAttribute('data-cap');
    if (dots) $$('button', dots).forEach(function (b, k) { b.setAttribute('aria-pressed', String(k === at)); });
  }
  function setPool() {
    if (!stage) return;
    pool = covers.filter(function (c) { return (' ' + c.getAttribute('data-evs') + ' ').indexOf(' ' + state.ev + ' ') > -1; });
    if (!pool.length) pool = covers.slice(0, 1);
    pool.forEach(function (c) { var im = c.querySelector('img'); if (im) im.loading = 'eager'; });
    if (dots) {
      dots.innerHTML = '';
      if (pool.length > 1) pool.forEach(function (c, k) {
        var b = d.createElement('button'); b.type = 'button';
        b.setAttribute('aria-label', c.getAttribute('data-cap'));
        b.addEventListener('click', function () { touched = true; stopSpin(); showCover(k, true); });
        dots.appendChild(b);
      });
    }
    showCover(0, true);
    startSpin();
  }
  function stopSpin() { if (spin) { clearInterval(spin); spin = null; } }
  function startSpin() {
    stopSpin();
    if (reduce || touched || pool.length < 2) return;
    spin = setInterval(function () { if (!d.hidden) showCover(at + 1, true); }, 4200);
  }

  /* ── the builder ───────────────────────────────────────────── */
  var make = $('[data-make]');
  function goStep(n, viaUser) {
    state.step = Math.max(1, Math.min(4, n));
    $$('[data-step]', make).forEach(function (s) {
      var on = Number(s.getAttribute('data-step')) === state.step;
      s.hidden = !on;
      s.classList.toggle('is-in', on && !reduce);
    });
    $$('[data-step-dot]', make).forEach(function (li) {
      var k = Number(li.getAttribute('data-step-dot'));
      li.classList.toggle('is-on', k <= state.step);
      if (k === state.step) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    draw();
    if (viaUser) {
      var cur = $('[data-step="' + state.step + '"]', make), h = cur && $('.h3', cur);
      if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
      var r = make.getBoundingClientRect();
      if (r.top < 0 || r.top > w.innerHeight * 0.5) {
        var y = w.pageYOffset + r.top - (parseInt(getComputedStyle(root).getPropertyValue('--head-h'), 10) || 60) - 12;
        w.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
      }
      track('make-step-' + state.step);
    }
  }
  function needName() {
    var f = $('[data-f="n1"]', make), inp = $('[data-in="n1"]', make);
    var ok = clean(state.n1).length > 0;
    f.classList.toggle('is-bad', !ok);
    var err = $('.field__err', f);
    if (!ok) {
      if (!err) { err = d.createElement('span'); err.className = 'field__err'; err.id = 'wt-n1-err'; err.setAttribute('role', 'alert'); f.appendChild(err); }
      err.textContent = 'כתבו שם, והוא יופיע על הכריכה.';
      inp.setAttribute('aria-describedby', 'wt-n1-err');
      inp.focus();
    } else if (err) { err.remove(); inp.removeAttribute('aria-describedby'); }
    return ok;
  }

  if (make) {
    make.addEventListener('click', function (e) {
      var t = e.target.closest('[data-next],[data-back],[data-style-set]');
      if (!t) return;
      if (t.hasAttribute('data-style-set')) { state.style = t.getAttribute('data-style-set'); save(); draw(); return; }
      if (t.hasAttribute('data-back')) { goStep(state.step - 1, true); return; }
      if (state.step === 2 && !needName()) return;
      goStep(state.step + 1, true);
    });
    make.addEventListener('input', function (e) {
      var k = e.target.getAttribute && e.target.getAttribute('data-in');
      if (k === 'n1' || k === 'n2') {
        state[k] = e.target.value.slice(0, 24);
        if (k === 'n1' && clean(state.n1)) { var f = $('[data-f="n1"]', make); f.classList.remove('is-bad'); var er = $('.field__err', f); if (er) er.remove(); }
        save(); draw();
      } else if (k === 'date') { state.date = e.target.value; save(); draw(); }
    });
    make.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.matches && e.target.matches('input[type="text"]')) {
        e.preventDefault();
        var nx = $('[data-step="' + state.step + '"] [data-next]', make); if (nx) nx.click();
      }
    });
    make.addEventListener('change', function (e) {
      var t = e.target;
      if (t.name === 'wt-pack') { state.pack = t.value === 'digital' ? 'digital' : 'print'; save(); draw(); track('make-pack-' + state.pack); return; }
      if (t.getAttribute('data-in') === 'photo') {
        var file = t.files && t.files[0];
        if (!file || !/^image\//.test(file.type)) return;
        var img = $('[data-cv-photo]');
        if (img.src && img.src.indexOf('blob:') === 0) URL.revokeObjectURL(img.src);
        img.src = URL.createObjectURL(file);
        cv.setAttribute('data-has-photo', '1');
        state.photo = true;
        var lab = $('[data-upl-label]'); if (lab) lab.textContent = 'להחליף תמונה';
        var rm = $('[data-photo-clear]'); if (rm) rm.hidden = false;
        track('make-photo');
      }
    });
    var rmBtn = $('[data-photo-clear]');
    if (rmBtn) rmBtn.addEventListener('click', function () {
      var img = $('[data-cv-photo]');
      if (img.src && img.src.indexOf('blob:') === 0) URL.revokeObjectURL(img.src);
      img.removeAttribute('src');
      cv.setAttribute('data-has-photo', '0');
      state.photo = false;
      var inp = $('[data-in="photo"]'); if (inp) inp.value = '';
      var lab = $('[data-upl-label]'); if (lab) lab.textContent = 'להוסיף תמונה לכריכה';
      rmBtn.hidden = true;
    });
  }

  /* ── event chips, anywhere on the page ─────────────────────── */
  d.addEventListener('click', function (e) {
    var b = e.target.closest('[data-ev-set]');
    if (!b) return;
    var ev = b.getAttribute('data-ev-set');
    if (!CFG.events[ev] || ev === state.ev) return;
    state.ev = ev; touched = false;
    save(); draw(); setPool();
    track('event-' + ev);
  });

  /* ── header, entrances, videos, buy bar ────────────────────── */
  var head = $('[data-head]');
  var bar = $('[data-buybar]');
  var hero = $('.hero');
  var quiet = { make: false, plans: false };
  function onScroll() {
    if (head) head.classList.toggle('is-stuck', w.pageYOffset > 8);
    if (bar && hero) {
      var past = hero.getBoundingClientRect().bottom < 80;
      var on = past && !quiet.make && !quiet.plans;
      bar.classList.toggle('is-on', on);
      bar.setAttribute('aria-hidden', String(!on));
    }
  }
  var ticking = false;
  w.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(function () { ticking = false; onScroll(); }); } }, { passive: true });

  if ('IntersectionObserver' in w) {
    var rise = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); rise.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    $$('[data-rise]').forEach(function (el) { rise.observe(el); });

    var hush = new IntersectionObserver(function (es) {
      es.forEach(function (en) { quiet[en.target.getAttribute('data-quiet')] = en.isIntersecting; });
      onScroll();
    }, { threshold: 0.12 });
    [['make', make], ['plans', $('.plans')]].forEach(function (p) { if (p[1]) { p[1].setAttribute('data-quiet', p[0]); hush.observe(p[1]); } });

    var vids = new IntersectionObserver(function (es) {
      es.forEach(function (en) {
        var v = en.target;
        if (en.isIntersecting) {
          if (!v.src && v.getAttribute('data-src')) v.src = v.getAttribute('data-src');
          if (!reduce) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
        } else if (!v.paused) v.pause();
      });
    }, { threshold: 0.35 });
    $$('video[data-loop]').forEach(function (v) { vids.observe(v); });
  } else {
    $$('[data-rise]').forEach(function (el) { el.classList.add('is-in'); });
  }

  $$('[data-film]').forEach(function (box) {
    var btn = $('.film__play', box);
    if (!btn) return;
    btn.addEventListener('click', function () {
      var v = d.createElement('video');
      v.src = box.getAttribute('data-film'); v.controls = true; v.playsInline = true; v.autoplay = true;
      v.setAttribute('aria-label', 'סרטון: כל התהליך ב־40 שניות');
      box.innerHTML = ''; box.appendChild(v);
      var p = v.play(); if (p && p.catch) p.catch(function () {});
      v.focus();
    });
  });

  /* ── light analytics: names of clicks, no personal details ─── */
  function track(name) {
    try { if (typeof w.clarity === 'function') w.clarity('event', name); } catch (e) { /* no analytics */ }
  }
  d.addEventListener('click', function (e) {
    var t = e.target.closest('[data-track]');
    if (t) track(t.getAttribute('data-track'));
  });

  /* ── start ─────────────────────────────────────────────────── */
  load();
  var i1 = $('[data-in="n1"]'), i2 = $('[data-in="n2"]'), idt = $('[data-in="date"]');
  if (i1) i1.value = state.n1; if (i2) i2.value = state.n2; if (idt) idt.value = state.date;
  if (make) goStep(1, false); else draw();
  setPool();
  onScroll();
})();
