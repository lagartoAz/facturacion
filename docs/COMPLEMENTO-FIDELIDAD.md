# Complemento: Fidelidad (puntos de clientes)

Sistema de puntos de fidelidad que se vende y se instala **aparte** del instalador
base. El código viaja en la app base pero permanece **oculto e inactivo** hasta
que se activa con una clave (licencia offline). Esta es la "Opción A".

## Cómo funciona

- La tabla `loyalty_ledger` y la configuración se crean siempre (migración v20),
  pero el setting `loyalty_enabled` arranca en `0` → la función no existe para el
  usuario (no hay menú, no se acumulan puntos).
- La activación valida una clave con HMAC **sin internet** y escribe el archivo
  `loyalty.license` en la carpeta de datos del usuario. Al arrancar, la app
  sincroniza ese archivo con `loyalty_enabled` (`src/main/index.ts` →
  `syncLoyaltyLicense`).
- Con la función activa: aparece el menú **Fidelidad**, cada venta con cliente
  acumula puntos y se pueden canjear.

Carpeta de datos (build instalado): `%USERPROFILE%\.facturacion-pos\`
Archivo de licencia: `%USERPROFILE%\.facturacion-pos\loyalty.license`

## Dos formas de activar

1. **Dentro de la app (recomendada para el cliente):**
   Configuración → *Complemento: Fidelidad* → pegar la clave → **Activar**.

2. **Instalador de complemento (`.exe` aparte):**
   El `.exe` deja caer el archivo de licencia en la carpeta de datos. No
   reinstala la app. Ver `installers/complemento-fidelidad.nsi`.

## Generar la clave de activación

```bash
node scripts/gen-loyalty-key.mjs
# -> Clave: FID-XXXXX-XXXXX-XXXXX
```

La clave es la misma para todas las instalaciones mientras no cambie
`LICENSE_SECRET`. Si cambias el secreto en
`src/main/services/license.service.ts`, regenera la clave y actualiza el `.nsi`.

> Nota: al ser una clave universal offline, es simple pero no infalible. Si más
> adelante quieres claves por cliente o que caduquen, se puede extender el HMAC
> para incluir el nombre del negocio o una fecha.

## Construir el `.exe` del complemento

Requiere NSIS (`makensis`):

```bash
makensis installers/complemento-fidelidad.nsi
# Genera: installers/InstalarComplementoFidelidad.exe
```

El `.exe` es independiente del instalador base: entrégalo solo a los clientes que
compren Fidelidad.

## Modo cliente/servidor (varias terminales)

La licencia y los datos de puntos viven en el **servidor** (la PC principal). Las
terminales "Acceso" reenvían las llamadas de fidelidad por la LAN, así que basta
activar el complemento una vez en el servidor.

## Funciones (v2)

### Formas de ganar puntos (combinables, se suman)
- **Por dinero gastado:** N puntos por cada 1 USD.
- **Por producto:** cada producto otorga sus propios puntos por unidad (se
  configura en Fidelidad → Reglas → "Puntos por producto").
- **Por factura finalizada:** puntos fijos por cada factura.

### Condiciones
- **Excluir crédito:** no acumula en ventas a crédito (activado por defecto).
- **Solo una divisa:** opcionalmente, solo acumulan las ventas pagadas en USD,
  VES o COP.
- Solo acumulan las facturas asociadas a un **cliente registrado**.

### Uso de los puntos (ambos pueden estar activos a la vez)
- **Premios / descuentos:** catálogo configurable (descuento en USD, descuento
  en %, o premio libre). El cliente canjea puntos por un premio.
- **Rifa:** los puntos otorgan participaciones. Se define un mínimo de puntos
  para participar y, opcionalmente, cuántos puntos valen cada participación
  extra (una persona puede tener varias participaciones). El dueño lanza una
  **ruleta animada** que elige al ganador ponderado por participaciones.

> Las participaciones se calculan sobre el saldo de puntos **actual** del
> cliente. Si canjea puntos en un premio, sus participaciones bajan en
> consecuencia (los puntos son una sola moneda). El ganador lo elige el backend
> de forma ponderada; la ruleta solo anima hacia ese resultado ya decidido.

### Lista de clientes
Con el complemento activo, la página de **Clientes** muestra una columna con los
puntos de cada cliente y, si la rifa está activa, sus participaciones.

## Archivos del complemento

- `src/main/database/migrations.ts` — migración v20 (base) y v21 (reglas,
  premios, rifa).
- `src/main/services/loyalty.service.ts` — motor: reglas de ganancia, saldo,
  premios, rifa y sorteo ponderado.
- `src/main/services/license.service.ts` — validación de licencia offline.
- `src/main/ipc/loyalty.ipc.ts` — handlers IPC + sincronización de licencia.
- `src/renderer/src/pages/LoyaltyPage.tsx` — página Fidelidad (pestañas).
- `src/renderer/src/components/loyalty/` — Reglas, Premios, Clientes, Rifa.
- `src/renderer/src/components/RaffleRoulette.tsx` — ruleta animada.
- `src/renderer/src/components/LoyaltyActivationCard.tsx` — activación en Config.
- `src/renderer/src/hooks/useLoyalty.tsx` — estado/config compartido.
- `src/renderer/src/pages/CustomersPage.tsx` — columna de puntos/participaciones.
- `scripts/gen-loyalty-key.mjs` — generador de claves.
- `installers/complemento-fidelidad.nsi` — instalador del `.exe` complemento.
