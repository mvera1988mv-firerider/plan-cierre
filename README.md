# Plan de Cierre · instalación

App para Mac, Windows, iPhone y Honor 600. Es una sola app web instalable: se abre con su propio ícono y ventana, funciona sin señal con el último dato guardado y se actualiza sola.

## Cómo está armada

- **App** (`web/`): se publica en GitHub Pages en `https://mvera1988mv-firerider.github.io/plan-cierre/`.
- **Servidor** (`gas/Code.gs`): un proyecto de Google Apps Script en tu cuenta.
  - Lee la hoja MASTER completa del pipeline, aunque tenga filtros activos, y el tablero de monday con tu token.
  - Guarda lo que registras en la hoja "Plan Cierre - Datos de la app" de tu Drive.
  - Envía los correos de las 8:10 y 17:40 en días hábiles.
  - No escribe en el pipeline ni en monday.

## Pasos (una sola vez, unos 15 minutos)

1. **Repositorio:** crea en GitHub un repositorio público vacío llamado `plan-cierre` en la cuenta `mvera1988mv-firerider`. Avisa a Claude para que suba la app y active GitHub Pages.
2. **Token de monday:** en monday, haz clic en tu foto › Developers › My access tokens › Copy.
3. **Proyecto de Apps Script:** en https://script.google.com, crea un **Nuevo proyecto** y llámalo "Plan de Cierre". Borra el contenido de `Code.gs` y pega el archivo `gas/Code.gs`. Guarda.
4. **Propiedad del script:** haz clic en el engranaje (Configuración del proyecto) › Propiedades del script › Agregar propiedad. Usa `MONDAY_TOKEN` como nombre y el token como valor. Guarda.
5. **Ejecutar setup:** vuelve al editor, elige la función `setup` y presiona **Ejecutar**. Autoriza; si Google dice que la app no está verificada, entra a Configuración avanzada › Ir a Plan de Cierre. En el registro de ejecución deben aparecer las filas del pipeline, las ofertas de monday y la clave de la app.
6. **Implementar:** ve a Implementar › Nueva implementación › tipo **Aplicación web**. Configura Ejecutar como **Yo** y Quién tiene acceso **Cualquier usuario**, y presiona Implementar.
7. **Enlace de configuración:** elige la función `enviarEnlaceConfiguracion` y presiona Ejecutar. Te llega un correo con el enlace que configura cada equipo.
8. **Instalar en cada equipo:** abre ese enlace en el equipo y haz lo siguiente:
   - **iPhone:** en Safari, Compartir › Agregar a inicio.
   - **Honor 600:** en Chrome, menú ⋮ › Instalar app (o Agregar a pantalla principal).
   - **Mac y Windows:** en Chrome o Edge, usa el ícono de instalar al final de la barra de direcciones.

## Seguridad

La dirección del servidor y la clave dan acceso a tus oportunidades del pipeline. Por eso:

- No reenvíes el correo de configuración.
- Si la clave se filtra, borra la propiedad `API_KEY` en Propiedades del script, vuelve a ejecutar `setup` y luego `enviarEnlaceConfiguracion`.

## Actualizar el servidor

Si Claude te entrega un `Code.gs` nuevo:

1. Pega el archivo nuevo y guarda.
2. Ve a Implementar › Gestionar implementaciones › editar (lápiz) › Versión: Nueva versión › Implementar.

La dirección del servidor no cambia.
