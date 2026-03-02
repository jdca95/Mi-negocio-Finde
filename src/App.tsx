import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { DEFAULT_LOCATION_ID, ROLE_LABELS, STORAGE_KEYS } from './constants'
import { db, ensureSeedData } from './db'
import { useOnlineStatus } from './hooks/useOnlineStatus'
import { clearSession, getSessionUser, login } from './services/authService'
import {
  isFirebaseConfigured,
  startRealtimeSync,
  stopRealtimeSync,
  syncNow,
} from './services/syncService'
import {
  ensureDeviceId,
  ensureRuntimeSessionId,
  resetRuntimeSessionId,
} from './utils/runtime'
import type { Location, Role, User } from './types'
import { InventoryModule } from './components/InventoryModule'
import { LoginForm } from './components/LoginForm'
import { OnlineBadge } from './components/OnlineBadge'
import { SalesModule } from './components/SalesModule'
import { SyncPanel } from './components/SyncPanel'

const DailyCutModule = lazy(async () => ({
  default: (await import('./components/DailyCutModule')).DailyCutModule,
}))
const ReportsModule = lazy(async () => ({
  default: (await import('./components/ReportsModule')).ReportsModule,
}))
const AdjustmentsModule = lazy(async () => ({
  default: (await import('./components/AdjustmentsModule')).AdjustmentsModule,
}))
const TransfersModule = lazy(async () => ({
  default: (await import('./components/TransfersModule')).TransfersModule,
}))
const ImportModule = lazy(async () => ({
  default: (await import('./components/ImportModule')).ImportModule,
}))
const BackupModule = lazy(async () => ({
  default: (await import('./components/BackupModule')).BackupModule,
}))

type TabKey =
  | 'inventory'
  | 'sales'
  | 'dailyCut'
  | 'reports'
  | 'adjustments'
  | 'transfers'
  | 'import'
  | 'backup'
  | 'pwa'

interface TabItem {
  id: TabKey
  label: string
  roles: Role[]
}

const TABS: TabItem[] = [
  { id: 'inventory', label: 'Inventario', roles: ['ADMIN', 'CASHIER'] },
  { id: 'sales', label: 'Ventas', roles: ['ADMIN', 'CASHIER'] },
  { id: 'dailyCut', label: 'Corte', roles: ['ADMIN', 'CASHIER'] },
  { id: 'reports', label: 'Reportes', roles: ['ADMIN', 'CASHIER'] },
  { id: 'adjustments', label: 'Ajustes', roles: ['ADMIN', 'CASHIER'] },
  { id: 'transfers', label: 'Transferencias', roles: ['ADMIN', 'CASHIER'] },
  { id: 'import', label: 'Importar CSV', roles: ['ADMIN'] },
  { id: 'backup', label: 'Respaldo', roles: ['ADMIN', 'CASHIER'] },
  { id: 'pwa', label: 'Instalar iPhone', roles: ['ADMIN', 'CASHIER'] },
]

const DEFAULT_TAB: TabKey = 'inventory'

function App() {
  const [ready, setReady] = useState(false)
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [activeLocationId, setActiveLocationId] = useState(DEFAULT_LOCATION_ID)
  const [activeTab, setActiveTab] = useState<TabKey>(DEFAULT_TAB)
  const [loginError, setLoginError] = useState('')
  const [infoMessage, setInfoMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSyncing, setIsSyncing] = useState(false)
  const [isRealtimeSyncActive, setIsRealtimeSyncActive] = useState(false)
  const syncInProgressRef = useRef(false)
  const lastAutoSyncPendingRef = useRef(0)
  const lastBootstrapSyncRef = useRef('')

  const isOnline = useOnlineStatus()
  const firebaseConfigured = isFirebaseConfigured()

  const users = useLiveQuery(() => db.users.toArray(), [], [] as User[])
  const locations = useLiveQuery(
    async () => (await db.locations.toArray()).filter((location) => location.active),
    [],
    [] as Location[],
  )
  const pendingSyncCount = useLiveQuery(() => db.syncQueue.count(), [], 0)
  const lastSyncAt = useLiveQuery(
    async () => (await db.settings.get('lastSyncAt'))?.value ?? '',
    [],
    '',
  )

  const activeLocation = useMemo(
    () => locations.find((location) => location.id === activeLocationId) ?? null,
    [locations, activeLocationId],
  )

  const visibleTabs = useMemo(() => {
    if (!currentUser) {
      return []
    }
    return TABS.filter((tab) => tab.roles.includes(currentUser.role))
  }, [currentUser])

  useEffect(() => {
    if (!visibleTabs.length) {
      return
    }
    if (!visibleTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(visibleTabs[0].id)
    }
  }, [visibleTabs, activeTab])

  const notify = useCallback((message: string) => {
    setInfoMessage(message)
    setErrorMessage('')
  }, [])

  const notifyError = useCallback((message: string) => {
    setErrorMessage(message)
    setInfoMessage('')
  }, [])

  const runSync = useCallback(
    async (silent = false) => {
      if (syncInProgressRef.current) {
        return
      }

      syncInProgressRef.current = true
      setIsSyncing(true)
      const result = await syncNow()
      setIsSyncing(false)
      syncInProgressRef.current = false

      if (silent) {
        if (result.status === 'error') {
          notifyError(result.message)
        }
        return
      }

      if (result.status === 'error') {
        notifyError(result.message)
      } else {
        notify(result.message)
      }
    },
    [notify, notifyError],
  )

  useEffect(() => {
    let alive = true
    const init = async () => {
      ensureDeviceId()
      ensureRuntimeSessionId()
      await ensureSeedData()
      const user = await getSessionUser()
      const storedLocation =
        localStorage.getItem(STORAGE_KEYS.activeLocationId) ?? DEFAULT_LOCATION_ID

      if (!alive) {
        return
      }

      setCurrentUser(user)
      setActiveLocationId(storedLocation)
      setReady(true)
    }
    void init()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!infoMessage && !errorMessage) {
      return
    }
    const timeout = window.setTimeout(() => {
      setInfoMessage('')
      setErrorMessage('')
    }, 4000)
    return () => window.clearTimeout(timeout)
  }, [infoMessage, errorMessage])

  useEffect(() => {
    if (!activeLocation) {
      return
    }
    localStorage.setItem(STORAGE_KEYS.activeLocationId, activeLocation.id)
  }, [activeLocation])

  useEffect(() => {
    if (!locations.length) {
      return
    }
    if (!locations.some((location) => location.id === activeLocationId)) {
      setActiveLocationId(locations[0].id)
    }
  }, [locations, activeLocationId])

  useEffect(() => {
    if (!firebaseConfigured || !currentUser) {
      return
    }

    const onOnline = () => {
      lastAutoSyncPendingRef.current = 0
      void runSync(true)
    }

    window.addEventListener('online', onOnline)
    if (pendingSyncCount === 0) {
      lastAutoSyncPendingRef.current = 0
    } else if (
      isOnline &&
      pendingSyncCount > 0 &&
      pendingSyncCount !== lastAutoSyncPendingRef.current
    ) {
      lastAutoSyncPendingRef.current = pendingSyncCount
      void runSync(true)
    }

    return () => {
      window.removeEventListener('online', onOnline)
    }
  }, [firebaseConfigured, currentUser, isOnline, pendingSyncCount, runSync])

  useEffect(() => {
    if (!currentUser) {
      lastBootstrapSyncRef.current = ''
      setIsRealtimeSyncActive(false)
      stopRealtimeSync()
      return
    }

    if (!firebaseConfigured) {
      setIsRealtimeSyncActive(false)
      stopRealtimeSync()
      return
    }

    const cleanup = startRealtimeSync((message) => {
      setIsRealtimeSyncActive(false)
      notifyError(message)
    })
    setIsRealtimeSyncActive(true)

    return () => {
      setIsRealtimeSyncActive(false)
      cleanup()
    }
  }, [firebaseConfigured, currentUser, notifyError])

  useEffect(() => {
    if (!firebaseConfigured || !currentUser || !isOnline) {
      return
    }

    const syncKey = `${currentUser.id}:${currentUser.updatedAt}`
    if (lastBootstrapSyncRef.current === syncKey) {
      return
    }

    lastBootstrapSyncRef.current = syncKey
    void runSync(true)
  }, [firebaseConfigured, currentUser, isOnline, runSync])

  if (!ready) {
    return (
      <main className="app-shell">
        <p>Cargando aplicacion...</p>
      </main>
    )
  }

  if (!currentUser) {
    return (
      <main className="app-shell auth-shell">
        <LoginForm
          users={users}
          onLogin={async (username, pin) => {
            const result = await login(username, pin)
            if (!result.user) {
              setLoginError(result.error)
              return
            }
            setLoginError('')
            resetRuntimeSessionId()
            setCurrentUser(result.user)
            setInfoMessage(`Bienvenido ${result.user.name}.`)
          }}
          errorMessage={loginError}
        />
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className="top-header">
        <div className="header-left">
          <h1>MiNegocioFinde</h1>
          <p>
            Usuario: <strong>{currentUser.name}</strong> ({ROLE_LABELS[currentUser.role]})
          </p>
        </div>

        <div className="header-actions">
          <OnlineBadge isOnline={isOnline} />
          <label>
            Sucursal activa
            <select
              value={activeLocationId}
              onChange={(event) => setActiveLocationId(event.target.value)}
            >
              {locations.map((location: Location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              clearSession()
              resetRuntimeSessionId()
              setCurrentUser(null)
            }}
          >
            Salir
          </button>
        </div>
      </header>

      <SyncPanel
        isConfigured={firebaseConfigured}
        realtimeActive={isRealtimeSyncActive && isOnline}
        pendingCount={pendingSyncCount}
        lastSyncAt={lastSyncAt}
        syncing={isSyncing}
        onSync={async () => runSync(false)}
      />

      {infoMessage ? <p className="success-banner">{infoMessage}</p> : null}
      {errorMessage ? <p className="error-banner">{errorMessage}</p> : null}

      <nav className="tabs-nav">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? 'tab active' : 'tab'}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <section className="content-shell">
        {activeTab === 'inventory' ? (
          <InventoryModule
            locationId={activeLocationId}
            canManage={currentUser.role === 'ADMIN'}
            performedBy={currentUser.id}
            onNotify={notify}
            onError={notifyError}
          />
        ) : null}

        {activeTab === 'sales' ? (
          <SalesModule
            locationId={activeLocationId}
            performedBy={currentUser.id}
            canCancel={currentUser.role === 'ADMIN'}
            onNotify={notify}
            onError={notifyError}
          />
        ) : null}

        {activeTab === 'dailyCut' ? (
          <Suspense fallback={<p>Cargando modulo...</p>}>
            <DailyCutModule
              locationId={activeLocationId}
              onNotify={notify}
              onError={notifyError}
            />
          </Suspense>
        ) : null}

        {activeTab === 'reports' ? (
          <Suspense fallback={<p>Cargando modulo...</p>}>
            <ReportsModule activeLocationId={activeLocationId} />
          </Suspense>
        ) : null}

        {activeTab === 'adjustments' ? (
          <Suspense fallback={<p>Cargando modulo...</p>}>
            <AdjustmentsModule
              locationId={activeLocationId}
              canAdjust={currentUser.role === 'ADMIN'}
              performedBy={currentUser.id}
              onNotify={notify}
              onError={notifyError}
            />
          </Suspense>
        ) : null}

        {activeTab === 'transfers' ? (
          <Suspense fallback={<p>Cargando modulo...</p>}>
            <TransfersModule
              locations={locations}
              canTransfer={currentUser.role === 'ADMIN'}
              performedBy={currentUser.id}
              onNotify={notify}
              onError={notifyError}
            />
          </Suspense>
        ) : null}

        {activeTab === 'import' ? (
          <Suspense fallback={<p>Cargando modulo...</p>}>
            <ImportModule
              defaultLocationId={activeLocationId}
              locations={locations}
              canImport={currentUser.role === 'ADMIN'}
              performedBy={currentUser.id}
              onNotify={notify}
              onError={notifyError}
            />
          </Suspense>
        ) : null}

        {activeTab === 'backup' ? (
          <Suspense fallback={<p>Cargando modulo...</p>}>
            <BackupModule
              canManage={currentUser.role === 'ADMIN'}
              onNotify={notify}
              onError={notifyError}
            />
          </Suspense>
        ) : null}

        {activeTab === 'pwa' ? (
          <section className="module-card">
            <h2>Instalar en iPhone (Safari)</h2>
            <ol>
              <li>Abre la URL de la app en Safari.</li>
              <li>Toca el boton Compartir.</li>
              <li>Selecciona "Agregar a pantalla de inicio".</li>
              <li>Confirma nombre y toca "Agregar".</li>
            </ol>
            <p>
              Una vez instalada, la app funciona offline con IndexedDB y service worker.
            </p>
          </section>
        ) : null}
      </section>
    </main>
  )
}

export default App
