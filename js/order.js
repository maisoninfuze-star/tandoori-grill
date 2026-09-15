/* =========================================================
   TANDOOR ET GRILLE — online pickup ordering
   Client-side cart (no backend). Order is sent to the
   restaurant via WhatsApp (primary) or email (fallback).
   ========================================================= */
(function () {
  'use strict';

  // ---- Online ordering is temporarily OFF while the menu/site is finalized. ----
  // The full priced menu still browses normally; "Add"/checkout is hidden and
  // a "coming soon, call us" banner shows instead. Flip this back to `true`
  // (nothing else needs to change) to re-enable checkout.
  var ORDERING_ENABLED = false;

  // ---- Restaurant config (edit these if numbers change) ----
  var TG = {
    name: 'Tandoor et Grille',
    phoneTel: '5146834878',
    taxRate: 0.14975,            // QC: GST 5% + QST 9.975%
    currency: '$',
  };

  var M = window.TG_MENU;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var lang = localStorage.getItem('tg-lang') || 'en';
  var cart = [];
  try { cart = JSON.parse(localStorage.getItem('tg-cart') || '[]'); } catch (e) { cart = []; }

  var L = function (o, key) { return (lang === 'fr' && o[key + 'Fr']) ? o[key + 'Fr'] : (o[key] || o[key + 'En'] || ''); };
  var money = function (n) { return TG.currency + n.toFixed(2); };

  // Flat lookup of every orderable line (id -> {item, section, protein?})
  var INDEX = {};
  M.sections.forEach(function (sec) {
    sec.items.forEach(function (it) {
      if (sec.shared) {
        M.PROTEINS.forEach(function (p) {
          INDEX[it.id + '::' + p.id] = { it: it, sec: sec, protein: p };
        });
      } else {
        INDEX[it.id] = { it: it, sec: sec, protein: null };
      }
    });
  });

  /* ---------------- i18n ---------------- */
  function applyLang() {
    document.documentElement.setAttribute('data-lang', lang);
    document.documentElement.lang = lang;
    $$('[data-en]').forEach(function (el) {
      var v = el.getAttribute('data-' + lang);
      if (v != null) el.textContent = v;
    });
    var lt = $('#langToggle');
    if (lt) lt.classList.toggle('lang--fr', lang === 'fr');
    var taxLabel = $('#taxLabel');
    if (taxLabel) taxLabel.textContent = (lang === 'fr' ? 'Taxes (14,975 %)' : 'Tax (14.975%)');
  }

  /* ---------------- render category nav ---------------- */
  function renderCats() {
    var nav = $('#ocats');
    nav.innerHTML = '';
    M.sections.forEach(function (sec) {
      var a = document.createElement('a');
      a.href = '#sec-' + sec.id;
      a.className = 'ocat';
      a.dataset.target = 'sec-' + sec.id;
      a.textContent = L(sec, 'en');
      a.setAttribute('data-en', sec.en);
      a.setAttribute('data-fr', sec.fr);
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var t = document.getElementById('sec-' + sec.id);
        if (t) window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - 118, behavior: 'smooth' });
      });
      nav.appendChild(a);
    });
  }

  /* ---------------- render menu ---------------- */
  function badge(it) {
    var b = '';
    if (it.veg) b += '<i class="lg lg--veg" title="Vegetarian"></i>';
    if (it.spice) b += '<i class="lg lg--spice" title="Spicy"></i>';
    return b ? '<span class="dish-badges">' + b + '</span>' : '';
  }

  function renderMenu() {
    var wrap = $('#menuSections');
    wrap.innerHTML = '';
    M.sections.forEach(function (sec) {
      var s = document.createElement('section');
      s.className = 'osec';
      s.id = 'sec-' + sec.id;

      var head = '<div class="osec__head"><h2 data-en="' + sec.en + '" data-fr="' + sec.fr + '">' + L(sec, 'en') + '</h2>';
      if (sec.note) {
        head += '<p class="osec__note" data-en="' + sec.note + '" data-fr="' + (sec.noteFr || sec.note) + '">' + (lang === 'fr' && sec.noteFr ? sec.noteFr : sec.note) + '</p>';
      }
      head += '</div>';

      var rows = sec.items.map(function (it) {
        var priceHtml, controls;
        if (sec.shared) {
          if (ORDERING_ENABLED) {
            // protein selector drives the price
            var opts = M.PROTEINS.map(function (p) {
              return '<option value="' + p.id + '" data-price="' + p.price + '">' + L(p, 'en') + ' · ' + money(p.price) + '</option>';
            }).join('');
            priceHtml = '<select class="dish-protein" aria-label="Protein">' + opts + '</select>';
            controls = '<button class="dish-add" data-id="' + it.id + '" data-shared="1">' +
              '<span data-en="Add" data-fr="Ajouter">Add</span></button>';
          } else {
            // browsable only: list each protein price as plain text, no picker
            priceHtml = '<span class="dish-price dish-price--list">' + M.PROTEINS.map(function (p) {
              return L(p, 'en') + ' ' + money(p.price);
            }).join(' · ') + '</span>';
            controls = '';
          }
        } else {
          priceHtml = '<span class="dish-price">' + (it.price != null ? money(it.price) : (lang === 'fr' ? 'Selon dispo.' : 'Ask')) + '</span>';
          controls = (ORDERING_ENABLED && it.price != null)
            ? '<button class="dish-add" data-id="' + it.id + '"><span data-en="Add" data-fr="Ajouter">Add</span></button>'
            : '';
        }
        var desc = L(it, 'desc');
        return '<article class="dish-row' + (it.big ? ' dish-row--big' : '') + '">' +
          '<div class="dish-row__main">' +
          '<h3>' + L(it, 'en') + ' ' + badge(it) + '</h3>' +
          (desc ? '<p>' + desc + '</p>' : '') +
          '</div>' +
          '<div class="dish-row__buy">' + priceHtml + controls + '</div>' +
          '</article>';
      }).join('');

      s.innerHTML = head + '<div class="osec__items">' + rows + '</div>';
      wrap.appendChild(s);
    });

    // wire add buttons (none are rendered while ordering is disabled)
    if (ORDERING_ENABLED) {
      $$('.dish-add').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = btn.dataset.id;
          if (btn.dataset.shared) {
            var sel = btn.parentNode.querySelector('.dish-protein');
            add(id + '::' + sel.value);
          } else {
            add(id);
          }
        });
      });
    }
  }

  /* ---------------- "ordering coming soon" banner ---------------- */
  function renderOrderingBanner() {
    if (ORDERING_ENABLED) return;
    var intro = $('.omenu__intro');
    if (!intro || $('#orderingBanner')) return;
    var b = document.createElement('div');
    b.id = 'orderingBanner';
    b.className = 'ordering-banner';
    b.innerHTML =
      '<div class="ordering-banner__text">' +
      '<strong data-en="Online ordering is coming soon." data-fr="La commande en ligne arrive bientôt.">Online ordering is coming soon.</strong>' +
      '<span data-en="Browse the full menu below. To order pickup right now, just give us a call." data-fr="Parcourez le menu complet ci-dessous. Pour commander à emporter tout de suite, appelez-nous.">Browse the full menu below. To order pickup right now, just give us a call.</span>' +
      '</div>' +
      '<a class="btn btn--big" href="tel:' + TG.phoneTel + '" data-en="Call (514) 683-4878" data-fr="Appeler (514) 683-4878">Call (514) 683-4878</a>';
    intro.appendChild(b);
  }

  /* ---------------- cart ---------------- */
  function keyMeta(key) { return INDEX[key]; }
  function unitPrice(key) {
    var m = INDEX[key];
    if (!m) return 0;
    return m.protein ? m.protein.price : (m.it.price || 0);
  }
  function lineName(key) {
    var m = INDEX[key];
    if (!m) return key;
    return L(m.it, 'en') + (m.protein ? ' · ' + L(m.protein, 'en') : '');
  }

  function add(key) {
    if (!INDEX[key]) return;
    var line = cart.find(function (l) { return l.key === key; });
    if (line) line.qty++;
    else cart.push({ key: key, qty: 1 });
    save(); renderCart(); pulseCount();
    toast((lang === 'fr' ? 'Ajouté : ' : 'Added: ') + lineName(key));
  }
  function setQty(key, qty) {
    var line = cart.find(function (l) { return l.key === key; });
    if (!line) return;
    line.qty = qty;
    if (line.qty <= 0) cart = cart.filter(function (l) { return l.key !== key; });
    save(); renderCart();
  }
  function save() { localStorage.setItem('tg-cart', JSON.stringify(cart)); }

  function totals() {
    var sub = cart.reduce(function (a, l) { return a + unitPrice(l.key) * l.qty; }, 0);
    var tax = sub * TG.taxRate;
    return { sub: sub, tax: tax, total: sub + tax };
  }

  function renderCart() {
    var count = cart.reduce(function (a, l) { return a + l.qty; }, 0);
    $('#cartCount').textContent = count;
    $('#cartCount').classList.toggle('is-zero', count === 0);

    var items = $('#cartItems');
    var empty = $('#cartEmpty');
    var foot = $('#cartFoot');
    if (!cart.length) {
      items.innerHTML = '';
      empty.hidden = false; foot.hidden = true;
      return;
    }
    empty.hidden = true; foot.hidden = false;
    items.innerHTML = cart.map(function (l) {
      var lineTotal = unitPrice(l.key) * l.qty;
      return '<div class="citem">' +
        '<div class="citem__info"><b>' + lineName(l.key) + '</b><span>' + money(unitPrice(l.key)) + '</span></div>' +
        '<div class="citem__qty">' +
        '<button class="qbtn" data-k="' + l.key + '" data-d="-1">−</button>' +
        '<span>' + l.qty + '</span>' +
        '<button class="qbtn" data-k="' + l.key + '" data-d="1">+</button>' +
        '</div>' +
        '<div class="citem__lt">' + money(lineTotal) + '</div>' +
        '</div>';
    }).join('');
    $$('.qbtn', items).forEach(function (b) {
      b.addEventListener('click', function () {
        var line = cart.find(function (l) { return l.key === b.dataset.k; });
        setQty(b.dataset.k, (line ? line.qty : 0) + parseInt(b.dataset.d, 10));
      });
    });

    var t = totals();
    $('#tSub').textContent = money(t.sub);
    $('#tTax').textContent = money(t.tax);
    $('#tTotal').textContent = money(t.total);
  }

  /* ---------------- submit order to the kitchen ---------------- */
  function validate() {
    if (!cart.length) return false;
    var name = $('#fName').value.trim();
    var phone = $('#fPhone').value.trim();
    if (!name || !phone) {
      toast(lang === 'fr' ? 'Ajoutez votre nom et téléphone.' : 'Please add your name and phone.');
      (!name ? $('#fName') : $('#fPhone')).focus();
      return false;
    }
    return true;
  }

  function orderPayload() {
    var t = totals();
    return {
      items: cart.map(function (l) {
        return { name: lineName(l.key), qty: l.qty, price: unitPrice(l.key) };
      }),
      subtotal: +t.sub.toFixed(2),
      tax: +t.tax.toFixed(2),
      total: +t.total.toFixed(2),
      lang: lang,
      customer: {
        name: $('#fName').value.trim(),
        phone: $('#fPhone').value.trim(),
        pickupTime: ($('#fTime').value || 'ASAP').trim(),
        notes: $('#fNotes').value.trim(),
      },
    };
  }

  var submitting = false;
  function placeOrder() {
    if (submitting) return;
    if (!cart.length) return;
    // Require a signed-in account before checkout (collects the customer's email).
    if (!window.TGAuth || !window.TGAuth.isLoggedIn()) {
      window.TGAuth.open(function () { prefillFromAccount(); placeOrder(); });
      return;
    }
    if (!validate()) return;
    submitting = true;
    var btn = $('#placeOrder');
    btn.disabled = true;
    var original = btn.textContent;
    btn.textContent = (lang === 'fr' ? 'Envoi…' : 'Sending…');

    fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + window.TGAuth.token() },
      body: JSON.stringify(orderPayload()),
    })
      .then(function (r) {
        if (r.status === 401) { window.TGAuth.logout(); throw new Error('auth'); }
        if (!r.ok) throw new Error('bad'); return r.json();
      })
      .then(function (data) {
        // success — clear cart, show confirmation
        cart = []; save(); renderCart();
        $('#doneNum').textContent = data.order.number;
        $('#cartFoot').hidden = true;
        $('#cartItems').innerHTML = '';
        $('#cartEmpty').hidden = true;
        $('#cartDone').hidden = false;
      })
      .catch(function (err) {
        if (err && err.message === 'auth') {
          toast(lang === 'fr' ? 'Session expirée — reconnectez-vous.' : 'Session expired — please sign in again.');
          window.TGAuth.open(function () { prefillFromAccount(); placeOrder(); });
        } else {
          toast(lang === 'fr' ? 'Échec de l\'envoi. Réessayez ou appelez-nous.' : 'Could not send. Try again or call us.');
        }
      })
      .then(function () {
        submitting = false; btn.disabled = false; btn.textContent = original;
      });
  }

  // Prefill the pickup form from the signed-in account.
  function prefillFromAccount() {
    var c = window.TGAuth && window.TGAuth.customer();
    if (!c) return;
    if (!$('#fName').value) $('#fName').value = c.name || '';
    if (!$('#fPhone').value) $('#fPhone').value = c.phone || '';
    renderAccountBar();
  }
  function renderAccountBar() {
    var bar = $('#acctBar'); if (!bar) return;
    var c = window.TGAuth && window.TGAuth.customer();
    if (c) {
      bar.hidden = false;
      bar.innerHTML = '<span>' + (lang === 'fr' ? 'Connecté · ' : 'Signed in · ') + c.email + '</span>' +
        '<button id="acctOut" type="button">' + (lang === 'fr' ? 'Déconnexion' : 'Sign out') + '</button>';
      $('#acctOut').addEventListener('click', function () { window.TGAuth.logout(); });
    } else { bar.hidden = true; bar.innerHTML = ''; }
  }
  document.addEventListener('tg-auth-change', function () { prefillFromAccount(); renderAccountBar(); });

  function newOrder() {
    $('#cartDone').hidden = true;
    $('#cartEmpty').hidden = false;
    closeCart();
  }

  /* ---------------- drawer + misc ---------------- */
  // Scroll lock derived from ACTUAL overlay state so it can never get stuck
  // (cart drawer + auth modal both use it via window.__tgSyncScroll).
  function syncScroll() {
    var cart = $('#cart'), am = $('#authModal');
    var open = (cart && cart.getAttribute('aria-hidden') === 'false') ||
               (am && am.getAttribute('aria-hidden') === 'false');
    document.body.style.overflow = open ? 'hidden' : '';
  }
  window.__tgSyncScroll = syncScroll;
  function openCart() { $('#cart').setAttribute('aria-hidden', 'false'); $('#cartScrim').hidden = false; syncScroll(); }
  function closeCart() { $('#cart').setAttribute('aria-hidden', 'true'); $('#cartScrim').hidden = true; syncScroll(); }
  function pulseCount() { var c = $('#cartCount'); c.classList.remove('pulse'); void c.offsetWidth; c.classList.add('pulse'); }
  var toastTimer;
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg; el.hidden = false; el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); setTimeout(function () { el.hidden = true; }, 250); }, 1800);
  }

  // scroll-spy for category nav
  function spy() {
    var y = window.scrollY + 140;
    var active = null;
    M.sections.forEach(function (sec) {
      var el = document.getElementById('sec-' + sec.id);
      if (el && el.offsetTop <= y) active = sec.id;
    });
    $$('.ocat').forEach(function (a) {
      var on = a.dataset.target === 'sec-' + active;
      a.classList.toggle('is-active', on);
      if (on) a.scrollIntoView({ block: 'nearest', inline: 'center' });
    });
  }

  /* ---------------- init ---------------- */
  function init() {
    // styles.css has a splash rule `body:not(.loaded){overflow:hidden;height:100vh}`
    // meant for the old home splash. This page has no splash, so mark it loaded
    // (otherwise the whole page is scroll-locked). Also clear any leaked inline lock.
    document.body.classList.add('loaded');
    document.body.style.overflow = '';
    renderCats();
    renderMenu();
    renderOrderingBanner();
    applyLang();

    if (ORDERING_ENABLED) {
      renderCart();
      prefillFromAccount();
      renderAccountBar();
      $('#cartBtn').addEventListener('click', openCart);
      $('#cartClose').addEventListener('click', closeCart);
      $('#cartScrim').addEventListener('click', closeCart);
      $('#placeOrder').addEventListener('click', placeOrder);
      $('#doneClose').addEventListener('click', newOrder);
    } else {
      // No cart while ordering is off — hide the (empty, non-functional) cart UI.
      var cartBtn = $('#cartBtn'); if (cartBtn) cartBtn.hidden = true;
      var cartAside = $('#cart'); if (cartAside) cartAside.hidden = true;
      var cartScrim = $('#cartScrim'); if (cartScrim) cartScrim.hidden = true;
      var authModal = $('#authModal'); if (authModal) authModal.hidden = true;
      var authScrim = $('#authScrim'); if (authScrim) authScrim.hidden = true;
    }

    $('#langToggle').addEventListener('click', function () {
      lang = (lang === 'en' ? 'fr' : 'en');
      localStorage.setItem('tg-lang', lang);
      renderCats(); renderMenu(); applyLang();
      if (ORDERING_ENABLED) renderCart();
    });
    window.addEventListener('scroll', spy, { passive: true });
    spy();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
