/* =========================================================
   TANDOOR ET GRILLE — customer auth (client)
   Signup / login modal. Token + customer kept in localStorage.
   window.TGAuth: { isLoggedIn, customer, token, open, logout }
   ========================================================= */
window.TGAuth = (function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var lang = function () { return localStorage.getItem('tg-lang') || 'en'; };
  var token = localStorage.getItem('tg-auth') || '';
  var customer = null;
  try { customer = JSON.parse(localStorage.getItem('tg-customer') || 'null'); } catch (e) {}

  var mode = 'signup';
  var pending = null; // callback after successful auth

  function save(tok, cust) {
    token = tok; customer = cust;
    localStorage.setItem('tg-auth', tok);
    localStorage.setItem('tg-customer', JSON.stringify(cust));
    document.dispatchEvent(new CustomEvent('tg-auth-change', { detail: cust }));
  }
  function logout() {
    token = ''; customer = null;
    localStorage.removeItem('tg-auth'); localStorage.removeItem('tg-customer');
    document.dispatchEvent(new CustomEvent('tg-auth-change', { detail: null }));
  }

  /* ---- modal ---- */
  function setMode(m) {
    mode = m;
    document.querySelectorAll('.auth__tab').forEach(function (t) {
      t.classList.toggle('is-active', t.dataset.mode === m);
    });
    document.querySelectorAll('.af-signup').forEach(function (el) { el.style.display = m === 'signup' ? '' : 'none'; });
    var fr = lang() === 'fr';
    $('#authTitle').textContent = m === 'signup'
      ? (fr ? 'Créer un compte' : 'Create your account')
      : (fr ? 'Bon retour' : 'Welcome back');
    $('#authSubmit').textContent = m === 'signup'
      ? (fr ? 'Créer le compte & continuer' : 'Create account & continue')
      : (fr ? 'Se connecter & continuer' : 'Sign in & continue');
    $('#auPass').setAttribute('autocomplete', m === 'signup' ? 'new-password' : 'current-password');
    hideErr();
  }
  function open(after) {
    pending = after || null;
    setMode('signup');
    $('#authScrim').hidden = false;
    var m = $('#authModal'); m.setAttribute('aria-hidden', 'false'); m.classList.add('open');
    if (window.__tgSyncScroll) window.__tgSyncScroll(); else document.body.style.overflow = 'hidden';
    setTimeout(function () { $('#auEmail').focus(); }, 60);
  }
  function close() {
    $('#authScrim').hidden = true;
    var m = $('#authModal'); m.setAttribute('aria-hidden', 'true'); m.classList.remove('open');
    if (window.__tgSyncScroll) window.__tgSyncScroll(); else document.body.style.overflow = '';
  }
  function showErr(msg) { var e = $('#authErr'); e.textContent = msg; e.hidden = false; }
  function hideErr() { var e = $('#authErr'); e.hidden = true; }

  function errMsg(code) {
    var fr = lang() === 'fr';
    var map = {
      'email already registered': fr ? 'Ce courriel a déjà un compte — connectez-vous.' : 'That email already has an account — sign in.',
      'invalid email or password': fr ? 'Courriel ou mot de passe invalide.' : 'Invalid email or password.',
      'invalid email': fr ? 'Courriel invalide.' : 'Please enter a valid email.',
      'password too short': fr ? 'Mot de passe : 6 caractères minimum.' : 'Password must be at least 6 characters.',
      'name and phone required': fr ? 'Nom et téléphone requis.' : 'Name and phone are required.',
    };
    return map[code] || (fr ? 'Une erreur est survenue. Réessayez.' : 'Something went wrong. Try again.');
  }

  function submit(e) {
    e.preventDefault();
    hideErr();
    var email = $('#auEmail').value.trim();
    var pass = $('#auPass').value;
    var btn = $('#authSubmit'); btn.disabled = true;
    var url = mode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
    var payload = mode === 'signup'
      ? { email: email, password: pass, name: $('#auName').value.trim(), phone: $('#auPhone').value.trim() }
      : { email: email, password: pass };
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) { showErr(errMsg(res.d && res.d.error)); return; }
        save(res.d.token, res.d.customer);
        close();
        var cb = pending; pending = null;
        if (cb) cb(res.d.customer);
      })
      .catch(function () { showErr(errMsg()); })
      .then(function () { btn.disabled = false; });
  }

  function wire() {
    if (!$('#authModal')) return;
    $('#authForm').addEventListener('submit', submit);
    $('#authClose').addEventListener('click', close);
    $('#authScrim').addEventListener('click', close);
    document.querySelectorAll('.auth__tab').forEach(function (t) {
      t.addEventListener('click', function () { setMode(t.dataset.mode); });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();

  return {
    isLoggedIn: function () { return !!token; },
    customer: function () { return customer; },
    token: function () { return token; },
    open: open,
    logout: logout,
  };
})();
