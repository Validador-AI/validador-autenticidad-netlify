/* =============================================================================
   tema.js — Botón de modo claro / oscuro
   =============================================================================
   · Agrega "Modo oscuro" / "Modo claro" (luna / sol) en el menú lateral.
   · Recuerda la elección de la persona (localStorage).
   · Si nunca eligió, la página se ve en claro (los colores de siempre), aunque
     el sistema esté en modo oscuro. El oscuro solo se activa con el botón.
   · El tema se aplica ANTES de que se dibuje la página con un script mínimo
     que está en el <head> de cada página (para que no parpadee en blanco).
   ========================================================================== */
(function () {
  'use strict';

  var CLAVE = 'purotexto_tema';
  var COLOR_BARRA = { claro: '#264B4A', oscuro: '#12201F' };
  var LUNA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path></svg>';
  var SOL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path></svg>';

  var raiz = document.documentElement;
  var boton = null;

  function eleccionGuardada() {
    try {
      var t = localStorage.getItem(CLAVE);
      return t === 'claro' || t === 'oscuro' ? t : null;
    } catch (e) { return null; }
  }
  function temaActual() {
    return raiz.getAttribute('data-tema') === 'oscuro' ? 'oscuro' : 'claro';
  }

  function pintarBoton() {
    if (!boton) return;
    var oscuro = temaActual() === 'oscuro';
    boton.innerHTML = (oscuro ? SOL : LUNA) + '<span>' + (oscuro ? 'Modo claro' : 'Modo oscuro') + '</span>';
    boton.setAttribute('aria-label', oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
  }

  function aplicar(tema, guardar) {
    raiz.setAttribute('data-tema', tema);
    var metaColor = document.querySelector('meta[name="theme-color"]');
    if (metaColor) metaColor.setAttribute('content', COLOR_BARRA[tema]);
    if (guardar) {
      try { localStorage.setItem(CLAVE, tema); } catch (e) { /* sin almacenamiento: no se recuerda */ }
    }
    pintarBoton();
  }

  // Por si el script del <head> no corrió
  if (!raiz.getAttribute('data-tema')) aplicar(eleccionGuardada() || 'claro', false);
  else aplicar(temaActual(), false);

  // Si cambia en otra pestaña, esta también se actualiza
  window.addEventListener('storage', function (e) {
    if (e.key === CLAVE) aplicar(eleccionGuardada() || 'claro', false);
  });

  function crearBoton() {
    var contenedor = document.querySelector('.sidebar-bottom');
    if (!contenedor || document.getElementById('btn-tema')) return;
    boton = document.createElement('button');
    boton.type = 'button';
    boton.id = 'btn-tema';
    boton.className = 'sidebar-item sidebar-auth sidebar-tema';
    boton.addEventListener('click', function () {
      aplicar(temaActual() === 'oscuro' ? 'claro' : 'oscuro', true);
    });
    // Queda justo antes de "Iniciar sesión / Mi cuenta"
    var botonCuenta = document.getElementById('btn-auth');
    contenedor.insertBefore(boton, botonCuenta && botonCuenta.parentNode === contenedor ? botonCuenta : null);
    pintarBoton();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', crearBoton);
  else crearBoton();
})();
