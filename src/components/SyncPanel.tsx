interface SyncPanelProps {
  isConfigured: boolean
  realtimeActive: boolean
  pendingCount: number
  lastSyncAt: string
  syncing: boolean
  onSync: () => Promise<void>
}

export const SyncPanel = ({
  isConfigured,
  realtimeActive,
  pendingCount,
  lastSyncAt,
  syncing,
  onSync,
}: SyncPanelProps) => (
  <div className="sync-panel">
    <div>
      <strong>Sync:</strong>{' '}
      {isConfigured
        ? realtimeActive
          ? 'Firebase conectado (tiempo real)'
          : 'Firebase configurado'
        : 'Local-only (sin Firebase)'}
      <small>
        Pendientes: {pendingCount} | Ultimo sync:{' '}
        {lastSyncAt ? new Date(lastSyncAt).toLocaleString('es-MX') : 'Nunca'}
      </small>
    </div>
    <button type="button" className="secondary" onClick={onSync} disabled={syncing}>
      {syncing ? 'Sincronizando...' : 'Sincronizar ahora'}
    </button>
  </div>
)
