import Dexie, { type EntityTable } from 'dexie'
import {
  DEFAULT_LOCATION_ID,
  DEFAULT_LOCATIONS,
  STORAGE_KEYS,
  nowForSeed,
} from './constants'
import type {
  InventoryBalance,
  Location,
  Product,
  Sale,
  SaleCancellation,
  SaleItem,
  Setting,
  StockMovement,
  SyncQueueItem,
  Transfer,
  TransferItem,
  User,
} from './types'
import { hashPin } from './utils/security'

export const buildBalanceId = (locationId: string, productId: string): string =>
  `${locationId}::${productId}`

export const buildEntityId = (prefix: string): string =>
  `${prefix}_${crypto.randomUUID()}`

class MiNegocioFindeDB extends Dexie {
  locations!: EntityTable<Location, 'id'>
  products!: EntityTable<Product, 'id'>
  inventoryBalances!: EntityTable<InventoryBalance, 'id'>
  sales!: EntityTable<Sale, 'id'>
  saleItems!: EntityTable<SaleItem, 'id'>
  saleCancellations!: EntityTable<SaleCancellation, 'id'>
  transfers!: EntityTable<Transfer, 'id'>
  transferItems!: EntityTable<TransferItem, 'id'>
  stockMovements!: EntityTable<StockMovement, 'id'>
  users!: EntityTable<User, 'id'>
  settings!: EntityTable<Setting, 'key'>
  syncQueue!: EntityTable<SyncQueueItem, 'id'>

  constructor() {
    super('MiNegocioFindeDB')
    this.version(1).stores({
      locations: 'id, code, name, type, active, updatedAt',
      products: 'id, name, sku, active, updatedAt',
      inventoryBalances:
        'id, locationId, productId, stock, updatedAt, [locationId+productId], [locationId+stock]',
      sales:
        'id, locationId, paymentMethod, status, createdAt, updatedAt, [locationId+createdAt]',
      saleItems: 'id, saleId, productId, createdAt, updatedAt',
      saleCancellations: 'id, saleId, createdAt, updatedAt',
      transfers: 'id, fromLocationId, toLocationId, createdAt, updatedAt',
      transferItems: 'id, transferId, productId, createdAt, updatedAt',
      stockMovements:
        'id, productId, locationId, type, createdAt, updatedAt, [locationId+createdAt], [productId+createdAt]',
      users: 'id, username, role, active, updatedAt',
      settings: 'key',
      syncQueue: 'id, entityType, status, attempts, updatedAt, createdAt',
    })
  }
}

export const db = new MiNegocioFindeDB()

let seedPromise: Promise<void> | null = null

export const ensureSeedData = async (): Promise<void> => {
  if (!seedPromise) {
    seedPromise = (async () => {
      const [adminPinHash, cashierPinHash] = await Promise.all([
        hashPin('1234'),
        hashPin('0000'),
      ])

      await db.transaction(
        'rw',
        db.locations,
        db.users,
        db.settings,
        async () => {
          const now = nowForSeed()

          if ((await db.locations.count()) === 0) {
            await db.locations.bulkAdd(
              DEFAULT_LOCATIONS.map((location) => ({
                ...location,
                createdAt: now,
                updatedAt: now,
              })),
            )
          }

          if ((await db.users.count()) === 0) {
            await db.users.bulkAdd([
              {
                id: 'user-admin',
                username: 'admin',
                name: 'Administrador',
                role: 'ADMIN',
                pinHash: adminPinHash,
                active: true,
                createdAt: now,
                updatedAt: now,
              },
              {
                id: 'user-cashier',
                username: 'cajero',
                name: 'Cajero',
                role: 'CASHIER',
                pinHash: cashierPinHash,
                active: true,
                createdAt: now,
                updatedAt: now,
              },
            ])
          }

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

      const currentLocation = localStorage.getItem(STORAGE_KEYS.activeLocationId)
      if (!currentLocation) {
        localStorage.setItem(STORAGE_KEYS.activeLocationId, DEFAULT_LOCATION_ID)
      }
    })()
  }

  await seedPromise
}

