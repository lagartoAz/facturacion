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

## Activación (solo por el `.exe` activador)

La activación **no** se hace con códigos ni claves dentro de la app. El cliente
recibe un **activador `.exe`** aparte que, al ejecutarse, deja el archivo de
licencia en la carpeta de datos. Al reabrir la app, el complemento queda activo.
Ver `installers/complemento-fidelidad.nsi`.

- **Estado:** se ve al final de Configuración (*Complemento: Fidelidad*):
  Activado / Desactivado.
- **Desactivar:** desde esa misma tarjeta, con una ventana de confirmación en la
  que hay que escribir `desactivar`. Los puntos y rifas guardados no se borran.

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

## Novedades (v3)

En Fidelidad → **Reglas**, la primera tarjeta es el **modo del programa**:

- **Solo puntos:** una sola moneda (puntos), con niveles y premios.
- **Solo tickets:** los clientes acumulan **tickets** (participaciones de rifa). No
  hay puntos ni niveles.
- **Puntos y tickets:** ambas monedas a la vez, con reglas **independientes**.

Según el modo aparecen/ocultan las secciones y pestañas.

### Puntos vs. tickets
- **Puntos:** moneda que se canjea por premios y define el nivel del cliente.
- **Tickets:** moneda independiente que solo da participaciones de rifa. Se ganan
  con sus propias reglas (por factura y/o por cada N USD) y se **acumulan**: un
  cliente con N tickets aparece N veces en la rifa. En *solo puntos*, las
  participaciones se siguen derivando de los puntos (como antes).

### Topes
- **Por factura:** tope opcional de puntos (def. **100**) y de tickets (def. **3**)
  que una sola factura puede otorgar.
- **Acumulables:** tope de tickets que un cliente puede acumular para la rifa
  (def. **5**; 0 = sin límite). Al llegar al tope deja de sumar.

### Niveles de cliente (solo con puntos)
- Niveles editables (Casual, Bronce, Plata, Oro, Diamante) con umbral, color y
  **beneficios**. La pestaña **Niveles** solo aparece si los puntos están activos.
- El nivel se calcula por los puntos **ganados** en una ventana móvil
  (configurable, def. **12 meses**). Canjear puntos no baja de nivel.
- **Beneficios por nivel:** descuento fijo (se aplica solo en el POS al cliente de
  ese nivel), cupón mensual (se emite 1 cupón al mes por miembro), rifa mensual
  del nivel (se crea una rifa exclusiva por mes y cada miembro recibe 1 ticket que
  **caduca al sortearla**) y personalizado (texto libre).
- Los procesos mensuales corren solos al abrir la app y la pestaña Fidelidad
  (idempotentes por mes; no hay planificador).

### Premios (3 tipos)
- **Descuento** (USD o %), **Ticket** (otorga participaciones de rifa) y
  **Personalizado** (premio libre). Todos se canjean con puntos.

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

### Cupones de descuento en el POS
- Canjear un premio de descuento (USD o %) genera un **cupón de un solo uso**
  para el cliente (los premios "libres" siguen siendo canje directo, sin cupón).
- En el POS, con un cliente seleccionado, aparece **"Aplicar cupón de descuento"**
  si el cliente tiene cupones sin usar **o** puntos suficientes para canjear uno
  en el momento.
- Se puede aplicar **1 cupón por venta**; el descuento se resta del total y el
  cupón queda marcado como usado (atado a esa factura). El recibo muestra el
  subtotal y el descuento.

### Mensaje al ganador (WhatsApp)
- Plantilla editable en Fidelidad → Rifa, con variables `{nombre}`, `{rifa}`,
  `{tienda}`, `{fecha}`.
- Tras sortear (o desde "Rifas anteriores"), el botón **Mensaje para WhatsApp**
  abre el texto ya armado para **copiar y pegar**.

### Tickets físicos de rifa (opcional)
- Se activa/desactiva en Fidelidad → Rifa ("Tickets físicos imprimibles").
- Al finalizar una venta se imprime primero la factura y luego el diálogo de
  éxito **ofrece imprimir los tickets** (uno por cupo) para meterlos en un pote
  físico y sortear a mano.
- En **Facturas** cada venta muestra si sus tickets ya se imprimieron o están
  **pendientes**, con botón para imprimirlos luego (así no se satura el cierre
  de la venta).

### Vista previa en el POS
Con un cliente seleccionado, el carrito muestra **cuántos puntos y cupos** ganará
la venta (se calcula en el backend con las reglas reales). Al finalizar, el
diálogo de éxito confirma los puntos/cupos otorgados.

### Reportes en puntos
En **Reportes** hay un botón **Dinero / Puntos**: cambia las tarjetas, la gráfica
(por día u hora) y el top de productos para mostrar las mismas estadísticas pero
en puntos otorgados.

### Estadísticas por cliente
En **Clientes**, el botón de estadísticas abre un panel con el gasto por día
(gráfica de barras, con toggle **Dinero / Puntos**), totales del periodo, y el
detalle de fidelidad: puntos, cupos de rifa y la lista de **cupones**
(Disponible, o Usado con su fecha de uso).

### Rifa en el Home
Si hay una rifa activa, el Home muestra una tarjeta con la rifa, cuántos
**participantes distintos** van y cuántas **participaciones** hay en total.

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
