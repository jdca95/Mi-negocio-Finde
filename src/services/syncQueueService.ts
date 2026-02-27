import { nowIso } from '../utils/date'
import type { SyncEntityType, SyncQueueItem } from '../types'

export const buildSyncQueueId = (
  entityType: SyncEntityType,
  entityId: string,
): string => `${entityType}:${entityId}`

export const buildSyncQueueItem = (
  entityType: SyncEntityType,
  entityId: string,
  updatedAt: string,
): SyncQueueItem => ({
  id: buildSyncQueueId(entityType, entityId),
  entityType,
  entityId,
  updatedAt,
  attempts: 0,
  status: 'PENDING',
  createdAt: nowIso(),
  lastError: '',
})

