import { WAREHOUSE_LOCATION_ID } from '../constants'
import { db } from '../db'
import type {
  CashEntry,
  DailyCutCashEntryRow,
  DailyCutDetailRow,
  DailyCutInventoryRow,
  DailyCutSaleRow,
  DailyCutSummary,
  PeriodReport,
  ReportFilters,
  TopProductMetric,
} from '../types'
import {
  enumerateDateKeys,
  getDateKeyFromIso,
  toIsoDayBounds,
  toIsoRangeBounds,
} from '../utils/date'

const roundTwo = (value: number): number => Number(value.toFixed(2))

const sortCashEntries = (entries: CashEntry[]): CashEntry[] =>
  [...entries].sort((left, right) => {
    if (left.type === 'OPENING' && right.type !== 'OPENING') {
      return -1
    }
    if (left.type !== 'OPENING' && right.type === 'OPENING') {
      return 1
    }
    return right.createdAt.localeCompare(left.createdAt)
  })

export const getDailyCut = async (
  dateInput: string,
  locationId: string,
): Promise<DailyCutSummary> => {
  const { startIso, endIso } = toIsoDayBounds(dateInput)

  const [location, locations, sales, cashEntries] = await Promise.all([
    db.locations.get(locationId),
    db.locations.toArray(),
    db.sales
      .where('locationId')
      .equals(locationId)
      .filter((sale) => sale.createdAt >= startIso && sale.createdAt <= endIso)
      .toArray(),
    db.cashEntries
      .where('[locationId+dateKey]')
      .equals([locationId, dateInput])
      .toArray(),
  ])

  if (!location) {
    throw new Error('Sucursal no encontrada.')
  }

  const saleIds = sales.map((sale) => sale.id)
  const saleItems =
    saleIds.length === 0
      ? []
      : await db.saleItems.where('saleId').anyOf(saleIds).toArray()

  const productIds = Array.from(new Set(saleItems.map((item) => item.productId)))
  const products =
    productIds.length === 0
      ? []
      : await db.products.where('id').anyOf(productIds).toArray()
  const productsMap = new Map(products.map((product) => [product.id, product]))

  const salesRows: DailyCutSaleRow[] = sales
    .map((sale) => ({
      id: sale.id,
      createdAt: sale.createdAt,
      paymentMethod: sale.paymentMethod,
      total: sale.total,
      estimatedProfit: sale.estimatedProfit,
      status: sale.status,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  const details: DailyCutDetailRow[] = saleItems
    .map((item) => ({
      saleId: item.saleId,
      productName: productsMap.get(item.productId)?.name ?? 'Producto eliminado',
      qty: item.qty,
      price: item.priceSnapshot,
      cost: item.costSnapshot,
      subtotal: item.subtotal,
    }))
    .sort((a, b) => a.saleId.localeCompare(b.saleId, 'es'))

  const byPayment = {
    CASH: 0,
    TRANSFER: 0,
    CARD: 0,
  }

  let totalSold = 0
  let estimatedProfit = 0
  for (const sale of sales) {
    if (sale.status !== 'COMPLETED') {
      continue
    }
    totalSold += sale.total
    estimatedProfit += sale.estimatedProfit
    byPayment[sale.paymentMethod] += sale.total
  }

  const performerIds = Array.from(new Set(cashEntries.map((entry) => entry.performedBy)))
  const users =
    performerIds.length === 0
      ? []
      : await db.users.where('id').anyOf(performerIds).toArray()
  const usersMap = new Map(users.map((user) => [user.id, user.name]))

  let openingCash = 0
  let withdrawalsTotal = 0
  let expensesTotal = 0
  for (const entry of cashEntries) {
    if (entry.type === 'OPENING') {
      openingCash = entry.amount
      continue
    }
    if (entry.type === 'WITHDRAWAL') {
      withdrawalsTotal += entry.amount
      continue
    }
    expensesTotal += entry.amount
  }

  const cashRows: DailyCutCashEntryRow[] = sortCashEntries(cashEntries).map((entry) => ({
    id: entry.id,
    createdAt: entry.createdAt,
    type: entry.type,
    amount: entry.amount,
    notes: entry.notes,
    performedBy: entry.performedBy,
    performedByName: usersMap.get(entry.performedBy) ?? entry.performedBy,
  }))

  const locationIds = Array.from(new Set([locationId, WAREHOUSE_LOCATION_ID]))
  const balances = await db.inventoryBalances
    .where('locationId')
    .anyOf(locationIds)
    .toArray()

  const allProducts = await db.products.toArray()
  const allProductsMap = new Map(allProducts.map((product) => [product.id, product]))
  const locationMap = new Map(locations.map((entry) => [entry.id, entry.name]))

  const inventoryRows: DailyCutInventoryRow[] = balances
    .map((balance) => {
      const product = allProductsMap.get(balance.productId)
      if (!product) {
        return null
      }
      return {
        locationName: locationMap.get(balance.locationId) ?? balance.locationId,
        productName: product.name,
        stock: balance.stock,
        price: product.price,
        cost: product.cost,
      } satisfies DailyCutInventoryRow
    })
    .filter((row): row is DailyCutInventoryRow => Boolean(row))
    .sort((a, b) => {
      const locationCompare = a.locationName.localeCompare(b.locationName, 'es')
      if (locationCompare !== 0) {
        return locationCompare
      }
      return a.productName.localeCompare(b.productName, 'es')
    })

  return {
    date: dateInput,
    locationId,
    locationName: location.name,
    totalSold: roundTwo(totalSold),
    estimatedProfit: roundTwo(estimatedProfit),
    byPayment: {
      CASH: roundTwo(byPayment.CASH),
      TRANSFER: roundTwo(byPayment.TRANSFER),
      CARD: roundTwo(byPayment.CARD),
    },
    openingCash: roundTwo(openingCash),
    withdrawalsTotal: roundTwo(withdrawalsTotal),
    expensesTotal: roundTwo(expensesTotal),
    expectedCash: roundTwo(
      openingCash + byPayment.CASH - withdrawalsTotal - expensesTotal,
    ),
    sales: salesRows,
    details,
    inventoryRows,
    cashEntries: cashRows,
  }
}

export const getPeriodReport = async (
  filters: ReportFilters,
): Promise<PeriodReport> => {
  const { startIso, endIso } = toIsoRangeBounds(filters.startDate, filters.endDate)
  const allSalesInRange = await db.sales
    .where('createdAt')
    .between(startIso, endIso, true, true)
    .toArray()

  const scopedSales = allSalesInRange.filter((sale) =>
    filters.locationId === 'ALL' ? true : sale.locationId === filters.locationId,
  )

  const completedSales = scopedSales.filter((sale) => sale.status === 'COMPLETED')
  const saleIds = completedSales.map((sale) => sale.id)
  const saleItems =
    saleIds.length === 0
      ? []
      : await db.saleItems.where('saleId').anyOf(saleIds).toArray()

  const productIds = Array.from(new Set(saleItems.map((item) => item.productId)))
  const products =
    productIds.length === 0
      ? []
      : await db.products.where('id').anyOf(productIds).toArray()
  const productsMap = new Map(products.map((product) => [product.id, product.name]))

  const dateKeys = enumerateDateKeys(filters.startDate, filters.endDate)
  const salesByDayMap = new Map(dateKeys.map((date) => [date, 0]))
  const profitByDayMap = new Map(dateKeys.map((date) => [date, 0]))

  const saleMap = new Map(completedSales.map((sale) => [sale.id, sale]))
  for (const sale of completedSales) {
    const dateKey = getDateKeyFromIso(sale.createdAt)
    salesByDayMap.set(dateKey, (salesByDayMap.get(dateKey) ?? 0) + sale.total)
    profitByDayMap.set(
      dateKey,
      (profitByDayMap.get(dateKey) ?? 0) + sale.estimatedProfit,
    )
  }

  const topMap = new Map<string, TopProductMetric>()
  for (const item of saleItems) {
    const sale = saleMap.get(item.saleId)
    if (!sale) {
      continue
    }

    const current = topMap.get(item.productId) ?? {
      productId: item.productId,
      productName: productsMap.get(item.productId) ?? 'Producto eliminado',
      qty: 0,
      revenue: 0,
      profit: 0,
    }

    current.qty += item.qty
    current.revenue += item.subtotal
    current.profit += (item.priceSnapshot - item.costSnapshot) * item.qty
    topMap.set(item.productId, current)
  }

  const topArray = Array.from(topMap.values()).map((item) => ({
    ...item,
    revenue: roundTwo(item.revenue),
    profit: roundTwo(item.profit),
  }))

  const topByQty = [...topArray].sort((a, b) => b.qty - a.qty).slice(0, 10)
  const topByRevenue = [...topArray]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
  const top20 = [...topArray].sort((a, b) => b.revenue - a.revenue).slice(0, 20)

  const salesByDay = dateKeys.map((date) => ({
    date,
    total: roundTwo(salesByDayMap.get(date) ?? 0),
  }))
  const profitByDay = dateKeys.map((date) => ({
    date,
    total: roundTwo(profitByDayMap.get(date) ?? 0),
  }))

  return {
    filters,
    topByQty,
    topByRevenue,
    top20,
    salesByDay,
    profitByDay,
  }
}
