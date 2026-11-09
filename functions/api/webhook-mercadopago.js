// =============================================================================
// functions/api/webhook-mercadopago.js  —  Avisos de Mercado Pago (pagos)
// =============================================================================
// Mercado Pago llama a esta dirección (POST /api/webhook-mercadopago) cuando
// cambia el estado de un pago. Acá:
//   1) se verifica la firma del aviso (que sea de verdad de Mercado Pago),
//   2) se le pregunta a Mercado Pago el estado real del pago (no se confía en
//      lo que diga el aviso),
//   3) si está aprobado, se le suman 30 días (plan mensual) o 365 días (plan anual) de Premium,
//   4) si fue devuelto o contracargado, se le saca.
//
// Variables en Cloudflare:
//   MP_ACCESS_TOKEN (Secret)    — el Access Token de tu aplicación de Mercado Pago
//   MP_WEBHOOK_SECRET (Secret)  — la "clave secreta" que muestra el panel al configurar webhooks
//   SUPABASE_SERVICE_ROLE_KEY   — ya existente
// =============================================================================

const SUPABASE_URL_POR_DEFECTO = 'https://bprvlyzdnsykwjamumhw.supabase.co';
const ESPERA_MS = 8000;
const DIAS_PLAN_MENSUAL = 30;
const DIAS_PLAN_ANUAL = 365;
const DIA_MS = 24 * 60 * 60 * 1000;
const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function responder(estado, objeto) {
  return new Response(JSON.stringify(objeto), {
    status: estado,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function urlSupabase(env) {
  return String(env.SUPABASE_URL || SUPABASE_URL_POR_DEFECTO).replace(/\/+$/, '');
}

function encabezadosServicio(env) {
  const clave = env.SUPABASE_SERVICE_ROLE_KEY;
  const encabezados = { apikey: clave, 'Content-Type': 'application/json' };
  if (clave.startsWith('eyJ')) encabezados.Authorization = 'Bearer ' + clave;
  return encabezados;
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

async function firmar(texto, secreto) {
  const clave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secreto),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const firma = await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(firma))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function iguales(a, b) {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferencia === 0;
}

// Verifica el encabezado x-signature ("ts=...,v1=...") según el método de Mercado Pago.
async function firmaValida(request, idPago, secreto) {
  const cabecera = String(request.headers.get('x-signature') || '');
  const idPedido = String(request.headers.get('x-request-id') || '');
  let ts = '';
  let v1 = '';
  for (const parte of cabecera.split(',')) {
    const [clave, valor] = parte.split('=').map((s) => (s || '').trim());
    if (clave === 'ts') ts = valor;
    if (clave === 'v1') v1 = valor;
  }
  if (!ts || !v1) return false;
  const id = /^[a-z0-9]+$/i.test(idPago) ? idPago.toLowerCase() : idPago;
  const esperado = await firmar(`id:${id};request-id:${idPedido};ts:${ts};`, secreto);
  return iguales(v1.toLowerCase(), esperado);
}

// Cuántos días de Premium corresponden a este pago. El plan se anota al crear el
// pago (metadata.periodo) y también en el nombre del ítem, por si faltara uno.
function diasDelPago(pago) {
  const periodo = pago && pago.metadata && pago.metadata.periodo;
  if (periodo === 'anual') return DIAS_PLAN_ANUAL;
  if (periodo === 'mensual') return DIAS_PLAN_MENSUAL;
  const items = pago && pago.additional_info && pago.additional_info.items;
  const idItem = Array.isArray(items) && items[0] ? String(items[0].id || '') : '';
  if (idItem === 'premium-365-dias') return DIAS_PLAN_ANUAL;
  if (idItem !== 'premium-30-dias') {
    console.warn('No se pudo saber el plan del pago ' + (pago && pago.id) + ': se usan ' + DIAS_PLAN_MENSUAL + ' días');
  }
  return DIAS_PLAN_MENSUAL;
}

// ----- Supabase ---------------------------------------------------------------
async function leerPerfil(env, userId) {
  const url =
    urlSupabase(env) +
    '/rest/v1/profiles?select=is_premium,premium_hasta,premium_proveedor&limit=1&id=eq.' +
    encodeURIComponent(userId);
  const respuesta = await pedir(url, { method: 'GET', headers: encabezadosServicio(env) });
  if (!respuesta.ok) throw new Error('profiles respondió ' + respuesta.status);
  const filas = await respuesta.json();
  return Array.isArray(filas) && filas.length > 0 ? filas[0] : null;
}

async function actualizarPerfil(env, userId, cambios, filtroExtra) {
  const url =
    urlSupabase(env) + '/rest/v1/profiles?id=eq.' + encodeURIComponent(userId) + (filtroExtra || '');
  const respuesta = await pedir(url, {
    method: 'PATCH',
    headers: Object.assign({}, encabezadosServicio(env), { Prefer: 'return=representation' }),
    body: JSON.stringify(cambios),
  });
  if (!respuesta.ok) throw new Error('profiles respondió ' + respuesta.status);
  const filas = await respuesta.json();
  return Array.isArray(filas) ? filas.length : 0;
}

async function leerPago(env, idPago) {
  const url =
    urlSupabase(env) +
    '/rest/v1/pagos?select=id,evento&limit=1&proveedor=eq.mercadopago&referencia=eq.' +
    encodeURIComponent(idPago);
  const respuesta = await pedir(url, { method: 'GET', headers: encabezadosServicio(env) });
  if (!respuesta.ok) throw new Error('pagos respondió ' + respuesta.status);
  const filas = await respuesta.json();
  return Array.isArray(filas) && filas.length > 0 ? filas[0] : null;
}

async function registrarPago(env, userId, idPago, evento, monto, moneda) {
  const respuesta = await pedir(urlSupabase(env) + '/rest/v1/pagos?on_conflict=proveedor,referencia', {
    method: 'POST',
    headers: Object.assign({}, encabezadosServicio(env), { Prefer: 'resolution=ignore-duplicates,return=minimal' }),
    body: JSON.stringify({ user_id: userId, proveedor: 'mercadopago', referencia: String(idPago), evento, monto, moneda }),
  });
  if (!respuesta.ok) console.error('No se pudo registrar el pago. Estado:', respuesta.status);
}

async function marcarReembolsado(env, idPago) {
  await pedir(
    urlSupabase(env) + '/rest/v1/pagos?proveedor=eq.mercadopago&referencia=eq.' + encodeURIComponent(idPago),
    {
      method: 'PATCH',
      headers: Object.assign({}, encabezadosServicio(env), { Prefer: 'return=minimal' }),
      body: JSON.stringify({ evento: 'reembolsado' }),
    }
  );
}

// ----- La función principal ---------------------------------------------------
export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') return responder(405, { error: 'Método no permitido.' });
  if (!env.MP_ACCESS_TOKEN || !env.MP_WEBHOOK_SECRET || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Faltan MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET o SUPABASE_SERVICE_ROLE_KEY');
    return responder(500, { error: 'No configurado.' });
  }

  // Mercado Pago manda el id del pago en la dirección (?data.id=...&type=payment)
  // y también en el cuerpo. Aceptamos cualquiera de los dos.
  const direccion = new URL(request.url);
  let cuerpo = {};
  try {
    cuerpo = await request.json();
  } catch (e) {
    cuerpo = {};
  }
  const tipo = String(direccion.searchParams.get('type') || direccion.searchParams.get('topic') || (cuerpo && cuerpo.type) || '');
  const idPago = String(direccion.searchParams.get('data.id') || (cuerpo && cuerpo.data && cuerpo.data.id) || '');

  // Solo nos interesan los pagos; lo demás (merchant_order, etc.) se contesta OK y se ignora.
  if (tipo !== 'payment' || !idPago) return responder(200, { ok: true, ignorado: true });

  // 1) Firma.
  if (!(await firmaValida(request, idPago, env.MP_WEBHOOK_SECRET))) {
    console.warn('Webhook de Mercado Pago con firma inválida');
    return responder(401, { error: 'Firma inválida.' });
  }

  try {
    // 2) Estado real del pago, preguntándole a Mercado Pago.
    const respuesta = await pedir('https://api.mercadopago.com/v1/payments/' + encodeURIComponent(idPago), {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + env.MP_ACCESS_TOKEN },
    });
    if (respuesta.status === 404) return responder(200, { ok: true, ignorado: true }); // p. ej. pruebas del panel
    if (!respuesta.ok) throw new Error('Mercado Pago respondió ' + respuesta.status);
    const pago = await respuesta.json();

    const userId = String(pago.external_reference || '');
    if (!FORMATO_UUID.test(userId)) {
      console.error('Pago de Mercado Pago sin user_id válido. Pago:', idPago);
      return responder(200, { ok: true, ignorado: true });
    }

    const registrado = await leerPago(env, idPago);

    // 3) Devuelto o contracargado: se le saca el Premium (una sola vez).
    if (pago.status === 'refunded' || pago.status === 'charged_back') {
      if (registrado && registrado.evento !== 'reembolsado') {
        await actualizarPerfil(
          env,
          userId,
          { is_premium: false, premium_hasta: new Date().toISOString() },
          '&premium_proveedor=eq.mercadopago'
        );
        await marcarReembolsado(env, idPago);
      }
      return responder(200, { ok: true });
    }

    // 4) Cualquier estado que no sea "aprobado" (pendiente, rechazado...) no activa nada.
    if (pago.status !== 'approved') return responder(200, { ok: true, estado: pago.status });

    // Ya procesado antes: no se suma dos veces.
    if (registrado) return responder(200, { ok: true, repetido: true });

    // 5) Sumar los días del plan (30 o 365). Si ya tenía Premium vigente, se suman al final de lo que le quedaba.
    const perfil = await leerPerfil(env, userId);
    if (!perfil) throw new Error('No existe el perfil del usuario');
    const ahora = Date.now();
    const vigenteHasta = perfil.is_premium && perfil.premium_hasta ? new Date(perfil.premium_hasta).getTime() : 0;
    const base = vigenteHasta > ahora ? vigenteHasta : ahora;
    const hasta = new Date(base + diasDelPago(pago) * DIA_MS).toISOString();

    await actualizarPerfil(env, userId, {
      is_premium: true,
      premium_hasta: hasta,
      premium_proveedor: 'mercadopago',
    });
    await registrarPago(env, userId, idPago, 'pago_aprobado', pago.transaction_amount, pago.currency_id);

    return responder(200, { ok: true });
  } catch (e) {
    // Un 500 le dice a Mercado Pago que reintente más tarde.
    console.error('Error procesando webhook de Mercado Pago:', e && e.message);
    return responder(500, { error: 'Error al procesar.' });
  }
}
