import type { Table } from 'dexie'
import type { FirebaseApp } from 'firebase/app'
import { buildBalanceId, db } from '../db'
import type {
  InventoryBalance,
  MovementType,
  StockMovement,
  SyncEntityType,
  SyncRunResult,
  User,
  Location,
} from '../types'
import { nowIso } from '../utils/date'

const REQUIRED_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
] as const

const BASELINE_SYNC_AT = '1970-01-01T00:00:00.000Z'

const PUSH_ENTITY_TYPES: SyncEntityType[] = [
  'products',
  'inventoryBalances',
  'sales',
  'saleItems',
  'saleCancellations',
  'transfers',
  'transferItems',
  'stockMovements',
]

type RemoteEntityType = SyncEntityType | 'locations' | 'users'

const REMOTE_ENTITY_TYPES: RemoteEntityType[] = [
  'locations',
  'users',
  ...PUSH_ENTITY_TYPES,
]

type SyncRecord = {
  id: string
  updatedAt: string
  [key: string]: unknown
}

let firebaseApp: FirebaseApp | null = null
let firebaseModulesPromise: Promise<{
  app: typeof import('firebase/app')
  firestore: typeof import('firebase/firestore')
}> | null = null
let realtimeCleanup: (() => void) | null = null

const MOVEMENT_OUT_TYPES: MovementType[] = ['SALE_OUT', 'TRANSFER_OUT', 'ADJUST_OUT']

const getFirebaseModules = async () => {
  if (!firebaseModulesPromise) {
    firebaseModulesPromise = Promise.all([
      import('firebase/app'),
      import('firebase/firestore'),
    ]).then(([app, firestore]) => ({ app, firestore }))
  }

  return firebaseModulesPromise
}

const getFirestoreInstance = async () => {
  const firebase = await getFirebaseModules()
  if (!firebaseApp) {
    firebaseApp =
      firebase.app.getApps()[0] ??
      firebase.app.initializeApp({
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        appId: import.meta.env.VITE_FIREBASE_APP_ID,
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      })
  }
  return {
    db: firebase.firestore.getFirestore(firebaseApp),
    firestore: firebase.firestore,
  }
}

const getEntityTable = (entityType: RemoteEntityType): Table<SyncRecord, string> => {
  switch (entityType) {
    case 'locations':
      return db.locations as unknown as Table<SyncRecord, string>
    case 'users':
      return db.users as unknown as Table<SyncRecord, string>
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

const parseError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const sortByUpdatedAtDesc = <T extends { updatedAt: string }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

const movementSortKey = (movement: StockMovement): string =>
  `${movement.createdAt}|${movement.updatedAt}|${movement.id}`

const calculateMovementDelta = (movement: StockMovement): number =>
  MOVEMENT_OUT_TYPES.includes(movement.type)
    ? -Math.abs(movement.qty)
    : Math.abs(movement.qty)

const rebuildInventoryBalancesFromMovements = async (): Promise<number> => {
  const [existingBalances, movements] = await Promise.all([
    db.inventoryBalances.toArray(),
    db.stockMovements.toArray(),
  ])

  const nextBalances = new Map<string, InventoryBalance>()
  for (const balance of existingBalances) {
    nextBalances.set(balance.id, { ...balance })
  }

  const touched = new Set<string>()
  const sortedMovements = [...movements].sort((a, b) =>
    movementSortKey(a).localeCompare(movementSortKey(b)),
  )

  for (const movement of sortedMovements) {
    const balanceId = buildBalanceId(movement.locationId, movement.productId)
    const existing =
      nextBalances.get(balanceId) ??
      ({
        id: balanceId,
        locationId: movement.locationId,
        productId: movement.productId,
        stock: 0,
        updatedAt: movement.updatedAt,
      } satisfies InventoryBalance)

    const baseStock = touched.has(balanceId) ? existing.stock : 0
    const nextStock =
      typeof movement.afterStock === 'number'
        ? movement.afterStock
        : baseStock + calculateMovementDelta(movement)

    nextBalances.set(balanceId, {
      ...existing,
      stock: nextStock,
      updatedAt: movement.updatedAt,
    })
    touched.add(balanceId)
  }

  let changed = 0
  const now = nowIso()
  await db.transaction(
    'rw',
    db.inventoryBalances,
    db.syncQueue,
    async () => {
      for (const balance of nextBalances.values()) {
        const current = await db.inventoryBalances.get(balance.id)
        if (
          current &&
          current.stock === balance.stock &&
          current.updatedAt === balance.updatedAt
        ) {
          continue
        }

        await db.inventoryBalances.put(balance)
        await db.syncQueue.put({
          id: `inventoryBalances:${balance.id}`,
          entityType: 'inventoryBalances',
          entityId: balance.id,
          updatedAt: now,
          attempts: 0,
          status: 'PENDING',
          createdAt: now,
          lastError: '',
        })
        changed += 1
      }
    },
  )

  return changed
}

const pushReferenceData = async (
  firestoreDb: ReturnType<typeof import('firebase/firestore')['getFirestore']>,
  firestore: typeof import('firebase/firestore'),
): Promise<void> => {
  const [locations, users] = await Promise.all([
    db.locations.toArray(),
    db.users.toArray(),
  ])

  const batches: Array<[RemoteEntityType, Array<Location | User>]> = [
    ['locations', sortByUpdatedAtDesc(locations)],
    ['users', sortByUpdatedAtDesc(users)],
  ]

  for (const [entityType, records] of batches) {
    for (const record of records) {
      await firestore.setDoc(
        firestore.doc(
          firestoreDb,
          entityType,
          record.id,
        ),
        record as unknown as Record<string, unknown>,
        { merge: true },
      )
    }
  }
}

const applyRemoteRecord = async (
  entityType: RemoteEntityType,
  record: Record<string, unknown>,
): Promise<boolean> => {
  if (!record.id || typeof record.id !== 'string') {
    return false
  }
  if (!record.updatedAt || typeof record.updatedAt !== 'string') {
    return false
  }

  const table = getEntityTable(entityType)
  const local = await table.get(record.id)
  if (!local || !local.updatedAt || record.updatedAt > local.updatedAt) {
    await table.put(record as SyncRecord)
    if (entityType !== 'locations' && entityType !== 'users') {
      await db.syncQueue.delete(`${entityType}:${record.id}`)
    }
    return true
  }

  return false
}

const applyRemoteRecords = async (
  entityType: RemoteEntityType,
  records: Array<Record<string, unknown>>,
): Promise<{ applied: number; reconciled: number }> => {
  let applied = 0
  let touchedMovements = false

  for (const record of records) {
    const changed = await applyRemoteRecord(entityType, record)
    if (changed) {
      applied += 1
      if (entityType === 'stockMovements') {
        touchedMovements = true
      }
    }
  }

  const reconciled = touchedMovements
    ? await rebuildInventoryBalancesFromMovements()
    : 0

  if (applied > 0 || reconciled > 0) {
    await db.settings.put({ key: 'lastSyncAt', value: nowIso() })
  }

  return { applied, reconciled }
}

export const isFirebaseConfigured = (): boolean =>
  REQUIRED_KEYS.every((key) => Boolean(import.meta.env[key]))

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

  let pushed = 0
  let pulled = 0
  let failed = 0

  try {
    const { db: firestoreDb, firestore } = await getFirestoreInstance()
    const syncStartedAt = nowIso()
    const lastSyncAtSetting = await db.settings.get('lastSyncAt')
    const lastSyncAt = lastSyncAtSetting?.value ?? BASELINE_SYNC_AT

    await pushReferenceData(firestoreDb, firestore)

    const queueItems = (await db.syncQueue.toArray()).sort(
      (left, right) =>
        PUSH_ENTITY_TYPES.indexOf(left.entityType) -
        PUSH_ENTITY_TYPES.indexOf(right.entityType),
    )

    for (const queueItem of queueItems) {
      const table = getEntityTable(queueItem.entityType)
      const record = await table.get(queueItem.entityId)

      if (!record) {
        await db.syncQueue.delete(queueItem.id)
        continue
      }

      try {
        await firestore.setDoc(
          firestore.doc(firestoreDb, queueItem.entityType, queueItem.entityId),
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

    for (const entityType of REMOTE_ENTITY_TYPES) {
      const snapshot = await firestore.getDocs(
        firestore.query(
          firestore.collection(firestoreDb, entityType),
          firestore.where('updatedAt', '>', lastSyncAt),
        ),
      )

      const rows = snapshot.docs.map((row) => row.data() as Record<string, unknown>)
      const result = await applyRemoteRecords(entityType, rows)
      pulled += result.applied
    }

    const reconciledBalances = await rebuildInventoryBalancesFromMovements()
    if (reconciledBalances > 0) {
      await db.settings.put({ key: 'lastSyncAt', value: syncStartedAt })
    } else {
      await db.settings.put({ key: 'lastSyncAt', value: syncStartedAt })
    }

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

export const stopRealtimeSync = (): void => {
  if (realtimeCleanup) {
    realtimeCleanup()
    realtimeCleanup = null
  }
}

export const startRealtimeSync = (
  onError?: (message: string) => void,
): (() => void) => {
  if (!isFirebaseConfigured()) {
    return () => undefined
  }

  stopRealtimeSync()

  let closed = false
  let unsubscribers: Array<() => void> = []

  const cleanup = () => {
    closed = true
    for (const unsubscribe of unsubscribers) {
      unsubscribe()
    }
    unsubscribers = []
    if (realtimeCleanup === cleanup) {
      realtimeCleanup = null
    }
  }

  realtimeCleanup = cleanup

  void (async () => {
    try {
      const { db: firestoreDb, firestore } = await getFirestoreInstance()
      if (closed) {
        return
      }

      unsubscribers = REMOTE_ENTITY_TYPES.map((entityType) =>
        firestore.onSnapshot(
          firestore.collection(firestoreDb, entityType),
          (snapshot) => {
            const changedRows = snapshot
              .docChanges()
              .filter((change) => change.type !== 'removed')
              .map((change) => change.doc.data() as Record<string, unknown>)

            if (!changedRows.length) {
              return
            }

            void applyRemoteRecords(entityType, changedRows).catch((error: unknown) => {
              onError?.(`Error de sync en tiempo real: ${parseError(error)}`)
            })
          },
          (error) => {
            onError?.(`Error de sync en tiempo real: ${parseError(error)}`)
          },
        ),
      )
    } catch (error) {
      onError?.(`No se pudo iniciar sync en tiempo real: ${parseError(error)}`)
    }
  })()

  return cleanup
}
