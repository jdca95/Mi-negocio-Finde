import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  query,
  setDoc,
  where,
} from 'firebase/firestore'
import type { Table } from 'dexie'
import { db } from '../db'
import type { SyncEntityType, SyncRunResult } from '../types'
import { nowIso } from '../utils/date'

const REQUIRED_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
] as const

let firebaseApp: FirebaseApp | null = null

type SyncRecord = {
  id: string
  updatedAt: string
  [key: string]: unknown
}

const getFirestoreInstance = () => {
  if (!firebaseApp) {
    firebaseApp =
      getApps()[0] ??
      initializeApp({
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        appId: import.meta.env.VITE_FIREBASE_APP_ID,
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      })
  }
  return getFirestore(firebaseApp)
}

const getEntityTable = (entityType: SyncEntityType): Table<SyncRecord, string> => {
  switch (entityType) {
    case 'products':
      return db.products as unknown as Table<SyncRecord, string>
    case 'inventoryBalances':
      return db.inventoryBalances as unknown as Table<SyncRecord, string>
    case 'sales':
      return db.sales as unknown as Table<SyncRecord, string>
    case 'saleItems':
      return db.saleItems as unknown as Table<SyncRecord, string>
    case 'saleCancellations':
      return db.saleCancellations as unknown as Table<SyncRecord, string>
    case 'transfers':
      return db.transfers as unknown as Table<SyncRecord, string>
    case 'transferItems':
      return db.transferItems as unknown as Table<SyncRecord, string>
    case 'stockMovements':
      return db.stockMovements as unknown as Table<SyncRecord, string>
    default:
      return db.products as unknown as Table<SyncRecord, string>
  }
}

export const isFirebaseConfigured = (): boolean =>
  REQUIRED_KEYS.every((key) => Boolean(import.meta.env[key]))

const ENTITY_TYPES: SyncEntityType[] = [
  'products',
  'inventoryBalances',
  'sales',
  'saleItems',
  'saleCancellations',
  'transfers',
  'transferItems',
  'stockMovements',
]

const parseError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export const syncNow = async (): Promise<SyncRunResult> => {
  if (!isFirebaseConfigured()) {
    return {
      status: 'disabled',
      pushed: 0,
      pulled: 0,
      failed: 0,
      message: 'Firebase no configurado. Modo local-only activo.',
    }
  }

  const firestore = getFirestoreInstance()
  const syncStartedAt = nowIso()

  let pushed = 0
  let pulled = 0
  let failed = 0

  try {
    const lastSyncAtSetting = await db.settings.get('lastSyncAt')
    const lastSyncAt = lastSyncAtSetting?.value ?? '1970-01-01T00:00:00.000Z'

    const queueItems = await db.syncQueue.toArray()
    for (const queueItem of queueItems) {
      const table = getEntityTable(queueItem.entityType)
      const record = await table.get(queueItem.entityId)

      if (!record) {
        await db.syncQueue.delete(queueItem.id)
        continue
      }

      try {
        await setDoc(
          doc(firestore, queueItem.entityType, queueItem.entityId),
          record as Record<string, unknown>,
          { merge: true },
        )
        await db.syncQueue.delete(queueItem.id)
        pushed += 1
      } catch (error) {
        failed += 1
        await db.syncQueue.put({
          ...queueItem,
          status: 'FAILED',
          attempts: queueItem.attempts + 1,
          lastError: parseError(error),
          updatedAt: nowIso(),
        })
      }
    }

    for (const entityType of ENTITY_TYPES) {
      const snapshot = await getDocs(
        query(collection(firestore, entityType), where('updatedAt', '>', lastSyncAt)),
      )

      const table = getEntityTable(entityType)
      for (const row of snapshot.docs) {
        const remote = row.data() as Record<string, unknown>
        if (!remote.id || typeof remote.id !== 'string') {
          continue
        }
        if (!remote.updatedAt || typeof remote.updatedAt !== 'string') {
          continue
        }

        const remoteRecord = remote as SyncRecord
        const local = await table.get(remoteRecord.id)
        if (!local || !local.updatedAt || remote.updatedAt > local.updatedAt) {
          await table.put(remoteRecord)
          await db.syncQueue.delete(`${entityType}:${remoteRecord.id}`)
          pulled += 1
        }
      }
    }

    await db.settings.put({ key: 'lastSyncAt', value: syncStartedAt })
    return {
      status: failed > 0 ? 'error' : 'ok',
      pushed,
      pulled,
      failed,
      message:
        failed > 0
          ? 'Sincronizacion parcial completada con errores.'
          : 'Sincronizacion completada.',
    }
  } catch (error) {
    return {
      status: 'error',
      pushed,
      pulled,
      failed: failed + 1,
      message: `Error de sincronizacion: ${parseError(error)}`,
    }
  }
}
