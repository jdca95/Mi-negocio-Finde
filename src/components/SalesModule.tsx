import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { PAYMENT_METHOD_LABELS } from '../constants'
import { listInventoryView } from '../services/inventoryService'
import { getRecentSales, type RecentSaleView } from '../services/queryService'
import { cancelSale, createSale } from '../services/salesService'
import type { InventoryViewRow, PaymentMethod } from '../types'
import { formatCurrency, formatNumber } from '../utils/format'

interface SalesModuleProps {
  locationId: string
  performedBy: string
  canCancel: boolean
  onNotify: (message: string) => void
  onError: (message: string) => void
}

interface CartLine {
  productId: string
  name: string
  stock: number
  price: number
  qty: number
}

const emptyCart: CartLine[] = []

export const SalesModule = ({
  locationId,
  performedBy,
  canCancel,
  onNotify,
  onError,
}: SalesModuleProps) => {
  const [search, setSearch] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH')
  const [cart, setCart] = useState<CartLine[]>(emptyCart)
  const [isSaving, setIsSaving] = useState(false)

  const inventory = useLiveQuery(
    () =>
      listInventoryView(locationId, {
        search,
        lowStockOnly: false,
        includeInactive: false,
      }),
    [locationId, search],
    [] as InventoryViewRow[],
  )

  const productsForSale = useMemo(
    () => inventory.filter((product) => product.stock > 0),
    [inventory],
  )

  const recentSales = useLiveQuery(
    () => getRecentSales(locationId, 20),
    [locationId],
    [] as RecentSaleView[],
  )

  const cartSubtotal = useMemo(
    () =>
      cart.reduce((accumulated, row) => accumulated + row.qty * row.price, 0),
    [cart],
  )

  const addToCart = (productId: string) => {
    const row = productsForSale.find((product) => product.productId === productId)
    if (!row) {
      onError('Producto no disponible.')
      return
    }

    setCart((current) => {
      const existing = current.find((line) => line.productId === productId)
      if (existing) {
        const nextQty = Math.min(existing.qty + 1, row.stock)
        return current.map((line) =>
          line.productId === productId ? { ...line, qty: nextQty, stock: row.stock } : line,
        )
      }

      return [
        ...current,
        {
          productId,
          name: row.name,
          stock: row.stock,
          price: row.price,
          qty: 1,
        },
      ]
    })
  }

  const updateQuantity = (productId: string, qty: number) => {
    setCart((current) =>
      current
        .map((line) => {
          if (line.productId !== productId) {
            return line
          }
          const safeQty = Math.max(0, Math.min(qty, line.stock))
          return { ...line, qty: safeQty }
        })
        .filter((line) => line.qty > 0),
    )
  }

  const handleSale = async () => {
    if (!cart.length) {
      onError('No hay productos en el carrito.')
      return
    }

    setIsSaving(true)
    try {
      await createSale({
        locationId,
        paymentMethod,
        performedBy,
        items: cart.map((line) => ({
          productId: line.productId,
          qty: line.qty,
        })),
      })
      setCart(emptyCart)
      onNotify('Venta registrada correctamente.')
    } catch (error) {
      onError(error instanceof Error ? error.message : 'No se pudo registrar la venta.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="module-card">
      <div className="module-header">
        <h2>Ventas rapidas</h2>
        <p>Busca productos, agrega al carrito y confirma en segundos.</p>
      </div>

      <div className="sales-grid">
        <div className="panel">
          <h3>Catalogo</h3>
          <label>
            Buscar
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nombre o SKU"
            />
          </label>
          <div className="list-scroll">
            {productsForSale.map((product) => (
              <article key={product.productId} className="list-item">
                <div>
                  <strong>{product.name}</strong>
                  <small>
                    Stock {formatNumber(product.stock)} | {formatCurrency(product.price)}
                  </small>
                </div>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => addToCart(product.productId)}
                >
                  Agregar
                </button>
              </article>
            ))}
            {!productsForSale.length ? <p>Sin productos disponibles.</p> : null}
          </div>
        </div>

        <div className="panel">
          <h3>Carrito</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Precio</th>
                  <th>Stock</th>
                  <th>Cantidad</th>
                  <th>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {cart.map((line) => (
                  <tr key={line.productId}>
                    <td>{line.name}</td>
                    <td>{formatCurrency(line.price)}</td>
                    <td>{formatNumber(line.stock)}</td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        max={line.stock}
                        value={line.qty}
                        onChange={(event) =>
                          updateQuantity(line.productId, Number(event.target.value))
                        }
                      />
                    </td>
                    <td>{formatCurrency(line.qty * line.price)}</td>
                  </tr>
                ))}
                {!cart.length ? (
                  <tr>
                    <td colSpan={5}>Carrito vacio.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="actions-row">
            <label>
              Metodo de pago
              <select
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
              >
                {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <p className="metric-box">Total: {formatCurrency(cartSubtotal)}</p>
            <button type="button" disabled={isSaving} onClick={handleSale}>
              {isSaving ? 'Guardando...' : 'Confirmar venta'}
            </button>
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>Ventas recientes</h3>
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
                {canCancel ? <th>Acciones</th> : null}
              </tr>
            </thead>
            <tbody>
              {recentSales.map((sale) => (
                <tr key={sale.id}>
                  <td>{sale.folio ?? sale.id.slice(0, 8)}</td>
                  <td>{sale.createdLabel}</td>
                  <td>{PAYMENT_METHOD_LABELS[sale.paymentMethod]}</td>
                  <td>{formatCurrency(sale.total)}</td>
                  <td>{formatCurrency(sale.estimatedProfit)}</td>
                  <td>{sale.status === 'COMPLETED' ? 'Completada' : 'Cancelada'}</td>
                  {canCancel ? (
                    <td>
                      {sale.status === 'COMPLETED' ? (
                        <button
                          type="button"
                          className="secondary danger"
                          onClick={async () => {
                            const reason = window.prompt('Motivo de cancelacion')
                            if (!reason) {
                              return
                            }
                            try {
                              await cancelSale({
                                saleId: sale.id,
                                reason,
                                performedBy,
                              })
                              onNotify('Venta cancelada con reversa de stock.')
                            } catch (error) {
                              onError(
                                error instanceof Error
                                  ? error.message
                                  : 'No se pudo cancelar venta.',
                              )
                            }
                          }}
                        >
                          Cancelar
                        </button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
