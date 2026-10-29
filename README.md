# ABS Entrenamiento

App única de entrenador y deportistas (une las antiguas ABS Seco y ABS Entrenamiento): perfiles individuales (nombre + PIN) y **grupos**, sesiones de fuerza, natación y carrera, planes predeterminados, biblioteca de ejercicios y carga de entrenamiento por sRPE (RPE × minutos).

## Grupos

- En la pestaña **Grupos** se crea el grupo y se copia su enlace (`…/?g=CÓDIGO`). Todo el grupo ve las mismas sesiones; cada persona entra con su nombre y su PIN y registra sus propios kilos, RPE y comentarios.
- Quien no está en la lista puede unirse desde el enlace (nombre + PIN). Si el entrenador crea a alguien sin PIN, lo elige esa persona la primera vez que entra.
- Los kilos y comentarios de fuerza se copian también en las pestañas *Registro* y *Comentarios* con el formato de ABS Seco, así que el resumen y el tablero siguen funcionando.
- Vídeos recortados: `watch?v=ID&start=50&end=60` reproduce ese tramo en bucle.

## Cómo está organizado

| Carpeta / archivo | Qué contiene |
|---|---|
| `docs/index.html` | La página. Aquí está la dirección del Apps Script (`window.ABS_API`). |
| `docs/styles.css` | Colores, tipografías y aspecto. Los colores principales están al principio (`--accent`, `--hero1`…). |
| `docs/app.js` | Toda la lógica de la app. |
| `docs/inicial.json` | Biblioteca inicial (ejercicios de fuerza con vídeo, calentamientos de natación y dos planes High Force). Se carga una vez desde la pestaña Biblioteca. |
| `apps-script/Codigo.gs` | El código que va en Extensiones → Apps Script de la hoja de Google. |
| `test/` | Pruebas automáticas (simulan la hoja de Google). |

Los datos (deportistas, sesiones, planes, biblioteca, registros y carga) no están aquí: se guardan en la hoja de Google **ABS Seco · Registro de cargas**, en las pestañas *Datos*, *Carga* y *Config*.

## Cambios rápidos

- **Colores:** `docs/styles.css`, primeras líneas.
- **Categorías de la biblioteca:** `docs/app.js`, constante `CATS`.
- **Deportes y sus colores:** `docs/app.js`, constante `DEP`.
- **Escala de RPE:** `docs/app.js`, constante `RPE_TXT`.

Para editar un archivo en GitHub: ábrelo, pulsa el lápiz ✏️, cambia el texto y pulsa **Commit changes**. Netlify publica el cambio solo en uno o dos minutos.

## Si cambias el Apps Script

Pega `apps-script/Codigo.gs` en el editor de Apps Script y publica con **Implementar → Gestionar implementaciones → High Force → lápiz → Versión: nueva versión**. Nunca "Nueva implementación", porque cambiaría la URL.
