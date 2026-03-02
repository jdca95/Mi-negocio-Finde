import { buildEntityId, db } from '../db'
import type {
  ActivityAction,
  ActivityEntityType,
  ActivityEvent,
} from '../types'
import { buildSyncQueueItem } from './syncQueueService'

interface BuildActivityEventInput {
  action: ActivityAction
  entityType: ActivityEntityType
  entityId: string
  performedBy: string
  createdAt: string
  productId?: string
  locationId?: string
  relatedLocationId?: string
  qty?: number
  summary: string
  details?: string
}

export const buildActivityEvent = (
  input: BuildActivityEventInput,
): ActivityEvent => ({
  id: buildEntityId('act'),
  action: input.action,
  entityType: input.entityType,
  entityId: input.entityId,
  productId: input.productId,
  locationId: input.locationId,
  relatedLocationId: input.relatedLocationId,
  qty: input.qty,
  summary: input.summary.trim(),
  details: input.details?.trim() ?? '',
  performedBy: input.performedBy,
  createdAt: input.createdAt,
  updatedAt: input.createdAt,
})

export const queueActivityEvent = async (event: ActivityEvent): Promise<void> => {
  await db.activityEvents.put(event)
  await db.syncQueue.put(buildSyncQueueItem('activityEvents', event.id, event.updatedAt))
}
