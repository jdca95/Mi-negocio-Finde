import { useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import { parseProductsCsv, importProductsFromCsv } from '../services/importService'
import type { CsvValidationResult, Location } from '../types'
import { formatCurrency, formatNumber } from '../utils/format'

interface ImportModuleProps {
  defaultLocationId: string
  locations: Location[]
  canImport: boolean
  performedBy: string
  onNotify: (message: string) => void
  onError: (message: string) => void
}

const emptyValidation: CsvValidationResult = { rows: [], errors: [] }

export const ImportModule = ({
  defaultLocationId,
  locations,
  canImport,
  performedBy,
  onNotify,
  onError,
}: ImportModuleProps) => {
  const [csvText, setCsvText] = useState('')
  const [fallbackLocationId, setFallbackLocationId] = useState(defaultLocationId)
  const [validation, setValidation] = useState<CsvValidationResult>(emptyValidation)
  const [importing, setImporting] = useState(false)

  const canImportRows = useMemo(
    () => validation.rows.length > 0 && validation.errors.length === 0,
    [validation],
  )

  const loadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    const text = await file.text()
    setCsvText(text)
    setValidation(parseProductsCsv(text))
  }

  return (
    <section className="module-card">
      <div className="module-header">
        <h2>Importacion CSV</h2>
        {!canImport ? (
          <p className="info-text">Solo Admin puede importar productos.</p>
        ) : null}
      </div>

      <div className="grid-form compact">
        <label>
          Archivo CSV
          <input type="file" accept=".csv,text/csv" onChange={loadFile} disabled={!canImport} />
        </label>

        <label>
          Ubicacion por defecto
          <select
            value={fallbackLocationId}
            onChange={(event) => setFallbackLocationId(event.target.value)}
            disabled={!canImport}
          >
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label>
        Pegar CSV (name,cost,price,stock,sku,locationCode)
        <textarea
          rows={8}
          value={csvText}
          onChange={(event) => setCsvText(event.target.value)}
          disabled={!canImport}
        />
      </label>

      <div className="actions-row">
        <button
          type="button"
          className="secondary"
          disabled={!canImport}
          onClick={() => setValidation(parseProductsCsv(csvText))}
        >
          Validar CSV
        </button>
        <button
          type="button"
          disabled={!canImport || !canImportRows || importing}
          onClick={async () => {
            setImporting(true)
            try {
              const result = await importProductsFromCsv({
                rows: validation.rows,
                fallbackLocationId,
                performedBy,
              })
              onNotify(
                `Importacion completada. Nuevos: ${result.created}, actualizados: ${result.updated}.`,
              )
            } catch (error) {
              onError(error instanceof Error ? error.message : 'No se pudo importar CSV.')
            } finally {
              setImporting(false)
            }
          }}
        >
          {importing ? 'Importando...' : 'Importar productos'}
        </button>
      </div>

      {validation.errors.length > 0 ? (
        <div className="error-block">
          <h4>Errores detectados</h4>
          <ul>
            {validation.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>SKU</th>
              <th>Costo</th>
              <th>Precio</th>
              <th>Stock</th>
              <th>locationCode</th>
            </tr>
          </thead>
          <tbody>
            {validation.rows.slice(0, 100).map((row, index) => (
              <tr key={`${row.name}-${index}`}>
                <td>{row.name}</td>
                <td>{row.sku || '-'}</td>
                <td>{formatCurrency(row.cost)}</td>
                <td>{formatCurrency(row.price)}</td>
                <td>{formatNumber(row.stock)}</td>
                <td>{row.locationCode || '(default)'}</td>
              </tr>
            ))}
            {!validation.rows.length ? (
              <tr>
                <td colSpan={6}>Sin filas validadas.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}
