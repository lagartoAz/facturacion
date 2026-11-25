# Compilar el APK de Android (Acceso)

Estado actual: **Fase 1 (cliente "Acceso") implementada**. El proyecto Android ya está
generado en `android/`. La UI React se reutiliza tal cual; en Android se conecta al
servidor (PC o, más adelante, otro Android) por WiFi vía HTTP `/rpc`.

## Requisitos (una sola vez)
- **Android Studio** (trae el Android SDK + Gradle). O bien el *command-line tools* del SDK.
- Definir `ANDROID_HOME` apuntando al SDK, o abrir el proyecto con Android Studio (lo detecta solo).
- Java 17 (Android Studio incluye uno; en este equipo hay `java` en `/usr/bin/java`).

## Flujo de trabajo
Los scripts nuevos en `package.json`:

```bash
# 1) Compila el bundle web (out/renderer) y lo copia al proyecto Android
npm run android:sync

# 2a) Abrir en Android Studio (recomendado la primera vez) para Build > Build APK
npm run android:open

# 2b) O compilar el APK de depuración por línea de comandos
npm run android:apk
#     -> genera android/app/build/outputs/apk/debug/app-debug.apk
```

Para un APK de **release firmado** (instalable en producción):
1. Crear un keystore: `keytool -genkey -v -keystore facturacion.keystore -alias acceso -keyalg RSA -keysize 2048 -validity 10000`
2. Configurar la firma en `android/app/build.gradle` (`signingConfigs`) o en `~/.gradle/gradle.properties`.
3. `cd android && ./gradlew assembleRelease` → `app/build/outputs/apk/release/app-release.apk`.

## Cómo se conecta la terminal Android
1. En la **PC servidor**, en Ajustes ▸ Red, activar "Compartir en la red" y anotar la **IP** y el
   **puerto** (47600 por defecto) y la clave de acceso si se usa.
2. Instalar el APK en el Android (misma red WiFi).
3. Al abrir, aparece la pantalla **"Terminal de Acceso"**: escribir la IP del servidor + la clave.
   Queda guardada y reconecta sola al reabrir.

## Segundo APK: app de Inventario (`com.facturacion.inventario`)

Desde el **mismo repo** se puede generar un segundo APK independiente, enfocado solo en
inventario, que convive con el de "Acceso" (tienen `applicationId` distinto).

```bash
# Genera android/app/build/outputs/apk/debug/app-debug.apk con appId com.facturacion.inventario
npm run android:inventory
```

El flag de build `APP_FLAVOR=inventory` (ver `electron.vite.config.ts`) hace que el renderer
arranque directo en la UI de inventario (`src/renderer/src/inventory/`) y fuerce rol cliente;
`APP_ID`/`APP_NAME` cambian el `applicationId` (`android/app/build.gradle`) y el nombre
(`capacitor.config.ts` → `strings.xml`). El `namespace` (clase R) se mantiene constante.

> Nota: como `android:apk` y `android:inventory` comparten el mismo proyecto `android/`,
> se compilan **uno a la vez** (cada corrida reescribe assets/applicationId).

**Qué hace la app de Inventario:**
- Se conecta por LAN a la terminal principal (misma pantalla "Terminal de Acceso").
- Ve el inventario: existencias y **precio de venta en USD/VES/COP** (cambio del día).
- Busca por **código de barras** (cámara) o por nombre.
- **Agrega** inventario: crear productos nuevos y sumar stock (vía ingreso/compra) —
  **solo cuando está conectada**.
- Guarda una **copia local (IndexedDB)** del inventario y precios para **seguir viendo**
  sin red (solo lectura); al reconectar sincroniza. Ver `src/renderer/src/inventory/offline-store.ts`.

## Notas técnicas
- El servidor ya envía cabeceras **CORS** (`src/main/server/rpc-server.ts`) para permitir la WebView.
- El manifest permite **tráfico HTTP en claro** (`usesCleartextTraffic="true"`) porque el servidor LAN
  usa HTTP plano; imprescindible en Android 9+.
- La config de conexión se guarda hoy en `localStorage`; se migrará a `@capacitor/preferences`
  (ya instalado) para mayor robustez.
- **Impresión**: aún deshabilitada en Android (Fase 3: ESC/POS Bluetooth/WiFi).
- **Android como servidor** (guardar la DB en el teléfono): Fase 2, pendiente.
