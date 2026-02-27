import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { createProduct, listInventoryView, setProductActive, updateProduct } from '../services/inventoryService'
import type { InventoryViewRow } from '../types'
import { formatCurrency, formatNumber } from '../utils/format'

interface InventoryModuleProps {
  locationId: string
  canManage: boolean
  performedBy: string
  onNotify: (message: string) => void
  onError: (message: string) => void
}

interface ProductFormState {
  id: string | null
  name: string
  sku: string
  cost: string
  price: string
  minStock: string
  initialStock: string
}

const defaultFormState: ProductFormState = {
  id: null,
  name: '',
  sku: '',
  cost: '0',
  price: '0',
  minStock: '0',
  initialStock: '0',
}

export const InventoryModule = ({
  locationId,
  canManage,
  performedBy,
  onNotify,
  onError,
}: InventoryModuleProps) => {
  const [search, setSearch] = useState('')
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [includeInactive, setIncludeInactive] = useState(false)
  const [formState, setFormState] = useState<ProductFormState>(defaultFormState)

  const inventoryRows = useLiveQuery(
    () =>
      listInventoryView(locationId, {
        search,
        lowStockOnly,
        includeInactive,
      }),
    [locationId, search, lowStockOnly, includeInactive],
    [] as InventoryViewRow[],
  )

  const location = useLiveQuery(() => db.locations.get(locationId), [locationId], null)

  const lowStockCount = useMemo(
    () => inventoryRows.filter((row) => row.lowStock && row.active).length,
    [inventoryRows],
  )

  const resetForm = () => setFormState(defaultFormState)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    try {
      if (formState.id) {
        await updateProduct(formState.id, {
          name: formState.name,
          sku: formState.sku,
          cost: Number(formState.cost),
          price: Number(formState.price),
          minStock: Number(formState.minStock),
        })
        onNotify('Producto actualizado.')
      } else {
        await createProduct({
          name: formState.name,
          sku: formState.sku,
          cost: Number(formState.cost),
          price: Number(formState.price),
          minStock: Number(formState.minStock),
          initialStock: Number(formState.initialStock),
          locationId,
          performedBy,
        })
        onNotify('Producto creado.')
      }
      resetForm()
    } catch (error) {
      onError(error instanceof Error ? error.message : 'No se pudo guardar producto.')
    }
  }

  return (
    <section className="module-card">
      <div className="module-header">
        <h2>Inventario</h2>
        <p>
          Ubicacion activa: <strong>{location?.name ?? locationId}</strong>
        </p>
      </div>

      <div className="toolbar">
        <label>
          Buscar
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nombre o SKU"
          />
        </label>

        <label className="inline-check">
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={(event) => setLowStockOnly(event.target.checked)}
          />
          Solo inventario bajo
        </label>

        <label className="inline-check">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(event) => setIncludeInactive(event.target.checked)}
          />
          Incluir inactivos
        </label>

        <span className="warning-pill">Bajo stock: {lowStockCount}</span>
      </div>

      {canManage ? (
        <form className="grid-form compact" onSubmit={handleSubmit}>
          <h3>{formState.id ? 'Editar producto' : 'Nuevo producto'}</h3>

          <label>
            Nombre
            <input
              value={formState.name}
              onChange={(event) =>
                setFormState((current) => ({ ...current, name: event.target.value }))
              }
              required
            />
          </label>

          <label>
            SKU
            <input
              value={formState.sku}
              onChange={(event) =>
                setFormState((current) => ({ ...current, sku: event.target.value }))
              }
              placeholder="Opcional"
            />
          </label>

          <label>
            Costo
            <input
              type="number"
              min="0"
              step="0.01"
              value={formState.cost}
              onChange={(event) =>
                setFormState((current) => ({ ...current, cost: event.target.value }))
              }
            />
          </label>

          <label>
            Precio
            <input
              type="number"
              min="0"
              step="0.01"
              value={formState.price}
              onChange={(event) =>
                setFormState((current) => ({ ...current, price: event.target.value }))
              }
            />
          </label>

          <label>
            Stock minimo
            <input
              type="number"
              min="0"
              step="1"
              value={formState.minStock}
              onChange={(event) =>
                setFormState((current) => ({ ...current, minStock: event.target.value }))
              }
            />
          </label>

          {!formState.id ? (
            <label>
              Stock inicial (ubicacion activa)
              <input
                type="number"
                min="0"
                step="1"
                value={formState.initialStock}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    initialStock: event.target.value,
                  }))
                }
              />
            </label>
          ) : null}

          <div className="actions-row">
            <button type="submit">{formState.id ? 'Guardar cambios' : 'Crear producto'}</button>
            {formState.id ? (
              <button type="button" className="secondary" onClick={resetForm}>
                Cancelar edicion
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th>SKU</th>
              <th>Costo</th>
              <th>Precio</th>
              <th>Stock</th>
              <th>Min</th>
              <th>Estado</th>
              {canManage ? <th>Acciones</th> : null}
            </tr>
          </thead>
          <tbody>
            {inventoryRows.map((row) => (
              <tr key={row.productId} className={row.lowStock && row.active ? 'low-row' : ''}>
                <td>{row.name}</td>
                <td>{row.sku || '-'}</td>
                <td>{formatCurrency(row.cost)}</td>
                <td>{formatCurrency(row.price)}</td>
                <td>{formatNumber(row.stock)}</td>
                <td>{formatNumber(row.minStock)}</td>
                <td>{row.active ? (row.lowStock ? 'Bajo' : 'OK') : 'Inactivo'}</td>
                {canManage ? (
                  <td className="actions-cell">
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        setFormState({
                          id: row.productId,
                          name: row.name,
                          sku: row.sku,
                          cost: row.cost.toString(),
                          price: row.price.toString(),
                          minStock: row.minStock.toString(),
                          initialStock: '0',
                        })
                      }
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="secondary danger"
                      onClick={async () => {
                        try {
                          await setProductActive(row.productId, !row.active)
                          onNotify(row.active ? 'Producto inactivado.' : 'Producto activado.')
                        } catch (error) {
                          onError(
                            error instanceof Error
                              ? error.message
                              : 'No se pudo actualizar estado.',
                          )
                        }
                      }}
                    >
                      {row.active ? 'Inactivar' : 'Activar'}
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
