# MiNegocioFinde

PWA offline-first para inventario y ventas de fin de semana con 3 sucursales y almacen central (Casa).

## Stack

- React + Vite + TypeScript
- PWA con `vite-plugin-pwa` (service worker Workbox)
- IndexedDB con Dexie.js
- Graficas con Chart.js + react-chartjs-2
- Exportacion Excel offline con SheetJS (`xlsx`)
- Sync opcional con Firebase Firestore

## Funcionalidades implementadas

- Inventario por ubicacion:
  - CRUD de productos (`name`, `sku`, `cost`, `price`, `minStock`, `active`)
  - Stock por sucursal/almacen
  - Busqueda y filtro de inventario bajo
- Ventas rapidas:
  - Carrito, ajuste de cantidades y metodo de pago
  - Validacion de stock insuficiente
  - Registro atomico de venta + items + descuento stock + movimientos
  - Cancelacion de venta con reversa de stock y trazabilidad
- Corte del dia:
  - Totales de venta y por metodo de pago
  - Utilidad estimada con snapshot de costo/precio
  - Exportacion Excel offline con hojas: Resumen, Ventas, Detalle, Inventario
- Reportes:
  - Filtros Hoy / Semana / Mes / Personalizado
  - Top por cantidad e ingresos
  - Ventas y utilidad por dia
  - Tabla Top 20
- Ajustes de inventario:
  - Entrada / Salida / Ajuste con motivo
  - Historial de movimientos
- Transferencias:
  - Reabasto formal Casa -> Sucursal (o entre ubicaciones)
  - Validacion de stock en origen
  - Movimientos `TRANSFER_OUT` y `TRANSFER_IN`
- Importacion CSV:
  - Subida de archivo o pegado de texto
  - Validacion de columnas y preview
- Sync opcional Firestore:
  - Boton "Sincronizar ahora"
  - Auto-sync al reconectar internet
  - Last-write-wins con `updatedAt`
  - Cola local de pendientes (`syncQueue`)

## Credenciales iniciales (demo local)

- Admin: `admin` / `1234`
- Cajero: `cajero` / `0000`

## Requisitos

- Node.js 20+
- npm 10+

## Instalacion

```bash
npm install
```

## Desarrollo

```bash
npm run dev
```

## Build produccion

```bash
npm run build
npm run preview
```

## Tests

```bash
npm run test
```

## Configuracion Firebase (opcional)

1. Copia `.env.example` a `.env`.
2. Completa las variables:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
```

Si no configuras Firebase, la app funciona en modo local-only sin errores.

## Deploy

### Netlify

- Build command: `npm run build`
- Publish directory: `dist`
- Ya incluye `public/_redirects` para SPA fallback.

### Vercel

- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Ya incluye `vercel.json` con rewrite a `index.html`.

## Instalar en iPhone (Safari)

1. Abre la URL de la app en Safari.
2. Toca **Compartir**.
3. Elige **Agregar a pantalla de inicio**.
4. Confirma el nombre y toca **Agregar**.

Despues de la primera carga, los assets quedan cacheados y la app sigue operando offline con IndexedDB.

## Notas de arquitectura

- Todas las operaciones criticas de inventario/ventas/transferencias usan transacciones Dexie.
- La utilidad historica no se recalcula con costos nuevos porque se guarda snapshot en cada item vendido.
- Las sucursales y Casa comparten catalogo de productos, pero el stock se maneja por `locationId`.
