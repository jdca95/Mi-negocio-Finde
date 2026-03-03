import { buildEntityId, db } from '../db'
import type { CashEntry, CashEntryType } from '../types'
import { nowIso } from '../utils/date'
import { buildActivityEvent, queueActivityEvent } from './activityService'
import { buildSyncQueueItem } from './syncQueueService'

interface SaveOpeningCashInput {
  dateKey: string
  locationId: string
  amount: number
  performedBy: string
}

interface CreateCashEntryInput {
  dateKey: string
  locationId: string
  type: Exclude<CashEntryType, 'OPENING'>
  amount: number
  notes: string
  performedBy: string
}

const normalizeCurrencyAmount = (
  rawAmount: number,
  { allowZero }: { allowZero: boolean },
): number => {
  const value = Number(rawAmount)
  if (!Number.isFinite(value)) {
    throw new Error('Ingresa un monto valido.')
  }

  const rounded = Number(value.toFixed(2))
  if (allowZero ? rounded < 0 : rounded <= 0) {
    throw new Error(
      allowZero
        ? 'El monto no puede ser negativo.'
        : 'El monto debe ser mayor a cero.',
    )
  }

  return rounded
}

const buildOpeningCashId = (locationId: string, dateKey: string): string =>
  `cash_open_${locationId}_${dateKey}`

export const saveOpeningCash = async ({
  dateKey,
  locationId,
  amount,
  performedBy,
}: SaveOpeningCashInput): Promise<CashEntry> => {
  const normalizedAmount = normalizeCurrencyAmount(amount, { allowZero: true })
  const existing = await db.cashEntries.get(buildOpeningCashId(locationId, dateKey))
  const timestamp = nowIso()
  const entry: CashEntry = {
    id: buildOpeningCashId(locationId, dateKey),
    locationId,
    dateKey,
    type: 'OPENING',
    amount: normalizedAmount,
    notes: '',
    performedBy,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  }

  const activity = buildActivityEvent({
    action: 'CASH_OPENING_SET',
    entityType: 'CASH',
    entityId: entry.id,
    performedBy,
    createdAt: timestamp,
    locationId,
    summary: `Fondo inicial establecido en $${normalizedAmount.toFixed(2)}`,
    details: `Fecha ${dateKey}`,
  })

  await db.transaction(
    'rw',
    db.cashEntries,
    db.activityEvents,
    db.syncQueue,
    async () => {
      await db.cashEntries.put(entry)
      await db.syncQueue.put(buildSyncQueueItem('cashEntries', entry.id, entry.updatedAt))
      await queueActivityEvent(activity)
    },
  )

  return entry
}

export const createCashEntry = async ({
  dateKey,
  locationId,
  type,
  amount,
  notes,
  performedBy,
}: CreateCashEntryInput): Promise<CashEntry> => {
  const normalizedAmount = normalizeCurrencyAmount(amount, { allowZero: false })
  const trimmedNotes = notes.trim()
  if (!trimmedNotes) {
    throw new Error('Agrega un motivo para el movimiento.')
  }

  const timestamp = nowIso()
  const entry: CashEntry = {
    id: buildEntityId('cash'),
    locationId,
    dateKey,
    type,
    amount: normalizedAmount,
    notes: trimmedNotes,
    performedBy,
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  const actionLabel = type === 'WITHDRAWAL' ? 'Retiro' : 'Gasto'
  const activity = buildActivityEvent({
    action: 'CASH_ENTRY_ADDED',
    entityType: 'CASH',
    entityId: entry.id,
    performedBy,
    createdAt: timestamp,
    locationId,
    summary: `${actionLabel} por $${normalizedAmount.toFixed(2)}`,
    details: `${trimmedNotes} (${dateKey})`,
  })

  await db.transaction(
    'rw',
    db.cashEntries,
    db.activityEvents,
    db.syncQueue,
    async () => {
      await db.cashEntries.put(entry)
      await db.syncQueue.put(buildSyncQueueItem('cashEntries', entry.id, entry.updatedAt))
      await queueActivityEvent(activity)
    },
  )

  return entry
}
