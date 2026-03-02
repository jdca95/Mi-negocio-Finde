import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import {
  getActivityTimeline,
  getProductHistory,
  type ActivityEventView,
  type ProductHistoryView,
} from '../services/queryService'
import { todayInputValue, toDateInputValue } from '../utils/date'
import { formatNumber } from '../utils/format'
import type { Location, Product, User } from '../types'

interface AuditModuleProps {
  activeLocationId: string
}

const buildDefaultStartDate = (): string => {
  const date = new Date()
  date.setDate(date.getDate() - 7)
  return toDateInputValue(date)
}

export const AuditModule = ({ activeLocationId }: AuditModuleProps) => {
  const [locationFilter, setLocationFilter] = useState<string | 'ALL'>(activeLocationId)
  const [userFilter, setUserFilter] = useState<string | 'ALL'>('ALL')
  const [productFilter, setProductFilter] = useState<string | 'ALL'>('ALL')
  const [startDate, setStartDate] = useState(buildDefaultStartDate)
  const [endDate, setEndDate] = useState(todayInputValue)

  const users = useLiveQuery(
    async () => (await db.users.toArray()).filter((user) => user.active),
    [],
    [] as User[],
  )
  const locations = useLiveQuery(
    async () => (await db.locations.toArray()).filter((location) => location.active),
    [],
    [] as Location[],
  )
  const products = useLiveQuery(() => db.products.toArray(), [], [] as Product[])

  const activityRows = useLiveQuery(
    () =>
      getActivityTimeline({
        locationId: locationFilter,
        userId: userFilter,
        productId: productFilter,
        startDate,
        endDate,
        limit: 250,
      }),
    [locationFilter, userFilter, productFilter, startDate, endDate],
    [] as ActivityEventView[],
  )

  const productHistory = useLiveQuery(
    () =>
      productFilter === 'ALL'
        ? Promise.resolve([] as ProductHistoryView[])
        : getProductHistory(productFilter, {
            locationId: locationFilter,
            userId: userFilter,
            startDate,
            endDate,
            limit: 250,
          }),
    [productFilter, locationFilter, userFilter, startDate, endDate],
    [] as ProductHistoryView[],
  )

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [users],
  )
  const sortedLocations = useMemo(
    () => [...locations].sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [locations],
  )
  const sortedProducts = useMemo(
    () => [...products].sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [products],
  )

  const selectedProductName = useMemo(() => {
    if (productFilter === 'ALL') {
      return ''
    }
    return (
      sortedProducts.find((product) => product.id === productFilter)?.name ?? productFilter
    )
  }, [productFilter, sortedProducts])

  return (
    <section className="module-card">
      <div className="module-header">
        <h2>Actividad y auditoria</h2>
        <p className="info-text">
          Bitacora general, filtros por usuario y rastreo por producto.
        </p>
      </div>

      <form className="grid-form compact" onSubmit={(event) => event.preventDefault()}>
        <label>
          Sucursal
          <select
            value={locationFilter}
            onChange={(event) =>
              setLocationFilter(event.target.value as typeof locationFilter)
            }
          >
            <option value="ALL">Todas</option>
            {sortedLocations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Usuario
          <select
            value={userFilter}
            onChange={(event) => setUserFilter(event.target.value as typeof userFilter)}
          >
            <option value="ALL">Todos</option>
            {sortedUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Producto
          <select
            value={productFilter}
            onChange={(event) =>
              setProductFilter(event.target.value as typeof productFilter)
            }
          >
            <option value="ALL">Todos</option>
            {sortedProducts.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Desde
          <input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </label>

        <label>
          Hasta
          <input
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </label>
      </form>

      <div className="metrics-grid">
        <div className="metric-box">
          <strong>Eventos</strong>
          <p>{formatNumber(activityRows.length)}</p>
        </div>
        <div className="metric-box">
          <strong>Producto filtrado</strong>
          <p>{selectedProductName || 'Todos'}</p>
        </div>
        <div className="metric-box">
          <strong>Historial de producto</strong>
          <p>{formatNumber(productHistory.length)}</p>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Accion</th>
              <th>Resumen</th>
              <th>Producto</th>
              <th>Sucursal</th>
              <th>Usuario</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {activityRows.map((row) => (
              <tr key={row.id}>
                <td>{row.createdLabel}</td>
                <td>{row.action}</td>
                <td>{row.summary}</td>
                <td>{row.productName}</td>
                <td>
                  {row.relatedLocationName !== '-' && row.relatedLocationName !== row.locationName
                    ? `${row.locationName} -> ${row.relatedLocationName}`
                    : row.locationName}
                </td>
                <td>{row.performedBy}</td>
                <td>{row.details || '-'}</td>
              </tr>
            ))}
            {!activityRows.length ? (
              <tr>
                <td colSpan={7}>Sin eventos para los filtros seleccionados.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {productFilter !== 'ALL' ? (
        <>
          <div className="module-header">
            <h3>Historial de producto</h3>
            <p className="info-text">{selectedProductName}</p>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Fuente</th>
                  <th>Accion</th>
                  <th>Sucursal</th>
                  <th>Usuario</th>
                  <th>Qty</th>
                  <th>Antes</th>
                  <th>Despues</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {productHistory.map((row) => (
                  <tr key={row.id}>
                    <td>{row.createdLabel}</td>
                    <td>{row.source}</td>
                    <td>{row.action}</td>
                    <td>{row.locationName}</td>
                    <td>{row.performedBy}</td>
                    <td>{row.qty === null ? '-' : formatNumber(row.qty)}</td>
                    <td>{row.stockBefore === null ? '-' : formatNumber(row.stockBefore)}</td>
                    <td>{row.stockAfter === null ? '-' : formatNumber(row.stockAfter)}</td>
                    <td>{row.details}</td>
                  </tr>
                ))}
                {!productHistory.length ? (
                  <tr>
                    <td colSpan={9}>Sin historial para este producto.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  )
}
