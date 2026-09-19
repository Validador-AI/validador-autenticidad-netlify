# Validador de Autenticidad de Texto (versión Netlify)

Pegás un texto y te dice si suena humano o a IA, con las frases que lo delatan y cómo reescribirlas.

## Qué hay en cada archivo

| Archivo | Para qué sirve |
|---|---|
| `public/index.html` | La página que ve la gente (diseño y botones). |
| `netlify/functions/analizar.mjs` | El intermediario que habla con Gemini usando tu clave secreta. Responde en `/api/analizar`. |
| `netlify.toml` | Le dice a Netlify dónde está la página (`public`) y dónde las funciones (`netlify/functions`). |
| `package.json` | Archivo mínimo, no lleva dependencias. |

Las carpetas `public` y `netlify` tienen que llamarse exactamente así.

## Publicar (resumen)

1. Conseguí la clave gratis en https://aistudio.google.com/apikey ("Create API key").
2. Subí esta carpeta a un repositorio de GitHub (arrastrando los archivos desde el navegador).
3. En https://app.netlify.com: **Add new project > Import an existing project > GitHub**, y elegí el repositorio.
4. En la pantalla de configuración, verificá: Build command vacío, Publish directory `public`.
5. Abrí **Environment variables** y agregá `GEMINI_API_KEY` con tu clave (empieza con `AIza...`). El alcance (scope) tiene que incluir **Functions**.
6. Apretá **Deploy** y abrí la dirección que te da Netlify (algo como `nombre-al-azar.netlify.app`).

## Si cambiás la clave o una variable

Los valores quedan fijos en cada despliegue. Después de cambiarlos: **Deploys > Trigger deploy > Deploy project without cache** (los nombres pueden variar un poco).

## Variable opcional: cambiar de modelo

Si Google da de baja el modelo actual, creá otra variable:

- Name: `GEMINI_MODEL`
- Value: un modelo vigente de https://ai.google.dev/gemini-api/docs/models (por ejemplo `gemini-3.6-flash`)

Y volvé a desplegar. No hace falta tocar el código.

## Cómo probar que funciona

1. Abrí la dirección de tu sitio en Netlify.
2. Apretá "Usar un texto de ejemplo" y después "Analizar texto".
3. Tiene que aparecer un puntaje bajo (el ejemplo suena a IA) y varias frases con sugerencias.
4. Prueba técnica extra: abrí `TU-SITIO.netlify.app/api/analizar` en el navegador. Si ves "Método no permitido", la función está bien desplegada.

## Si algo falla

| Mensaje o síntoma | Qué hacer |
|---|---|
| "El servidor todavía no tiene configurada la clave" | Falta `GEMINI_API_KEY`, no incluye el alcance **Functions**, o la agregaste y no volviste a desplegar. |
| "La clave de Gemini no es válida" | Copiala de nuevo desde AI Studio, sin espacios al principio ni al final. |
| "El modelo ... no existe o fue dado de baja" | Usá la variable `GEMINI_MODEL` con un modelo vigente. |
| "Se alcanzó el límite de uso gratuito" | Esperá un minuto. Si pasa seguido, el uso supera la capa gratuita de Gemini. |
| Error 404 en `/api/analizar` | Revisá que el archivo esté en `netlify/functions/analizar.mjs` y que Netlify muestre la función en **Logs > Functions**. |
| La página muestra "Site not available" | Se gastaron los 300 créditos mensuales del plan gratuito de Netlify (se reinician cada mes). |

Los detalles técnicos de cada error quedan en Netlify > tu sitio > **Logs > Functions**.

## Cuidar la clave

- La clave solo vive en Netlify (variable de entorno). No está en ningún archivo.
- Al cargarla, marcá la opción de valor secreto ("Contains secret values") si aparece.
- Nunca la pegues en `index.html`, en `netlify.toml`, en el repositorio, en capturas ni en chats.
- Si sospechás que se filtró: en AI Studio borrala y creá una nueva, actualizá la variable en Netlify y volvé a desplegar.

## Tené en cuenta

- El texto que pegan las personas viaja a Google. En la capa gratuita, Google puede usar esos contenidos para mejorar sus productos. Por eso la página avisa que no se pegue información confidencial.
- Este tipo de análisis es una estimación, no una prueba. Puede equivocarse en ambos sentidos.
- El plan gratuito de Netlify tiene 300 créditos por mes. Si se agotan, el sitio se pausa hasta el mes siguiente.
