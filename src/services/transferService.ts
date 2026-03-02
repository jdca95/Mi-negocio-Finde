import { db, buildBalanceId, buildEntityId } from '../db'
import { nowIso } from '../utils/date'
import { buildFolio, getRuntimeMeta } from '../utils/runtime'
import { buildActivityEvent, queueActivityEvent } from './activityService'
import { buildSyncQueueItem } from './syncQueueService'
import type { SaleItemInput, Transfer, TransferItem } from '../types'

interface CreateTransferInput {
  fromLocationId: string
  toLocationId: string
  items: SaleItemInput[]
  notes: string
  performedBy: string
}

export const createTransfer = async (
  input: CreateTransferInput,
): Promise<Transfer> => {
  if (input.fromLocationId === input.toLocationId) {
    throw new Error('Origen y destino deben ser distintos.')
  }

  if (!input.items.length) {
    throw new Error('La transferencia no tiene productos.')
  }

  const dedupMap = new Map<string, number>()
  for (const item of input.items) {
    if (!Number.isInteger(item.qty) || item.qty <= 0) {
      throw new Error('Las cantidades deben ser enteros mayores a cero.')
    }
    dedupMap.set(item.productId, (dedupMap.get(item.productId) ?? 0) + item.qty)
  }

  const normalizedItems = Array.from(dedupMap.entries()).map(([productId, qty]) => ({
    productId,
    qty,
  }))

  const now = nowIso()
  const runtimeMeta = getRuntimeMeta()
  const [fromLocation, toLocation] = await Promise.all([
    db.locations.get(input.fromLocationId),
    db.locations.get(input.toLocationId),
  ])
  if (!fromLocation || !toLocation) {
    throw new Error('Origen o destino no encontrado.')
  }

  const transfer: Transfer = {
    id: buildEntityId('tran'),
    folio: buildFolio(`TRF-${toLocation.code}`, fromLocation.code, now),
    fromLocationId: input.fromLocationId,
    toLocationId: input.toLocationId,
    status: 'COMPLETED',
    notes: input.notes.trim(),
    performedBy: input.performedBy,
    deviceId: runtimeMeta.deviceId,
    sessionId: runtimeMeta.sessionId,
    createdAt: now,
    updatedAt: now,
  }

  await db.transaction(
    'rw',
    [
      db.products,
      db.inventoryBalances,
      db.transfers,
      db.transferItems,
      db.stockMovements,
      db.activityEvents,
      db.syncQueue,
    ],
    async () => {
      for (const item of normalizedItems) {
        const product = await db.products.get(item.productId)
        if (!product) {
          throw new Error('Producto no encontrado en transferencia.')
        }

        const fromBalanceId = buildBalanceId(input.fromLocationId, item.productId)
        const fromBalance = await db.inventoryBalances.get(fromBalanceId)
        const stock = fromBalance?.stock ?? 0
        if (stock < item.qty) {
          throw new Error(`Stock insuficiente en origen para ${product.name}.`)
        }
      }

      await db.transfers.put(transfer)
      await db.syncQueue.put(buildSyncQueueItem('transfers', transfer.id, now))

      for (const item of normalizedItems) {
        const transferItem: TransferItem = {
          id: buildEntityId('tritem'),
          transferId: transfer.id,
          productId: item.productId,
          qty: item.qty,
          createdAt: now,
          updatedAt: now,
        }
        await db.transferItems.put(transferItem)
        await db.syncQueue.put(buildSyncQueueItem('transferItems', transferItem.id, now))

        const fromBalanceId = buildBalanceId(input.fromLocationId, item.productId)
        const fromBalance = await db.inventoryBalances.get(fromBalanceId)
        const fromStock = fromBalance?.stock ?? 0
        await db.inventoryBalances.put({
          id: fromBalanceId,
          locationId: input.fromLocationId,
          productId: item.productId,
          stock: fromStock - item.qty,
          updatedAt: now,
        })
        await db.syncQueue.put(buildSyncQueueItem('inventoryBalances', fromBalanceId, now))

        const toBalanceId = buildBalanceId(input.toLocationId, item.productId)
        const toBalance = await db.inventoryBalances.get(toBalanceId)
        const toStock = toBalance?.stock ?? 0
        await db.inventoryBalances.put({
          id: toBalanceId,
          locationId: input.toLocationId,
          productId: item.productId,
          stock: toStock + item.qty,
          updatedAt: now,
        })
        await db.syncQueue.put(buildSyncQueueItem('inventoryBalances', toBalanceId, now))

        const outMovementId = buildEntityId('mov')
        await db.stockMovements.put({
          id: outMovementId,
          productId: item.productId,
          locationId: input.fromLocationId,
          type: 'TRANSFER_OUT',
          qty: item.qty,
          beforeStock: fromStock,
          afterStock: fromStock - item.qty,
          reason: `Transferencia ${transfer.id}`,
          refType: 'TRANSFER',
          refId: transfer.id,
          performedBy: input.performedBy,
          deviceId: runtimeMeta.deviceId,
          sessionId: runtimeMeta.sessionId,
          createdAt: now,
          updatedAt: now,
        })
        await db.syncQueue.put(buildSyncQueueItem('stockMovements', outMovementId, now))

        const inMovementId = buildEntityId('mov')
        await db.stockMovements.put({
          id: inMovementId,
          productId: item.productId,
          locationId: input.toLocationId,
          type: 'TRANSFER_IN',
          qty: item.qty,
          beforeStock: toStock,
          afterStock: toStock + item.qty,
          reason: `Transferencia ${transfer.id}`,
          refType: 'TRANSFER',
          refId: transfer.id,
          performedBy: input.performedBy,
          deviceId: runtimeMeta.deviceId,
          sessionId: runtimeMeta.sessionId,
          createdAt: now,
          updatedAt: now,
        })
        await db.syncQueue.put(buildSyncQueueItem('stockMovements', inMovementId, now))
      }

      const totalQty = normalizedItems.reduce((sum, item) => sum + item.qty, 0)
      await queueActivityEvent(
        buildActivityEvent({
          action: 'TRANSFER_CREATED',
          entityType: 'TRANSFER',
          entityId: transfer.id,
          locationId: input.fromLocationId,
          relatedLocationId: input.toLocationId,
          qty: totalQty,
          performedBy: input.performedBy,
          createdAt: now,
          summary: `Transferencia registrada: ${transfer.folio ?? transfer.id}`,
          details: `items=${totalQty} | origen=${fromLocation.code} | destino=${toLocation.code}${transfer.notes ? ` | nota=${transfer.notes}` : ''}`,
        }),
      )
    },
  )

  return transfer
}
