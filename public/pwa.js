/* =============================================================================
   pwa.js — Registra la app instalable y agrega el botón "Instalar app"
   =============================================================================
   · Registra el service worker (/sw.js).
   · Agrega "Instalar app" en el menú lateral:
       - Android / Chrome / Edge: instala con un toque.
       - iPhone / iPad (Safari): muestra cómo agregarla a la pantalla de inicio.
   · Si ya está instalada y abierta como app, no muestra nada.
   ========================================================================== */
(function () {
  'use strict';

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function (e) {
        console.warn('No se pudo registrar el service worker:', e);
      });
    });
  }

  var instaladaComoApp =
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    window.navigator.standalone === true;
  if (instaladaComoApp) return;

  var esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var eventoInstalar = null;
  var boton = null;

  function crearBoton() {
    if (boton) return boton;
    var contenedor = document.querySelector('.sidebar-bottom');
    if (!contenedor) return null;
    boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'sidebar-item';
    boton.hidden = true;
    boton.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>' +
      '<span>Instalar app</span>';
    contenedor.insertBefore(boton, contenedor.firstChild);
    boton.addEventListener('click', alTocar);
    return boton;
  }

  function avisar(texto) {
    var aviso = document.createElement('div');
    aviso.setAttribute('role', 'status');
    aviso.textContent = texto;
    aviso.style.cssText =
      'position:fixed;left:16px;right:16px;bottom:24px;max-width:420px;margin:0 auto;z-index:9999;' +
      'padding:14px 18px;border-radius:14px;background:#264B4A;color:#FFF;font-size:.95rem;line-height:1.5;' +
      'box-shadow:0 8px 24px rgba(0,0,0,.25);text-align:center';
    document.body.appendChild(aviso);
    setTimeout(function () { aviso.remove(); }, 7000);
  }

  function alTocar() {
    if (eventoInstalar) {
      eventoInstalar.prompt();
      eventoInstalar.userChoice.then(function () {
        eventoInstalar = null;
        if (boton) boton.hidden = true;
      });
    } else if (esIOS) {
      avisar('Para instalar PuroTexto: tocá el botón Compartir de Safari y elegí «Agregar a pantalla de inicio».');
    }
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    eventoInstalar = e;
    if (crearBoton()) boton.hidden = false;
  });

  window.addEventListener('appinstalled', function () {
    eventoInstalar = null;
    if (boton) boton.hidden = true;
  });

  document.addEventListener('DOMContentLoaded', function () {
    if (esIOS && crearBoton()) boton.hidden = false;
  });
})();
