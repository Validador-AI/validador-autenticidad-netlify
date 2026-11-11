/* =============================================================================
   captcha-auth.js — Verificación anti-bots (Cloudflare Turnstile) para el
   inicio de sesión y el registro. Va en public/captcha-auth.js
   ============================================================================= */
(function () {
  'use strict';

  var SITE_KEY = '0x4AAAAAAF823hfEC7xf3EQb'; // clave pública (no es secreta)
  var SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

  var widgetId = null;
  var token = '';
  var cargando = false;

  function montar() {
    var cont = document.getElementById('auth-captcha');
    if (!cont || !window.turnstile || widgetId !== null) return;
    try {
      widgetId = window.turnstile.render(cont, {
        sitekey: SITE_KEY,
        appearance: 'interaction-only', // solo se ve si hace falta que la persona interactúe
        theme: 'light',
        language: 'es',
        callback: function (t) { token = t; },
        'expired-callback': function () { token = ''; },
        'error-callback': function () { token = ''; }
      });
    } catch (e) {
      widgetId = null;
    }
  }

  // Carga el script de Cloudflare la primera vez que se abre el formulario
  function preparar() {
    if (window.turnstile) { montar(); return; }
    if (cargando) return;
    cargando = true;
    var s = document.createElement('script');
    s.src = SRC;
    s.async = true;
    s.defer = true;
    s.onload = function () { cargando = false; montar(); };
    s.onerror = function () { cargando = false; };
    document.head.appendChild(s);
  }

  // Cada código sirve una sola vez: después de cada intento se pide uno nuevo
  function reiniciar() {
    token = '';
    if (window.turnstile && widgetId !== null) {
      try { window.turnstile.reset(widgetId); } catch (e) { /* nada */ }
    }
  }

  // Mensajes de Supabase en español
  function traducir(msg) {
    var m = String(msg || '').toLowerCase();
    if (!m) return '';
    if (m.indexOf('captcha') !== -1) return 'No pudimos verificar que sos una persona. Recargá la página y probá de nuevo.';
    if (m.indexOf('invalid login credentials') !== -1) return 'Email o contraseña incorrectos.';
    if (m.indexOf('user already registered') !== -1) return 'Ya hay una cuenta con ese email. Probá iniciar sesión.';
    if (m.indexOf('email not confirmed') !== -1) return 'Todavía no confirmaste tu email. Revisá tu casilla.';
    if (m.indexOf('at least one character of each') !== -1) return 'La contraseña tiene que incluir letras y números.';
    if (m.indexOf('password should be at least') !== -1) return 'La contraseña tiene que tener al menos 8 caracteres.';
    if (m.indexOf('rate limit') !== -1 || m.indexOf('too many') !== -1) return 'Demasiados intentos. Esperá unos minutos y probá de nuevo.';
    if (m.indexOf('invalid email') !== -1 || m.indexOf('unable to validate email') !== -1) return 'Ese email no parece válido.';
    return msg;
  }

  window.PTCaptcha = {
    preparar: preparar,
    reiniciar: reiniciar,
    traducir: traducir,
    token: function () { return token; }
  };
})();
