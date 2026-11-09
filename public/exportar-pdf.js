/* =============================================================================
   exportar-pdf.js — Exportar a PDF (función exclusiva de Premium)
   =============================================================================
   Lo usan resumen.html y traductor.html. Necesita jsPDF cargado antes
   (window.jspdf). Qué hace:
     · Arma el PDF con los colores de PuroTexto.
     · Si la persona no es Premium, no descarga nada y muestra un aviso con
       el enlace a Precios.
     · Si el texto tiene un idioma que el PDF todavía no soporta (chino,
       japonés, ruso...), lo avisa en vez de generar un PDF con símbolos rotos.

   Uso desde una página:
     var pdf = PuroTextoPDF.crearBoton({ boton: ..., etiqueta: ..., aviso: ... });
     pdf.actualizar({
       esPremium: true/false,
       titulo: 'Resumen',
       subtitulo: 'Largo: Medio',
       secciones: [{ titulo: 'Texto resumido', texto: '...' }],
       nombreArchivo: 'purotexto-resumen'
     });
   ========================================================================== */
(function () {
  'use strict';

  // Caracteres que el PDF sí puede dibujar con su fuente estándar (Latin-1 y
  // algunos signos tipográficos comunes).
  var NO_SOPORTADO = /[^\u0000-\u00FF\u2018\u2019\u201C\u201D\u2013\u2014\u2026\u20AC\u2022\u2122]/g;
  var ES_LETRA = /\p{L}/u;

  // Estilos propios de la etiqueta "Premium" y del aviso (así no hace falta tocar estilos.css)
  function inyectarEstilos() {
    if (document.getElementById('estilos-exportar-pdf')) return;
    var estilo = document.createElement('style');
    estilo.id = 'estilos-exportar-pdf';
    estilo.textContent =
      '.etiqueta-premium{display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;' +
      'background:var(--terracota,#B84E2E);color:#FFF;font-size:.72rem;font-weight:600;letter-spacing:.02em;line-height:1.4}' +
      '.exportar-aviso{margin:12px 0 0;padding:12px 16px;border:1.5px solid rgba(38,75,74,.3);border-radius:12px;' +
      'background:var(--arena,#EADFCB);color:var(--petroleo-oscuro,#1C3A39);font-size:.92rem;line-height:1.5}' +
      '.exportar-aviso a{color:var(--terracota,#B84E2E);font-weight:600}';
    document.head.appendChild(estilo);
  }

  // Revisa el texto. Devuelve { ok:true, texto } o { ok:false } si hay letras de otros alfabetos.
  function prepararTexto(texto) {
    texto = String(texto || '');
    var raros = texto.match(NO_SOPORTADO);
    if (!raros) return { ok: true, texto: texto };
    for (var i = 0; i < raros.length; i++) {
      if (ES_LETRA.test(raros[i])) return { ok: false };
    }
    // Solo símbolos sueltos (emojis, flechas...): se sacan.
    return { ok: true, texto: texto.replace(NO_SOPORTADO, '') };
  }

  // Genera y descarga el PDF. Devuelve 'ok' | 'sin_jspdf' | 'idioma'.
  function generar(datos) {
    if (typeof window.jspdf === 'undefined') return 'sin_jspdf';

    var secciones = [];
    for (var i = 0; i < datos.secciones.length; i++) {
      var revisado = prepararTexto(datos.secciones[i].texto);
      if (!revisado.ok) return 'idioma';
      secciones.push({ titulo: datos.secciones[i].titulo, texto: revisado.texto });
    }
    var subtitulo = prepararTexto(datos.subtitulo || '');
    if (!subtitulo.ok) subtitulo = { ok: true, texto: '' };

    var doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });

    var estiloRaiz = getComputedStyle(document.documentElement);
    function colorVar(nombre, porDefecto) {
      var valor = estiloRaiz.getPropertyValue(nombre).trim();
      return valor || porDefecto;
    }
    function hexARgb(hex) {
      hex = hex.replace('#', '');
      return [parseInt(hex.substring(0, 2), 16), parseInt(hex.substring(2, 4), 16), parseInt(hex.substring(4, 6), 16)];
    }
    function colorear(hex) {
      var rgb = hexARgb(hex);
      doc.setTextColor(rgb[0], rgb[1], rgb[2]);
    }

    var petroleo = colorVar('--petroleo', '#264B4A');
    var textoSuave = colorVar('--texto-suave', '#6B6358');
    var textoColor = colorVar('--texto', '#221E18');

    var anchoPagina = doc.internal.pageSize.getWidth();
    var altoPagina = doc.internal.pageSize.getHeight();
    var margen = 48;
    var anchoUtil = anchoPagina - margen * 2;
    var alturaLinea = 15;
    var y;

    function escribirParrafo(texto, opciones) {
      opciones = opciones || {};
      doc.setFont('helvetica', opciones.negrita ? 'bold' : 'normal');
      doc.setFontSize(opciones.tamano || 11);
      colorear(opciones.color || textoColor);
      var parrafos = String(texto).split(/\n/);
      parrafos.forEach(function (parrafo) {
        if (parrafo.trim() === '') {
          y += alturaLinea * 0.6;
          return;
        }
        doc.splitTextToSize(parrafo, anchoUtil).forEach(function (linea) {
          if (y + alturaLinea > altoPagina - margen) {
            doc.addPage();
            y = margen;
          }
          doc.text(linea, margen, y);
          y += opciones.alturaLinea || alturaLinea;
        });
      });
    }

    // Encabezado
    var rgbPetroleo = hexARgb(petroleo);
    doc.setFillColor(rgbPetroleo[0], rgbPetroleo[1], rgbPetroleo[2]);
    doc.rect(0, 0, anchoPagina, 86, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('PuroTexto', margen, 42);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.text(datos.titulo, margen, 62);

    y = 118;
    var fecha = new Date();
    var detalle = 'Generado el ' + fecha.toLocaleString('es-AR', { dateStyle: 'long', timeStyle: 'short' });
    if (subtitulo.texto) detalle += '  ·  ' + subtitulo.texto;
    escribirParrafo(detalle, { color: textoSuave, tamano: 9 });
    y += 10;
    doc.setDrawColor(rgbPetroleo[0], rgbPetroleo[1], rgbPetroleo[2]);
    doc.setLineWidth(0.75);
    doc.line(margen, y, anchoPagina - margen, y);
    y += 26;

    secciones.forEach(function (seccion) {
      escribirParrafo(seccion.titulo, { negrita: true, tamano: 12, color: petroleo });
      y += 4;
      escribirParrafo(seccion.texto, { color: textoColor });
      y += 20;
    });

    // Pie en cada hoja
    var total = doc.internal.getNumberOfPages();
    for (var p = 1; p <= total; p++) {
      doc.setPage(p);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      colorear(textoSuave);
      doc.text('PuroTexto — purotexto.com', margen, altoPagina - 24);
      doc.text('Página ' + p + ' de ' + total, anchoPagina - margen, altoPagina - 24, { align: 'right' });
    }

    doc.save((datos.nombreArchivo || 'purotexto') + '-' + fecha.toISOString().slice(0, 10) + '.pdf');
    return 'ok';
  }

  // Conecta el botón: controla la etiqueta, el aviso y la descarga.
  function crearBoton(elementos) {
    inyectarEstilos();
    var boton = elementos.boton;
    var etiqueta = elementos.etiqueta;
    var aviso = elementos.aviso;
    var actual = null;

    function ocultarAviso() {
      if (aviso) aviso.hidden = true;
    }
    function mostrarAviso(texto, conEnlacePremium) {
      if (!aviso) return;
      aviso.textContent = texto;
      if (conEnlacePremium) {
        aviso.appendChild(document.createTextNode(' '));
        var enlace = document.createElement('a');
        enlace.href = 'precios.html';
        enlace.textContent = 'Ver Premium';
        aviso.appendChild(enlace);
      }
      aviso.hidden = false;
      aviso.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    if (boton) {
      boton.addEventListener('click', function () {
        if (!actual) return;
        if (!actual.esPremium) {
          mostrarAviso('Exportar a PDF es una función exclusiva del plan Premium.', true);
          return;
        }
        var resultado = generar(actual);
        if (resultado === 'sin_jspdf') {
          mostrarAviso('No pudimos cargar el generador de PDF. Revisá tu conexión y probá de nuevo.', false);
        } else if (resultado === 'idioma') {
          mostrarAviso('Por ahora el PDF no admite este idioma (por ejemplo chino, japonés o ruso). Usá el botón Copiar para llevarte el texto.', false);
        } else {
          ocultarAviso();
        }
      });
    }

    return {
      // Llamar cada vez que aparece un resultado nuevo.
      actualizar: function (datos) {
        actual = datos;
        if (etiqueta) etiqueta.hidden = !!datos.esPremium;
        ocultarAviso();
      }
    };
  }

  window.PuroTextoPDF = { crearBoton: crearBoton };
})();
