// =============================================================================
// functions/api/precios.js  —  Precios en pesos para mostrar en precios.html
// =============================================================================
// Devuelve los montos de Mercado Pago que cargaste en Cloudflare, así el precio
// que se ve en la página es siempre el mismo que se cobra (y cambiarlo es
// editar la variable, sin tocar el código).
//   GET /api/precios  →  { ars: { mensual: 14900, anual: 149000 } }
// Variables: MP_PRECIO_ARS (mensual) y MP_PRECIO_ARS_ANUAL (anual).
// =============================================================================
export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Método no permitido.' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
  function numero(valor) {
    const n = Number(valor);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return new Response(
    JSON.stringify({ ars: { mensual: numero(env.MP_PRECIO_ARS), anual: numero(env.MP_PRECIO_ARS_ANUAL) } }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    }
  );
}
