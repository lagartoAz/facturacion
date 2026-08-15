# Guía de instalación — Facturación en red (varias terminales)

Sistema: **1 PC servidor** (guarda la base de datos) + **varias terminales de acceso**
que se conectan por la red local. Todas comparten inventario, ventas, caja y proveedores
en tiempo real.

---

## Antes de empezar (requisitos)

- Todos los equipos en la **misma red** (mismo router/switch, por cable o WiFi).
- El **PC servidor** debe quedar encendido mientras se trabaja.
- Tener los dos instaladores:
  - **Servidor**: `Facturacion POS` (el de siempre) → carpeta `dist/`
  - **Acceso**: `Facturacion Acceso` → carpeta `dist-client/`

> Para generarlos (en la PC de desarrollo):
> ```
> npm run dist          → servidor  (dist/)
> npm run dist:client   → accesos   (dist-client/)
> ```

---

## PARTE A — Configurar el PC SERVIDOR (una sola vez)

### A1. Instalar
Ejecuta el instalador **Facturacion POS** en el PC principal y ábrelo. Este equipo ya
tiene toda la base de datos.

### A2. Fijar la dirección IP del servidor
Para que las terminales siempre lo encuentren, su IP no debe cambiar. Dos opciones:

**Opción fácil (recomendada): reservar la IP en el router**
1. Entra al router (normalmente `192.168.1.1` o `192.168.0.1` en el navegador).
2. Busca *DHCP → Reserva de IP / IP fija por dispositivo*.
3. Asigna una IP fija al PC servidor (ej. `192.168.1.50`).

**Ver la IP actual del servidor:** abre `CMD` y escribe:
```
ipconfig
```
Anota el número de **Dirección IPv4** (ej. `192.168.1.50`). Esa es la que usarán las terminales.

### A3. Poner la clave de acceso
1. En la app del servidor: **Configuración → Red / Multi-terminal**.
2. Escribe una **Clave de acceso** (ej. `ferreteria2026`).
3. Deja el **Puerto** en `47600` (salvo que sepas que está ocupado).
4. Marca **"Compartir la base de datos con otras terminales"** y pulsa **Guardar y aplicar**.
5. Verás el punto verde: *"Servidor activo, escuchando en el puerto 47600"* y las direcciones IP para las terminales.

### A4. Abrir el puerto en el Firewall de Windows
Abre **CMD como administrador** (clic derecho → *Ejecutar como administrador*) y pega:
```
netsh advfirewall firewall add rule name="Facturacion POS" dir=in action=allow protocol=TCP localport=47600
```
Debe responder `Aceptar.` / `Ok.`

> El PC servidor ya está listo. Anota: **IP del servidor** + **Clave de acceso**.

---

## PARTE B — Configurar CADA TERMINAL de acceso

Repite estos pasos en cada PC que será terminal:

### B1. Instalar
Ejecuta **Facturacion Acceso** (instalador de `dist-client/`) y ábrelo.

### B2. Conectar
Al abrir aparece la pantalla **"Terminal de Acceso"**:
1. **Dirección IP del servidor**: la que anotaste (ej. `192.168.1.50`).
2. **Clave de acceso**: la misma del servidor (ej. `ferreteria2026`).
3. Pulsa **Conectar**.

Si todo está bien, entra directamente a la app y ya comparte los datos del servidor.
La terminal recuerda la conexión y reconecta sola la próxima vez.

### B3. Configurar la impresora (por terminal)
Cada terminal imprime con su propia impresora:
**Configuración → Impresora →** elige la impresora y guarda.

---

## Verificar que funciona

1. En una terminal, abre **Productos**: deben aparecer los mismos productos del servidor.
2. Haz una venta de prueba en la terminal.
3. En el servidor, abre **Facturas**: la venta debe aparecer al instante.

---

## Problemas frecuentes

| Síntoma | Solución |
|---|---|
| *"No se pudo conectar al servidor"* | Verifica que el servidor esté encendido y con la app abierta; que la IP sea la correcta (`ipconfig`); y que hiciste el paso del Firewall (A4). |
| *"Clave de acceso incorrecta"* | La clave de la terminal debe ser **idéntica** a la del servidor (mayúsculas/minúsculas cuentan). |
| La terminal conectaba y dejó de conectar | Probablemente cambió la IP del servidor. Fíjala en el router (A2) y actualízala en la terminal: **Configuración → Red / Multi-terminal → Reconectar**. |
| Cambié el puerto o la clave en el servidor | Vuelve a correr el comando del Firewall si cambiaste el **puerto**, y actualiza la clave en cada terminal. |

---

## Cosas importantes a recordar

- **El servidor debe estar encendido** para que las terminales funcionen. Si se apaga, las terminales no pueden vender hasta que vuelva.
- Los **respaldos** siguen siendo automáticos en el servidor (cada cambio + cada hora, últimos 50) y, si algo se daña, se restaura solo al iniciar.
- Las **fotos de productos** se guardan dentro de la base de datos del servidor. Se pueden
  agregar y ver desde cualquier terminal de acceso (incluida la versión USB), y viajan con
  los respaldos: al restaurar la base en otro equipo las fotos siguen ahí.
- Recomendado: deja la base de datos del servidor en el **disco interno** (no en USB) y usa el USB solo para respaldos.
