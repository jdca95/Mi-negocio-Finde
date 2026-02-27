import { PAYMENT_METHOD_LABELS } from '../constants'
import type { PaymentMethod } from '../types'

export const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 2,
  }).format(value)

export const formatPaymentMethod = (method: PaymentMethod): string =>
  PAYMENT_METHOD_LABELS[method]

export const formatNumber = (value: number): string =>
  new Intl.NumberFormat('es-MX').format(value)

