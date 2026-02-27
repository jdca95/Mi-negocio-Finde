import { db, buildBalanceId, buildEntityId } from '../db'
import { nowIso } from '../utils/date'
import { buildSyncQueueItem } from './syncQueueService'
import type {
  PaymentMethod,
  Sale,
  SaleCancellation,
  SaleItem,
  SaleItemInput,
} from '../types'

interface CreateSaleInput {
  locationId: string
  paymentMethod: PaymentMethod
  items: SaleItemInput[]
  performedBy: string
}

interface CancelSaleInput {
  saleId: string
  reason: string
  performedBy: string
}

const ensurePositiveInteger = (value: number, field: string): void => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} debe ser un entero mayor a cero.`)
  }
}

export const createSale = async (input: CreateSaleInput): Promise<Sale> => {
  if (!input.items.length) {
    throw new Error('El carrito esta vacio.')
  }

  const now = nowIso()
  const saleId = buildEntityId('sale')
  const dedupMap = new Map<string, number>()
  for (const item of input.items) {
    ensurePositiveInteger(item.qty, 'Cantidad')
    dedupMap.set(item.productId, (dedupMap.get(item.productId) ?? 0) + item.qty)
  }

  const normalizedItems = Array.from(dedupMap.entries()).map(([productId, qty]) => ({
    productId,
    qty,
  }))

  let total = 0
  let estimatedProfit = 0

  const sale: Sale = {
    id: saleId,
    locationId: input.locationId,
    paymentMethod: input.paymentMethod,
    total: 0,
    estimatedProfit: 0,
    status: 'COMPLETED',
    createdAt: now,
    updatedAt: now,
  }

  await db.transaction(
    'rw',
    [
      db.products,
      db.inventoryBalances,
      db.sales,
      db.saleItems,
      db.stockMovements,
      db.syncQueue,
    ],
    async () => {
      for (const item of normalizedItems) {
        const product = await db.products.get(item.productId)
        if (!product || !product.active) {
          throw new Error('Producto no disponible para venta.')
        }

        const balanceId = buildBalanceId(input.locationId, item.productId)
        const balance = await db.inventoryBalances.get(balanceId)
        const stock = balance?.stock ?? 0
        if (stock < item.qty) {
          throw new Error(`Stock insuficiente para ${product.name}. Disponible: ${stock}`)
        }

        const subtotal = product.price * item.qty
        const profit = (product.price - product.cost) * item.qty
        total += subtotal
        estimatedProfit += profit
      }

      sale.total = Number(total.toFixed(2))
      sale.estimatedProfit = Number(estimatedProfit.toFixed(2))

      await db.sales.put(sale)
      await db.syncQueue.put(buildSyncQueueItem('sales', sale.id, now))

      for (const item of normalizedItems) {
        const product = await db.products.get(item.productId)
        if (!product) {
          throw new Error('Producto no encontrado.')
        }

        const balanceId = buildBalanceId(input.locationId, item.productId)
        const balance = await db.inventoryBalances.get(balanceId)
        const currentStock = balance?.stock ?? 0
        const nextStock = currentStock - item.qty

        await db.inventoryBalances.put({
          id: balanceId,
          locationId: input.locationId,
          productId: item.productId,
          stock: nextStock,
          updatedAt: now,
        })
        await db.syncQueue.put(buildSyncQueueItem('inventoryBalances', balanceId, now))

        const saleItem: SaleItem = {
          id: buildEntityId('sitem'),
          saleId: sale.id,
          productId: item.productId,
          qty: item.qty,
          priceSnapshot: product.price,
          costSnapshot: product.cost,
          subtotal: Number((product.price * item.qty).toFixed(2)),
          createdAt: now,
          updatedAt: now,
        }
        await db.saleItems.put(saleItem)
        await db.syncQueue.put(buildSyncQueueItem('saleItems', saleItem.id, now))

        const movementId = buildEntityId('mov')
        await db.stockMovements.put({
          id: movementId,
          productId: item.productId,
          locationId: input.locationId,
          type: 'SALE_OUT',
          qty: item.qty,
          reason: `Venta ${sale.id}`,
          refType: 'SALE',
          refId: sale.id,
          performedBy: input.performedBy,
          createdAt: now,
          updatedAt: now,
        })
        await db.syncQueue.put(buildSyncQueueItem('stockMovements', movementId, now))
      }
    },
  )

  return sale
}

export const cancelSale = async (input: CancelSaleInput): Promise<void> => {
  const reason = input.reason.trim()
  if (!reason) {
    throw new Error('Motivo de cancelacion obligatorio.')
  }

  const now = nowIso()

  await db.transaction(
    'rw',
    [
      db.sales,
      db.saleItems,
      db.saleCancellations,
      db.inventoryBalances,
      db.stockMovements,
      db.syncQueue,
    ],
    async () => {
      const sale = await db.sales.get(input.saleId)
      if (!sale) {
        throw new Error('Venta no encontrada.')
      }
      if (sale.status === 'CANCELED') {
        throw new Error('La venta ya fue cancelada.')
      }

      const items = await db.saleItems.where('saleId').equals(sale.id).toArray()
      for (const item of items) {
        const balanceId = buildBalanceId(sale.locationId, item.productId)
        const balance = await db.inventoryBalances.get(balanceId)
        const currentStock = balance?.stock ?? 0
        const nextStock = currentStock + item.qty

        await db.inventoryBalances.put({
          id: balanceId,
          locationId: sale.locationId,
          productId: item.productId,
          stock: nextStock,
          updatedAt: now,
        })
        await db.syncQueue.put(buildSyncQueueItem('inventoryBalances', balanceId, now))

        const movementId = buildEntityId('mov')
        await db.stockMovements.put({
          id: movementId,
          productId: item.productId,
          locationId: sale.locationId,
          type: 'SALE_CANCEL_IN',
          qty: item.qty,
          reason: `Cancelacion ${reason}`,
          refType: 'SALE',
          refId: sale.id,
          performedBy: input.performedBy,
          createdAt: now,
          updatedAt: now,
        })
        await db.syncQueue.put(buildSyncQueueItem('stockMovements', movementId, now))
      }

      await db.sales.put({
        ...sale,
        status: 'CANCELED',
        canceledAt: now,
        cancellationReason: reason,
        updatedAt: now,
      })
      await db.syncQueue.put(buildSyncQueueItem('sales', sale.id, now))

      const cancellation: SaleCancellation = {
        id: buildEntityId('scancel'),
        saleId: sale.id,
        reason,
        performedBy: input.performedBy,
        createdAt: now,
        updatedAt: now,
      }
      await db.saleCancellations.put(cancellation)
      await db.syncQueue.put(buildSyncQueueItem('saleCancellations', cancellation.id, now))
    },
  )
}
