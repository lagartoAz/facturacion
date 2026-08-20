# Plan de port a Android (APK) — Facturación POS

Estado: **Fase 0 ✅ + Fase 1 (código) ✅** — falta compilar el APK con Android SDK, probar
en dispositivo, Fase 2 (Android servidor) y Fase 3 (impresión). Ver `ANDROID_BUILD.md`.
Arquitectura elegida: **Opción 2 — Node.js embebido (`nodejs-mobile`) + Capacitor** para
reutilizar el backend Node actual casi intacto y mantener **un solo código**.

## 1. Objetivo

Distribuir la app en Android como **dos APKs**, igual que hoy en Windows:

- **Facturación POS (base principal / servidor)**: guarda la base de datos y atiende a las terminales.
- **Facturación Acceso (cliente / terminal)**: sin base de datos; se conecta a un servidor por WiFi.

Requisitos confirmados:
- La **base de datos puede vivir en PC (Windows) o en un Android**, a elección del cliente.
  Un cliente sin PC debe poder usar un Android como servidor.
- La **impresión se elige dentro de la app**: Bluetooth o Red/WiFi (ambas ESC/POS).

## 2. Cómo se mapea Electron → Android

Hoy en Electron hay dos procesos: `renderer` (React, la UI) y `main` (Node: servicios + DB + servidor
`/rpc`). En Android replicamos ese mismo modelo:

| Concepto Electron | En Android (Opción 2) |
|---|---|
| `renderer` (React) | **Capacitor WebView** — mismo React, casi sin cambios |
| `main` (Node) del **servidor** | **`nodejs-mobile`** corriendo el backend Node dentro del APK |
| `window.api` (preload/IPC) | Capa de transporte HTTP a `/rpc` (misma forma) |
| `better-sqlite3` (nativo) | `node-sqlite3-wasm` en Android, tras un adaptador; `better-sqlite3` sigue en escritorio |
| Servidor `http` `/rpc` :47600 | **Igual**, corre dentro de `nodejs-mobile` |
| Impresión por impresora del SO | **ESC/POS** por Bluetooth o TCP (plugin Capacitor) |
| App en segundo plano | **Foreground service** + exención de batería (solo rol servidor) |

Punto clave: el **cliente Acceso NO necesita `nodejs-mobile`**. Solo es UI + `fetch` al `/rpc` del
servidor. Por eso se hace primero: es simple y se necesita en todos los escenarios.

## 3. Fases

### Fase 0 — Andamiaje Capacitor (base común de ambos APKs)
- Añadir Capacitor (`@capacitor/core`, `@capacitor/cli`, `@capacitor/android`).
- Configurar `capacitor.config.ts` para empaquetar la salida del `renderer` (Vite).
- Ajustar el build del renderer para producir un bundle web independiente de Electron
  (hoy asume `window.api`; ver Fase 1).
- Verificar que la UI abre en un emulador/dispositivo Android (aunque aún sin datos).
- **Entregable:** APK vacío que muestra la UI.

### Fase 1 — Acceso Android (cliente) ✅ prioridad
Objetivo: una terminal Android que se conecta a cualquier servidor (PC **o** Android).

1. **Capa de transporte del `api`.** Hoy `src/preload/index.ts` define `api` sobre
   `ipcRenderer.invoke(canal, ...args)`. Refactor: extraer el mapa **método → canal** a un módulo
   compartido y crear dos transportes:
   - Electron: `ipcRenderer.invoke` (actual).
   - Android/web: `fetch(POST ${host}/rpc, { channel, args }, header X-Auth-Token)`.
   La UI sigue llamando `window.api.getProducts()` sin enterarse del transporte.
2. **Pantalla de conexión** (host, puerto, clave), reutilizando la lógica que ya tiene el cliente
   Windows (`net:clientConnect` → `/auth`). Guardar con `@capacitor/preferences` + autoreconexión.
3. **CORS en el servidor** (`src/main/server/rpc-server.ts`): hoy no envía cabeceras CORS. La WebView
   de Capacitor tiene origen `http://localhost`, así que hay que responder `OPTIONS` (preflight) y
   añadir `Access-Control-Allow-Origin/Headers/Methods` incluyendo `X-Auth-Token`. Cambio pequeño y
   compatible con los clientes Windows actuales.
4. **Canales server-only e impresión**: en el cliente muestran el mismo error amable que ya existe;
   la impresión se implementa en Fase 3.
- **Entregable:** APK "Acceso" que factura contra un servidor Windows existente por WiFi.

### Fase 2 — Android como servidor (base principal)
Objetivo: que un Android guarde la DB y atienda terminales.

1. **Adaptador de base de datos.** ✅ HECHO Y VALIDADO (headless). `src/main/database/mobile-sqlite.ts`
   imita la superficie de `better-sqlite3` (`prepare/get/all/run/exec/pragma/transaction/close`,
   `lastInsertRowid`/`changes`) sobre `node-sqlite3-wasm`. Auditoría: el código usa solo params
   posicionales `?`, sin `pluck/raw/iterate` ni params nombrados; los servicios reciben `db` inyectado,
   así que **no se tocan**. Probado con `scripts/mobile-db-smoketest.ts` contra las **migraciones reales
   (18 versiones)**: esquema, statements reutilizados, transacciones commit/rollback, integridad y
   **persistencia entre procesos** (reinicio de app). Hallazgo crítico: `node-sqlite3-wasm` deja un
   directorio `<db>.lock` huérfano si el proceso muere sin cierre limpio (habitual en Android) → el
   adaptador **borra el lock obsoleto al abrir** (seguro: un solo proceso abre la DB). Desktop sigue con
   `better-sqlite3` intacto. Falta: cablear la selección de motor en el arranque del backend móvil.
2. **Desacoplar Electron + empaquetar en `nodejs-mobile`.** ✅ DESACOPLE HECHO Y VALIDADO (headless).
   `src/main/platform/electron-shim.ts` reimplementa la superficie de `electron` que toca el backend
   (`app` con paths/versión desde Node, `ipcMain` como singleton que `captureHandlers` parchea,
   `BrowserWindow`/`dialog`/`shell` como stubs inertes — solo los usan canales `LOCAL_ONLY` que no se
   invocan en el servidor). El **build móvil hace alias `electron` → shim**; el escritorio conserva el
   Electron real (0 cambios, `npm run build` verde). Entrypoint `src/main/mobile/server-main.ts`:
   `MobileDatabase` + `runMigrations` + `initBackupService` (backups por escritura + horarios, con
   `MobileDatabase.backup()` = copia de archivo) + `captureHandlers(registerAllHandlers)` + `startRpcServer`.
   Validado con `scripts/mobile-server-smoketest.ts` en **Node puro sin Electron**: arranca en :47600,
   `/ping` role=server, `/rpc` (products/categories) recorre servicios→DB móvil, errores de negocio
   propagados, canales no-servibles rechazados. FALTA (device-dependiente): empaquetar realmente en
   `nodejs-mobile` (probable `nodejs-mobile-cordova` en Capacitor) y arrancarlo desde la app.
3. **Ciclo de vida servidor**: `@capacitor-community/...` foreground service + notificación persistente
   + pedir "ignorar optimización de batería". Arrancar/parar el `/rpc` con la app.
4. **Descubrimiento**: mostrar la IP local del Android-servidor en pantalla para que las terminales la
   escriban (mDNS/autodescubrimiento opcional más adelante).
5. **DB opcional PC/Android — UI de rol**: ✅ HECHO Y VALIDADO (end-to-end). Al primer arranque, el
   Android pregunta si es **Servidor** (guarda la DB) o **Terminal** (`RoleSelectScreen.tsx`); si es
   servidor muestra las **IPs de la LAN** para dar a las terminales. `web-api.ts` maneja 3 modos
   (`''`/`server`/`client`), persistidos; en modo servidor la WebView es cliente de `localhost:47600`.
   `create-api.ts` + `App.tsx` integran el rol (`unselected` → pantalla de rol; escritorio nunca lo
   devuelve, sin cambios). El `/ping` del servidor ahora incluye `addresses`. Verificado con
   `scripts/mobile-role-smoketest.ts`: rol nuevo→servidor, `net:getInfo` con IPs reales, y datos
   fluyendo WebView→localhost→servicios→DB. FALTA: arrancar el servidor embebido (nodejs-mobile) al
   entrar en modo servidor; editar rol desde Ajustes.
- **Entregable:** APK "base principal" que funciona como servidor para otras terminales.

### Fase 3 — Impresión ESC/POS (Bluetooth / WiFi) seleccionable
1. Pantalla de configuración de impresora: elegir **Bluetooth** o **Red/WiFi**.
   - Bluetooth: escanear/emparejar impresora térmica.
   - WiFi: IP + puerto (9100 típico).
2. Generar comandos **ESC/POS** desde el ticket (hoy se imprime HTML; en térmica se manda ESC/POS).
3. Plugin de impresión (Capacitor community BT/TCP o plugin propio) y guardar config por dispositivo.
- **Entregable:** impresión de tickets desde Android por el transporte elegido.

## 4. Dependencias nuevas (previstas)
- `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/preferences`
- `nodejs-mobile` (runtime Node en Android) — solo build servidor
- `node-sqlite3-wasm` — SQLite en Android
- Plugin(s) de impresión ESC/POS Bluetooth/TCP
- (Firma de APK) keystore para releases

## 5. Riesgos / decisiones abiertas
- **Fiabilidad del servidor en Android**: Doze/segundo plano. Mitigación: foreground service +
  dispositivo enchufado y dedicado. A comunicar a los clientes.
- **`nodejs-mobile`**: tooling menos común, APK más grande (~+40 MB), builds nativas.
- **Auditoría del adaptador SQLite**: confirmar que ningún servicio usa APIs exclusivas de
  `better-sqlite3` sin equivalente en `node-sqlite3-wasm`.
- **Convivencia de DB en PC y Android**: definir cuál manda (no se sincronizan entre sí; es
  una u otra por instalación de cliente).
- **Impresora**: falta marca/modelo concretos para validar ESC/POS.

## 6. Orden de ejecución sugerido
Fase 0 → Fase 1 (entregable usable ya) → Fase 2 → Fase 3.
Cada fase termina en un APK instalable y probado antes de pasar a la siguiente.
