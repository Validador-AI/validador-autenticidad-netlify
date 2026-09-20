# Validador de Autenticidad de Texto (versión Netlify, con subida de archivos)

Pegás un texto, o subís un PDF o un Word (.docx), y te dice si suena humano o a IA, con las frases que lo delatan y cómo reescribirlas.

## Qué hay en cada archivo

| Archivo | Para qué sirve |
|---|---|
| `public/index.html` | La página que ve la gente (diseño, botones y subida de archivos). |
| `netlify/functions/analizar.mjs` | El intermediario: lee el archivo, extrae el texto y habla con Gemini usando tu clave secreta. Responde en `/api/analizar`. |
| `netlify.toml` | Le dice a Netlify dónde está la página (`public`), dónde las funciones (`netlify/functions`) y qué versión de Node usar. |
| `package.json` | Lista las dos librerías que usa el proyecto. |
| `package-lock.json` | Fija las versiones exactas de esas librerías. No lo edites ni lo borres. |

Las carpetas `public` y `netlify` tienen que llamarse exactamente así.

## Librerías

- **unpdf** (1.8.1): lee el texto de los PDF. Funciona en servidores como los de Netlify, sin programas extra.
- **mammoth** (1.12.3): lee el texto de los archivos Word (.docx).

No tenés que instalar nada: Netlify las descarga solo al desplegar.

## Cómo actualizar tu sitio (si ya lo tenías publicado)

1. Descomprimí el ZIP nuevo.
2. En tu repositorio de GitHub, hacé clic en **Add file > Upload files**.
3. Arrastrá los archivos y carpetas: `netlify.toml`, `package.json`, `package-lock.json`, `README.md`, la carpeta `public` y la carpeta `netlify`. Los que ya existen se reemplazan.
4. Hacé clic en **Commit changes**.
5. Netlify detecta el cambio y vuelve a desplegar solo. Esperá uno o dos minutos.

La variable `GEMINI_API_KEY` ya está cargada en Netlify: no hay que tocarla.

## Cómo funciona la subida de archivos

- Formatos: PDF y Word (.docx). No se pueden leer los .doc viejos.
- Tamaño máximo: 4 MB (Netlify no deja pasar pedidos de más de unos 6 MB).
- El archivo se lee en la memoria del servidor y no se guarda.
- Se analizan hasta los primeros 8000 caracteres. Si el archivo es más largo, la página avisa.
- Los PDF tienen que tener texto que se pueda seleccionar. Los PDF escaneados (fotos de páginas) no se pueden leer: la página lo avisa y sugiere pegar el texto.
- Los PDF con contraseña se rechazan con un mensaje claro.
- El servidor mira el contenido real del archivo, no solo el nombre: cambiarle la extensión no sirve para colarlo.

## Cómo probar que funciona

1. Abrí la dirección de tu sitio en Netlify.
2. Probá el modo "Pegar texto": "Usar un texto de ejemplo" y "Analizar texto".
3. Cambiá a "Subir archivo", elegí un PDF o un Word con texto y apretá "Analizar texto".
4. Probá subir un PDF escaneado o una foto renombrada a .pdf: tienen que aparecer mensajes claros, no una pantalla rota.

## Si algo falla

| Mensaje o síntoma | Qué hacer |
|---|---|
| "No encontramos texto en este PDF" | Es un PDF escaneado. Pegá el texto, o pasalo por un programa de OCR y volvé a subirlo. |
| "El archivo es muy grande" | Pesa más de 4 MB. Subí solo el fragmento que te interesa. |
| "No pudimos leer este PDF / documento" | Puede estar dañado. Abrilo y guardalo de nuevo, o pegá el texto. |
| La subida falla pero pegar texto funciona | Mirá en Netlify > **Deploys** si el último despliegue terminó bien (un error al instalar las librerías sale ahí). |
| "El servidor todavía no tiene configurada la clave" | Falta `GEMINI_API_KEY`, no incluye el alcance **Functions**, o la agregaste y no volviste a desplegar. |
| "La clave de Gemini no es válida" | Copiala de nuevo desde AI Studio, sin espacios al principio ni al final. |
| "El modelo ... no existe o fue dado de baja" | Creá la variable `GEMINI_MODEL` con un modelo vigente y volvé a desplegar. |
| "Se alcanzó el límite de uso gratuito" | Esperá un minuto. Si pasa seguido, el uso supera la capa gratuita de Gemini. |
| La página muestra "Site not available" | Se gastaron los 300 créditos mensuales del plan gratuito de Netlify (se reinician cada mes). |

Los detalles técnicos de cada error quedan en Netlify > tu sitio > **Logs > Functions**.

## Cuidar la clave

- La clave solo vive en Netlify (variable de entorno). No está en ningún archivo.
- Nunca la pegues en `index.html`, en `netlify.toml`, en el repositorio, en capturas ni en chats.
- Si sospechás que se filtró: en AI Studio borrala y creá una nueva, actualizá la variable en Netlify y volvé a desplegar.

## Tené en cuenta

- El texto (pegado o extraído de un archivo) viaja a Google. En la capa gratuita, Google puede usar esos contenidos para mejorar sus productos. Por eso la página avisa que no se suba información confidencial.
- Este tipo de análisis es una estimación, no una prueba. Puede equivocarse en ambos sentidos.
- El plan gratuito de Netlify tiene 300 créditos por mes. Si se agotan, el sitio se pausa hasta el mes siguiente.
