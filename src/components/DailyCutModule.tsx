import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { PAYMENT_METHOD_LABELS } from '../constants'
import { exportDailyExcel } from '../services/exportService'
import { getDailyCut } from '../services/reportService'
import { todayInputValue } from '../utils/date'
import { formatCurrency } from '../utils/format'

interface DailyCutModuleProps {
  locationId: string
  onNotify: (message: string) => void
  onError: (message: string) => void
}

export const DailyCutModule = ({
  locationId,
  onNotify,
  onError,
}: DailyCutModuleProps) => {
  const [dateInput, setDateInput] = useState(todayInputValue())
  const [exporting, setExporting] = useState(false)

  const summary = useLiveQuery(
    () => getDailyCut(dateInput, locationId),
    [dateInput, locationId],
    null,
  )

  return (
    <section className="module-card">
      <div className="module-header">
        <h2>Corte del dia</h2>
        <label>
          Fecha
          <input
            type="date"
            value={dateInput}
            onChange={(event) => setDateInput(event.target.value)}
          />
        </label>
      </div>

      {summary ? (
        <>
          <div className="metrics-grid">
            <article className="metric-box">
              <h4>Total vendido</h4>
              <p>{formatCurrency(summary.totalSold)}</p>
            </article>
            <article className="metric-box">
              <h4>Utilidad estimada</h4>
              <p>{formatCurrency(summary.estimatedProfit)}</p>
            </article>
            <article className="metric-box">
              <h4>{PAYMENT_METHOD_LABELS.CASH}</h4>
              <p>{formatCurrency(summary.byPayment.CASH)}</p>
            </article>
            <article className="metric-box">
              <h4>{PAYMENT_METHOD_LABELS.TRANSFER}</h4>
              <p>{formatCurrency(summary.byPayment.TRANSFER)}</p>
            </article>
            <article className="metric-box">
              <h4>{PAYMENT_METHOD_LABELS.CARD}</h4>
              <p>{formatCurrency(summary.byPayment.CARD)}</p>
            </article>
          </div>

          <div className="actions-row">
            <button
              type="button"
              disabled={exporting}
              onClick={async () => {
                setExporting(true)
                try {
                  await exportDailyExcel(dateInput, locationId)
                  onNotify('Excel generado correctamente.')
                } catch (error) {
                  onError(
                    error instanceof Error
                      ? error.message
                      : 'No se pudo generar Excel.',
                  )
                } finally {
                  setExporting(false)
                }
              }}
            >
              {exporting ? 'Exportando...' : 'Exportar Excel del dia'}
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Fecha</th>
                  <th>Metodo</th>
                  <th>Total</th>
                  <th>Utilidad</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {summary.sales.map((sale) => (
                  <tr key={sale.id}>
                    <td>{sale.id.slice(0, 8)}</td>
                    <td>{new Date(sale.createdAt).toLocaleString('es-MX')}</td>
                    <td>{PAYMENT_METHOD_LABELS[sale.paymentMethod]}</td>
                    <td>{formatCurrency(sale.total)}</td>
                    <td>{formatCurrency(sale.estimatedProfit)}</td>
                    <td>{sale.status === 'COMPLETED' ? 'Completada' : 'Cancelada'}</td>
                  </tr>
                ))}
                {!summary.sales.length ? (
                  <tr>
                    <td colSpan={6}>No hay ventas para esta fecha.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p>Cargando corte...</p>
      )}
    </section>
  )
}

