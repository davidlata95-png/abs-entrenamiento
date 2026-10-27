# ABS Entrenamiento

App de entrenador y deportistas: perfiles (nombre + PIN), sesiones de fuerza, natación y carrera, planes predeterminados, biblioteca de ejercicios y carga de entrenamiento por sRPE (RPE × minutos).

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
