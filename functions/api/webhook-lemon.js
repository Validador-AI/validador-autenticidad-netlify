// =============================================================================
// functions/api/webhook-lemon.js  —  Avisos de Lemon Squeezy (suscripciones)
// =============================================================================
// Lemon Squeezy llama a esta dirección (POST /api/webhook-lemon) cada vez que
// pasa algo con una suscripción: se crea, se renueva, se cancela, vence, etc.
// Acá se verifica que el aviso sea de verdad de Lemon (firma secreta) y se le
// prende o apaga el Premium a la persona en Supabase (profiles).
//
// Variables en Cloudflare:
//   LEMON_WEBHOOK_SECRET (Secret)   — la "signing secret" que inventás al crear el webhook
//   SUPABASE_SERVICE_ROLE_KEY       — ya existente
//
// Reglas de acceso:
//   · Suscripción activa ........ Premium hasta la próxima renovación (+2 días de margen)
//   · Cancelada ................. Premium hasta que termine el período ya pagado
//   · Vencida / impaga / pausada  Se apaga
//   · Pago fallado (past_due) ... No se cambia nada (Lemon reintenta el cobro)
// =============================================================================

const SUPABASE_URL_POR_DEFECTO = 'https://bprvlyzdnsykwjamumhw.supabase.co';
const ESPERA_MS = 8000;
const MARGEN_DIAS = 2;
const DIA_MS = 24 * 60 * 60 * 1000;

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

// Calcula la firma HMAC-SHA256 (en hexadecimal) del cuerpo con la clave secreta.
async function firmar(cuerpo, secreto) {
  const clave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secreto),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const firma = await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(cuerpo));
  return Array.from(new Uint8Array(firma))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Compara dos textos sin que el tiempo que tarda delate cuántas letras coinciden.
function iguales(a, b) {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferencia === 0;
}

// Modifica el perfil. Devuelve cuántas filas cambió (0 = no existe el perfil).
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

// Guarda el pago en el registro (si ya estaba, lo ignora).
async function registrarPago(env, userId, referencia, evento, monto, moneda) {
  const respuesta = await pedir(urlSupabase(env) + '/rest/v1/pagos?on_conflict=proveedor,referencia', {
    method: 'POST',
    headers: Object.assign({}, encabezadosServicio(env), {
      Prefer: 'resolution=ignore-duplicates,return=minimal',
    }),
    body: JSON.stringify({
      user_id: userId,
      proveedor: 'lemon',
      referencia: String(referencia),
      evento,
      monto,
      moneda,
    }),
  });
  if (!respuesta.ok) console.error('No se pudo registrar el pago. Estado:', respuesta.status);
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') return responder(405, { error: 'Método no permitido.' });
  if (!env.LEMON_WEBHOOK_SECRET || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Faltan LEMON_WEBHOOK_SECRET o SUPABASE_SERVICE_ROLE_KEY');
    return responder(500, { error: 'No configurado.' });
  }

  // 1) Verificar la firma. Se usa el cuerpo EXACTO, sin tocar.
  const cuerpoTexto = await request.text();
  const firmaRecibida = String(request.headers.get('x-signature') || '').trim().toLowerCase();
  const firmaEsperada = await firmar(cuerpoTexto, env.LEMON_WEBHOOK_SECRET);
  if (!firmaRecibida || !iguales(firmaRecibida, firmaEsperada)) {
    console.warn('Webhook de Lemon con firma inválida');
    return responder(401, { error: 'Firma inválida.' });
  }

  let aviso;
  try {
    aviso = JSON.parse(cuerpoTexto);
  } catch (e) {
    return responder(400, { error: 'Cuerpo inválido.' });
  }

  const meta = (aviso && aviso.meta) || {};
  const dato = (aviso && aviso.data) || {};
  const atributos = dato.attributes || {};
  const evento = String(meta.event_name || request.headers.get('x-event-name') || '');
  const userId = meta.custom_data && meta.custom_data.user_id;

  try {
    // 2) Pagos de suscripción: se anotan en el registro (comprobantes).
    if (dato.type === 'subscription-invoices' && evento === 'subscription_payment_success') {
      if (userId) {
        await registrarPago(
          env,
          userId,
          dato.id,
          evento,
          Number.isFinite(Number(atributos.total)) ? Number(atributos.total) / 100 : null,
          atributos.currency || null
        );
      }
      return responder(200, { ok: true });
    }

    // 3) Cambios de estado de la suscripción: prender o apagar Premium.
    if (dato.type !== 'subscriptions') return responder(200, { ok: true, ignorado: true });

    if (!userId) {
      console.error('Aviso de Lemon sin user_id (¿pago de prueba hecho a mano?). Evento:', evento);
      return responder(200, { ok: true, ignorado: true });
    }

    const estado = String(atributos.status || '');
    const ahora = Date.now();

    if (estado === 'active' || estado === 'on_trial') {
      const renueva = atributos.renews_at ? new Date(atributos.renews_at).getTime() : ahora + 33 * DIA_MS;
      const hasta = new Date(renueva + MARGEN_DIAS * DIA_MS).toISOString();
      const filas = await actualizarPerfil(env, userId, {
        is_premium: true,
        premium_hasta: hasta,
        premium_proveedor: 'lemon',
      });
      if (filas === 0) throw new Error('No existe el perfil del usuario');
    } else if (estado === 'cancelled') {
      // Cancelada: conserva lo ya pagado hasta ends_at.
      const fin = atributos.ends_at ? new Date(atributos.ends_at).getTime() : 0;
      if (fin > ahora) {
        await actualizarPerfil(env, userId, {
          is_premium: true,
          premium_hasta: new Date(fin).toISOString(),
          premium_proveedor: 'lemon',
        });
      } else {
        await actualizarPerfil(env, userId, { is_premium: false, premium_hasta: new Date().toISOString() }, '&premium_proveedor=eq.lemon');
      }
    } else if (estado === 'expired' || estado === 'unpaid' || estado === 'paused') {
      // Solo se apaga si el Premium actual vino de Lemon (no pisar uno pagado con Mercado Pago).
      await actualizarPerfil(env, userId, { is_premium: false, premium_hasta: new Date().toISOString() }, '&premium_proveedor=eq.lemon');
    }
    // past_due: no se toca nada.

    return responder(200, { ok: true });
  } catch (e) {
    // Un 500 le dice a Lemon que reintente más tarde.
    console.error('Error procesando webhook de Lemon:', evento, e && e.message);
    return responder(500, { error: 'Error al procesar.' });
  }
}
