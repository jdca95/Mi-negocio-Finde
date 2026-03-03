import { APP_NAME, BACKUP_SCHEMA_VERSION, DEFAULT_LOCATION_ID } from '../constants'
import { db } from '../db'
import type { BackupPayload } from '../types'
import { nowIso } from '../utils/date'

const downloadTextFile = (filename: string, content: string): void => {
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

const parseBackup = (rawText: string): BackupPayload => {
  let payload: unknown
  try {
    payload = JSON.parse(rawText)
  } catch {
    throw new Error('El archivo no contiene JSON valido.')
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('Formato de respaldo invalido.')
  }

  const typedPayload = payload as Partial<BackupPayload>
  if (!typedPayload.data || typeof typedPayload.data !== 'object') {
    throw new Error('El respaldo no contiene datos.')
  }

  const requiredCollections: Array<keyof BackupPayload['data']> = [
    'locations',
    'products',
    'inventoryBalances',
    'sales',
    'saleItems',
    'saleCancellations',
    'transfers',
    'transferItems',
    'stockMovements',
    'users',
    'settings',
    'syncQueue',
  ]

  for (const key of requiredCollections) {
    const collection = typedPayload.data[key]
    if (!Array.isArray(collection)) {
      throw new Error(`Coleccion faltante o invalida: ${key}`)
    }
  }

  if (!Array.isArray(typedPayload.data.activityEvents)) {
    ;(typedPayload.data as BackupPayload['data']).activityEvents = []
  }
  if (!Array.isArray(typedPayload.data.cashEntries)) {
    ;(typedPayload.data as BackupPayload['data']).cashEntries = []
  }

  return typedPayload as BackupPayload
}

export const exportFullBackup = async (): Promise<void> => {
  const [
    locations,
    products,
    inventoryBalances,
    sales,
    saleItems,
    saleCancellations,
    transfers,
    transferItems,
    cashEntries,
    stockMovements,
    activityEvents,
    users,
    settings,
    syncQueue,
  ] = await Promise.all([
    db.locations.toArray(),
    db.products.toArray(),
    db.inventoryBalances.toArray(),
    db.sales.toArray(),
    db.saleItems.toArray(),
    db.saleCancellations.toArray(),
    db.transfers.toArray(),
    db.transferItems.toArray(),
    db.cashEntries.toArray(),
    db.stockMovements.toArray(),
    db.activityEvents.toArray(),
    db.users.toArray(),
    db.settings.toArray(),
    db.syncQueue.toArray(),
  ])

  const exportedAt = nowIso()
  const payload: BackupPayload = {
    metadata: {
      appName: APP_NAME,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt,
    },
    data: {
      locations,
      products,
      inventoryBalances,
      sales,
      saleItems,
      saleCancellations,
      transfers,
      transferItems,
      cashEntries,
      stockMovements,
      activityEvents,
      users,
      settings,
      syncQueue,
    },
  }

  downloadTextFile(
    `MiNegocioFinde_Backup_${exportedAt.slice(0, 10).replaceAll('-', '')}.json`,
    JSON.stringify(payload, null, 2),
  )
}

export const importFullBackup = async (rawText: string): Promise<void> => {
  const payload = parseBackup(rawText)

  await db.transaction(
    'rw',
    [
      db.locations,
      db.products,
      db.inventoryBalances,
      db.sales,
      db.saleItems,
      db.saleCancellations,
      db.transfers,
      db.transferItems,
      db.cashEntries,
      db.stockMovements,
      db.activityEvents,
      db.users,
      db.settings,
      db.syncQueue,
    ],
    async () => {
      await Promise.all([
        db.syncQueue.clear(),
        db.stockMovements.clear(),
        db.transferItems.clear(),
        db.transfers.clear(),
        db.saleCancellations.clear(),
        db.saleItems.clear(),
        db.sales.clear(),
        db.cashEntries.clear(),
        db.inventoryBalances.clear(),
        db.products.clear(),
        db.activityEvents.clear(),
        db.users.clear(),
        db.locations.clear(),
        db.settings.clear(),
      ])

      await Promise.all([
        db.locations.bulkPut(payload.data.locations),
        db.products.bulkPut(payload.data.products),
        db.inventoryBalances.bulkPut(payload.data.inventoryBalances),
        db.sales.bulkPut(payload.data.sales),
        db.saleItems.bulkPut(payload.data.saleItems),
        db.saleCancellations.bulkPut(payload.data.saleCancellations),
        db.transfers.bulkPut(payload.data.transfers),
        db.transferItems.bulkPut(payload.data.transferItems),
        db.cashEntries.bulkPut(payload.data.cashEntries),
        db.stockMovements.bulkPut(payload.data.stockMovements),
        db.activityEvents.bulkPut(payload.data.activityEvents),
        db.users.bulkPut(payload.data.users),
        db.settings.bulkPut(payload.data.settings),
        db.syncQueue.bulkPut(payload.data.syncQueue),
      ])

      if (!(await db.settings.get('activeLocationId'))) {
        await db.settings.put({ key: 'activeLocationId', value: DEFAULT_LOCATION_ID })
      }

      if (!(await db.settings.get('lastSyncAt'))) {
        await db.settings.put({
          key: 'lastSyncAt',
          value: '1970-01-01T00:00:00.000Z',
        })
      }
    },
  )
}
