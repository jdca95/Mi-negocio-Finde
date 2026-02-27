import { db, buildBalanceId, buildEntityId } from '../db'
import { nowIso } from '../utils/date'
import { buildSyncQueueItem } from './syncQueueService'
import type {
  AdjustmentMode,
  AdjustmentReason,
  InventoryBalance,
  InventoryViewRow,
  Product,
} from '../types'

interface InventoryFilters {
  search: string
  lowStockOnly: boolean
  includeInactive?: boolean
}

interface CreateProductInput {
  name: string
  sku: string
  cost: number
  price: number
  minStock: number
  initialStock: number
  locationId: string
  performedBy: string
}

interface UpdateProductInput {
  name: string
  sku: string
  cost: number
  price: number
  minStock: number
}

interface AdjustStockInput {
  locationId: string
  productId: string
  mode: AdjustmentMode
  quantity: number
  reason: AdjustmentReason
  notes: string
  performedBy: string
}

const sanitizeString = (value: string): string => value.trim()

const assertNonNegative = (value: number, field: string): void => {
  if (Number.isNaN(value) || value < 0) {
    throw new Error(`${field} debe ser un numero mayor o igual a cero.`)
  }
}

const getOrCreateBalance = async (
  locationId: string,
  productId: string,
  updatedAt: string,
): Promise<InventoryBalance> => {
  const id = buildBalanceId(locationId, productId)
  const existing = await db.inventoryBalances.get(id)
  if (existing) {
    return existing
  }

  const created: InventoryBalance = {
    id,
    locationId,
    productId,
    stock: 0,
    updatedAt,
  }
  await db.inventoryBalances.put(created)
  return created
}

export const listInventoryView = async (
  locationId: string,
  filters: InventoryFilters,
): Promise<InventoryViewRow[]> => {
  const [products, balances] = await Promise.all([
    db.products.toArray(),
    db.inventoryBalances.where('locationId').equals(locationId).toArray(),
  ])

  const stockMap = new Map<string, number>()
  for (const balance of balances) {
    stockMap.set(balance.productId, balance.stock)
  }

  const searchValue = sanitizeString(filters.search).toLowerCase()

  return products
    .filter((product) => (filters.includeInactive ? true : product.active))
    .map((product) => {
      const stock = stockMap.get(product.id) ?? 0
      return {
        productId: product.id,
        name: product.name,
        sku: product.sku,
        cost: product.cost,
        price: product.price,
        minStock: product.minStock,
        stock,
        lowStock: stock <= product.minStock,
        active: product.active,
      } satisfies InventoryViewRow
    })
    .filter((row) => {
      if (!searchValue) {
        return true
      }
      return (
        row.name.toLowerCase().includes(searchValue) ||
        row.sku.toLowerCase().includes(searchValue)
      )
    })
    .filter((row) => (filters.lowStockOnly ? row.lowStock : true))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

const normalizeSku = (sku: string): string => sku.trim().toUpperCase()

const findProductBySkuOrName = async (
  sku: string,
  name: string,
): Promise<Product | undefined> => {
  const normalizedSku = normalizeSku(sku)
  const normalizedName = name.trim().toLowerCase()

  const products = await db.products.toArray()
  return products.find((product) => {
    if (normalizedSku && product.sku === normalizedSku) {
      return true
    }
    return product.name.trim().toLowerCase() === normalizedName
  })
}

export const createProduct = async (input: CreateProductInput): Promise<Product> => {
  const name = sanitizeString(input.name)
  const sku = normalizeSku(input.sku)
  const now = nowIso()

  if (!name) {
    throw new Error('Nombre de producto obligatorio.')
  }

  assertNonNegative(input.cost, 'Costo')
  assertNonNegative(input.price, 'Precio')
  assertNonNegative(input.minStock, 'Stock minimo')
  assertNonNegative(input.initialStock, 'Stock inicial')

  const duplicate = await findProductBySkuOrName(sku, name)
  if (duplicate) {
    throw new Error('Ya existe un producto con el mismo nombre o SKU.')
  }

  const product: Product = {
    id: buildEntityId('prod'),
    name,
    sku,
    cost: Number(input.cost),
    price: Number(input.price),
    minStock: Number(input.minStock),
    active: true,
    createdAt: now,
    updatedAt: now,
  }

  await db.transaction(
    'rw',
    [db.products, db.locations, db.inventoryBalances, db.stockMovements, db.syncQueue],
    async () => {
      await db.products.add(product)
      await db.syncQueue.put(buildSyncQueueItem('products', product.id, now))

      const locations = await db.locations.toArray()
      for (const location of locations) {
        const balance: InventoryBalance = {
          id: buildBalanceId(location.id, product.id),
          locationId: location.id,
          productId: product.id,
          stock: location.id === input.locationId ? Number(input.initialStock) : 0,
          updatedAt: now,
        }
        await db.inventoryBalances.put(balance)
        await db.syncQueue.put(buildSyncQueueItem('inventoryBalances', balance.id, now))
      }

      if (input.initialStock > 0) {
        const movementId = buildEntityId('mov')
        await db.stockMovements.add({
          id: movementId,
          productId: product.id,
          locationId: input.locationId,
          type: 'ADJUST_IN',
          qty: input.initialStock,
          reason: 'Inventario inicial',
          refType: 'ADJUSTMENT',
          refId: product.id,
          performedBy: input.performedBy,
          createdAt: now,
          updatedAt: now,
        })
        await db.syncQueue.put(buildSyncQueueItem('stockMovements', movementId, now))
      }
    },
  )

  return product
}

export const updateProduct = async (
  productId: string,
  input: UpdateProductInput,
): Promise<void> => {
  const name = sanitizeString(input.name)
  const sku = normalizeSku(input.sku)
  const now = nowIso()

  if (!name) {
    throw new Error('Nombre de producto obligatorio.')
  }

  assertNonNegative(input.cost, 'Costo')
  assertNonNegative(input.price, 'Precio')
  assertNonNegative(input.minStock, 'Stock minimo')

  const current = await db.products.get(productId)
  if (!current) {
    throw new Error('Producto no encontrado.')
  }

  const duplicate = await findProductBySkuOrName(sku, name)
  if (duplicate && duplicate.id !== productId) {
    throw new Error('Nombre o SKU ya utilizado por otro producto.')
  }

  await db.transaction('rw', db.products, db.syncQueue, async () => {
    await db.products.update(productId, {
      name,
      sku,
      cost: Number(input.cost),
      price: Number(input.price),
      minStock: Number(input.minStock),
      updatedAt: now,
    })
    await db.syncQueue.put(buildSyncQueueItem('products', productId, now))
  })
}

export const setProductActive = async (
  productId: string,
  active: boolean,
): Promise<void> => {
  const now = nowIso()
  await db.transaction('rw', db.products, db.syncQueue, async () => {
    const product = await db.products.get(productId)
    if (!product) {
      throw new Error('Producto no encontrado.')
    }

    await db.products.update(productId, { active, updatedAt: now })
    await db.syncQueue.put(buildSyncQueueItem('products', productId, now))
  })
}

export const adjustStock = async (input: AdjustStockInput): Promise<void> => {
  const now = nowIso()

  if (input.quantity < 0) {
    throw new Error('Cantidad invalida.')
  }

  await db.transaction(
    'rw',
    db.inventoryBalances,
    db.stockMovements,
    db.syncQueue,
    async () => {
      const balance = await getOrCreateBalance(input.locationId, input.productId, now)
      const previousStock = balance.stock

      let newStock = previousStock
      let movementType: 'ADJUST_IN' | 'ADJUST_OUT' | 'ADJUST_SET' = 'ADJUST_IN'
      let movementQty = input.quantity

      if (input.mode === 'IN') {
        movementType = 'ADJUST_IN'
        newStock = previousStock + input.quantity
      } else if (input.mode === 'OUT') {
        movementType = 'ADJUST_OUT'
        newStock = previousStock - input.quantity
      } else {
        movementType = 'ADJUST_SET'
        newStock = input.quantity
        movementQty = input.quantity - previousStock
      }

      if (newStock < 0) {
        throw new Error('No hay stock suficiente para salida.')
      }

      await db.inventoryBalances.put({
        ...balance,
        stock: newStock,
        updatedAt: now,
      })
      await db.syncQueue.put(buildSyncQueueItem('inventoryBalances', balance.id, now))

      const movementId = buildEntityId('mov')
      await db.stockMovements.add({
        id: movementId,
        productId: input.productId,
        locationId: input.locationId,
        type: movementType,
        qty: movementQty,
        reason: `${input.reason}${input.notes ? ` - ${input.notes}` : ''}`,
        refType: 'ADJUSTMENT',
        refId: movementId,
        performedBy: input.performedBy,
        createdAt: now,
        updatedAt: now,
      })
      await db.syncQueue.put(buildSyncQueueItem('stockMovements', movementId, now))
    },
  )
}
