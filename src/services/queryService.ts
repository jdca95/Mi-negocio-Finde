import { db } from '../db'
import { formatDateTime } from '../utils/date'

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
  performedBy: string
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
  const [movements, products, locations] = await Promise.all([
    db.stockMovements.orderBy('createdAt').reverse().limit(limit * 2).toArray(),
    db.products.toArray(),
    db.locations.toArray(),
  ])

  const productMap = new Map(products.map((product) => [product.id, product.name]))
  const locationMap = new Map(locations.map((location) => [location.id, location.name]))

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
      performedBy: movement.performedBy,
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
