import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { WAREHOUSE_LOCATION_ID } from '../constants'
import { listInventoryView } from '../services/inventoryService'
import {
  getTransferHistory,
  type TransferHistoryView,
} from '../services/queryService'
import { createTransfer } from '../services/transferService'
import type { InventoryViewRow, Location } from '../types'
import { formatNumber } from '../utils/format'

interface TransferLine {
  productId: string
  name: string
  available: number
  qty: number
}

interface TransfersModuleProps {
  locations: Location[]
  canTransfer: boolean
  performedBy: string
  onNotify: (message: string) => void
  onError: (message: string) => void
}

export const TransfersModule = ({
  locations,
  canTransfer,
  performedBy,
  onNotify,
  onError,
}: TransfersModuleProps) => {
  const [fromLocationId, setFromLocationId] = useState(WAREHOUSE_LOCATION_ID)
  const [toLocationId, setToLocationId] = useState('loc-suc-1')
  const [notes, setNotes] = useState('')
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<TransferLine[]>([])
  const [isSaving, setIsSaving] = useState(false)

  const inventory = useLiveQuery(
    () =>
      listInventoryView(fromLocationId, {
        search,
        lowStockOnly: false,
        includeInactive: false,
      }),
    [fromLocationId, search],
    [] as InventoryViewRow[],
  )

  const transferHistory = useLiveQuery(
    () => getTransferHistory(60),
    [],
    [] as TransferHistoryView[],
  )

  const destinationOptions = useMemo(
    () => locations.filter((location) => location.id !== fromLocationId),
    [locations, fromLocationId],
  )

  useEffect(() => {
    if (!destinationOptions.length) {
      return
    }
    if (!destinationOptions.some((location) => location.id === toLocationId)) {
      setToLocationId(destinationOptions[0].id)
    }
  }, [destinationOptions, toLocationId])

  const stockFromSource = useMemo(
    () => inventory.filter((row) => row.stock > 0),
    [inventory],
  )

  const addItem = (productId: string) => {
    const product = stockFromSource.find((entry) => entry.productId === productId)
    if (!product) {
      return
    }

    setCart((current) => {
      const existing = current.find((line) => line.productId === productId)
      if (existing) {
        return current.map((line) =>
          line.productId === productId
            ? { ...line, qty: Math.min(line.qty + 1, line.available) }
            : line,
        )
      }
      return [
        ...current,
        {
          productId,
          name: product.name,
          available: product.stock,
          qty: 1,
        },
      ]
    })
  }

  const updateQty = (productId: string, value: number) => {
    setCart((current) =>
      current
        .map((line) => {
          if (line.productId !== productId) {
            return line
          }
          const qty = Math.max(0, Math.min(value, line.available))
          return { ...line, qty }
        })
        .filter((line) => line.qty > 0),
    )
  }

  const executeTransfer = async () => {
    if (!canTransfer) {
      onError('Solo Admin puede transferir inventario.')
      return
    }
    if (!cart.length) {
      onError('Agrega productos a la transferencia.')
      return
    }

    setIsSaving(true)
    try {
      await createTransfer({
        fromLocationId,
        toLocationId,
        notes,
        performedBy,
        items: cart.map((line) => ({ productId: line.productId, qty: line.qty })),
      })
      setCart([])
      setNotes('')
      onNotify('Transferencia registrada.')
    } catch (error) {
      onError(error instanceof Error ? error.message : 'No se pudo registrar transferencia.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="module-card">
      <div className="module-header">
        <h2>Transferencias Casa a sucursales</h2>
        {!canTransfer ? (
          <p className="info-text">Modo cajero: solo consulta historial.</p>
        ) : null}
      </div>

      <div className="toolbar">
        <label>
          Origen
          <select
            value={fromLocationId}
            onChange={(event) => setFromLocationId(event.target.value)}
            disabled={!canTransfer}
          >
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Destino
          <select
            value={toLocationId}
            onChange={(event) => setToLocationId(event.target.value)}
            disabled={!canTransfer}
          >
            {destinationOptions.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Nota
          <input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Motivo de reabasto"
            disabled={!canTransfer}
          />
        </label>
      </div>

      <div className="sales-grid">
        <div className="panel">
          <h3>Stock disponible en origen</h3>
          <label>
            Buscar
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nombre o SKU"
              disabled={!canTransfer}
            />
          </label>
          <div className="list-scroll">
            {stockFromSource.map((product) => (
              <article key={product.productId} className="list-item">
                <div>
                  <strong>{product.name}</strong>
                  <small>Disponible {formatNumber(product.stock)}</small>
                </div>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => addItem(product.productId)}
                  disabled={!canTransfer}
                >
                  Agregar
                </button>
              </article>
            ))}
          </div>
        </div>

        <div className="panel">
          <h3>Detalle de transferencia</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Disponible</th>
                  <th>Qty</th>
                </tr>
              </thead>
              <tbody>
                {cart.map((line) => (
                  <tr key={line.productId}>
                    <td>{line.name}</td>
                    <td>{formatNumber(line.available)}</td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        max={line.available}
                        value={line.qty}
                        onChange={(event) =>
                          updateQty(line.productId, Number(event.target.value))
                        }
                        disabled={!canTransfer}
                      />
                    </td>
                  </tr>
                ))}
                {!cart.length ? (
                  <tr>
                    <td colSpan={3}>No hay productos agregados.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="actions-row">
            <button type="button" disabled={!canTransfer || isSaving} onClick={executeTransfer}>
              {isSaving ? 'Guardando...' : 'Confirmar transferencia'}
            </button>
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>Historial de transferencias</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Folio</th>
                <th>Fecha</th>
                <th>Origen</th>
                <th>Destino</th>
                <th>Items</th>
                <th>Notas</th>
              </tr>
            </thead>
            <tbody>
              {transferHistory.map((transfer) => (
                <tr key={transfer.id}>
                  <td>{transfer.id.slice(0, 8)}</td>
                  <td>{transfer.createdLabel}</td>
                  <td>{transfer.fromLocationName}</td>
                  <td>{transfer.toLocationName}</td>
                  <td>{formatNumber(transfer.itemsCount)}</td>
                  <td>{transfer.notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
