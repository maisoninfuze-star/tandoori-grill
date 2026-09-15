/* =========================================================
   TANDOOR ET GRILLE — shared site behaviour
   Smooth scroll, nav states, mobile menu, scroll reveals,
   EN/FR language toggle. Vanilla, no deps beyond Lenis (CDN).
   ========================================================= */
(function () {
  'use strict';
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Signals JS is active → CSS hides .reveal only now (content stays visible if JS fails).
  document.documentElement.classList.add('js');

  /* ---- smooth scroll (Lenis if present) ---- */
  var lenis = null;
  if (window.Lenis && !reduced) {
    lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1, smoothWheel: true });
    function raf(t) { lenis.raf(t); requestAnimationFrame(raf); }
    requestAnimationFrame(raf);
  }
  window.__scrollTo = function (sel) {
    var el = document.querySelector(sel); if (!el) return;
    if (lenis) lenis.scrollTo(el, { offset: -70, duration: 1.3 });
    else el.scrollIntoView({ behavior: 'smooth' });
  };

  /* ---- nav: solid on scroll + light-over-hero ---- */
  var nav = document.querySelector('.nav');
  var hero = document.querySelector('[data-hero-dark]');
  function onScroll() {
    var y = window.scrollY;
    if (nav) nav.classList.toggle('is-solid', y > 40);
    if (nav && hero) {
      var h = hero.offsetHeight - 90;
      nav.classList.toggle('is-light', y < h && !nav.classList.contains('is-solid'));
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---- mobile menu ---- */
  var mnav = document.querySelector('.mnav');
  var burger = document.querySelector('.nav__burger');
  var mclose = document.querySelector('.mnav__close');
  function openM() { if (mnav) { mnav.classList.add('open'); document.body.style.overflow = 'hidden'; } }
  function closeM() { if (mnav) { mnav.classList.remove('open'); document.body.style.overflow = ''; } }
  if (burger) burger.addEventListener('click', openM);
  if (mclose) mclose.addEventListener('click', closeM);
  if (mnav) mnav.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', closeM); });

  /* ---- scroll reveals ---- */
  var revealEls = [].slice.call(document.querySelectorAll('.reveal, .img-reveal'));
  function show(el) { el.classList.add('in'); }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { show(e.target); io.unobserve(e.target); }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  revealEls.forEach(function (el) { io.observe(el); });
  // Reveal anything already in/above the first viewport immediately (hero, etc.)
  function revealInView() {
    var vh = window.innerHeight || 0;
    revealEls.forEach(function (el) {
      if (el.classList.contains('in')) return;
      var r = el.getBoundingClientRect();
      if (vh === 0 || r.top < vh * 0.94) show(el);
    });
  }
  requestAnimationFrame(revealInView);
  // Failsafe: never leave content permanently hidden if IO/layout misbehaves.
  setTimeout(function () { revealEls.forEach(show); }, 2600);

  /* ---- EN / FR language ---- */
  var lang = localStorage.getItem('tg-lang') || 'en';
  function applyLang() {
    document.documentElement.setAttribute('data-lang', lang);
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-en]').forEach(function (el) {
      var v = el.getAttribute('data-' + lang);
      if (v != null) {
        if (el.hasAttribute('data-html')) el.innerHTML = v; else el.textContent = v;
      }
    });
    document.querySelectorAll('.nav__lang').forEach(function (b) {
      b.classList.toggle('fr', lang === 'fr');
      var en = b.querySelector('.en'), fr = b.querySelector('.fr-t');
      if (en) en.classList.toggle('on', lang === 'en'), en.classList.toggle('off', lang !== 'en');
      if (fr) fr.classList.toggle('on', lang === 'fr'), fr.classList.toggle('off', lang !== 'fr');
    });
  }
  document.querySelectorAll('.nav__lang, [data-lang-toggle]').forEach(function (b) {
    b.addEventListener('click', function () {
      lang = (lang === 'en' ? 'fr' : 'en'); localStorage.setItem('tg-lang', lang); applyLang();
    });
  });
  applyLang();

  /* ---- video autoplay (Safari-safe) ----
     Safari often ignores the `autoplay` attribute on a <video> that uses a
     <source> child, and requires `muted` to be set on the element (not just
     the attribute) plus an explicit play() call. We also retry on the first
     user interaction to cover Low-Power Mode / strict autoplay policies. */
  (function initVideos() {
    var vids = [].slice.call(document.querySelectorAll('video'));
    if (!vids.length) return;
    function play(v) { try { var p = v.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {} }
    vids.forEach(function (v) {
      v.muted = true; v.defaultMuted = true; v.playsInline = true;
      v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
      if (v.readyState >= 2) play(v);
      v.addEventListener('loadeddata', function () { play(v); }, { once: true });
      v.addEventListener('canplay', function () { play(v); }, { once: true });
    });
    var kick = function () { vids.forEach(function (v) { if (v.paused) play(v); }); };
    ['touchstart', 'pointerdown', 'click', 'scroll', 'keydown'].forEach(function (ev) {
      window.addEventListener(ev, kick, { once: true, passive: true });
    });
    // Re-assert when returning to the tab (Safari pauses on background).
    document.addEventListener('visibilitychange', function () { if (!document.hidden) kick(); });
  })();

  /* ---- year ---- */
  var y = document.getElementById('year'); if (y) y.textContent = new Date().getFullYear();
})();
