import type {
  AdjustmentMode,
  AdjustmentReason,
  ActivityAction,
  CashEntryType,
  Location,
  MovementType,
  PaymentMethod,
  PeriodPreset,
  Role,
} from './types'
import { nowIso } from './utils/date'

export const APP_NAME = 'MiNegocioFinde'

export const STORAGE_KEYS = {
  activeLocationId: 'mnf.activeLocationId',
  sessionUserId: 'mnf.sessionUserId',
  deviceId: 'mnf.deviceId',
  runtimeSessionId: 'mnf.runtimeSessionId',
} as const

export const BACKUP_SCHEMA_VERSION = 3

export const DEFAULT_LOCATIONS: Array<Omit<Location, 'createdAt' | 'updatedAt'>> = [
  {
    id: 'loc-casa',
    code: 'CASA',
    name: 'Casa (Almacen Central)',
    type: 'WAREHOUSE',
    active: true,
  },
  {
    id: 'loc-suc-1',
    code: 'SUC1',
    name: 'Sucursal 1',
    type: 'STORE',
    active: true,
  },
  {
    id: 'loc-suc-2',
    code: 'SUC2',
    name: 'Sucursal 2',
    type: 'STORE',
    active: true,
  },
  {
    id: 'loc-suc-3',
    code: 'SUC3',
    name: 'Sucursal 3',
    type: 'STORE',
    active: true,
  },
]

export const DEFAULT_LOCATION_ID = 'loc-suc-1'
export const WAREHOUSE_LOCATION_ID = 'loc-casa'
export const DEFAULT_USER_SEED_VERSION = '2'

export const DEFAULT_USERS = [
  {
    id: 'user-admin',
    username: 'diegocastro',
    name: 'Diego Castro',
    role: 'ADMIN' as const,
    pinHash: '0a4e3e70597a358b9447fa8a647aadf5b76dde95c8e4ab02e5f8cee6caa1cd28',
  },
  {
    id: 'user-cashier',
    username: 'papa',
    name: 'Papa',
    role: 'ADMIN' as const,
    pinHash: 'b6f6b6715fae0829382e6f3bef5fffcf0e7e87bb2136e511774768204b1d120b',
  },
  {
    id: 'user-luis-castro',
    username: 'luiscastro',
    name: 'Luis Castro',
    role: 'ADMIN' as const,
    pinHash: '214538a798d46607ed8c5bb7cb54c13f9bc164789f576296189559feeef5b3ad',
  },
  {
    id: 'user-mama',
    username: 'mama',
    name: 'Mama',
    role: 'ADMIN' as const,
    pinHash: '45614290270f9909ee6ffe6f52ae5f8360be81fec6d3868d8022e2d200be3de4',
  },
  {
    id: 'user-alondra',
    username: 'alondra',
    name: 'Alondra',
    role: 'ADMIN' as const,
    pinHash: 'd66cd4cc6e5d2e8f736eb3efa2a53865d7fae6e6fb784759833ea8406fa1b44f',
  },
]

export const nowForSeed = (): string => nowIso()

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CARD: 'Tarjeta',
}

export const CASH_ENTRY_TYPE_LABELS: Record<CashEntryType, string> = {
  OPENING: 'Fondo inicial',
  WITHDRAWAL: 'Retiro',
  EXPENSE: 'Gasto',
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Admin',
  CASHIER: 'Cajero',
}

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  SALE_OUT: 'Venta salida',
  SALE_CANCEL_IN: 'Cancelacion venta',
  TRANSFER_OUT: 'Transferencia salida',
  TRANSFER_IN: 'Transferencia entrada',
  ADJUST_IN: 'Ajuste entrada',
  ADJUST_OUT: 'Ajuste salida',
  ADJUST_SET: 'Ajuste establecer',
}

export const ADJUSTMENT_MODE_LABELS: Record<AdjustmentMode, string> = {
  IN: 'Entrada',
  OUT: 'Salida',
  SET: 'Ajuste',
}

export const ADJUSTMENT_REASON_LABELS: Record<AdjustmentReason, string> = {
  MERMA: 'Merma',
  PURCHASE: 'Compra',
  ADJUSTMENT: 'Ajuste',
  CORRECTION: 'Correccion',
  IMPORT: 'Importacion',
}

export const PERIOD_PRESET_LABELS: Record<PeriodPreset, string> = {
  TODAY: 'Hoy',
  WEEK: 'Semana',
  MONTH: 'Mes',
  CUSTOM: 'Personalizado',
}

export const ACTIVITY_ACTION_LABELS: Record<ActivityAction, string> = {
  PRODUCT_CREATED: 'Producto creado',
  PRODUCT_UPDATED: 'Producto editado',
  PRODUCT_STATUS_CHANGED: 'Estado de producto',
  SALE_CREATED: 'Venta registrada',
  SALE_CANCELED: 'Venta cancelada',
  TRANSFER_CREATED: 'Transferencia registrada',
  STOCK_ADJUSTED: 'Ajuste de inventario',
  CASH_OPENING_SET: 'Fondo inicial actualizado',
  CASH_ENTRY_ADDED: 'Movimiento de caja registrado',
}
