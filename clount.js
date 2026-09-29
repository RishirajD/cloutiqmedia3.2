/* ═══════════════════════════════════════════════════════════════════════════
   CLOUT IQ MEDIA — clount.js
   "Digital Kinetic Energy" motion engine

   Architecture
     01  Environment & capability detection
     02  Single rAF orchestrator (pauses when the tab is hidden)
     03  Lenis inertial scroll  ->  ScrollTrigger sync
     04  Scroll state + anchor navigation
     05  Header / mobile nav
     06  Contextual custom cursor
     07  Phase 1 · Preloader
     08  Phase 2 · Hero (intro, marquees, parallax, counters)
     09  Reveal primitives
     10  Phase 3 · Services deck
     11  Card visualisers (canvas 2D)
     12  Phase 4 · Kinetic reading spotlight
     13  WebGL core (raw GL, no library)
     14  Phase 5 · Project matrix distortion
     15  Phase 6 · Footer volumetric fog
     16  Ambient fluid field
     17  Process section reveal
     18  Scroll progress bar
     19  Ripple click effect
     20  Button press feedback
     21  Logo marquee hover pause
     22  Footer CTA reveal + heartbeat
     23  Boot

   Everything degrades: if a CDN fails, or WebGL is unavailable, or the user
   prefers reduced motion, the page stays fully readable and usable.
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ───────────────────────────────────────────────
     01 · ENVIRONMENT
     ─────────────────────────────────────────────── */
  var html      = document.documentElement;
  var HAS_GSAP  = !!window.gsap;
  var HAS_ST    = HAS_GSAP && !!window.ScrollTrigger;
  var HAS_LENIS = typeof window.Lenis === 'function';
  var REDUCED   = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Master switch: only hide things for reveal if we can actually reveal them. */
  var ANIM = HAS_GSAP && HAS_ST && !REDUCED;

  var FINE_POINTER = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  function isDesktop() { return window.matchMedia('(min-width: 1025px)').matches; }

  if (HAS_ST) {
    gsap.registerPlugin(ScrollTrigger);
    /* Allow viewport changes to be measured on phones and tablets. */
    ScrollTrigger.config({ ignoreMobileResize: false });
  }
  if (ANIM) html.classList.add('anim');

  /* Mobile browser chrome and orientation changes can alter the layout height. */
  var scrollRefreshTimer = null;
  function scheduleScrollRefresh(delay) {
    if (!HAS_ST) return;
    clearTimeout(scrollRefreshTimer);
    scrollRefreshTimer = setTimeout(function () {
      ScrollTrigger.refresh();
    }, delay || 250);
  }
  if (HAS_ST) {
    window.addEventListener('resize', function () {
      scheduleScrollRefresh(250);
    }, { passive: true });
    window.addEventListener('orientationchange', function () {
      scheduleScrollRefresh(450);
    }, { passive: true });
  }

  /* The 3D services deck was enabled optimistically pre-paint. If the animation
     stack never arrived, drop it now so the section renders as a plain stack. */
  if (!ANIM) html.classList.remove('deck3d');

  /* Low-power heuristic — skip WebGL on machines that will choke on it. */
  var LOW_POWER = (function () {
    if (REDUCED) return true;
    var cores = navigator.hardwareConcurrency || 4;
    var mem   = navigator.deviceMemory || 4;
    if (cores <= 2) return true;
    if (mem <= 2) return true;
    return false;
  })();

  var USE_WEBGL = html.classList.contains('has-webgl') && !LOW_POWER;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function clamp01(v) { return clamp(v, 0, 1); }
  function smoothstep(t) { t = clamp01(t); return t * t * (3 - 2 * t); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dpr(max) { return Math.min(window.devicePixelRatio || 1, max || 2); }
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

    /* ───────────────────────────────────────────────
     02 · rAF ORCHESTRATOR
     One loop for the whole site. Sleeps with the tab.
     ─────────────────────────────────────────────── */
  var tasks = [];
  var rafId = null;
  var lastT = 0;
  /* When the GSAP ticker drives Lenis, it also runs the custom
     tasks — one loop instead of two. Eliminates the one-frame
     delay between ScrollTrigger updates and scroll-dependent
     tasks (cursor, header state, reel video checks...). */
  var useGaspTicker = false;

  function tick(t) {
    rafId = requestAnimationFrame(tick);
    var dt = t - lastT;
    if (!dt || dt > 50) dt = 16.7;
    lastT = t;
    for (var i = 0; i < tasks.length; i++) {
      try { tasks[i](t, dt); } catch (e) { /* one bad task must not kill the loop */ }
    }
  }
  function startLoop() {
    if (useGaspTicker) return;               /* GSAP ticker owns the loop */
    if (rafId === null && tasks.length) {
      lastT = performance.now();
      rafId = requestAnimationFrame(tick);
    }
  }
  function addTask(fn) { if (tasks.indexOf(fn) === -1) tasks.push(fn); startLoop(); }
  function removeTask(fn) {
    var i = tasks.indexOf(fn);
    if (i > -1) tasks.splice(i, 1);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    } else {
      startLoop();
    }
  });

  /* ───────────────────────────────────────────────
     03 · LENIS INERTIAL SCROLL
     ─────────────────────────────────────────────── */
  var lenis = null;
  if (HAS_LENIS && !REDUCED) {
    try {
      lenis = new Lenis({
        duration: 0.9,
        easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
        orientation: 'vertical',
        gestureOrientation: 'vertical',
        smoothWheel: true,
        syncTouch: false,
        smoothTouch: false,
        wheelMultiplier: 1.05,
        touchMultiplier: 1.0
      });
    } catch (e) { lenis = null; }
  }

  if (lenis) {
    if (HAS_ST) {
      useGaspTicker = true;
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.lagSmoothing(500, 33);
      /* Merge Lenis and the custom task loop into GSAP's single ticker so
         there is one animation frame — not two — per rendered frame.
         Lenis runs first so scrollState (read inside the tasks)
         reflects the *current* scroll position, not the previous frame's. */
      gsap.ticker.add(function (time, dt) {
        lenis.raf(time * 1000);
        if (!tasks.length) return;
        var ms = time * 1000;
        var deltaMs = dt * 1000;
        if (!deltaMs || deltaMs > 50) deltaMs = 16.7;
        for (var i = 0; i < tasks.length; i++) {
          try { tasks[i](ms, deltaMs); } catch (e) { /* one bad task must not kill the loop */ }
        }
      });
    } else {
      (function loop(t) { lenis.raf(t); requestAnimationFrame(loop); })(performance.now());
    }
  }

  /* ───────────────────────────────────────────────
     04 · SCROLL STATE + ANCHORS
     Lenis drives real window scroll, so scrollY is always authoritative.
     ─────────────────────────────────────────────── */
  var scrollState = { y: window.scrollY, vel: 0, dir: 1 };
  addTask(function () {
    var y = window.scrollY;
    scrollState.vel = y - scrollState.y;
    if (Math.abs(scrollState.vel) > 0.4) scrollState.dir = scrollState.vel > 0 ? 1 : -1;
    scrollState.y = y;
  });

  var header = document.getElementById('siteHeader');

  function headerH() { return header ? header.offsetHeight : 0; }

  function scrollToEl(el) {
    if (!el) return;
    var off = -headerH();
    if (lenis) {
      lenis.scrollTo(el, { offset: off, duration: 1.35 });
    } else {
      window.scrollTo({
        top: el.getBoundingClientRect().top + window.scrollY + off,
        behavior: REDUCED ? 'auto' : 'smooth'
      });
    }
  }

  $$('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      if (!id || id === '#') return;
      var el;
      try { el = document.querySelector(id); } catch (err) { return; }
      if (!el) return;
      e.preventDefault();
      setNav(false);
      scrollToEl(el);
    });
  });

  /* ───────────────────────────────────────────────
     05 · HEADER + MOBILE NAV
     ─────────────────────────────────────────────── */
  var navToggle = document.getElementById('navToggle');
  var mobileNav = document.getElementById('mobileNav');
  var navOpen = false;

  function setNav(open) {
    if (!mobileNav || !navToggle) return;
    if (open === navOpen) return;
    navOpen = open;
    navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');

    if (open) {
      mobileNav.hidden = false;
      requestAnimationFrame(function () { mobileNav.classList.add('is-open'); });
      if (lenis) lenis.stop();
    } else {
      mobileNav.classList.remove('is-open');
      window.setTimeout(function () { if (!navOpen) mobileNav.hidden = true; }, 380);
      if (lenis) lenis.start();
    }
  }

  if (navToggle) {
    navToggle.addEventListener('click', function () { setNav(!navOpen); });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && navOpen) setNav(false);
  });

  if (header) {
    addTask(function () {
      var y = scrollState.y;
      if (y > 40) header.classList.add('is-stuck');
      else header.classList.remove('is-stuck');

      var hide = y > 560 && scrollState.dir === 1 && !navOpen;
      if (hide) header.classList.add('is-hidden');
      else header.classList.remove('is-hidden');
    });
  }

  /* ───────────────────────────────────────────────
     06 · CONTEXTUAL CUSTOM CURSOR
     Soft blur circle in empty space; expands into a
     labelled disc over media and projects.
     ─────────────────────────────────────────────── */
  function initCursor() {
    var cur = document.getElementById('cursor');
    if (!cur || !FINE_POINTER || REDUCED) return;

    var ring  = $('.cursor__ring', cur);
    var label = $('.cursor__label', cur);
    html.classList.add('has-cursor');

    var x = window.innerWidth / 2, y = window.innerHeight / 2;
    var tx = x, ty = y;
    var seen = false;

    var LABELS = { view: 'View', drag: 'Drag', arrow: 'Go', play: 'Play' };

    window.addEventListener('mousemove', function (e) {
      tx = e.clientX; ty = e.clientY;
      if (!seen) { seen = true; x = tx; y = ty; cur.classList.add('is-active'); }
    }, { passive: true });

    document.addEventListener('mouseleave', function () { cur.classList.remove('is-active'); });
    document.addEventListener('mouseenter', function () { if (seen) cur.classList.add('is-active'); });

    addTask(function () {
      x = lerp(x, tx, 0.2);
      y = lerp(y, ty, 0.2);
      cur.style.transform = 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0)';
    });

    /* Expanded, labelled state */
    $$('[data-cursor]').forEach(function (el) {
      var kind = el.getAttribute('data-cursor');
      var text = LABELS[kind] || kind;
      el.addEventListener('mouseenter', function () {
        if (label) label.textContent = text;
        cur.classList.add('is-expanded');
      });
      el.addEventListener('mouseleave', function () {
        cur.classList.remove('is-expanded');
      });
    });

    /* Gentle focus state on every other interactive thing */
    $$('a:not([data-cursor]), button:not([data-cursor])').forEach(function (el) {
      el.addEventListener('mouseenter', function () { cur.classList.add('is-focus'); });
      el.addEventListener('mouseleave', function () { cur.classList.remove('is-focus'); });
    });
  }

  /* ───────────────────────────────────────────────
     07 · PHASE 1 · PRELOADER & CINEMATIC ENTRY
     ─────────────────────────────────────────────── */
  function initPreloader(onDone) {
    var fired = false;
    function finishOnce() {
      if (fired) return;
      fired = true;
      if (lenis) lenis.start();
      document.body.style.overflow = '';
      onDone();
    }

    var pre = document.getElementById('preloader');
    if (!pre || !html.classList.contains('js')) { finishOnce(); return; }

    /* Always start from the top on a fresh load */
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    if (lenis) lenis.stop();
    document.body.style.overflow = 'hidden';

    var bar      = document.getElementById('ringBar');
    var countEl  = document.getElementById('preloadCount');
    var grid     = $('.preloader__grid', pre);
    var ring     = $('.preloader__ring', pre);
    var reticle  = $('.preloader__reticle', pre);
    var readout  = $('.preloader__readout', pre);
    var dot      = $('.preloader__dot', pre);
    var brand    = $('.preloader__brand', pre);
    var veil     = $('.preloader__veil', pre);
    var dispMap  = document.getElementById('liquidWaveMap');

    /* Wire the progress ring */
    var C = 553;
    if (bar) {
      var r = (bar.r && bar.r.baseVal) ? bar.r.baseVal.value : 88;
      C = 2 * Math.PI * r;
      bar.style.strokeDasharray = String(C);
      bar.style.strokeDashoffset = String(C);
    }

    /* The dot expands into the technical wireframe */
    if (HAS_GSAP && !REDUCED) {
      var intro = gsap.timeline();
      intro.to([ring, reticle], { opacity: 1, duration: 0.9, ease: 'power2.out' }, 0.3)
           .from([ring, reticle], { scale: 0.3, duration: 1.2, ease: 'expo.out' }, 0.3)
           .to(grid, { opacity: 1, duration: 1.3, ease: 'power2.out' }, 0.45)
           .to(readout, { opacity: 1, duration: 0.7, ease: 'power2.out' }, 0.6);
    } else {
      [grid, ring, reticle, readout].forEach(function (el) { if (el) el.style.opacity = '1'; });
    }

    /* Progress: scripted climb, gated on the real load event */
    var loaded = document.readyState === 'complete';
    if (!loaded) window.addEventListener('load', function () { loaded = true; }, { once: true });

    var t0 = performance.now();
    var shown = 0;
    var settled = false;

    function step(now) {
      var elapsed = now - t0;
      var scripted = Math.min(92, (elapsed / 1900) * 92);
      var canFinish = loaded || elapsed > 5000;
      var target = canFinish ? 100 : scripted;

      shown += (target - shown) * 0.09;
      if (canFinish && target - shown < 0.5) shown = 100;

      var p = clamp(shown, 0, 100);
      var whole = Math.floor(p + 0.0001);
      if (countEl) countEl.textContent = (whole < 10 ? '0' : '') + whole;
      pre.setAttribute('aria-valuenow', String(whole));
      if (bar) bar.style.strokeDashoffset = String(C * (1 - p / 100));

      if (p >= 99.9 && !settled) {
        settled = true;
        removeTask(step);
        exit();
      }
    }
    addTask(step);

    /* Liquid distortion wave on the wordmark */
    function liquid() {
      if (!dispMap || !brand || !HAS_GSAP) return;
      brand.style.filter = 'url(#liquidWave)';
      var o = { v: 0 };
      gsap.to(o, {
        v: 200, duration: 1.0, ease: 'power2.in',
        onUpdate: function () { dispMap.setAttribute('scale', String(Math.round(o.v))); }
      });
    }

    function exit() {
      pre.classList.add('is-done');

      var teardown = function () {
        pre.style.display = 'none';
        if (dispMap) dispMap.setAttribute('scale', '0');
        if (brand) brand.style.filter = 'none';
        finishOnce();
      };

      if (!HAS_GSAP || REDUCED) {
        pre.style.transition = 'opacity .6s ease';
        pre.style.opacity = '0';
        window.setTimeout(teardown, 650);
        return;
      }

      gsap.timeline({ onComplete: teardown })
        .to([readout, ring, reticle, grid], { opacity: 0, duration: 0.45, ease: 'power2.in' }, 0)
        .to(dot, { opacity: 0, duration: 0.3, ease: 'power2.in' }, 0)
        .set(brand, { scale: 0.86 }, 0.1)
        .to(brand, { opacity: 1, scale: 1, duration: 0.8, ease: 'expo.out' }, 0.14)
        .call(liquid, null, 0.88)
        .to(brand, { scale: 1.6, opacity: 0, duration: 1.0, ease: 'power2.in' }, 0.95)
        .to(veil, { scaleY: 0, duration: 1.15, ease: 'expo.inOut' }, 1.02);
    }

    /* Absolute last resort — the entry must never trap the page */
    window.setTimeout(function () {
      if (!fired) {
        removeTask(step);
        pre.style.display = 'none';
        finishOnce();
      }
    }, 9000);
  }

  /* ───────────────────────────────────────────────
     08 · REVEAL PRIMITIVES
     ─────────────────────────────────────────────── */
  function initReveals() {
    if (!ANIM) {
      /* Belt and braces: strip any hidden state that CSS may have applied. */
      $$('.line__in, .footer__cta-line > span').forEach(function (el) { el.style.transform = 'none'; });
      $$('.reveal-fade').forEach(function (el) { el.style.opacity = '1'; el.style.transform = 'none'; });
      var cta = $('.footer__cta');
      if (cta && !REDUCED) cta.classList.add('is-beating');
      return;
    }

    /* Masked line headings (the hero is handled by the intro timeline) */
    $$('.strategies__heading, .why__title, .process__title').forEach(function (h) {
      var inners = $$('.line__in', h);
      if (!inners.length) return;
      /* Neutralize the CSS hide first. gsap.set({ yPercent:110 }) otherwise
         parses the stylesheet's translateY(110%) into `y` and then adds
         another 110%, leaving the heading clipped even after the reveal
         ("translate(0%,110%) translate(0px,44px)" — the visible bug where
         these titles never appear). */
      inners.forEach(function (el) { el.style.transform = 'none'; });
      gsap.set(inners, { yPercent: 110 });
      gsap.to(inners, {
        yPercent: 0, duration: 1.15, ease: 'expo.out', stagger: 0.09,
        scrollTrigger: { trigger: h, start: 'top 88%', once: true },
        /* Retire the composited layers the mask reveal needed — keeping
           will-change on huge display type permanently holds large GPU
           textures and makes the reveal's first raster more expensive. */
        onComplete: function () {
          inners.forEach(function (el) { el.style.willChange = 'auto'; });
        }
      });
    });

    /* Generic soft entrances */
    var soft = $$('.section-tag, .strategies__body, .work__body, .partners__kicker, .footer__kicker, .footer__contact, .footer__base > *');
    soft.forEach(function (el) {
      gsap.set(el, { opacity: 0, y: 24 });
      gsap.to(el, {
        opacity: 1, y: 0, duration: 0.95, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 94%', once: true }
      });
    });

    $$('.reveal-fade').forEach(function (el) {
      if (el.closest('.hero')) return;
      gsap.set(el, { opacity: 0, y: 26 });
      gsap.to(el, {
        opacity: 1, y: 0, duration: 1, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 92%', once: true }
      });
    });

  }

  /* ───────────────────────────────────────────────
     09 · COUNTERS
     ─────────────────────────────────────────────── */
  function startCounters() {
    $$('.stat__num[data-count]').forEach(function (el) {
      if (el.getAttribute('data-count-started') === 'true') return;
      el.setAttribute('data-count-started', 'true');

      var target = parseFloat(el.getAttribute('data-count')) || 0;
      var suffix = el.getAttribute('data-suffix') || '';
      var dec = parseInt(el.getAttribute('data-decimals') || '0', 10);

      if (REDUCED || !HAS_GSAP) {
        el.textContent = target.toFixed(dec) + suffix;
        return;
      }
      var o = { v: 0 };
      gsap.to(o, {
        v: target, duration: 1.9, ease: 'power2.out',
        onUpdate: function () { el.textContent = o.v.toFixed(dec) + suffix; },
        onComplete: function () { el.textContent = target.toFixed(dec) + suffix; }
      });
    });
  }

  /* ───────────────────────────────────────────────
     10 · PHASE 2 · HERO INTRO + PARALLAX
     ─────────────────────────────────────────────── */
  function heroIntro() {
    var hero = document.getElementById('hero');
    if (!hero) return;

    if (!ANIM) {
      $$('.line__in', hero).forEach(function (e) { e.style.transform = 'none'; });
      $$('.reveal-fade', hero).forEach(function (e) { e.style.opacity = '1'; e.style.transform = 'none'; });
      startCounters();
      return;
    }

    var lines  = $$('.hero__title .line__in', hero);
    var fades  = $$('.reveal-fade', hero);
    var figure = $('.hero__reel', hero);
    var stats  = $$('.hero__stats .stat', hero);
    var cue    = $('.scroll-cue', hero);
    var marq   = $('.hero__marquee', hero);

    var heroSettled     = false;
    var countersStarted = false;

    function ensureCounters() {
      if (countersStarted) return;
      countersStarted = true;
      try { startCounters(); } catch (e) { /* counters must never block the hero */ }
    }

    /* Guaranteed landing state. No matter what happens above — a stray GSAP
       error, a ScrollTrigger.refresh() collision mid-tween, or a race with
       the preloader's exit timeline — the hero must end up fully visible
       and settled. Idempotent: safe to call as many times as needed. */
    function forceHeroFinalState() {
      if (heroSettled) return;
      heroSettled = true;

      try { if (lines.length) gsap.set(lines, { yPercent: 0 }); } catch (e) {}
      try { if (fades.length) gsap.set(fades, { opacity: 1, y: 0 }); } catch (e) {}
      try { if (stats.length) gsap.set(stats, { opacity: 1, y: 0 }); } catch (e) {}
      try { if (figure) gsap.set(figure, { opacity: 1, scale: 1 }); } catch (e) {}
      try { if (cue) gsap.set(cue, { opacity: 1 }); } catch (e) {}
      try { if (marq) gsap.set(marq, { opacity: 1 }); } catch (e) {}

      /* Belt and braces: if gsap.set itself is what's broken, strip the raw
         inline hides directly so nothing can be left stuck invisible. */
      lines.forEach(function (e) { e.style.transform = 'none'; });
      fades.forEach(function (e) { e.style.opacity = '1'; e.style.transform = 'none'; });
      stats.forEach(function (e) { e.style.opacity = '1'; e.style.transform = 'none'; });
      if (figure) figure.style.opacity = '1';
      if (cue) cue.style.opacity = '1';
      if (marq) marq.style.opacity = '1';

      ensureCounters();
    }

    try {
      /* Neutralize the CSS translateY(110%) so GSAP's yPercent starts from a
         single clean 110% — otherwise the two cumulate and the reveal settles
         on a still-clipped position. */
      lines.forEach(function (e) { e.style.transform = 'none'; });
      gsap.set(lines, { yPercent: 110 });
      gsap.set(fades, { opacity: 0, y: 26 });
      gsap.set(stats, { opacity: 0, y: 20 });
      if (figure) gsap.set(figure, { opacity: 0, scale: 1.04 });
      if (cue) gsap.set(cue, { opacity: 0 });
      if (marq) gsap.set(marq, { opacity: 0 });

      var tl = gsap.timeline({
        delay: 0.12,
        onComplete: forceHeroFinalState
      });

      if (marq)   tl.to(marq, { opacity: 1, duration: 1.6, ease: 'power2.out' }, 0);
      if (figure) tl.to(figure, { opacity: 1, scale: 1, duration: 1.7, ease: 'expo.out' }, 0);
      if (fades[0]) tl.to(fades[0], { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }, 0.12);
      if (lines.length) tl.to(lines, { yPercent: 0, duration: 1.3, ease: 'expo.out', stagger: 0.1 }, 0.24);
      if (fades.length > 1) {
        tl.to(fades.slice(1), { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out', stagger: 0.12 }, 0.78);
      }
      if (stats.length) tl.to(stats, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', stagger: 0.07 }, 0.98);
      if (cue) tl.to(cue, { opacity: 1, duration: 0.8, ease: 'power2.out' }, 1.35);
      tl.call(ensureCounters, null, 1.0);
    } catch (e) {
      /* The intro timeline itself blew up — skip straight to the resting
         state instead of leaving the hero half-hidden. */
      forceHeroFinalState();
    }

    /* Depth parallax while leaving the hero — purely decorative and fully
       independent of the reveal above, so a failure here must never be
       able to block or undo it. */
    try {
      if (figure) {
        gsap.to(figure, {
          yPercent: -8, ease: 'none',
          scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true }
        });
      }
      gsap.to('.hero__copy', {
        yPercent: -7, opacity: 0.25, ease: 'none',
        scrollTrigger: { trigger: hero, start: 'center top', end: 'bottom top', scrub: true }
      });
    } catch (e) { /* decorative parallax only — never block the reveal for this */ }

    /* Silent watchdog. The intro timeline above totals well under 2.2s once
       its 0.12s delay is included; 2.6s gives it a comfortable margin. If
       anything left the hero mid-hide for any reason, this quietly forces
       the exact same resting state — no visible jump, no console noise. */
    window.setTimeout(forceHeroFinalState, 2600);
  }

  /* ───────────────────────────────────────────────
     11 · KINETIC MARQUEES
     Giant lettering that travels against the scroll.
     ─────────────────────────────────────────────── */
  function initMarquees() {
    $$('[data-marquee-dir]').forEach(function (wrap) {
      var track = $('[data-marquee-track]', wrap);
      if (!track) return;

      var dir = parseFloat(wrap.getAttribute('data-marquee-dir'));
      if (!dir) dir = -1;

      var originals = Array.prototype.slice.call(track.children).filter(function (n) {
        return !n.hasAttribute('data-clone');
      });
      if (!originals.length) return;

      var baseW = 0;
      var offset = 0;
      var visible = true;

      function build() {
        $$('[data-clone]', track).forEach(function (n) {
          if (n.parentNode) n.parentNode.removeChild(n);
        });

        var cs = window.getComputedStyle(track);
        var gap = parseFloat(cs.columnGap) || parseFloat(cs.gap) || 0;

        baseW = 0;
        originals.forEach(function (n) {
          baseW += n.getBoundingClientRect().width + gap;
        });
        if (!(baseW > 0)) return;

        var need = Math.ceil((window.innerWidth * 2) / baseW) + 1;
        for (var c = 1; c < need; c++) {
          originals.forEach(function (n) {
            var cl = n.cloneNode(true);
            cl.setAttribute('data-clone', '');
            cl.setAttribute('aria-hidden', 'true');
            track.appendChild(cl);
          });
        }
      }

      build();
      /* Web fonts change metrics — remeasure once they land */
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(build).catch(function () {});
      }

      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (entries) {
          visible = entries[0].isIntersecting;
        }, { rootMargin: '250px 0px' }).observe(wrap);
      }

      var drift = 0.34;
      addTask(function (t, dt) {
        if (!visible || !baseW) return;
        var move = drift * (dt / 16.7) + scrollState.vel * 1.45;
        offset += move * dir;
        offset = offset % baseW;
        if (offset > 0) offset -= baseW;
        track.style.transform = 'translate3d(' + offset.toFixed(2) + 'px,0,0)';
      });

      var rt;
      window.addEventListener('resize', function () {
        clearTimeout(rt);
        rt = setTimeout(build, 220);
      });
    });
  }

  /* ───────────────────────────────────────────────
     12 · CARD VISUALISERS (canvas 2D)
     Each returns { resize(w,h), render(ctx,w,h,time,dt) }
     ─────────────────────────────────────────────── */

  /* 01 · Hyper-Growth SEO — a glowing grid line that peaks and trends upward */
  function vizSeo() {
    var pts = [];
    var travel = 0;

    function resize() {
      var base = [0.80, 0.74, 0.79, 0.64, 0.68, 0.50, 0.55, 0.32, 0.20];
      pts = base.map(function (y, i) {
        return { x: i / (base.length - 1), y: y };
      });
    }

    function pointAt(prog, w, h, t) {
      var seg = (pts.length - 1) * clamp01(prog);
      var i = Math.min(pts.length - 2, Math.floor(seg));
      var f = seg - i;
      var ax = 0.08 * w + pts[i].x * 0.84 * w;
      var bx = 0.08 * w + pts[i + 1].x * 0.84 * w;
      var ay = (pts[i].y + Math.sin(t * 1.3 + i * 0.7) * 0.012) * h;
      var by = (pts[i + 1].y + Math.sin(t * 1.3 + (i + 1) * 0.7) * 0.012) * h;
      return { x: lerp(ax, bx, f), y: lerp(ay, by, f) };
    }

    function render(ctx, w, h, time, dt) {
      var t = time / 1000;
      if (!pts.length) resize();

      /* Perspective grid floor */
      ctx.save();
      ctx.strokeStyle = 'rgba(242,242,240,0.055)';
      ctx.lineWidth = 1;
      var i, f;
      for (i = 0; i <= 7; i++) {
        f = i / 7;
        var gy = h * (0.26 + Math.pow(f, 1.75) * 0.74);
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
      }
      for (i = 0; i <= 10; i++) {
        f = i / 10;
        ctx.beginPath();
        ctx.moveTo(w * (0.5 + (f - 0.5) * 0.34), h * 0.26);
        ctx.lineTo(w * (f * 1.44 - 0.22), h);
        ctx.stroke();
      }
      ctx.restore();

      /* Area under the trend */
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0.08 * w, h);
      for (i = 0; i < pts.length; i++) {
        var p = pointAt(i / (pts.length - 1), w, h, t);
        ctx.lineTo(p.x, p.y);
      }
      ctx.lineTo(0.92 * w, h);
      ctx.closePath();
      var fill = ctx.createLinearGradient(0, h * 0.15, 0, h);
      fill.addColorStop(0, 'rgba(255,107,26,0.22)');
      fill.addColorStop(1, 'rgba(255,107,26,0)');
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.restore();

      /* The line itself */
      ctx.save();
      var grad = ctx.createLinearGradient(0, h, w, 0);
      grad.addColorStop(0, 'rgba(255,107,26,0.25)');
      grad.addColorStop(1, 'rgba(255,168,110,1)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2.2;
      ctx.lineJoin = 'round';
      ctx.shadowColor = 'rgba(255,107,26,0.9)';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      for (i = 0; i < pts.length; i++) {
        var q = pointAt(i / (pts.length - 1), w, h, t);
        if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
      }
      ctx.stroke();
      ctx.restore();

      /* Travelling pulse */
      travel += dt / 4200;
      if (travel > 1.25) travel = 0;
      var pt = pointAt(Math.min(1, travel), w, h, t);
      ctx.save();
      ctx.shadowColor = 'rgba(255,138,61,1)';
      ctx.shadowBlur = 22;
      ctx.fillStyle = '#fff6ef';
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    return { resize: resize, render: render };
  }

  /* 02 · Social Domination — glass spheres bumping, each contact rippling */
  function vizSocial() {
    var balls = [], ripples = [], W = 0, H = 0;

    function resize(w, h) {
      W = w; H = h;
      var R = Math.min(w, h);
      balls = [];
      ripples = [];
      var n = 5;
      for (var i = 0; i < n; i++) {
        var rad = R * (0.11 + Math.random() * 0.07);
        balls.push({
          x: rad + Math.random() * Math.max(1, w - 2 * rad),
          y: rad + Math.random() * Math.max(1, h - 2 * rad),
          vx: (Math.random() - 0.5) * 0.9,
          vy: (Math.random() - 0.5) * 0.9,
          r: rad
        });
      }
    }

    function ripple(x, y, r) { ripples.push({ x: x, y: y, r: r, life: 0 }); }

    function render(ctx, w, h, time, dt) {
      if (w !== W || h !== H || !balls.length) resize(w, h);
      var k = dt / 16.7;
      var i, j, b;

      for (i = 0; i < balls.length; i++) {
        b = balls[i];
        b.x += b.vx * k;
        b.y += b.vy * k;
        if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx); ripple(b.x, b.y, b.r); }
        if (b.x + b.r > w) { b.x = w - b.r; b.vx = -Math.abs(b.vx); ripple(b.x, b.y, b.r); }
        if (b.y - b.r < 0) { b.y = b.r; b.vy = Math.abs(b.vy); ripple(b.x, b.y, b.r); }
        if (b.y + b.r > h) { b.y = h - b.r; b.vy = -Math.abs(b.vy); ripple(b.x, b.y, b.r); }
      }

      /* Gentle elastic contact */
      for (i = 0; i < balls.length; i++) {
        for (j = i + 1; j < balls.length; j++) {
          var a = balls[i], c = balls[j];
          var dx = c.x - a.x, dy = c.y - a.y;
          var d = Math.sqrt(dx * dx + dy * dy) || 0.001;
          var min = a.r + c.r;
          if (d < min) {
            var nx = dx / d, ny = dy / d;
            var push = (min - d) / 2;
            a.x -= nx * push; a.y -= ny * push;
            c.x += nx * push; c.y += ny * push;
            var tmpx = a.vx, tmpy = a.vy;
            a.vx = c.vx; a.vy = c.vy;
            c.vx = tmpx; c.vy = tmpy;
            ripple(a.x + nx * a.r, a.y + ny * a.r, min * 0.45);
          }
        }
      }

      /* Ripples */
      for (i = ripples.length - 1; i >= 0; i--) {
        var rp = ripples[i];
        rp.life += dt / 900;
        if (rp.life >= 1) { ripples.splice(i, 1); continue; }
        var e = rp.life;
        ctx.save();
        ctx.strokeStyle = 'rgba(255,107,26,' + (0.5 * (1 - e)).toFixed(3) + ')';
        ctx.lineWidth = 1.4 * (1 - e) + 0.3;
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, rp.r * (1 + e * 2.6), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      /* Glass spheres */
      for (i = 0; i < balls.length; i++) {
        b = balls[i];
        ctx.save();
        var g = ctx.createRadialGradient(
          b.x - b.r * 0.34, b.y - b.r * 0.4, b.r * 0.08,
          b.x, b.y, b.r
        );
        g.addColorStop(0, 'rgba(255,255,255,0.34)');
        g.addColorStop(0.42, 'rgba(255,107,26,0.11)');
        g.addColorStop(1, 'rgba(18,39,107,0.10)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();

        ctx.strokeStyle = 'rgba(242,242,240,0.20)';
        ctx.lineWidth = 1;
        ctx.stroke();

        /* specular highlight */
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.ellipse(b.x - b.r * 0.36, b.y - b.r * 0.44, b.r * 0.17, b.r * 0.1, -0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    return { resize: resize, render: render };
  }

  /* 03 · Paid Acquisition — neon metrics accelerating into a funnel */
  function vizPaid() {
    var parts = [], W = 0, H = 0;
    var GLYPHS = ['0','1','4','7','9','%','₹','$','▲','◆','+','·'];

    function make(w, h, seeded) {
      return {
        x0: Math.random(),
        y: seeded ? Math.random() * h : -Math.random() * h * 0.25,
        sp: 0.55 + Math.random() * 0.9,
        g: GLYPHS[(Math.random() * GLYPHS.length) | 0],
        a: 0.28 + Math.random() * 0.72,
        sz: 8 + Math.random() * 6
      };
    }

    function resize(w, h) {
      W = w; H = h;
      parts = [];
      var n = Math.max(26, Math.min(64, Math.round(w / 9)));
      for (var i = 0; i < n; i++) parts.push(make(w, h, true));
    }

    function render(ctx, w, h, time, dt) {
      if (w !== W || h !== H || !parts.length) resize(w, h);
      var k = dt / 16.7;

      /* Funnel walls */
      var topPad = 0.06, apex = 0.30;
      ctx.save();
      ctx.strokeStyle = 'rgba(242,242,240,0.11)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(w * topPad, 0);
      ctx.lineTo(w * (0.5 - apex * 0.22), h);
      ctx.moveTo(w * (1 - topPad), 0);
      ctx.lineTo(w * (0.5 + apex * 0.22), h);
      ctx.stroke();
      ctx.restore();

      /* Accelerating metric stream */
      ctx.save();
      ctx.font = '700 11px "Space Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        var f = clamp01(p.y / h);
        /* speed ramps up as it funnels down */
        p.y += p.sp * (0.6 + f * 2.7) * k;
        if (p.y > h + 20) { parts[i] = make(w, h, false); continue; }

        var narrow = Math.pow(f, 1.45);
        var half = lerp(0.5 - topPad, apex * 0.22, narrow);
        var x = w * (0.5 + (p.x0 - 0.5) * 2 * half);

        ctx.font = '700 ' + (p.sz * (1 - narrow * 0.4)).toFixed(1) + 'px "Space Mono", monospace';
        ctx.fillStyle = 'rgba(255,' + Math.round(107 + narrow * 90) + ',' + Math.round(26 + narrow * 120) + ',' + (p.a * (0.35 + f * 0.65)).toFixed(3) + ')';
        ctx.shadowColor = 'rgba(255,107,26,0.75)';
        ctx.shadowBlur = 6 + narrow * 12;
        ctx.fillText(p.g, x, p.y);
      }
      ctx.restore();

      /* Apex bloom */
      var bg = ctx.createRadialGradient(w * 0.5, h, 0, w * 0.5, h, w * 0.42);
      bg.addColorStop(0, 'rgba(255,138,61,0.42)');
      bg.addColorStop(1, 'rgba(255,138,61,0)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, h * 0.55, w, h * 0.45);
    }

    return { resize: resize, render: render };
  }

  /* 04 · Content & Creator Collaboration — orbiting nodes connected by glowing threads */
  function vizCollab() {
    var nodes = [], W = 0, H = 0;
    var CENTER_X, CENTER_Y;

    function resize(w, h) {
      W = w; H = h;
      CENTER_X = w * 0.5; CENTER_Y = h * 0.5;
      var R = Math.min(w, h) * 0.34;
      nodes = [];
      var n = 6;
      for (var i = 0; i < n; i++) {
        var angle = (i / n) * Math.PI * 2;
        nodes.push({
          bx: CENTER_X + Math.cos(angle) * R,
          by: CENTER_Y + Math.sin(angle) * R,
          x: 0, y: 0,
          phase: angle,
          speed: 0.28 + Math.random() * 0.18,
          r: 5 + Math.random() * 4
        });
      }
    }

    function render(ctx, w, h, time, dt) {
      if (w !== W || h !== H || !nodes.length) resize(w, h);
      var t = time / 1000;

      /* Update positions with gentle drift */
      for (var i = 0; i < nodes.length; i++) {
        var nd = nodes[i];
        nd.x = nd.bx + Math.cos(t * nd.speed + nd.phase) * 9;
        nd.y = nd.by + Math.sin(t * nd.speed * 0.7 + nd.phase) * 9;
      }

      /* Central hub */
      var cx = CENTER_X + Math.cos(t * 0.22) * 4;
      var cy = CENTER_Y + Math.sin(t * 0.18) * 4;

      /* Threads from hub to each node */
      for (var j = 0; j < nodes.length; j++) {
        var nd2 = nodes[j];
        var grad = ctx.createLinearGradient(cx, cy, nd2.x, nd2.y);
        grad.addColorStop(0, 'rgba(255,107,26,0.55)');
        grad.addColorStop(1, 'rgba(255,107,26,0.04)');
        ctx.save();
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(nd2.x, nd2.y);
        ctx.stroke();
        ctx.restore();
      }

      /* Cross-threads between adjacent nodes */
      for (var k = 0; k < nodes.length; k++) {
        var a = nodes[k], b = nodes[(k + 1) % nodes.length];
        ctx.save();
        ctx.strokeStyle = 'rgba(242,242,240,0.07)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.restore();
      }

      /* Outer nodes */
      for (var m = 0; m < nodes.length; m++) {
        var nd3 = nodes[m];
        ctx.save();
        ctx.shadowColor = 'rgba(255,107,26,0.7)';
        ctx.shadowBlur = 10;
        ctx.fillStyle = 'rgba(255,107,26,0.9)';
        ctx.beginPath();
        ctx.arc(nd3.x, nd3.y, nd3.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      /* Hub */
      ctx.save();
      ctx.shadowColor = 'rgba(255,107,26,1)';
      ctx.shadowBlur = 22;
      var hg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 14);
      hg.addColorStop(0, 'rgba(255,168,110,1)');
      hg.addColorStop(1, 'rgba(255,107,26,0.3)');
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    return { resize: resize, render: render };
  }

  /* 05 · Analytics & Reporting — animated bar chart with rising columns */
  function vizAnalytics() {
    var bars = [], W = 0, H = 0;
    var LABELS = ['Jan','Feb','Mar','Apr','May','Jun'];

    function resize(w, h) {
      W = w; H = h;
      bars = LABELS.map(function (label, i) {
        return {
          label: label,
          target: 0.28 + Math.random() * 0.62,
          current: 0,
          phase: i * 0.55
        };
      });
    }

    function render(ctx, w, h, time, dt) {
      if (w !== W || h !== H || !bars.length) resize(w, h);
      var t = time / 1000;
      var n = bars.length;
      var padX = w * 0.08;
      var padTop = h * 0.12;
      var padBot = h * 0.18;
      var chartH = h - padTop - padBot;
      var slotW = (w - padX * 2) / n;
      var barW = slotW * 0.52;

      /* Baseline */
      ctx.save();
      ctx.strokeStyle = 'rgba(242,242,240,0.10)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padX, padTop + chartH);
      ctx.lineTo(w - padX, padTop + chartH);
      ctx.stroke();

      /* Horizontal grid lines */
      for (var g = 1; g <= 3; g++) {
        var gy = padTop + chartH * (1 - g / 4);
        ctx.beginPath();
        ctx.moveTo(padX, gy); ctx.lineTo(w - padX, gy);
        ctx.stroke();
      }
      ctx.restore();

      for (var i = 0; i < n; i++) {
        var bar = bars[i];
        /* Animate height with a breathing wave */
        var wave = 0.06 * Math.sin(t * 1.1 + bar.phase);
        var h2 = clamp01(bar.target + wave);
        bar.current += (h2 - bar.current) * clamp01(dt / 280);

        var bh = bar.current * chartH;
        var bx = padX + i * slotW + (slotW - barW) / 2;
        var by = padTop + chartH - bh;

        /* Bar fill */
        var grad = ctx.createLinearGradient(0, by, 0, by + bh);
        grad.addColorStop(0, i === 4 ? 'rgba(255,168,110,1)' : 'rgba(255,107,26,0.85)');
        grad.addColorStop(1, 'rgba(255,107,26,0.12)');
        ctx.save();
        ctx.shadowColor = 'rgba(255,107,26,0.5)';
        ctx.shadowBlur = i === 4 ? 18 : 6;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(bx, by, barW, bh, [3, 3, 0, 0])
                      : ctx.rect(bx, by, barW, bh);
        ctx.fill();
        ctx.restore();

        /* Label */
        ctx.save();
        ctx.fillStyle = 'rgba(242,242,240,0.35)';
        ctx.font = '600 ' + Math.round(w * 0.055) + 'px "Space Mono",monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(bar.label, bx + barW / 2, padTop + chartH + 8);
        ctx.restore();
      }
    }

    return { resize: resize, render: render };
  }

  var VIZ_FACTORY = { seo: vizSeo, social: vizSocial, paid: vizPaid, collab: vizCollab, analytics: vizAnalytics };

  /* Wraps a visualiser in a canvas with DPR handling and viewport gating */
  function mountViz(canvas, gate) {
    var kind = canvas.getAttribute('data-viz');
    var factory = VIZ_FACTORY[kind];
    if (!factory || REDUCED) return null;

    var ctx;
    try { ctx = canvas.getContext('2d'); } catch (e) { return null; }
    if (!ctx) return null;

    var impl = factory();
    var W = 0, H = 0, time = 0, visible = false;

    function resize() {
      var r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      var ratio = dpr(2);
      W = r.width; H = r.height;
      canvas.width = Math.max(1, Math.round(W * ratio));
      canvas.height = Math.max(1, Math.round(H * ratio));
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (impl.resize) impl.resize(W, H);
    }

    resize();

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
      }, { rootMargin: '120px 0px' }).observe(canvas);
    } else {
      visible = true;
    }

    var rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(resize, 200);
    });

    addTask(function (t, dt) {
      if (!visible) return;
      if (gate && !gate()) return;
      if (!W) { resize(); if (!W) return; }
      time += dt;
      ctx.clearRect(0, 0, W, H);
      impl.render(ctx, W, H, time, dt);
    });

    return { resize: resize };
  }

    /* ───────────────────────────────────────────────
     13 · PHASE 3 · SERVICES DECK
     Sticky split-screen; smoothly scrubs through
     the cards on both desktop and mobile screens.
     ─────────────────────────────────────────────── */
  function initStrategies() {
    var section = document.getElementById('strategies');
    if (!section) return;

    var cards = $$('[data-strat-card]', section);
    var items = $$('[data-strat-index]', section);
    var progressBar = $('[data-strat-progress]', section);
    if (!cards.length) return;

    var n = cards.length;
    var activeIdx = -1;

    /* Mount visualizers on cards */
    var allowCardViz = !LOW_POWER;
    cards.forEach(function (card) {
      card.__vizOn = true;
      var cv = $('.card__canvas', card);
      if (cv && allowCardViz) {
        mountViz(cv, function () { return card.__vizOn !== false; });
      }
    });

    function setActive(i) {
      if (i === activeIdx) return;
      activeIdx = i;
      items.forEach(function (it, k) {
        if (k === i) it.classList.add('is-active');
        else it.classList.remove('is-active');
      });
    }

    function update(p) {
      var s = clamp01(p) * n;
      var isDesk = isDesktop();
      for (var i = 0; i < n; i++) {
        var card = cards[i];
        var u = s - i;
        var enter = clamp01((u + 0.62) / 0.62);
        var exit = (i === n - 1) ? 0 : clamp01((u - 0.90) / 0.55);
        var op = enter * (1 - exit);

        if (isDesk) {
          var rotY = 82 * (1 - enter) - 104 * exit;
          var xp = 18 * (1 - enter) - 11 * exit;
          var sc = 0.90 + 0.10 * enter - 0.07 * exit;
          var tz = -70 * (1 - enter) - 40 * exit;
          card.style.transform =
            'translate3d(' + xp.toFixed(2) + '%,0px,' + tz.toFixed(1) + 'px)' +
            ' rotateY(' + rotY.toFixed(2) + 'deg)' +
            ' scale(' + sc.toFixed(3) + ')';
        } else {
          var mXp = 28 * (1 - enter) - 28 * exit;
          var mSc = 0.94 + 0.06 * enter - 0.06 * exit;
          card.style.transform =
            'translate3d(' + mXp.toFixed(2) + '%,0px,0px)' +
            ' scale(' + mSc.toFixed(3) + ')';
        }
        card.style.opacity = op.toFixed(3);
        /* Paint order: mirror the desktop translateZ depth (settled card in
           front, exiting next, entering furthest back). The <=1024 branch has
           no perspective, so there is no 3D depth sort, and will-change makes
           every card its own stacking context: without this the in-flight card
           paints over the settled one and ghosts its text through it. */
        card.style.zIndex = String(Math.round(1000 + (-70 * (1 - enter) - 40 * exit)));
        card.style.pointerEvents = op > 0.6 ? 'auto' : 'none';
        card.__vizOn = op > 0.04;
      }
      setActive(clamp(Math.floor(s), 0, n - 1));
      if (progressBar) progressBar.style.transform = 'scaleX(' + clamp01(p).toFixed(4) + ')';
    }

    function clearInline() {
      cards.forEach(function (card) {
        card.style.transform = '';
        card.style.opacity = '';
        card.style.pointerEvents = '';
        card.style.zIndex = '';
        card.__vizOn = true;
      });
      if (progressBar) progressBar.style.transform = '';
    }

    var st = null;

    /* ── Does the pinned panel actually fit on this screen? ──
       The panel is a fixed 100svh box that has to hold the copy column AND
       one whole card. When that does not fit, flex crushes the deck (it has
       measured 99px at 1024×768 and 0px at 360×740) and clips the cards. So
       measure it, and fall back to the plain stacked deck — the CSS default,
       which cannot clip anything — whenever the panel is too short.
       Only meaningful while `deck3d` is set: that is the pinned CSS. */
    var FIT_SLACK = 4;

    function panelFits() {
      var pin = $('.strategies__pin', section);
      var left = $('.strategies__left', section);
      var right = $('.strategies__right', section);
      if (!pin || !left || !right) return true;

      var cs = getComputedStyle(pin);
      var inner = pin.clientHeight -
                  parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      if (!(inner > 0)) return true;

      var leftNeed = left.scrollHeight;
      var cardNeed = cards[0].scrollHeight;
      /* 861px is where the CSS moves the copy from above the deck to beside
         it (the same split-panel grid the desktop layout uses). */
      var beside = window.innerWidth >= 861;
      var need = beside ? Math.max(leftNeed, cardNeed)
                        : leftNeed + cardNeed + 12;
      return need <= inner + FIT_SLACK;
    }

    /* panelFits() only describes the pinned layout, so make sure that layout
       is applied before asking the question. */
    function canPin() {
      var wasPinned = html.classList.contains('deck3d');
      if (!wasPinned) html.classList.add('deck3d');
      var ok = panelFits();
      if (!wasPinned && !ok) html.classList.remove('deck3d');
      return ok;
    }

    function enable() {
      if (st || !HAS_ST || REDUCED) { setActive(0); return; }
      if (!canPin()) { clearInline(); setActive(0); return; }
      html.classList.add('deck3d');
      st = ScrollTrigger.create({
        trigger: section,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: function (self) { update(self.progress); },
        onRefresh: function (self) { update(self.progress); }
      });
      update(st.progress || 0);
    }

    function disable() {
      if (st) { st.kill(); st = null; }
      html.classList.remove('deck3d');
      clearInline();
      setActive(0);
    }

    if (HAS_ST && HAS_GSAP && !REDUCED && canPin()) {
      enable();
    } else {
      disable();
    }

    window.addEventListener('resize', function () {
      if (!HAS_ST || !HAS_GSAP || REDUCED) return;
      /* Re-decide the pin on resize: entering or leaving the pinned layout
         changes the height of the whole section, so refresh afterwards. */
      var fits = canPin();
      if (fits === !!st) {
        if (st) ScrollTrigger.refresh();
        return;
      }
      if (fits) enable(); else disable();
      ScrollTrigger.refresh();
    });
  }

  /* ───────────────────────────────────────────────
     14 · PHASE 4 · KINETIC READING SPOTLIGHT
     Each word carries a dim base copy and a glowing
     duplicate whose opacity tracks its distance from
     the centre of the viewport.
     ─────────────────────────────────────────────── */
  function initKinetic() {
    var lines = $$('[data-kinetic]');
    if (!lines.length || !ANIM) return;

    var words = [];

    lines.forEach(function (line) {
      var text = (line.textContent || '').trim();
      if (!text) return;
      var frag = document.createDocumentFragment();

      text.split(/\s+/).forEach(function (word) {
        var host = document.createElement('span');
        host.className = 'k-word';
        host.appendChild(document.createTextNode(word));

        var lit = document.createElement('span');
        lit.className = 'k-lit';
        lit.setAttribute('aria-hidden', 'true');
        lit.textContent = word;
        lit.style.opacity = '0';

        host.appendChild(lit);
        frag.appendChild(host);
        words.push({ el: lit, host: host, y: 0, last: -1 });
      });

      line.textContent = '';
      line.appendChild(frag);
    });

    if (!words.length) return;

    var vh = window.innerHeight;
    var span = 1;

    function measure() {
      vh = window.innerHeight || 1;
      span = vh * 0.34;
      var base = scrollState.y;
      for (var i = 0; i < words.length; i++) {
        var r = words[i].host.getBoundingClientRect();
        words[i].y = r.top + base + r.height * 0.5;
      }
    }

    /* Word boxes depend on wrapping, which depends on the webfont */
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(measure);
    }
    measure();

    var rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(measure, 200);
    });
    if (HAS_ST) ScrollTrigger.addEventListener('refresh', measure);

    addTask(function () {
      var mid = scrollState.y + vh * 0.5;
      for (var i = 0; i < words.length; i++) {
        var w = words[i];
        var d = Math.abs(w.y - mid) / span;
        /* 1 at the centre, 0 once the word is a third of a screen away */
        var a = 1 - smoothstep(clamp01((d - 0.12) / 0.88));
        if (Math.abs(a - w.last) < 0.008) continue;
        w.last = a;
        w.el.style.opacity = a.toFixed(3);
      }
    });
  }

  /* ───────────────────────────────────────────────
     15 · WEBGL CORE  (raw GL — no library)
     A single fullscreen triangle per canvas. Everything
     interesting lives in the fragment shader.
     ─────────────────────────────────────────────── */
  var GL_BUDGET = 10;

  var VERT_SRC = [
    'attribute vec2 aPos;',
    'varying vec2 vUv;',
    'void main(){',
    '  vUv = aPos * 0.5 + 0.5;',
    '  gl_Position = vec4(aPos, 0.0, 1.0);',
    '}'
  ].join('\n');

  function glInit(canvas, fragSrc, maxDpr) {
    if (!USE_WEBGL || GL_BUDGET <= 0) return null;

    var attrs = {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      failIfMajorPerformanceCaveat: false,
      powerPreference: 'high-performance'
    };

    var gl = null;
    try {
      gl = canvas.getContext('webgl', attrs) ||
           canvas.getContext('experimental-webgl', attrs);
    } catch (e) { return null; }
    if (!gl) return null;

    function compile(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        gl.deleteShader(s);
        return null;
      }
      return s;
    }

    var vs = compile(gl.VERTEX_SHADER, VERT_SRC);
    var fs = compile(gl.FRAGMENT_SHADER, fragSrc);
    if (!vs || !fs) return null;

    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      gl.deleteProgram(prog);
      return null;
    }
    gl.useProgram(prog);

    /* One oversized triangle covers clip space with 3 vertices */
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    var aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);          /* single draw — write the colour verbatim */
    gl.clearColor(0, 0, 0, 0);

    var cache = {};
    function loc(name) {
      if (!(name in cache)) cache[name] = gl.getUniformLocation(prog, name);
      return cache[name];
    }

    var pw = 0, ph = 0, cw = 0, ch = 0;
    var alive = true;

    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      alive = false;
    }, false);

    function resize() {
      var r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      cw = r.width; ch = r.height;
      var ratio = dpr(maxDpr || 2);
      var w = Math.max(1, Math.round(r.width * ratio));
      var h = Math.max(1, Math.round(r.height * ratio));
      if (w !== pw || h !== ph) {
        pw = w; ph = h;
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, pw, ph);
      return true;
    }

    GL_BUDGET--;

    return {
      gl: gl,
      alive: function () { return alive && !gl.isContextLost(); },
      resize: resize,
      w: function () { return pw; },
      h: function () { return ph; },
      cssW: function () { return cw; },
      cssH: function () { return ch; },
      f1: function (n, v) { var l = loc(n); if (l) gl.uniform1f(l, v); },
      f2: function (n, a, b) { var l = loc(n); if (l) gl.uniform2f(l, a, b); },
      f3: function (n, a, b, c) { var l = loc(n); if (l) gl.uniform3f(l, a, b, c); },
      i1: function (n, v) { var l = loc(n); if (l) gl.uniform1i(l, v); },
      clear: function () { gl.clear(gl.COLOR_BUFFER_BIT); },
      draw: function () {
        gl.useProgram(prog);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    };
  }

/* ───────────────────────────────────────────────
     17 · SHARED NOISE (GLSL)
     ─────────────────────────────────────────────── */
  var GLSL_NOISE = [
    'float hash(vec2 p){',
    '  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);',
    '}',
    'float vnoise(vec2 p){',
    '  vec2 i = floor(p); vec2 f = fract(p);',
    '  vec2 u = f * f * (3.0 - 2.0 * f);',
    '  float a = hash(i);',
    '  float b = hash(i + vec2(1.0, 0.0));',
    '  float c = hash(i + vec2(0.0, 1.0));',
    '  float d = hash(i + vec2(1.0, 1.0));',
    '  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);',
    '}',
    'float fbm(vec2 p){',
    '  float v = 0.0; float a = 0.5;',
    '  for (int i = 0; i < 4; i++) {',
    '    v += a * vnoise(p);',
    '    p = p * 2.03 + vec2(11.7, 5.3);',
    '    a *= 0.5;',
    '  }',
    '  return v;',
    '}'
  ].join('\n');

  /* ───────────────────────────────────────────────
     18 · PHASE 6 · FOOTER VOLUMETRIC FOG
     ─────────────────────────────────────────────── */
  var FOG_FRAG = [
    'precision mediump float;',
    'varying vec2 vUv;',
    'uniform vec2  uRes;',
    'uniform float uTime;',
    'uniform float uAmt;',
    'uniform float uPulse;',
    GLSL_NOISE,
    'void main(){',
    '  vec2 uv = vUv;',
    '  float ar = uRes.x / max(uRes.y, 1.0);',
    '  vec2 p = vec2(uv.x * ar, uv.y);',
    '  float t = uTime * 0.055;',

    /* domain warp — makes the fog curl instead of merely sliding */
    '  vec2 q = vec2(fbm(p * 2.1 + vec2(0.0, -t * 3.0)),',
    '                fbm(p * 2.1 + vec2(5.2, 1.3) - vec2(0.0, t * 2.3)));',
    '  float f = fbm(p * 2.5 + q * 1.55 + vec2(0.0, -t * 1.9));',

    /* fog pools along the bottom edge */
    '  float pool = pow(1.0 - uv.y, 1.55);',
    '  float density = clamp(f * 1.45 - 0.30, 0.0, 1.0) * pool;',

    /* volumetric core rising from just below the fold */
    '  vec2 c = vec2(0.5 * ar, -0.08);',
    '  float dd = distance(p, c);',
    '  float core = exp(-dd * dd * (2.5 - uPulse * 0.28));',

    '  vec3 hot  = vec3(1.000, 0.455, 0.115);',
    '  vec3 deep = vec3(0.042, 0.102, 0.290);',
    '  vec3 col = mix(deep, hot, clamp(core * 1.25 + density * 0.5, 0.0, 1.0));',
    '  col += hot * core * (0.80 + uPulse * 0.22);',
    '  col += vec3(1.0, 0.74, 0.52) * pow(core, 3.0) * 0.52;',
    '  col += deep * density * 0.85;',

    '  float alpha = clamp(density * 0.82 + core * 0.92, 0.0, 1.0) * uAmt;',
    /* dither, because smooth fog on 8-bit output bands badly */
    '  float dith = (hash(uv * uRes) - 0.5) * 0.022;',
    '  gl_FragColor = vec4(col + dith, alpha);',
    '}'
  ].join('\n');

  function initFog() {
    var canvas = document.getElementById('fogCanvas');
    var footer = document.getElementById('contact');
    if (!canvas || !footer) return;
    if (getComputedStyle(canvas).display === 'none') return;
    if (!USE_WEBGL) return;                 /* .footer__bloom carries it alone */

    /* Fog is soft by nature — render well under 1:1 and let the GPU upscale. */
    var ctx = glInit(canvas, FOG_FRAG, 0.7);
    if (!ctx) return;
    if (!ctx.resize()) {
      /* footer not laid out yet; try again after fonts settle */
      setTimeout(function () { ctx.resize(); }, 400);
    }

    var visible = false, time = 0, amt = 0, amtTarget = 0;

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) {
        visible = en[0].isIntersecting;
        if (visible) canvas.classList.add('is-live');
      }, { rootMargin: '25% 0px' }).observe(footer);
    } else {
      visible = true;
      canvas.classList.add('is-live');
    }

    if (HAS_ST) {
      ScrollTrigger.create({
        trigger: footer,
        start: 'top bottom',
        end: 'bottom bottom',
        onUpdate: function (self) { amtTarget = 0.25 + self.progress * 0.75; }
      });
    } else {
      amtTarget = 1;
    }

    var rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () { ctx.resize(); }, 220);
    });

    addTask(function (t, dt) {
      if (!visible || !ctx.alive()) return;
      if (!ctx.w()) { if (!ctx.resize()) return; }
      time += dt;
      amt += (amtTarget - amt) * clamp01(dt / 400);
      var pulse = 0.5 + 0.5 * Math.sin(time / 1000 * 1.35);
      ctx.f2('uRes', ctx.w(), ctx.h());
      ctx.f1('uTime', time / 1000);
      ctx.f1('uAmt', amt);
      ctx.f1('uPulse', pulse);
      ctx.draw();
    });
  }

  /* ───────────────────────────────────────────────
     19 · AMBIENT FLUID FIELD
     The faint moving light that makes the whole page
     feel suspended in fluid.
     ─────────────────────────────────────────────── */
  var FIELD_FRAG = [
    'precision mediump float;',
    'varying vec2 vUv;',
    'uniform vec2  uRes;',
    'uniform vec2  uPointer;',
    'uniform float uTime;',
    'uniform float uEnergy;',
    GLSL_NOISE,
    'void main(){',
    '  float ar = uRes.x / max(uRes.y, 1.0);',
    '  vec2 p = vec2(vUv.x * ar, vUv.y);',
    '  float t = uTime * 0.035;',
    '  float n = fbm(p * 1.45 + vec2(t, -t * 0.7));',

    '  vec2 a = vec2(0.24 * ar + sin(t * 1.7) * 0.13, 0.79 + cos(t * 1.25) * 0.09);',
    '  vec2 b = vec2(0.79 * ar + cos(t * 1.05) * 0.15, 0.21 + sin(t * 1.85) * 0.10);',
    '  float da = distance(p, a); float ga = exp(-da * da * 3.1);',
    '  float db = distance(p, b); float gb = exp(-db * db * 3.7);',

    '  vec2 m = vec2(uPointer.x * ar, uPointer.y);',
    '  float dm = distance(p, m); float gm = exp(-dm * dm * 8.5);',

    '  vec3 col = vec3(0.0);',
    '  col += vec3(1.00, 0.42, 0.10) * ga * (0.30 + n * 0.52);',
    '  col += vec3(0.07, 0.16, 0.44) * gb * (0.55 + n * 0.60);',
    '  col += vec3(1.00, 0.56, 0.24) * gm * (0.14 + uEnergy * 0.32);',

    '  float alpha = max(max(ga, gb), gm) * (0.40 + n * 0.42) + uEnergy * 0.045;',
    '  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0) * 0.82);',
    '}'
  ].join('\n');

  function initFluidField() {
    var canvas = document.getElementById('fluidField');
    if (!canvas) return;
    if (getComputedStyle(canvas).display === 'none') return;
    if (!USE_WEBGL || REDUCED) return;

    var ctx = glInit(canvas, FIELD_FRAG, 0.6);
    if (!ctx) return;
    ctx.resize();

    var time = 0, energy = 0;
    var px = 0.5, py = 0.4, tpx = 0.5, tpy = 0.4;

    window.addEventListener('pointermove', function (e) {
      tpx = clamp01(e.clientX / (window.innerWidth || 1));
      tpy = clamp01(e.clientY / (window.innerHeight || 1));
    }, { passive: true });

    var rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () { ctx.resize(); }, 220);
    });

    canvas.classList.add('is-live');

    addTask(function (t, dt) {
      if (!ctx.alive()) return;
      if (!ctx.w()) { if (!ctx.resize()) return; }
      time += dt;
      var e = clamp01(dt / 260);
      px += (tpx - px) * e;
      py += (tpy - py) * e;
      var target = clamp01(Math.abs(scrollState.vel) / 55);
      energy += (target - energy) * clamp01(dt / 300);
      ctx.f2('uRes', ctx.w(), ctx.h());
      ctx.f2('uPointer', px, 1 - py);   /* GL y is bottom-up */
      ctx.f1('uTime', time / 1000);
      ctx.f1('uEnergy', energy);
      ctx.draw();
    });
  }

  function initProcess() {
    var section = document.getElementById('process');
    if (!section) return;

    function activate() {
      section.classList.add('is-visible');
    }

    if (!ANIM) { activate(); return; }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries, obs) {
        if (entries[0].isIntersecting) {
          activate();
          obs.disconnect();
        }
      }, { threshold: 0.18 }).observe(section);
    } else {
      activate();
    }
  }

  function initExperiences() {
    var section = document.getElementById('experiences');
    if (!section) return;

    function activate() {
      section.classList.add('is-visible');
      var fills = $$('.skill__fill', section);
      var nums = $$('.skill__num', section);

      fills.forEach(function (fill) {
        var target = parseFloat(fill.getAttribute('data-target')) || 0;
        /* Compositor-only fill level — pairs with the scaleX() transition in
           CSS. (The old inline width change forced a full layout+paint on
           every frame of the 1.5s reveal.) */
        fill.style.transform = 'scaleX(' + (target / 100) + ')';
      });

      if (HAS_GSAP) {
        nums.forEach(function (num) {
          var endVal = parseInt(num.getAttribute('data-val') || '0', 10);
          gsap.to(num, {
            innerHTML: endVal,
            duration: 1.5,
            ease: 'power3.out',
            snap: { innerHTML: 1 }
          });
        });
      } else {
        nums.forEach(function (num) {
          num.innerHTML = num.getAttribute('data-val');
        });
      }
    }

    if (!ANIM) { activate(); return; }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries, obs) {
        if (entries[0].isIntersecting) {
          activate();
          obs.disconnect();
        }
      }, { threshold: 0.25 }).observe(section);
    } else {
      activate();
    }
  }

  /* ───────────────────────────────────────────────
     25 · SERVICES MODAL
     ─────────────────────────────────────────────── */
  function initServicesModal() {
    var modal    = document.getElementById('svcModal');
    var openBtn  = document.getElementById('svcModalOpen');
    var closeBtn = document.getElementById('svcModalClose');
    var ctaBtn   = document.getElementById('svcModalCta');
    if (!modal || !openBtn) return;

    var focusable = 'a[href],button:not([disabled]),input,textarea,[tabindex]:not([tabindex="-1"])';
    var lastFocus = null;
    var closing = false;

    function openModal() {
      if (!modal.hidden || closing) return;
      lastFocus = document.activeElement;
      modal.hidden = false;
      if (lenis) lenis.stop();
      else document.body.style.overflow = 'hidden';
      requestAnimationFrame(function () {
        modal.classList.add('is-open');
        var first = modal.querySelector(focusable);
        if (first) first.focus();
      });
    }

    function closeModal() {
      if (modal.hidden || closing) return;
      closing = true;
      modal.classList.remove('is-open');
      var finished = false;
      var fallbackTimer = setTimeout(finish, 450);

      function finish() {
        if (finished) return;
        finished = true;
        closing = false;
        modal.hidden = true;
        modal.removeEventListener('transitionend', onEnd);
        clearTimeout(fallbackTimer);
        if (lenis) lenis.start();
        else document.body.style.overflow = '';
        if (lastFocus) lastFocus.focus();
      }

      function onEnd(e) {
        if (e && e.propertyName !== 'opacity' && e.propertyName !== 'transform') return;
        finish();
      }

      modal.addEventListener('transitionend', onEnd);
    }

    openBtn.addEventListener('click', openModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    /* Close on backdrop click */
    modal.addEventListener('click', function (e) {
      if (e.target === modal || e.target.classList.contains('svc-modal__backdrop')) closeModal();
    });

    /* Close on Escape */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.hidden) closeModal();
    });

    /* Trap focus inside modal */
    modal.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var els = Array.prototype.slice.call(modal.querySelectorAll(focusable));
      if (!els.length) return;
      var first = els[0], last = els[els.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });

    /* CTA inside modal closes modal then scrolls to contact */
    if (ctaBtn) {
      ctaBtn.addEventListener('click', function () {
        closeModal();
      });
    }
  }

  /* ───────────────────────────────────────────────
     26 · SCROLL PROGRESS BAR
     Thin orange line at the very top of the viewport
     that fills as the user scrolls down the page.
     ─────────────────────────────────────────────── */
  function initScrollProgress() {
    if (REDUCED) return;
    var bar = document.createElement('div');
    bar.id = 'scrollProgress';
    bar.setAttribute('aria-hidden', 'true');
    bar.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'z-index:9999',
      'height:2px', 'width:0%',
      'background:linear-gradient(to right,var(--orange),var(--orange-hot))',
      'box-shadow:0 0 8px rgba(255,107,26,0.7)',
      'pointer-events:none',
      'transition:width 0.1s linear'
    ].join(';');
    document.body.appendChild(bar);

    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var scrollTop = window.scrollY;
        var docH = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.width = (docH > 0 ? (scrollTop / docH) * 100 : 0) + '%';
        ticking = false;
      });
    }, { passive: true });
  }

  /* ───────────────────────────────────────────────
     21 · RIPPLE CLICK EFFECT
     Ink-spread on buttons and key interactive elements.
     ─────────────────────────────────────────────── */
  function addRipple(el) {
    el.addEventListener('click', function (e) {
      var rect = el.getBoundingClientRect();
      var size = Math.max(rect.width, rect.height);
      var x = (e.clientX || rect.left + rect.width / 2) - rect.left - size / 2;
      var y = (e.clientY || rect.top + rect.height / 2) - rect.top - size / 2;

      var ripple = document.createElement('span');
      ripple.style.cssText = [
        'position:absolute', 'border-radius:50%', 'pointer-events:none',
        'background:rgba(255,255,255,0.18)',
        'width:' + size + 'px', 'height:' + size + 'px',
        'left:' + x + 'px', 'top:' + y + 'px',
        'transform:scale(0)', 'opacity:1',
        'animation:ciqRipple 0.62s var(--ease-out) forwards'
      ].join(';');

      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      el.style.overflow = 'hidden';
      el.appendChild(ripple);
      setTimeout(function () { if (ripple.parentNode) ripple.parentNode.removeChild(ripple); }, 660);
    });
  }

  function initRipples() {
    if (REDUCED) return;
    /* Inject the keyframe once */
    if (!document.getElementById('ciqRippleStyle')) {
      var s = document.createElement('style');
      s.id = 'ciqRippleStyle';
      s.textContent = '@keyframes ciqRipple{to{transform:scale(2.8);opacity:0}}';
      document.head.appendChild(s);
    }
    $$('.btn, .nav-toggle').forEach(addRipple);
  }

  /* ───────────────────────────────────────────────
     22 · BUTTON PRESS FEEDBACK
     Subtle scale-down on mousedown for tactile feel.
     ─────────────────────────────────────────────── */
  function initButtonFeedback() {
    $$('.btn--solid, .btn--ghost, .btn--pill').forEach(function (btn) {
      btn.addEventListener('mousedown', function () {
        if (!REDUCED) btn.style.transform = 'scale(0.96) translateY(-1px)';
      });
      btn.addEventListener('mouseup', function () { btn.style.transform = ''; });
      btn.addEventListener('mouseleave', function () { btn.style.transform = ''; });
    });
  }

  /* ───────────────────────────────────────────────
     23 · LOGO MARQUEE HOVER PAUSE
     Pauses the CSS infinite-scroll rows on hover so
     users can read/click individual brand logos.
     ─────────────────────────────────────────────── */
  function initMarqueeHoverPause() {
    $$('.logo-marquee__track').forEach(function (track) {
      track.addEventListener('mouseenter', function () {
        track.style.animationPlayState = 'paused';
      });
      track.addEventListener('mouseleave', function () {
        track.style.animationPlayState = 'running';
      });
    });
  }

  /* ───────────────────────────────────────────────
     24 · FOOTER CTA — REVEAL + HEARTBEAT
     ─────────────────────────────────────────────── */
  function initFooterCta() {
    var yearElement = document.getElementById('year');
    if (yearElement) yearElement.textContent = String(new Date().getFullYear());

    var cta = $('.footer__cta');
    if (!cta) return;

    var ctaTextLines = $$('.footer__cta-line > span', cta);
    if (!ctaTextLines.length) return;

    /* Always leave the CTA readable when the animation stack is unavailable. */
    if (!ANIM) {
      ctaTextLines.forEach(function (line) { line.style.transform = 'none'; });
      return;
    }

    /* Use a ScrollTrigger so the CTA only reveals when the footer is in view. */
    gsap.set(ctaTextLines, { yPercent: 110 });
    gsap.to(ctaTextLines, {
      yPercent: 0,
      duration: 1.35,
      ease: 'expo.out',
      stagger: 0.11,
      onComplete: startHeartbeat,
      scrollTrigger: HAS_ST ? {
        trigger: cta,
        start: 'top 92%',
        once: true
      } : null
    });

    function startHeartbeat() {
      if (REDUCED) return;
      gsap.to(cta, {
        scale: 1.018,
        duration: 1.15,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
        transformOrigin: '50% 50%'
      });
    }

    if (FINE_POINTER) {
      cta.addEventListener('pointermove', function (event) {
        var box = cta.getBoundingClientRect();
        if (!box.width || !box.height) return;

        var mouseX = (event.clientX - box.left) / box.width - 0.5;
        var mouseY = (event.clientY - box.top) / box.height - 0.5;

        gsap.to(cta, {
          x: mouseX * 26,
          y: mouseY * 14,
          duration: 0.7,
          ease: 'power3.out',
          overwrite: 'auto'
        });
      });

      cta.addEventListener('pointerleave', function () {
        gsap.to(cta, {
          x: 0,
          y: 0,
          duration: 1.1,
          ease: 'elastic.out(1, 0.5)',
          overwrite: 'auto'
        });
      });
    }
  }

  /* Reels duplicate ~54 <video> tags for their looped collage. Pausing the
     ones that are comfortably off-screen (and pausing ALL of them for
     reduced-motion users) keeps mobile and tablet scrolling smooth and
     saves battery — without ever removing or degrading any video.
     Implemented as a cheap distance check inside the site's single rAF
     loop (acts only on on/off transitions) so it cannot fail silently,
     unlike an IntersectionObserver that might not fire on every device. */
  function initReelVideoPause() {
    var reels = ['.hero__reel', '.footer__reel']
      .map(function (sel) { return $(sel); })
      .filter(function (el) { return !!el; });
    if (!reels.length) return;

    function playReel(reel) {
      $$('video', reel).forEach(function (vid, i) {
        try {
          if (vid.paused) {
            vid.muted = true;
            /* Stagger the starts: every column of the footer collage crosses
               the visibility threshold in the SAME frame, so ~30 play() calls
               used to land at once — a video-decode burst heavy enough to
               freeze the compositor for about a second while scrolling past
               the process section. */
            window.setTimeout(function () {
              if (reel.__near === false) return;   /* scrolled away before our slot */
              var p = vid.play();
              if (p && p.catch) p.catch(function () {});
            }, i * 40);
          }
        } catch (e) { /* autoplay policies must never take the page down */ }
      });
    }

    function pauseReel(reel) {
      $$('video', reel).forEach(function (vid) {
        try { if (!vid.paused) vid.pause(); } catch (e) {}
      });
    }

    if (REDUCED) {
      reels.forEach(pauseReel);
      return;
    }

        /* Throttle: a single shared task checks ALL reels at most every
       250 ms instead of running two getBoundingClientRect() calls on
       every frame — that was one of the biggest sources of layout
       thrash during scroll with 48 <video> elements on the page. */
    var lastReelCheck = 0;
    addTask(function (t) {
      if (t - lastReelCheck < 250) return;
      lastReelCheck = t;

      var vh = window.innerHeight || 800;
      for (var i = 0; i < reels.length; i++) {
        var reel = reels[i];
        var r;
        try { r = reel.getBoundingClientRect(); } catch (e) { continue; }
        if (r.height < 2) {          /* display:none — nothing worth decoding */
          if (reel.__near !== false) { reel.__near = false; pauseReel(reel); }
          continue;
        }
        var near = r.top < vh + 400 && r.bottom > -400;
        if (near === reel.__near) continue;      /* transition only — no churn */
        reel.__near = near;
        if (near) playReel(reel); else pauseReel(reel);
      }
    });
    function unlockVideos() {
      for (var i = 0; i < reels.length; i++) {
        if (reels[i].__near) playReel(reels[i]);
      }
      window.removeEventListener('touchstart', unlockVideos);
      window.removeEventListener('scroll', unlockVideos);
    }
    window.addEventListener('touchstart', unlockVideos, { passive: true, once: true });
    window.addEventListener('scroll', unlockVideos, { passive: true, once: true });
  }

  /* ───────────────────────────────────────────────
     21 · BOOT
     Structure first (so ScrollTrigger measures a settled
     page), then the entrance choreography once the
     preloader hands over.
     ─────────────────────────────────────────────── */
  function boot() {
    initServicesModal();
    initProcess();
    initExperiences();
    initCursor();
    initReveals();
    initMarquees();
    initStrategies();
    initKinetic();
    initFog();
    initFluidField();
    initScrollProgress();
    initRipples();
    initButtonFeedback();
    initMarqueeHoverPause();
    initReelVideoPause();
    initFooterCta();

    if (HAS_ST) {
      /* Late-loading webfonts and lazy images both change layout height */
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
      }
      window.addEventListener('load', function () {
        ScrollTrigger.refresh();
      });
      setTimeout(function () { ScrollTrigger.refresh(); }, 1200);
    }
  }

  function main() {
    boot();
    initPreloader(function () {
      heroIntro();
      startCounters();
      if (HAS_ST) ScrollTrigger.refresh();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main, { once: true });
  } else {
    main();
  }

})();
