import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CASH_ENTRY_TYPE_LABELS, PAYMENT_METHOD_LABELS } from '../constants'
import { createCashEntry, saveOpeningCash } from '../services/cashService'
import { exportDailyExcel } from '../services/exportService'
import { getDailyCut } from '../services/reportService'
import type { CashEntryType } from '../types'
import { todayInputValue } from '../utils/date'
import { formatCurrency } from '../utils/format'

interface DailyCutModuleProps {
  locationId: string
  performedBy: string
  onNotify: (message: string) => void
  onError: (message: string) => void
}

const formatAmountInput = (value: number): string => {
  if (value === 0) {
    return '0'
  }
  return value.toFixed(2).replace(/\.00$/, '')
}

export const DailyCutModule = ({
  locationId,
  performedBy,
  onNotify,
  onError,
}: DailyCutModuleProps) => {
  const [dateInput, setDateInput] = useState(todayInputValue())
  const [exporting, setExporting] = useState(false)
  const [savingOpeningCash, setSavingOpeningCash] = useState(false)
  const [savingCashEntry, setSavingCashEntry] = useState(false)
  const [openingCashInput, setOpeningCashInput] = useState('0')
  const [cashEntryType, setCashEntryType] =
    useState<Exclude<CashEntryType, 'OPENING'>>('WITHDRAWAL')
  const [cashEntryAmount, setCashEntryAmount] = useState('')
  const [cashEntryNotes, setCashEntryNotes] = useState('')

  const summary = useLiveQuery(
    () => getDailyCut(dateInput, locationId),
    [dateInput, locationId],
    null,
  )

  useEffect(() => {
    if (!summary) {
      return
    }
    setOpeningCashInput(formatAmountInput(summary.openingCash))
  }, [summary])

  const cashMovements = useMemo(
    () =>
      summary?.cashEntries.filter((entry) => entry.type !== 'OPENING') ?? [],
    [summary],
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
            <article className="metric-box">
              <h4>{CASH_ENTRY_TYPE_LABELS.OPENING}</h4>
              <p>{formatCurrency(summary.openingCash)}</p>
            </article>
            <article className="metric-box">
              <h4>{CASH_ENTRY_TYPE_LABELS.WITHDRAWAL}</h4>
              <p>{formatCurrency(summary.withdrawalsTotal)}</p>
            </article>
            <article className="metric-box">
              <h4>{CASH_ENTRY_TYPE_LABELS.EXPENSE}</h4>
              <p>{formatCurrency(summary.expensesTotal)}</p>
            </article>
            <article className="metric-box">
              <h4>Efectivo esperado</h4>
              <p>{formatCurrency(summary.expectedCash)}</p>
            </article>
          </div>

          <div className="daily-cut-cash-grid">
            <form
              className="module-card daily-cut-section"
              onSubmit={(event) => {
                event.preventDefault()
                if (savingOpeningCash) {
                  return
                }

                setSavingOpeningCash(true)
                void saveOpeningCash({
                  dateKey: dateInput,
                  locationId,
                  amount: Number(openingCashInput || 0),
                  performedBy,
                })
                  .then(() => {
                    onNotify('Fondo inicial guardado.')
                  })
                  .catch((error: unknown) => {
                    onError(
                      error instanceof Error
                        ? error.message
                        : 'No se pudo guardar el fondo inicial.',
                    )
                  })
                  .finally(() => {
                    setSavingOpeningCash(false)
                  })
              }}
            >
              <div className="section-title-row">
                <h3>Fondo inicial</h3>
                <span>{formatCurrency(summary.openingCash)}</span>
              </div>
              <label>
                Monto
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={openingCashInput}
                  onChange={(event) => setOpeningCashInput(event.target.value)}
                />
              </label>
              <button type="submit" disabled={savingOpeningCash}>
                {savingOpeningCash ? 'Guardando...' : 'Guardar fondo inicial'}
              </button>
            </form>

            <form
              className="module-card daily-cut-section"
              onSubmit={(event) => {
                event.preventDefault()
                if (savingCashEntry) {
                  return
                }

                setSavingCashEntry(true)
                void createCashEntry({
                  dateKey: dateInput,
                  locationId,
                  type: cashEntryType,
                  amount: Number(cashEntryAmount),
                  notes: cashEntryNotes,
                  performedBy,
                })
                  .then(() => {
                    setCashEntryAmount('')
                    setCashEntryNotes('')
                    onNotify('Movimiento de caja registrado.')
                  })
                  .catch((error: unknown) => {
                    onError(
                      error instanceof Error
                        ? error.message
                        : 'No se pudo registrar el movimiento.',
                    )
                  })
                  .finally(() => {
                    setSavingCashEntry(false)
                  })
              }}
            >
              <div className="section-title-row">
                <h3>Retiros y gastos</h3>
                <span>Impactan el efectivo esperado</span>
              </div>
              <label>
                Tipo
                <select
                  value={cashEntryType}
                  onChange={(event) =>
                    setCashEntryType(
                      event.target.value as Exclude<CashEntryType, 'OPENING'>,
                    )
                  }
                >
                  <option value="WITHDRAWAL">
                    {CASH_ENTRY_TYPE_LABELS.WITHDRAWAL}
                  </option>
                  <option value="EXPENSE">{CASH_ENTRY_TYPE_LABELS.EXPENSE}</option>
                </select>
              </label>
              <label>
                Monto
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={cashEntryAmount}
                  onChange={(event) => setCashEntryAmount(event.target.value)}
                />
              </label>
              <label>
                Motivo
                <input
                  type="text"
                  maxLength={120}
                  value={cashEntryNotes}
                  onChange={(event) => setCashEntryNotes(event.target.value)}
                  placeholder="Ej. pago proveedor, retiro de caja"
                />
              </label>
              <button type="submit" disabled={savingCashEntry}>
                {savingCashEntry ? 'Guardando...' : 'Registrar movimiento'}
              </button>
            </form>
          </div>

          <p className="daily-cut-hint">
            Efectivo esperado = fondo inicial + ventas en efectivo - retiros - gastos.
          </p>

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
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Monto</th>
                  <th>Motivo</th>
                  <th>Usuario</th>
                </tr>
              </thead>
              <tbody>
                {summary.cashEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{new Date(entry.createdAt).toLocaleString('es-MX')}</td>
                    <td>{CASH_ENTRY_TYPE_LABELS[entry.type]}</td>
                    <td>{formatCurrency(entry.amount)}</td>
                    <td>{entry.notes || '-'}</td>
                    <td>{entry.performedByName}</td>
                  </tr>
                ))}
                {!summary.cashEntries.length ? (
                  <tr>
                    <td colSpan={5}>No hay movimientos de caja para esta fecha.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="daily-cut-summary-row">
            <span>Movimientos del dia</span>
            <strong>
              {cashMovements.length}{' '}
              {cashMovements.length === 1 ? 'registro' : 'registros'}
            </strong>
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
