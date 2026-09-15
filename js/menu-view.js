/* =========================================================
   TANDOOR ET GRILLE — Menu page (elegant, read-only)
   Renders the full menu from menu-data.js. Order happens on
   order.html (the cart). Bilingual EN/FR.
   ========================================================= */
(function () {
  'use strict';
  var M = window.TG_MENU;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var lang = localStorage.getItem('tg-lang') || 'en';
  var L = function (o, key) { return (lang === 'fr' && o[key + 'Fr']) ? o[key + 'Fr'] : (o[key] || o[key + 'En'] || ''); };
  var money = function (n) { return '$' + Number(n).toFixed(2); };

  function marker(it) {
    var m = '';
    if (it.veg) m += '<span class="m-veg" title="Vegetarian">◦</span>';
    if (it.spice) m += '<span class="m-spice" title="Spicy">✦</span>';
    return m ? ' <span class="m-badges">' + m + '</span>' : '';
  }

  function priceStr(sec, it) {
    if (sec.shared) {
      var min = Math.min.apply(null, M.PROTEINS.map(function (p) { return p.price; }));
      return (lang === 'fr' ? 'dès ' : 'from ') + money(min);
    }
    return it.price != null ? money(it.price) : (lang === 'fr' ? 'Selon dispo.' : 'Ask');
  }

  function render() {
    var nav = $('#menuCats'), root = $('#menuRoot');
    nav.innerHTML = ''; root.innerHTML = '';

    M.sections.forEach(function (sec) {
      var a = document.createElement('a');
      a.href = '#m-' + sec.id; a.className = 'mcat'; a.textContent = L(sec, 'en');
      a.addEventListener('click', function (e) {
        e.preventDefault();
        window.__scrollTo ? window.__scrollTo('#m-' + sec.id)
          : document.getElementById('m-' + sec.id).scrollIntoView({ behavior: 'smooth' });
      });
      nav.appendChild(a);

      var rows = sec.items.map(function (it) {
        var desc = L(it, 'desc');
        return '<div class="mrow">' +
          '<div class="mrow__l"><h3>' + L(it, 'en') + marker(it) + '</h3>' +
          (desc ? '<p>' + desc + '</p>' : '') + '</div>' +
          '<div class="mrow__p">' + priceStr(sec, it) + '</div>' +
          '</div>';
      }).join('');

      var sub = sec.shared
        ? '<p class="msec__note" data-en="Choose your protein — Chicken / Beef ' + money(15.99) + ', Lamb ' + money(17.99) + ', King Prawn ' + money(20.99) + '. Any spice level." data-fr="Choisissez la viande — Poulet / Bœuf ' + money(15.99) + ', Agneau ' + money(17.99) + ', Crevettes ' + money(20.99) + '. Niveau d\'épices au choix.">Choose your protein — Chicken / Beef ' + money(15.99) + ', Lamb ' + money(17.99) + ', King Prawn ' + money(20.99) + '. Any spice level.</p>'
        : (sec.note ? '<p class="msec__note" data-en="' + sec.note + '" data-fr="' + (sec.noteFr || sec.note) + '">' + L(sec, 'note') + '</p>' : '');

      var el = document.createElement('section');
      el.className = 'msec'; el.id = 'm-' + sec.id;
      el.innerHTML = '<div class="msec__head"><span class="msec__idx">' +
        '</span><h2>' + L(sec, 'en') + '</h2></div>' + sub +
        '<div class="msec__items">' + rows + '</div>';
      root.appendChild(el);
    });
  }

  function reRender() { lang = localStorage.getItem('tg-lang') || 'en'; render(); }
  document.querySelectorAll('.nav__lang, [data-lang-toggle]').forEach(function (b) {
    b.addEventListener('click', function () { setTimeout(reRender, 0); });
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
