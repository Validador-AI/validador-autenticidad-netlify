/* =============================================================================
   sw.js — Service worker de PuroTexto (lo que hace instalable la app)
   =============================================================================
   Estrategia simple y segura: SIEMPRE se pide primero a internet, así nunca se
   ve una versión vieja del sitio después de un deploy. Solo si no hay conexión
   se usa la copia guardada de la última vez.
   NUNCA se toca: /api/ (análisis, pagos, webhooks), los espacios de publicidad,
   otros sitios (Supabase, Google, Lemon, Mercado Pago) ni pedidos que no sean GET.
   Para forzar que todos descarguen una versión nueva, cambiá el número de VERSION.
   ========================================================================== */
const VERSION = 'v2';
const CACHE = 'purotexto-' + VERSION;
const PRECARGA = ['/logo-icono.png', '/icon-192.png', '/icon-512.png', '/favicon.svg'];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.allSettled(PRECARGA.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((c) => c.startsWith('purotexto-') && c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

const PAGINA_SIN_CONEXION =
  '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
  '<title>Sin conexión — PuroTexto</title></head>' +
  '<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#F5EFE7;color:#1E3A3A;font-family:system-ui,sans-serif;text-align:center;padding:24px">' +
  '<div><h1 style="font-size:1.4rem;margin:0 0 8px">Sin conexión</h1>' +
  '<p style="margin:0">PuroTexto necesita internet para analizar tus textos. Volvé a intentar cuando estés conectado.</p></div></body></html>';

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET' || pedido.headers.has('range')) return;

  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;            // otros sitios: no tocar
  if (url.pathname.startsWith('/api/')) return;               // el servidor: no tocar
  if (url.pathname.startsWith('/anuncio-')) return;           // publicidad: no tocar
  if (url.searchParams.has('code') || url.searchParams.has('error')) return; // vueltas de inicio de sesión

  const esPagina = pedido.mode === 'navigate';
  const clave = esPagina ? url.origin + url.pathname : pedido;

  // Los archivos (css, js, imágenes) se revalidan siempre contra el servidor, así el
  // celular nunca se queda con una copia vieja guardada por el navegador.
  const pedidoRed = esPagina ? pedido : new Request(pedido, { cache: 'no-cache' });

  evento.respondWith(
    fetch(pedidoRed)
      .then((respuesta) => {
        if (respuesta.ok && respuesta.type === 'basic') {
          const copia = respuesta.clone();
          caches.open(CACHE).then((cache) => cache.put(clave, copia));
        }
        return respuesta;
      })
      .catch(() =>
        caches.match(clave).then((guardada) => {
          if (guardada) return guardada;
          if (esPagina) {
            return new Response(PAGINA_SIN_CONEXION, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
          }
          return Response.error();
        })
      )
  );
});
