import { STORAGE_KEYS } from '../constants'

const buildId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`

const getStorage = (type: 'local' | 'session'): Storage => {
  if (type === 'session') {
    return window.sessionStorage
  }
  return window.localStorage
}

const getOrCreate = (
  storageType: 'local' | 'session',
  key: string,
  prefix: string,
): string => {
  const storage = getStorage(storageType)
  const existing = storage.getItem(key)
  if (existing) {
    return existing
  }

  const created = buildId(prefix)
  storage.setItem(key, created)
  return created
}

const compactDate = (iso: string): string => {
  const date = new Date(iso)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('')
}

export const ensureDeviceId = (): string =>
  getOrCreate('local', STORAGE_KEYS.deviceId, 'device')

export const ensureRuntimeSessionId = (): string =>
  getOrCreate('session', STORAGE_KEYS.runtimeSessionId, 'session')

export const resetRuntimeSessionId = (): string => {
  window.sessionStorage.removeItem(STORAGE_KEYS.runtimeSessionId)
  return ensureRuntimeSessionId()
}

export const getRuntimeMeta = (): { deviceId: string; sessionId: string } => ({
  deviceId: ensureDeviceId(),
  sessionId: ensureRuntimeSessionId(),
})

export const buildFolio = (
  prefix: string,
  locationCode: string,
  iso: string,
): string => {
  const safeLocationCode = locationCode.trim().toUpperCase() || 'GEN'
  return `${prefix}-${safeLocationCode}-${compactDate(iso)}`
}

