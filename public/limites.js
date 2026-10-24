/* ==========================================================================
   PuroTexto · Límites de uso (Freemium)
   Módulo compartido por todas las herramientas con IA.

   Anónimo ........ 3 análisis por día  (se cuenta en localStorage)
   Registrado ..... 10 análisis por día (se cuenta en Supabase, tabla user_usage)
   Premium ........ ilimitado           (profiles.is_premium = true)

   Requisitos en cada página:
     1. <script src="/limites.js?v=1" defer></script>
     2. Que la página exponga el cliente de Supabase: window.supabaseClient
     3. Llamar a PuroTextoLimites.init({ campo, boton }) una vez
     4. Antes de analizar:  await PuroTextoLimites.puedeAnalizar()
        Después de un análisis exitoso:  PuroTextoLimites.registrarAnalisis()

   IMPORTANTE: este control corre en el navegador, así que sirve para la
   experiencia de usuario pero NO frena a alguien que llame directo a /api/*.
   Para proteger de verdad la cuota de Gemini hay que validar también en el
   servidor (las funciones de /api).
   ========================================================================== */
(function () {
  'use strict';

  var CONFIG = {
    limiteAnonimo: 3,
    limiteRegistrado: 10,                       // mismo valor que limite_diario_registrado() en limites.sql
    zonaHoraria: 'America/Argentina/Buenos_Aires', // mismo valor que dia_actual() en limites.sql
    claveStorage: 'purotexto_uso',
    paginaPrecios: '/precios'
  };

  var estado = {
    sesion: false,     // ¿hay usuario logueado?
    premium: false,
    usados: 0,
    limite: CONFIG.limiteAnonimo,
    error: false,      // true si no pudimos consultar a Supabase (no bloqueamos al usuario)
    listo: false
  };

  var ui = { banner: null, panel: null, textoPanel: null, btnRegistro: null };
  var iniciado = false;

  /* ------------------------------------------------------------------------
     Fecha de hoy (AAAA-MM-DD) en la zona horaria del sitio
     ------------------------------------------------------------------------ */
  function hoy() {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: CONFIG.zonaHoraria, year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(new Date());
    } catch (e) {
      return new Date().toISOString().slice(0, 10);
    }
  }

  /* ------------------------------------------------------------------------
     Conteo anónimo en localStorage (con respaldo en memoria si el navegador
     bloquea el almacenamiento, por ejemplo en modo privado)
     ------------------------------------------------------------------------ */
  var respaldoMemoria = null;

  function leerAnonimo() {
    var dia = hoy();
    var datos = null;
    try { datos = JSON.parse(localStorage.getItem(CONFIG.claveStorage)); } catch (e) { datos = null; }
    if (!datos) datos = respaldoMemoria;
    if (!datos || datos.dia !== dia || typeof datos.n !== 'number' || !(datos.n >= 0)) {
      datos = { dia: dia, n: 0 };
    }
    return datos;
  }

  function guardarAnonimo(datos) {
    respaldoMemoria = datos;
    try { localStorage.setItem(CONFIG.claveStorage, JSON.stringify(datos)); } catch (e) { /* sin almacenamiento */ }
  }

  /* ------------------------------------------------------------------------
     Supabase
     ------------------------------------------------------------------------ */
  function cliente() {
    return window.supabaseClient || null;
  }

  function aplicarRespuestaServidor(r) {
    estado.sesion = true;
    estado.error = false;
    estado.premium = !!r.premium;
    estado.usados = r.usados || 0;
    estado.limite = r.limite || CONFIG.limiteRegistrado;
  }

  // Lee el estado actual (sesión + conteo) y actualiza el cartel de estado.
  async function refrescar() {
    var sb = cliente();
    var sesion = null;

    if (sb) {
      try {
        var resultado = await sb.auth.getSession();
        sesion = resultado && resultado.data && resultado.data.session;
      } catch (e) { sesion = null; }
    }

    if (sesion) {
      try {
        var rpc = await sb.rpc('obtener_uso');
        if (rpc.error || !rpc.data) throw (rpc.error || new Error('sin datos'));
        aplicarRespuestaServidor(rpc.data);
      } catch (e) {
        // Si Supabase falla no le cortamos el uso al usuario: dejamos pasar.
        estado.sesion = true;
        estado.error = true;
      }
    } else {
      estado.sesion = false;
      estado.error = false;
      estado.premium = false;
      estado.limite = CONFIG.limiteAnonimo;
      estado.usados = leerAnonimo().n;
    }

    estado.listo = true;
    pintarBanner();
    return estado;
  }

  function restantes() {
    if (estado.premium) return Infinity;
    return Math.max(estado.limite - estado.usados, 0);
  }

  /* ------------------------------------------------------------------------
     Interfaz: cartel "Te quedan X análisis hoy" y aviso de límite alcanzado
     ------------------------------------------------------------------------ */
  function pintarBanner() {
    if (!ui.banner) return;

    if (!estado.listo || estado.error) {
      ui.banner.hidden = true;
      return;
    }

    var n = restantes();
    ui.banner.classList.toggle('uso-estado--premium', estado.premium);
    ui.banner.classList.toggle('uso-estado--agotado', !estado.premium && n === 0);

    if (estado.premium) {
      ui.banner.textContent = 'Análisis ilimitados';
    } else if (n === 0) {
      ui.banner.textContent = 'Llegaste al límite de análisis de hoy';
    } else if (n === 1) {
      ui.banner.textContent = 'Te queda 1 análisis hoy';
    } else {
      ui.banner.textContent = 'Te quedan ' + n + ' análisis hoy';
    }
    ui.banner.hidden = false;

    // Si ya hay cupo (por ejemplo porque se logueó o pasó la medianoche), se oculta el aviso.
    if (ui.panel && (estado.premium || n > 0)) ui.panel.hidden = true;
  }

  function abrirRegistro() {
    var btnAuth = document.getElementById('btn-auth');
    var tabRegistro = document.getElementById('tab-registro');
    if (btnAuth) btnAuth.click();       // abre el modal de cuenta
    if (tabRegistro) tabRegistro.click(); // lo deja en "Crear cuenta"
  }

  function mostrarLimite() {
    if (!ui.panel) return;
    if (estado.sesion) {
      ui.textoPanel.textContent = 'Actualizá a Premium para uso ilimitado. Tu cupo gratuito se renueva mañana.';
      ui.btnRegistro.hidden = true;
    } else {
      ui.textoPanel.textContent = 'Registrate gratis para tener más, o actualizá a Premium para uso ilimitado.';
      ui.btnRegistro.hidden = false;
    }
    ui.panel.hidden = false;
    try { ui.panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { /* navegador viejo */ }
  }

  function crear(etiqueta, clase, texto) {
    var el = document.createElement(etiqueta);
    if (clase) el.className = clase;
    if (texto) el.textContent = texto;
    return el;
  }

  function montarInterfaz(opciones) {
    // Cartel de estado: arriba del cuadro de texto
    ui.banner = crear('p', 'uso-estado');
    ui.banner.id = 'uso-estado';
    ui.banner.setAttribute('role', 'status');
    ui.banner.setAttribute('aria-live', 'polite');
    ui.banner.hidden = true;

    var campo = opciones.campo;
    var anclaCampo = (campo && campo.closest && campo.closest('.caja-escritura')) || campo;
    if (anclaCampo && anclaCampo.parentNode) {
      anclaCampo.parentNode.insertBefore(ui.banner, anclaCampo);
    }

    // Aviso de límite alcanzado: debajo del botón de acción
    ui.panel = crear('div', 'uso-limite');
    ui.panel.setAttribute('role', 'alert');
    ui.panel.hidden = true;

    var texto = crear('p', 'uso-limite-texto');
    texto.appendChild(crear('strong', '', 'Llegaste al límite de análisis de hoy. '));
    ui.textoPanel = crear('span');
    texto.appendChild(ui.textoPanel);

    var acciones = crear('div', 'uso-limite-acciones');
    ui.btnRegistro = crear('button', 'boton-principal', 'Registrarme gratis');
    ui.btnRegistro.type = 'button';
    ui.btnRegistro.addEventListener('click', abrirRegistro);

    var enlacePremium = crear('a', 'boton-secundario', 'Ver Premium');
    enlacePremium.href = CONFIG.paginaPrecios;

    acciones.appendChild(ui.btnRegistro);
    acciones.appendChild(enlacePremium);
    ui.panel.appendChild(texto);
    ui.panel.appendChild(acciones);

    var boton = opciones.boton;
    var anclaBoton = (boton && boton.closest && boton.closest('.accion-contenedor')) || boton;
    if (anclaBoton && anclaBoton.parentNode) {
      anclaBoton.parentNode.insertBefore(ui.panel, anclaBoton.nextSibling);
    }
  }

  /* ------------------------------------------------------------------------
     API pública
     ------------------------------------------------------------------------ */

  // Se llama una vez al cargar la herramienta.
  function init(opciones) {
    if (iniciado) return;
    iniciado = true;
    montarInterfaz(opciones || {});
    refrescar();

    // Si el usuario inicia o cierra sesión, se vuelve a consultar.
    var sb = cliente();
    if (sb && sb.auth && sb.auth.onAuthStateChange) {
      sb.auth.onAuthStateChange(function () {
        // Se difiere para no llamar a Supabase dentro del propio callback de auth.
        setTimeout(refrescar, 0);
      });
    }
    // Si abre otra pestaña y gasta análisis, esta se entera.
    window.addEventListener('storage', function (e) {
      if (e.key === CONFIG.claveStorage) refrescar();
    });
  }

  // Antes de analizar. Devuelve { permitido: true|false }.
  // Si no hay cupo, muestra el aviso con los botones de registro / Premium.
  async function puedeAnalizar() {
    await refrescar();
    if (estado.error || estado.premium || restantes() > 0) {
      return { permitido: true };
    }
    mostrarLimite();
    return { permitido: false };
  }

  // Después de un análisis exitoso: descuenta uno.
  async function registrarAnalisis() {
    if (estado.sesion && !estado.error) {
      var sb = cliente();
      try {
        var rpc = await sb.rpc('consumir_analisis');
        if (rpc.error || !rpc.data) throw (rpc.error || new Error('sin datos'));
        if (rpc.data.premium) {
          estado.premium = true;
        } else {
          estado.usados = rpc.data.usados;
          estado.limite = rpc.data.limite;
        }
        pintarBanner();
      } catch (e) {
        refrescar();
      }
      return;
    }

    if (!estado.sesion) {
      var datos = leerAnonimo();
      datos.n += 1;
      guardarAnonimo(datos);
      estado.usados = datos.n;
      pintarBanner();
    }
  }

  window.PuroTextoLimites = {
    init: init,
    puedeAnalizar: puedeAnalizar,
    registrarAnalisis: registrarAnalisis
  };
})();
