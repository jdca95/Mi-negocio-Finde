import { STORAGE_KEYS } from '../constants'
import { db } from '../db'
import type { User } from '../types'
import { hashPin } from '../utils/security'

export const setSessionUserId = (userId: string): void => {
  localStorage.setItem(STORAGE_KEYS.sessionUserId, userId)
}

export const clearSession = (): void => {
  localStorage.removeItem(STORAGE_KEYS.sessionUserId)
}

export const getSessionUserId = (): string | null =>
  localStorage.getItem(STORAGE_KEYS.sessionUserId)

export const getSessionUser = async (): Promise<User | null> => {
  const userId = getSessionUserId()
  if (!userId) {
    return null
  }

  const user = await db.users.get(userId)
  return user && user.active ? user : null
}

export const login = async (
  username: string,
  pin: string,
): Promise<{ user: User | null; error: string }> => {
  const sanitized = username.trim().toLowerCase()
  if (!sanitized || !pin.trim()) {
    return { user: null, error: 'Usuario y PIN son obligatorios.' }
  }

  const candidates = await db.users.where('username').equals(sanitized).toArray()
  const user = candidates.find((entry) => entry.active)
  if (!user) {
    return { user: null, error: 'Usuario no encontrado.' }
  }

  const pinHash = await hashPin(pin)
  if (pinHash !== user.pinHash) {
    return { user: null, error: 'PIN incorrecto.' }
  }

  setSessionUserId(user.id)
  return { user, error: '' }
}

