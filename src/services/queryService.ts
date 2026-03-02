import { db } from '../db'
import {
  ACTIVITY_ACTION_LABELS,
  MOVEMENT_TYPE_LABELS,
} from '../constants'
import { formatDateTime, toIsoRangeBounds } from '../utils/date'

export interface RecentSaleView {
  id: string
  folio?: string
  createdAt: string
  createdLabel: string
  total: number
  estimatedProfit: number
  status: 'COMPLETED' | 'CANCELED'
  paymentMethod: 'CASH' | 'TRANSFER' | 'CARD'
}

export interface MovementView {
  id: string
  createdAt: string
  createdLabel: string
  productName: string
  locationName: string
  type: string
  qty: number
  reason: string
  performedById: string
  performedBy: string
}

export interface ActivityTimelineFilters {
  locationId: string | 'ALL'
  userId: string | 'ALL'
  productId: string | 'ALL'
  startDate: string
  endDate: string
  limit?: number
}

export interface ActivityEventView {
  id: string
  createdAt: string
  createdLabel: string
  action: string
  summary: string
  details: string
  entityId: string
  productName: string
  locationName: string
  relatedLocationName: string
  qty: number | null
  performedById: string
  performedBy: string
}

export interface ProductHistoryView {
  id: string
  createdAt: string
  createdLabel: string
  source: 'ACTIVITY' | 'MOVEMENT'
  action: string
  locationName: string
  performedById: string
  performedBy: string
  qty: number | null
  stockBefore: number | null
  stockAfter: number | null
  details: string
}

export interface TransferHistoryView {
  id: string
  folio?: string
  createdAt: string
  createdLabel: string
  fromLocationName: string
  toLocationName: string
  notes: string
  itemsCount: number
}

export const getRecentSales = async (
  locationId: string,
  limit = 25,
): Promise<RecentSaleView[]> => {
  const sales = await db.sales.where('locationId').equals(locationId).toArray()
  return sales
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .map((sale) => ({
      id: sale.id,
      folio: sale.folio,
      createdAt: sale.createdAt,
      createdLabel: formatDateTime(sale.createdAt),
      total: sale.total,
      estimatedProfit: sale.estimatedProfit,
      status: sale.status,
      paymentMethod: sale.paymentMethod,
    }))
}

export const getMovementHistory = async (
  locationId: string | 'ALL',
  limit = 200,
): Promise<MovementView[]> => {
  const [movements, products, locations, users] = await Promise.all([
    db.stockMovements.orderBy('createdAt').reverse().limit(limit * 2).toArray(),
    db.products.toArray(),
    db.locations.toArray(),
    db.users.toArray(),
  ])

  const productMap = new Map(products.map((product) => [product.id, product.name]))
  const locationMap = new Map(locations.map((location) => [location.id, location.name]))
  const userMap = new Map(users.map((user) => [user.id, user.name]))

  return movements
    .filter((movement) =>
      locationId === 'ALL' ? true : movement.locationId === locationId,
    )
    .slice(0, limit)
    .map((movement) => ({
      id: movement.id,
      createdAt: movement.createdAt,
      createdLabel: formatDateTime(movement.createdAt),
      productName: productMap.get(movement.productId) ?? 'Producto eliminado',
      locationName: locationMap.get(movement.locationId) ?? movement.locationId,
      type: movement.type,
      qty: movement.qty,
      reason: movement.reason,
      performedById: movement.performedBy,
      performedBy: userMap.get(movement.performedBy) ?? movement.performedBy,
    }))
}

export const getTransferHistory = async (
  limit = 80,
): Promise<TransferHistoryView[]> => {
  const [transfers, transferItems, locations] = await Promise.all([
    db.transfers.orderBy('createdAt').reverse().limit(limit).toArray(),
    db.transferItems.toArray(),
    db.locations.toArray(),
  ])

  const locationMap = new Map(locations.map((location) => [location.id, location.name]))
  const itemCountMap = new Map<string, number>()

  for (const item of transferItems) {
    itemCountMap.set(item.transferId, (itemCountMap.get(item.transferId) ?? 0) + item.qty)
  }

  return transfers.map((transfer) => ({
    id: transfer.id,
    folio: transfer.folio,
    createdAt: transfer.createdAt,
    createdLabel: formatDateTime(transfer.createdAt),
    fromLocationName:
      locationMap.get(transfer.fromLocationId) ?? transfer.fromLocationId,
    toLocationName: locationMap.get(transfer.toLocationId) ?? transfer.toLocationId,
    notes: transfer.notes,
    itemsCount: itemCountMap.get(transfer.id) ?? 0,
  }))
}

export const getActivityTimeline = async (
  filters: ActivityTimelineFilters,
): Promise<ActivityEventView[]> => {
  const [events, products, locations, users] = await Promise.all([
    db.activityEvents.orderBy('createdAt').reverse().toArray(),
    db.products.toArray(),
    db.locations.toArray(),
    db.users.toArray(),
  ])

  const { startIso, endIso } = toIsoRangeBounds(filters.startDate, filters.endDate)
  const productMap = new Map(products.map((product) => [product.id, product.name]))
  const locationMap = new Map(locations.map((location) => [location.id, location.name]))
  const userMap = new Map(users.map((user) => [user.id, user.name]))

  return events
    .filter((event) => event.createdAt >= startIso && event.createdAt <= endIso)
    .filter((event) =>
      filters.locationId === 'ALL'
        ? true
        : event.locationId === filters.locationId ||
          event.relatedLocationId === filters.locationId,
    )
    .filter((event) =>
      filters.userId === 'ALL' ? true : event.performedBy === filters.userId,
    )
    .filter((event) =>
      filters.productId === 'ALL' ? true : event.productId === filters.productId,
    )
    .slice(0, filters.limit ?? 250)
    .map((event) => ({
      id: event.id,
      createdAt: event.createdAt,
      createdLabel: formatDateTime(event.createdAt),
      action: ACTIVITY_ACTION_LABELS[event.action] ?? event.action,
      summary: event.summary,
      details: event.details,
      entityId: event.entityId,
      productName: event.productId
        ? productMap.get(event.productId) ?? event.productId
        : '-',
      locationName: event.locationId
        ? locationMap.get(event.locationId) ?? event.locationId
        : '-',
      relatedLocationName: event.relatedLocationId
        ? locationMap.get(event.relatedLocationId) ?? event.relatedLocationId
        : '-',
      qty: typeof event.qty === 'number' ? event.qty : null,
      performedById: event.performedBy,
      performedBy: userMap.get(event.performedBy) ?? event.performedBy,
    }))
}

export const getProductHistory = async (
  productId: string,
  filters: Omit<ActivityTimelineFilters, 'productId'>,
): Promise<ProductHistoryView[]> => {
  if (!productId) {
    return []
  }

  const [events, movements, locations, users] = await Promise.all([
    db.activityEvents.where('productId').equals(productId).toArray(),
    db.stockMovements.where('productId').equals(productId).toArray(),
    db.locations.toArray(),
    db.users.toArray(),
  ])

  const { startIso, endIso } = toIsoRangeBounds(filters.startDate, filters.endDate)
  const locationMap = new Map(locations.map((location) => [location.id, location.name]))
  const userMap = new Map(users.map((user) => [user.id, user.name]))

  const eventRows: ProductHistoryView[] = events
    .filter((event) => event.createdAt >= startIso && event.createdAt <= endIso)
    .filter((event) =>
      filters.locationId === 'ALL'
        ? true
        : event.locationId === filters.locationId ||
          event.relatedLocationId === filters.locationId,
    )
    .filter((event) =>
      filters.userId === 'ALL' ? true : event.performedBy === filters.userId,
    )
    .map((event) => ({
      id: event.id,
      createdAt: event.createdAt,
      createdLabel: formatDateTime(event.createdAt),
      source: 'ACTIVITY',
      action: ACTIVITY_ACTION_LABELS[event.action] ?? event.action,
      locationName: event.locationId
        ? locationMap.get(event.locationId) ?? event.locationId
        : '-',
      performedById: event.performedBy,
      performedBy: userMap.get(event.performedBy) ?? event.performedBy,
      qty: typeof event.qty === 'number' ? event.qty : null,
      stockBefore: null,
      stockAfter: null,
      details: [event.summary, event.details].filter(Boolean).join(' | '),
    }))

  const movementRows: ProductHistoryView[] = movements
    .filter((movement) => movement.createdAt >= startIso && movement.createdAt <= endIso)
    .filter((movement) =>
      filters.locationId === 'ALL' ? true : movement.locationId === filters.locationId,
    )
    .filter((movement) =>
      filters.userId === 'ALL' ? true : movement.performedBy === filters.userId,
    )
    .map((movement) => ({
      id: movement.id,
      createdAt: movement.createdAt,
      createdLabel: formatDateTime(movement.createdAt),
      source: 'MOVEMENT',
      action: MOVEMENT_TYPE_LABELS[movement.type] ?? movement.type,
      locationName: locationMap.get(movement.locationId) ?? movement.locationId,
      performedById: movement.performedBy,
      performedBy: userMap.get(movement.performedBy) ?? movement.performedBy,
      qty: movement.qty,
      stockBefore:
        typeof movement.beforeStock === 'number' ? movement.beforeStock : null,
      stockAfter:
        typeof movement.afterStock === 'number' ? movement.afterStock : null,
      details: movement.reason,
    }))

  return [...eventRows, ...movementRows]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, filters.limit ?? 250)
}
