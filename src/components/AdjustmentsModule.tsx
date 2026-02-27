import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ADJUSTMENT_MODE_LABELS,
  ADJUSTMENT_REASON_LABELS,
  MOVEMENT_TYPE_LABELS,
} from '../constants'
import { listInventoryView, adjustStock } from '../services/inventoryService'
import { getMovementHistory, type MovementView } from '../services/queryService'
import type { AdjustmentMode, AdjustmentReason, InventoryViewRow } from '../types'
import { formatNumber } from '../utils/format'

interface AdjustmentsModuleProps {
  locationId: string
  canAdjust: boolean
  performedBy: string
  onNotify: (message: string) => void
  onError: (message: string) => void
}

export const AdjustmentsModule = ({
  locationId,
  canAdjust,
  performedBy,
  onNotify,
  onError,
}: AdjustmentsModuleProps) => {
  const [selectedProductId, setSelectedProductId] = useState('')
  const [mode, setMode] = useState<AdjustmentMode>('IN')
  const [quantity, setQuantity] = useState('0')
  const [reason, setReason] = useState<AdjustmentReason>('ADJUSTMENT')
  const [notes, setNotes] = useState('')
  const [historyScope, setHistoryScope] = useState<string | 'ALL'>(locationId)

  const products = useLiveQuery(
    () =>
      listInventoryView(locationId, {
        search: '',
        lowStockOnly: false,
        includeInactive: false,
      }),
    [locationId],
    [] as InventoryViewRow[],
  )

  const sortedProducts = useMemo(
    () => [...products].sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [products],
  )

  const movements = useLiveQuery(
    () => getMovementHistory(historyScope, 180),
    [historyScope],
    [] as MovementView[],
  )

  const handleAdjust = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canAdjust) {
      onError('Solo Admin puede registrar ajustes.')
      return
    }

    if (!selectedProductId) {
      onError('Selecciona un producto.')
      return
    }

    try {
      await adjustStock({
        locationId,
        productId: selectedProductId,
        mode,
        quantity: Number(quantity),
        reason,
        notes,
        performedBy,
      })
      onNotify('Ajuste guardado correctamente.')
      setQuantity('0')
      setNotes('')
    } catch (error) {
      onError(error instanceof Error ? error.message : 'No se pudo aplicar ajuste.')
    }
  }

  return (
    <section className="module-card">
      <div className="module-header">
        <h2>Ajustes de inventario</h2>
        {!canAdjust ? (
          <p className="info-text">Modo cajero: solo consulta de movimientos.</p>
        ) : null}
      </div>

      <form className="grid-form compact" onSubmit={handleAdjust}>
        <label>
          Producto
          <select
            value={selectedProductId}
            onChange={(event) => setSelectedProductId(event.target.value)}
            disabled={!canAdjust}
          >
            <option value="">Seleccionar</option>
            {sortedProducts.map((product) => (
              <option key={product.productId} value={product.productId}>
                {product.name} (stock {formatNumber(product.stock)})
              </option>
            ))}
          </select>
        </label>

        <label>
          Tipo
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value as AdjustmentMode)}
            disabled={!canAdjust}
          >
            {Object.entries(ADJUSTMENT_MODE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Cantidad
          <input
            type="number"
            min="0"
            step="1"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            disabled={!canAdjust}
          />
        </label>

        <label>
          Motivo
          <select
            value={reason}
            onChange={(event) => setReason(event.target.value as AdjustmentReason)}
            disabled={!canAdjust}
          >
            {Object.entries(ADJUSTMENT_REASON_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Nota
          <input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Opcional"
            disabled={!canAdjust}
          />
        </label>

        <div className="actions-row">
          <button type="submit" disabled={!canAdjust}>
            Registrar ajuste
          </button>
        </div>
      </form>

      <div className="toolbar">
        <label>
          Historial
          <select
            value={historyScope}
            onChange={(event) => setHistoryScope(event.target.value)}
          >
            <option value={locationId}>Sucursal activa</option>
            <option value="ALL">Todas</option>
          </select>
        </label>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Producto</th>
              <th>Ubicacion</th>
              <th>Tipo</th>
              <th>Qty</th>
              <th>Motivo</th>
              <th>Usuario</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((movement) => (
              <tr key={movement.id}>
                <td>{movement.createdLabel}</td>
                <td>{movement.productName}</td>
                <td>{movement.locationName}</td>
                <td>{MOVEMENT_TYPE_LABELS[movement.type as keyof typeof MOVEMENT_TYPE_LABELS] ?? movement.type}</td>
                <td>{formatNumber(movement.qty)}</td>
                <td>{movement.reason}</td>
                <td>{movement.performedBy}</td>
              </tr>
            ))}
            {!movements.length ? (
              <tr>
                <td colSpan={7}>Sin movimientos registrados.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}
