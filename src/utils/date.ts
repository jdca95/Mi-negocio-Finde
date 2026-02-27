import type { PeriodPreset } from '../types'

const pad = (value: number): string => String(value).padStart(2, '0')

export const nowIso = (): string => new Date().toISOString()

export const toDateInputValue = (value: Date): string =>
  `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`

export const todayInputValue = (): string => toDateInputValue(new Date())

export const toLocalDayBounds = (dateInput: string): { start: Date; end: Date } => {
  const [year, month, day] = dateInput.split('-').map(Number)
  const start = new Date(year, (month || 1) - 1, day || 1, 0, 0, 0, 0)
  const end = new Date(year, (month || 1) - 1, day || 1, 23, 59, 59, 999)
  return { start, end }
}

export const toIsoDayBounds = (
  dateInput: string,
): { startIso: string; endIso: string } => {
  const { start, end } = toLocalDayBounds(dateInput)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

export const toIsoRangeBounds = (
  startDateInput: string,
  endDateInput: string,
): { startIso: string; endIso: string } => {
  const start = toLocalDayBounds(startDateInput).start
  const end = toLocalDayBounds(endDateInput).end
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

export const getDateKeyFromIso = (iso: string): string => {
  const date = new Date(iso)
  return toDateInputValue(date)
}

export const enumerateDateKeys = (
  startDateInput: string,
  endDateInput: string,
): string[] => {
  const start = toLocalDayBounds(startDateInput).start
  const end = toLocalDayBounds(endDateInput).end
  const result: string[] = []
  const pointer = new Date(start)
  while (pointer <= end) {
    result.push(toDateInputValue(pointer))
    pointer.setDate(pointer.getDate() + 1)
  }
  return result
}

export const resolvePeriodRange = (
  period: PeriodPreset,
  customStart: string,
  customEnd: string,
): { startDate: string; endDate: string } => {
  const today = new Date()
  const endDate = toDateInputValue(today)

  if (period === 'CUSTOM') {
    return { startDate: customStart, endDate: customEnd }
  }

  if (period === 'TODAY') {
    return { startDate: endDate, endDate }
  }

  if (period === 'WEEK') {
    const start = new Date(today)
    const day = start.getDay()
    const distanceFromMonday = day === 0 ? 6 : day - 1
    start.setDate(start.getDate() - distanceFromMonday)
    return { startDate: toDateInputValue(start), endDate }
  }

  const start = new Date(today.getFullYear(), today.getMonth(), 1)
  return { startDate: toDateInputValue(start), endDate }
}

export const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString('es-MX', {
    dateStyle: 'short',
    timeStyle: 'short',
  })

