import * as XLSX from 'xlsx'
import { PAYMENT_METHOD_LABELS } from '../constants'
import { getDailyCut } from './reportService'

const sanitizeForFilename = (value: string): string =>
  value.replace(/[^a-zA-Z0-9_-]/g, '_')

export const exportDailyExcel = async (
  dateInput: string,
  locationId: string,
): Promise<void> => {
  const summary = await getDailyCut(dateInput, locationId)
  const workbook = XLSX.utils.book_new()

  const resumenRows = [
    ['Sucursal', summary.locationName],
    ['Fecha', summary.date],
    ['Total vendido', summary.totalSold],
    ['Utilidad estimada', summary.estimatedProfit],
    ['Efectivo', summary.byPayment.CASH],
    ['Transferencia', summary.byPayment.TRANSFER],
    ['Tarjeta', summary.byPayment.CARD],
  ]
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(resumenRows),
    'Resumen',
  )

  const ventasRows = summary.sales.map((sale) => ({
    id: sale.id,
    fecha: sale.createdAt,
    metodo: PAYMENT_METHOD_LABELS[sale.paymentMethod],
    total: sale.total,
    utilidad: sale.estimatedProfit,
    estado: sale.status,
  }))
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(ventasRows),
    'Ventas',
  )

  const detalleRows = summary.details.map((detail) => ({
    ventaId: detail.saleId,
    producto: detail.productName,
    qty: detail.qty,
    precio: detail.price,
    costo: detail.cost,
    subtotal: detail.subtotal,
  }))
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(detalleRows),
    'Detalle',
  )

  const inventarioRows = summary.inventoryRows.map((row) => ({
    ubicacion: row.locationName,
    producto: row.productName,
    stockFinal: row.stock,
    precio: row.price,
    costo: row.cost,
  }))
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(inventarioRows),
    'Inventario',
  )

  const locationSafe = sanitizeForFilename(summary.locationName)
  XLSX.writeFile(
    workbook,
    `MiNegocioFinde_${locationSafe}_${summary.date.replaceAll('-', '')}.xlsx`,
  )
}

