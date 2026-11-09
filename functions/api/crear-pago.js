// =============================================================================
// functions/api/crear-pago.js  —  Crea el link de pago de Premium
// =============================================================================
// La página (precios.html) le pide acá el link de pago, indicando con qué quiere
// pagar. Esta función verifica quién es la persona (por su sesión de Supabase),
// le pide el link al proveedor y se lo devuelve. Responde en /api/crear-pago.
//
//   POST /api/crear-pago
//   Encabezado:  Authorization: Bearer <token de sesión>
//   Cuerpo:      { "proveedor": "lemon" | "mercadopago", "periodo": "mensual" | "anual" }
//                (si falta "periodo", se toma "mensual")
//   Respuesta:   200 { url }   |   4xx/5xx { error }
//
// Variables en Cloudflare (Settings → Variables and Secrets):
//   Ya existentes:  SUPABASE_SERVICE_ROLE_KEY (Secret)
//   Lemon Squeezy:  LEMON_API_KEY (Secret), LEMON_STORE_ID,
//                   LEMON_VARIANT_ID (plan mensual), LEMON_VARIANT_ID_ANUAL (plan anual)
//   Mercado Pago:   MP_ACCESS_TOKEN (Secret),
//                   MP_PRECIO_ARS (mensual, ej: 14900), MP_PRECIO_ARS_ANUAL (ej: 149000)
//   Opcional:       SITIO_URL (por defecto https://purotexto.com)
//
// IMPORTANTE: el user_id viaja al proveedor como dato "propio" del pago. Después
// el webhook lo usa para saber a quién activarle el Premium. Sale siempre del
// token verificado acá, nunca de lo que mande la página.
// =============================================================================

const SUPABASE_URL_POR_DEFECTO = 'https://bprvlyzdnsykwjamumhw.supabase.co';
const SITIO_POR_DEFECTO = 'https://purotexto.com';
const ESPERA_MS = 10000;

function responder(estado, objeto) {
  return new Response(JSON.stringify(objeto), {
    status: estado,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function urlSupabase(env) {
  return String(env.SUPABASE_URL || SUPABASE_URL_POR_DEFECTO).replace(/\/+$/, '');
}

function urlSitio(env) {
  return String(env.SITIO_URL || SITIO_POR_DEFECTO).replace(/\/+$/, '');
}

async function pedir(url, opciones) {
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), ESPERA_MS);
  try {
    return await fetch(url, Object.assign({ signal: control.signal }, opciones));
  } finally {
    clearTimeout(temporizador);
  }
}

function encabezadosServicio(env) {
  const clave = env.SUPABASE_SERVICE_ROLE_KEY;
  const encabezados = { apikey: clave, 'Content-Type': 'application/json' };
  if (clave.startsWith('eyJ')) encabezados.Authorization = 'Bearer ' + clave;
  return encabezados;
}

// Le pregunta a Supabase de quién es el token. Devuelve { id, email } o null.
async function usuarioDelToken(env, token) {
  const respuesta = await pedir(urlSupabase(env) + '/auth/v1/user', {
    method: 'GET',
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + token },
  });
  if (respuesta.status === 401 || respuesta.status === 403) return null;
  if (!respuesta.ok) throw new Error('Supabase auth respondió ' + respuesta.status);
  const usuario = await respuesta.json();
  return usuario && usuario.id ? { id: usuario.id, email: usuario.email || '' } : null;
}

// Lee el estado Premium actual de la persona.
async function perfilPremium(env, userId) {
  const url =
    urlSupabase(env) +
    '/rest/v1/profiles?select=is_premium,premium_hasta,premium_proveedor&limit=1&id=eq.' +
    encodeURIComponent(userId);
  const respuesta = await pedir(url, { method: 'GET', headers: encabezadosServicio(env) });
  if (!respuesta.ok) throw new Error('profiles respondió ' + respuesta.status);
  const filas = await respuesta.json();
  return Array.isArray(filas) && filas.length > 0 ? filas[0] : null;
}

// ----- Lemon Squeezy: suscripción mensual en dólares --------------------------
async function crearLinkLemon(env, usuario, periodo) {
  const variante = periodo === 'anual' ? env.LEMON_VARIANT_ID_ANUAL : env.LEMON_VARIANT_ID;
  const respuesta = await pedir('https://api.lemonsqueezy.com/v1/checkouts', {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization: 'Bearer ' + env.LEMON_API_KEY,
    },
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          checkout_options: { logo: true },
          checkout_data: {
            email: usuario.email || undefined,
            custom: { user_id: usuario.id }, // vuelve en el webhook: meta.custom_data.user_id
          },
          product_options: {
            redirect_url: urlSitio(env) + '/cuenta.html?pago=ok',
          },
        },
        relationships: {
          store: { data: { type: 'stores', id: String(env.LEMON_STORE_ID) } },
          variant: { data: { type: 'variants', id: String(variante) } },
        },
      },
    }),
  });
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    console.error('Lemon Squeezy rechazó el checkout. Estado:', respuesta.status, JSON.stringify(datos && datos.errors));
    throw new Error('lemon');
  }
  const url = datos && datos.data && datos.data.attributes && datos.data.attributes.url;
  if (!url) throw new Error('Lemon no devolvió el link');
  return url;
}

// ----- Mercado Pago: pago único de 30 días, en pesos --------------------------
async function crearLinkMercadoPago(env, usuario, periodo) {
  const anual = periodo === 'anual';
  const precio = Number(anual ? env.MP_PRECIO_ARS_ANUAL : env.MP_PRECIO_ARS);
  if (!Number.isFinite(precio) || precio <= 0) throw new Error('Falta el precio en pesos del plan ' + periodo);
  const sitio = urlSitio(env);

  const respuesta = await pedir('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + env.MP_ACCESS_TOKEN,
    },
    body: JSON.stringify({
      items: [
        {
          id: anual ? 'premium-365-dias' : 'premium-30-dias',
          title: anual ? 'PuroTexto Premium (1 año)' : 'PuroTexto Premium (30 días)',
          quantity: 1,
          currency_id: 'ARS',
          unit_price: precio,
        },
      ],
      payer: usuario.email ? { email: usuario.email } : undefined,
      external_reference: usuario.id, // vuelve en el pago: es el user_id
      metadata: { periodo: anual ? 'anual' : 'mensual' }, // el webhook lo usa para saber cuántos días sumar
      notification_url: sitio + '/api/webhook-mercadopago',
      back_urls: {
        success: sitio + '/cuenta.html?pago=ok',
        pending: sitio + '/cuenta.html?pago=pendiente',
        failure: sitio + '/precios.html?pago=error',
      },
      auto_return: 'approved',
      statement_descriptor: 'PUROTEXTO',
    }),
  });
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    console.error('Mercado Pago rechazó la preferencia. Estado:', respuesta.status, JSON.stringify(datos && datos.message));
    throw new Error('mercadopago');
  }
  // Si el access token es de PRUEBA, init_point igual sirve con usuarios de prueba.
  const url = datos && datos.init_point;
  if (!url) throw new Error('Mercado Pago no devolvió el link');
  return url;
}

// ----- La función principal ---------------------------------------------------
export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return responder(405, { error: 'Método no permitido.' });
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Falta SUPABASE_SERVICE_ROLE_KEY');
    return responder(500, { error: 'El servidor no está configurado todavía.' });
  }

  try {
    // 1) ¿Quién es? Hace falta sesión para pagar.
    const m = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') || '');
    if (!m) {
      return responder(401, { codigo: 'sin_sesion', error: 'Iniciá sesión para pasarte a Premium.' });
    }
    const usuario = await usuarioDelToken(env, m[1].trim());
    if (!usuario) {
      return responder(401, { codigo: 'sesion_invalida', error: 'Tu sesión venció. Volvé a iniciar sesión.' });
    }

    // 2) ¿Qué proveedor eligió?
    let cuerpo = {};
    try {
      cuerpo = await request.json();
    } catch (e) {
      cuerpo = {};
    }
    const proveedor = cuerpo && cuerpo.proveedor;
    if (proveedor !== 'lemon' && proveedor !== 'mercadopago') {
      return responder(400, { error: 'Elegí cómo querés pagar.' });
    }

    const periodo = cuerpo && cuerpo.periodo === 'anual' ? 'anual' : 'mensual';

    // 3) Si ya tiene una suscripción activa en Lemon, no dejamos crear otra
    // (se cobraría doble). Con Mercado Pago sí se puede pagar de nuevo: suma 30 días.
    const perfil = await perfilPremium(env, usuario.id);
    const vigente = perfil && perfil.is_premium === true && (!perfil.premium_hasta || new Date(perfil.premium_hasta) > new Date());
    if (vigente && proveedor === 'lemon' && perfil.premium_proveedor === 'lemon') {
      return responder(409, { error: 'Ya tenés una suscripción Premium activa con tarjeta. Para cambiar de plan, escribinos a hola@purotexto.com.' });
    }

    // 4) Pedirle el link al proveedor.
    let url;
    if (proveedor === 'lemon') {
      const varianteElegida = periodo === 'anual' ? env.LEMON_VARIANT_ID_ANUAL : env.LEMON_VARIANT_ID;
      if (!env.LEMON_API_KEY || !env.LEMON_STORE_ID || !varianteElegida) {
        console.error('Faltan variables de Lemon Squeezy');
        return responder(503, { error: 'El pago con tarjeta todavía no está disponible.' });
      }
      url = await crearLinkLemon(env, usuario, periodo);
    } else {
      const precioElegido = periodo === 'anual' ? env.MP_PRECIO_ARS_ANUAL : env.MP_PRECIO_ARS;
      if (!env.MP_ACCESS_TOKEN || !precioElegido) {
        console.error('Faltan variables de Mercado Pago');
        return responder(503, { error: 'El pago con Mercado Pago todavía no está disponible.' });
      }
      url = await crearLinkMercadoPago(env, usuario, periodo);
    }

    return responder(200, { url });
  } catch (e) {
    console.error('Error en /api/crear-pago:', e && e.name, e && e.message);
    return responder(502, { error: 'No pudimos armar el pago. Probá de nuevo en unos minutos.' });
  }
}
