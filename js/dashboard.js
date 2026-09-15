/* =========================================================
   TANDOOR ET GRILLE — kitchen dashboard
   Live order board (SSE) with accept/deny/status, ring alert
   and daily stats. Talks to server.mjs order API.
   ========================================================= */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var money = function (n) { return '$' + (Number(n) || 0).toFixed(2); };

  var key = localStorage.getItem('tg-owner') || '';
  var orders = {};        // id -> order
  var es = null;
  var soundOn = localStorage.getItem('tg-sound') !== 'off';
  var audioCtx = null;
  var ringTimer = null;

  /* ---------------- audio alert ---------------- */
  function primeAudio() {
    if (audioCtx) return;
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  }
  function chime() {
    if (!soundOn || !audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    var now = audioCtx.currentTime;
    [660, 880, 1180].forEach(function (f, i) {
      var o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      var t = now + i * 0.16;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.28, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t); o.stop(t + 0.42);
    });
  }
  function manageRing() {
    var pending = Object.keys(orders).some(function (id) { return orders[id].status === 'pending'; });
    if (pending && soundOn && !ringTimer) {
      ringTimer = setInterval(chime, 12000);
    } else if ((!pending || !soundOn) && ringTimer) {
      clearInterval(ringTimer); ringTimer = null;
    }
  }

  /* ---------------- rendering ---------------- */
  function timeAgo(ts) {
    var s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return s + 's';
    var m = Math.floor(s / 60);
    if (m < 60) return m + 'm';
    return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
  }
  function esc(str) { return String(str || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function cardHtml(o) {
    var items = o.items.map(function (it) {
      return '<li><span class="qi">' + it.qty + '×</span> ' + esc(it.name) + '<b>' + money(it.price * it.qty) + '</b></li>';
    }).join('');
    var actions = '';
    if (o.status === 'pending') {
      actions = '<button class="dbtn dbtn--danger" data-act="denied" data-id="' + o.id + '">Deny</button>' +
        '<button class="dbtn dbtn--primary" data-act="accepted" data-id="' + o.id + '">Accept</button>';
    } else if (o.status === 'accepted') {
      actions = '<button class="dbtn dbtn--ghost" data-act="denied" data-id="' + o.id + '">Cancel</button>' +
        '<button class="dbtn dbtn--primary" data-act="preparing" data-id="' + o.id + '">Start preparing</button>';
    } else if (o.status === 'preparing') {
      actions = '<button class="dbtn dbtn--go" data-act="ready" data-id="' + o.id + '">Mark ready</button>';
    } else if (o.status === 'ready') {
      actions = '<button class="dbtn dbtn--primary" data-act="completed" data-id="' + o.id + '">Picked up ✓</button>';
    }
    var notes = o.customer.notes ? '<p class="ocard__notes">“' + esc(o.customer.notes) + '”</p>' : '';
    return '<article class="ocard ocard--' + o.status + '" data-id="' + o.id + '">' +
      '<header class="ocard__top">' +
      '<span class="ocard__num">#' + esc(o.number) + '</span>' +
      '<span class="ocard__time" data-ts="' + o.createdAt + '">' + timeAgo(o.createdAt) + '</span>' +
      '</header>' +
      '<ul class="ocard__items">' + items + '</ul>' +
      notes +
      '<div class="ocard__cust">' +
      '<div class="ocard__who"><b>' + esc(o.customer.name) + '</b>' +
      '<a href="tel:' + esc(o.customer.phone) + '">' + esc(o.customer.phone) + '</a>' +
      (o.customer.email ? '<a class="ocard__email" href="mailto:' + esc(o.customer.email) + '">' + esc(o.customer.email) + '</a>' : '') +
      '</div>' +
      '<div class="ocard__meta"><span>' + esc(o.customer.pickupTime) + '</span><b>' + money(o.total) + '</b></div>' +
      '</div>' +
      '<footer class="ocard__actions">' + actions + '</footer>' +
      '</article>';
  }

  function render() {
    var cols = { new: [], preparing: [], ready: [] };
    Object.keys(orders).forEach(function (id) {
      var o = orders[id];
      if (o.status === 'pending') cols.new.push(o);
      else if (o.status === 'accepted' || o.status === 'preparing') cols.preparing.push(o);
      else if (o.status === 'ready') cols.ready.push(o);
    });
    ['new', 'preparing', 'ready'].forEach(function (c) {
      cols[c].sort(function (a, b) { return a.createdAt - b.createdAt; });
    });
    $('#listNew').innerHTML = cols.new.map(cardHtml).join('') || emptyCol('No new orders');
    $('#listPrep').innerHTML = cols.preparing.map(cardHtml).join('') || emptyCol('Nothing cooking');
    $('#listReady').innerHTML = cols.ready.map(cardHtml).join('') || emptyCol('Nothing waiting');
    $('#cNew').textContent = cols.new.length;
    $('#cPrep').textContent = cols.preparing.length;
    $('#cReady').textContent = cols.ready.length;
    wireActions();
    renderStats();
    manageRing();
  }
  function emptyCol(msg) { return '<div class="col__empty">' + msg + '</div>'; }

  function renderStats() {
    var startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    var t0 = startOfDay.getTime();
    var today = Object.keys(orders).map(function (id) { return orders[id]; })
      .filter(function (o) { return o.createdAt >= t0; });
    var active = today.filter(function (o) { return ['pending', 'accepted', 'preparing', 'ready'].indexOf(o.status) >= 0; });
    var revenue = today.filter(function (o) { return o.status !== 'denied'; })
      .reduce(function (a, o) { return a + (o.total || 0); }, 0);
    $('#stOrders').textContent = today.length;
    $('#stActive').textContent = active.length;
    $('#stRevenue').textContent = '$' + Math.round(revenue);
  }

  function wireActions() {
    Array.prototype.forEach.call(document.querySelectorAll('.ocard__actions .dbtn'), function (b) {
      b.addEventListener('click', function () { patch(b.dataset.id, b.dataset.act); });
    });
  }

  function patch(id, status) {
    fetch('/api/orders/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-owner-key': key },
      body: JSON.stringify({ status: status }),
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d.order) { orders[d.order.id] = d.order; render(); }
    });
  }

  /* ---------------- live stream ---------------- */
  function connect() {
    if (es) es.close();
    es = new EventSource('/api/orders/stream?key=' + encodeURIComponent(key));
    es.onopen = function () { $('#liveDot').classList.add('on'); };
    es.onerror = function () { $('#liveDot').classList.remove('on'); };
    es.onmessage = function (ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.type === 'snapshot') {
        orders = {}; msg.orders.forEach(function (o) { orders[o.id] = o; });
        render();
      } else if (msg.type === 'created') {
        orders[msg.order.id] = msg.order;
        render(); chime(); flashTitle();
      } else if (msg.type === 'updated') {
        orders[msg.order.id] = msg.order; render();
      }
    };
  }

  var titleTimer;
  function flashTitle() {
    var base = 'Kitchen Dashboard — Tandoor et Grille';
    var n = 0; clearInterval(titleTimer);
    titleTimer = setInterval(function () {
      document.title = (n % 2 ? '🔔 NEW ORDER' : '● ● ●') + ' · T&G';
      if (++n > 8) { clearInterval(titleTimer); document.title = base; }
    }, 700);
  }

  /* ---------------- auth ---------------- */
  function showDash() {
    $('#gate').hidden = true;
    $('#dash').hidden = false;
    connect();
    setInterval(function () {
      Array.prototype.forEach.call(document.querySelectorAll('.ocard__time'), function (el) {
        el.textContent = timeAgo(+el.dataset.ts);
      });
      renderStats();
    }, 30000);
  }
  function tryKey(pass) {
    return fetch('/api/orders', { headers: { 'x-owner-key': pass } })
      .then(function (r) { return r.ok; });
  }
  function login(pass) {
    primeAudio();
    tryKey(pass).then(function (ok) {
      if (ok) { key = pass; localStorage.setItem('tg-owner', pass); showDash(); }
      else { $('#gateErr').hidden = false; }
    });
  }

  function init() {
    $('#gateForm').addEventListener('submit', function (e) {
      e.preventDefault(); $('#gateErr').hidden = true; login($('#gatePass').value.trim());
    });
    $('#logoutBtn').addEventListener('click', function () {
      localStorage.removeItem('tg-owner'); if (es) es.close(); location.reload();
    });
    $('#soundBtn').addEventListener('click', function () {
      soundOn = !soundOn; localStorage.setItem('tg-sound', soundOn ? 'on' : 'off');
      this.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
      this.classList.toggle('is-off', !soundOn);
      primeAudio(); if (soundOn) chime(); manageRing();
    });
    if (!soundOn) { $('#soundBtn').setAttribute('aria-pressed', 'false'); $('#soundBtn').classList.add('is-off'); }

    // auto-login if we already have a valid key
    if (key) { tryKey(key).then(function (ok) { if (ok) showDash(); else localStorage.removeItem('tg-owner'); }); }
    else { $('#gatePass').focus(); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
