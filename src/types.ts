export type Role = 'ADMIN' | 'CASHIER'

export type LocationType = 'STORE' | 'WAREHOUSE'

export type PaymentMethod = 'CASH' | 'TRANSFER' | 'CARD'

export type SaleStatus = 'COMPLETED' | 'CANCELED'

export type AdjustmentMode = 'IN' | 'OUT' | 'SET'

export type AdjustmentReason =
  | 'MERMA'
  | 'PURCHASE'
  | 'ADJUSTMENT'
  | 'CORRECTION'
  | 'IMPORT'

export type MovementType =
  | 'SALE_OUT'
  | 'SALE_CANCEL_IN'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'
  | 'ADJUST_IN'
  | 'ADJUST_OUT'
  | 'ADJUST_SET'

export type TransferStatus = 'COMPLETED'

export type SyncStatus = 'PENDING' | 'FAILED'

export type SyncEntityType =
  | 'products'
  | 'inventoryBalances'
  | 'sales'
  | 'saleItems'
  | 'saleCancellations'
  | 'transfers'
  | 'transferItems'
  | 'stockMovements'

export interface Location {
  id: string
  code: string
  name: string
  type: LocationType
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface Product {
  id: string
  name: string
  sku: string
  cost: number
  price: number
  minStock: number
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface InventoryBalance {
  id: string
  locationId: string
  productId: string
  stock: number
  updatedAt: string
}

export interface Sale {
  id: string
  folio?: string
  locationId: string
  paymentMethod: PaymentMethod
  total: number
  estimatedProfit: number
  status: SaleStatus
  performedBy?: string
  deviceId?: string
  sessionId?: string
  createdAt: string
  updatedAt: string
  canceledAt?: string
  cancellationReason?: string
}

export interface SaleItem {
  id: string
  saleId: string
  productId: string
  qty: number
  priceSnapshot: number
  costSnapshot: number
  subtotal: number
  createdAt: string
  updatedAt: string
}

export interface SaleCancellation {
  id: string
  saleId: string
  reason: string
  performedBy: string
  createdAt: string
  updatedAt: string
}

export interface Transfer {
  id: string
  folio?: string
  fromLocationId: string
  toLocationId: string
  status: TransferStatus
  notes: string
  performedBy: string
  deviceId?: string
  sessionId?: string
  createdAt: string
  updatedAt: string
}

export interface TransferItem {
  id: string
  transferId: string
  productId: string
  qty: number
  createdAt: string
  updatedAt: string
}

export interface StockMovement {
  id: string
  productId: string
  locationId: string
  type: MovementType
  qty: number
  beforeStock?: number
  afterStock?: number
  reason: string
  refType: 'SALE' | 'TRANSFER' | 'ADJUSTMENT'
  refId: string
  performedBy: string
  deviceId?: string
  sessionId?: string
  createdAt: string
  updatedAt: string
}

export interface User {
  id: string
  username: string
  name: string
  role: Role
  pinHash: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface Setting {
  key: string
  value: string
}

export interface SyncQueueItem {
  id: string
  entityType: SyncEntityType
  entityId: string
  updatedAt: string
  attempts: number
  status: SyncStatus
  createdAt: string
  lastError: string
}

export interface InventoryViewRow {
  productId: string
  name: string
  sku: string
  cost: number
  price: number
  minStock: number
  stock: number
  lowStock: boolean
  active: boolean
}

export interface SaleItemInput {
  productId: string
  qty: number
}

export interface DailyCutSaleRow {
  id: string
  createdAt: string
  paymentMethod: PaymentMethod
  total: number
  estimatedProfit: number
  status: SaleStatus
}

export interface DailyCutDetailRow {
  saleId: string
  productName: string
  qty: number
  price: number
  cost: number
  subtotal: number
}

export interface DailyCutInventoryRow {
  locationName: string
  productName: string
  stock: number
  price: number
  cost: number
}

export interface DailyCutSummary {
  date: string
  locationId: string
  locationName: string
  totalSold: number
  estimatedProfit: number
  byPayment: Record<PaymentMethod, number>
  sales: DailyCutSaleRow[]
  details: DailyCutDetailRow[]
  inventoryRows: DailyCutInventoryRow[]
}

export type PeriodPreset = 'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM'

export interface ReportFilters {
  period: PeriodPreset
  startDate: string
  endDate: string
  locationId: string | 'ALL'
}

export interface TopProductMetric {
  productId: string
  productName: string
  qty: number
  revenue: number
  profit: number
}

export interface DayMetric {
  date: string
  total: number
}

export interface PeriodReport {
  filters: ReportFilters
  topByQty: TopProductMetric[]
  topByRevenue: TopProductMetric[]
  top20: TopProductMetric[]
  salesByDay: DayMetric[]
  profitByDay: DayMetric[]
}

export interface CsvProductRow {
  name: string
  sku: string
  cost: number
  price: number
  stock: number
  locationCode?: string
}

export interface CsvValidationResult {
  rows: CsvProductRow[]
  errors: string[]
}

export interface SyncRunResult {
  status: 'disabled' | 'ok' | 'error'
  pushed: number
  pulled: number
  failed: number
  message: string
}

export interface BackupPayload {
  metadata: {
    appName: string
    schemaVersion: number
    exportedAt: string
  }
  data: {
    locations: Location[]
    products: Product[]
    inventoryBalances: InventoryBalance[]
    sales: Sale[]
    saleItems: SaleItem[]
    saleCancellations: SaleCancellation[]
    transfers: Transfer[]
    transferItems: TransferItem[]
    stockMovements: StockMovement[]
    users: User[]
    settings: Setting[]
    syncQueue: SyncQueueItem[]
  }
}
