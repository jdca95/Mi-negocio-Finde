import { db, buildBalanceId, buildEntityId } from '../db'
import { nowIso } from '../utils/date'
import { getRuntimeMeta } from '../utils/runtime'
import { buildSyncQueueItem } from './syncQueueService'
import type { CsvProductRow, CsvValidationResult, Product } from '../types'

const normalizeHeader = (value: string): string => value.trim().toLowerCase()

const parseCsvLine = (line: string): string[] => {
  const values: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (char === '"') {
      const next = line[i + 1]
      if (inQuotes && next === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      values.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  values.push(current.trim())
  return values
}

const parsePositiveOrZero = (
  value: string,
  field: string,
  line: number,
  errors: string[],
): number => {
  const parsed = Number(value)
  if (Number.isNaN(parsed) || parsed < 0) {
    errors.push(`Linea ${line}: ${field} invalido.`)
    return 0
  }
  return parsed
}

export const parseProductsCsv = (rawText: string): CsvValidationResult => {
  const text = rawText.trim()
  if (!text) {
    return { rows: [], errors: ['El CSV esta vacio.'] }
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length < 2) {
    return { rows: [], errors: ['Se requiere cabecera y al menos una fila.'] }
  }

  const headers = parseCsvLine(lines[0]).map(normalizeHeader)
  const requiredHeaders = ['name', 'cost', 'price', 'stock']
  const errors: string[] = []

  for (const required of requiredHeaders) {
    if (!headers.includes(required)) {
      errors.push(`Falta columna obligatoria: ${required}`)
    }
  }
  if (errors.length > 0) {
    return { rows: [], errors }
  }

  const headerIndex = (header: string): number => headers.indexOf(header)

  const rows: CsvProductRow[] = []
  for (let i = 1; i < lines.length; i += 1) {
    const lineNumber = i + 1
    const columns = parseCsvLine(lines[i])

    const name = (columns[headerIndex('name')] ?? '').trim()
    if (!name) {
      errors.push(`Linea ${lineNumber}: name es obligatorio.`)
      continue
    }

    const cost = parsePositiveOrZero(
      columns[headerIndex('cost')] ?? '',
      'cost',
      lineNumber,
      errors,
    )
    const price = parsePositiveOrZero(
      columns[headerIndex('price')] ?? '',
      'price',
      lineNumber,
      errors,
    )
    const stock = parsePositiveOrZero(
      columns[headerIndex('stock')] ?? '',
      'stock',
      lineNumber,
      errors,
    )

    const sku = (columns[headerIndex('sku')] ?? '').trim().toUpperCase()
    const locationCode = (columns[headerIndex('locationcode')] ?? '').trim().toUpperCase()

    rows.push({
      name,
      sku,
      cost,
      price,
      stock,
      locationCode: locationCode || undefined,
    })
  }

  return { rows, errors }
}

interface ImportRowsInput {
  rows: CsvProductRow[]
  fallbackLocationId: string
  performedBy: string
}

interface ImportRowsResult {
  created: number
  updated: number
}

const normalizeName = (value: string): string => value.trim().toLowerCase()

const findExistingProduct = async (
  row: CsvProductRow,
  products: Product[],
): Promise<Product | undefined> => {
  if (row.sku) {
    return products.find((product) => product.sku === row.sku)
  }
  const normalized = normalizeName(row.name)
  return products.find((product) => normalizeName(product.name) === normalized)
}

export const importProductsFromCsv = async (
  input: ImportRowsInput,
): Promise<ImportRowsResult> => {
  if (!input.rows.length) {
    return { created: 0, updated: 0 }
  }

  const now = nowIso()
  const runtimeMeta = getRuntimeMeta()
  let created = 0
  let updated = 0

  await db.transaction(
    'rw',
    [
      db.locations,
      db.products,
      db.inventoryBalances,
      db.stockMovements,
      db.syncQueue,
    ],
    async () => {
      const [locations, products] = await Promise.all([
        db.locations.toArray(),
        db.products.toArray(),
      ])
      const locationByCode = new Map(
        locations.map((location) => [location.code.toUpperCase(), location.id]),
      )

      for (const row of input.rows) {
        const targetLocationId =
          (row.locationCode ? locationByCode.get(row.locationCode) : undefined) ??
          input.fallbackLocationId

        if (!targetLocationId) {
          throw new Error(`Ubicacion invalida para producto ${row.name}`)
        }

        const existing = await findExistingProduct(row, products)
        let targetProduct: Product
        if (!existing) {
          const productId = buildEntityId('prod')
          const newProduct: Product = {
            id: productId,
            name: row.name.trim(),
            sku: row.sku.trim().toUpperCase(),
            cost: row.cost,
            price: row.price,
            minStock: 0,
            active: true,
            createdAt: now,
            updatedAt: now,
          }
          await db.products.put(newProduct)
          await db.syncQueue.put(buildSyncQueueItem('products', productId, now))
          products.push(newProduct)
          targetProduct = newProduct
          created += 1

          for (const location of locations) {
            const balance = {
              id: buildBalanceId(location.id, productId),
              locationId: location.id,
              productId,
              stock: 0,
              updatedAt: now,
            }
            await db.inventoryBalances.put(balance)
            await db.syncQueue.put(buildSyncQueueItem('inventoryBalances', balance.id, now))
          }
        } else {
          const refreshed: Product = {
            ...existing,
            name: row.name.trim(),
            sku: row.sku.trim().toUpperCase(),
            cost: row.cost,
            price: row.price,
            active: true,
            updatedAt: now,
          }
          await db.products.put({
            ...refreshed,
          })
          await db.syncQueue.put(buildSyncQueueItem('products', existing.id, now))
          targetProduct = refreshed
          const index = products.findIndex((product) => product.id === refreshed.id)
          if (index >= 0) {
            products[index] = refreshed
          }
          updated += 1
        }

        const balanceId = buildBalanceId(targetLocationId, targetProduct.id)
        const existingBalance = await db.inventoryBalances.get(balanceId)
        await db.inventoryBalances.put({
          id: balanceId,
          locationId: targetLocationId,
          productId: targetProduct.id,
          stock: row.stock,
          updatedAt: now,
        })
        await db.syncQueue.put(buildSyncQueueItem('inventoryBalances', balanceId, now))

        const movementId = buildEntityId('mov')
        await db.stockMovements.put({
          id: movementId,
          productId: targetProduct.id,
          locationId: targetLocationId,
          type: 'ADJUST_SET',
          qty: row.stock,
          beforeStock: existingBalance?.stock ?? 0,
          afterStock: row.stock,
          reason: 'Importacion CSV',
          refType: 'ADJUSTMENT',
          refId: movementId,
          performedBy: input.performedBy,
          deviceId: runtimeMeta.deviceId,
          sessionId: runtimeMeta.sessionId,
          createdAt: now,
          updatedAt: now,
        })
        await db.syncQueue.put(buildSyncQueueItem('stockMovements', movementId, now))
      }
    },
  )

  return { created, updated }
}
