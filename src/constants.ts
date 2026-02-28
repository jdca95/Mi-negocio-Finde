import type {
  AdjustmentMode,
  AdjustmentReason,
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

export const BACKUP_SCHEMA_VERSION = 1

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

export const nowForSeed = (): string => nowIso()

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CARD: 'Tarjeta',
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
