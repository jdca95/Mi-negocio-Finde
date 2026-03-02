import { useEffect, useMemo, useState } from 'react'
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
const MAX_RECENT_TOUCHES = 3

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
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [isRecentSalesOpen, setIsRecentSalesOpen] = useState(false)
  const [recentlyTouchedProductIds, setRecentlyTouchedProductIds] = useState<string[]>([])

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

  const inventoryMap = useMemo(
    () => new Map(inventory.map((product) => [product.productId, product])),
    [inventory],
  )

  const recentSales = useLiveQuery(
    () => getRecentSales(locationId, 8),
    [locationId],
    [] as RecentSaleView[],
  )

  useEffect(() => {
    setCart((current) => {
      let changed = false
      const nextCart = current
        .map((line) => {
          const latest = inventoryMap.get(line.productId)
          if (!latest || latest.stock <= 0) {
            changed = true
            return null
          }

          const nextQty = Math.min(line.qty, latest.stock)
          if (
            nextQty !== line.qty ||
            latest.stock !== line.stock ||
            latest.price !== line.price ||
            latest.name !== line.name
          ) {
            changed = true
            return {
              ...line,
              name: latest.name,
              stock: latest.stock,
              price: latest.price,
              qty: nextQty,
            }
          }

          return line
        })
        .filter((line): line is CartLine => line !== null && line.qty > 0)

      return changed ? nextCart : current
    })
  }, [inventoryMap])

  const cartSubtotal = useMemo(
    () => cart.reduce((accumulated, row) => accumulated + row.qty * row.price, 0),
    [cart],
  )

  const cartPieces = useMemo(
    () => cart.reduce((accumulated, row) => accumulated + row.qty, 0),
    [cart],
  )

  const recentTouchNames = useMemo(
    () =>
      recentlyTouchedProductIds
        .map((productId) => inventoryMap.get(productId)?.name)
        .filter((name): name is string => Boolean(name))
        .slice(0, MAX_RECENT_TOUCHES),
    [inventoryMap, recentlyTouchedProductIds],
  )

  const rememberTouch = (productId: string) => {
    setRecentlyTouchedProductIds((current) => {
      const next = [productId, ...current.filter((entry) => entry !== productId)]
      return next.slice(0, MAX_RECENT_TOUCHES)
    })
  }

  const addToCart = (productId: string) => {
    const row = productsForSale.find((product) => product.productId === productId)
    if (!row) {
      onError('Producto no disponible.')
      return
    }

    const existing = cart.find((line) => line.productId === productId)
    if (existing && existing.qty >= row.stock) {
      onError(`Ya alcanzaste el stock disponible para ${row.name}.`)
      return
    }

    rememberTouch(productId)

    setCart((current) => {
      const currentLine = current.find((line) => line.productId === productId)
      if (currentLine) {
        return current.map((line) =>
          line.productId === productId
            ? {
                ...line,
                qty: Math.min(line.qty + 1, row.stock),
                stock: row.stock,
                price: row.price,
                name: row.name,
              }
            : line,
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

          if (!Number.isFinite(qty)) {
            return line
          }

          const safeQty = Math.max(0, Math.min(Math.trunc(qty), line.stock))
          return { ...line, qty: safeQty }
        })
        .filter((line) => line.qty > 0),
    )
  }

  const removeFromCart = (productId: string) => {
    setCart((current) => current.filter((line) => line.productId !== productId))
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
      setPaymentMethod('CASH')
      setIsCartOpen(false)
      onNotify('Venta registrada correctamente.')
    } catch (error) {
      onError(error instanceof Error ? error.message : 'No se pudo registrar la venta.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="module-card sales-mobile-shell">
      <div className="module-header">
        <h2>Ventas rapidas</h2>
        <p>Busca productos, agrega al carrito y confirma en segundos.</p>
      </div>

      <div className="sales-search-sticky">
        <label>
          Buscar
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nombre o SKU"
          />
        </label>

        <div className="sales-summary-strip">
          <span>
            En carrito:{' '}
            <strong>
              {cart.length
                ? `${formatNumber(cart.length)} ${cart.length === 1 ? 'producto' : 'productos'}`
                : 'sin productos'}
            </strong>
          </span>
          <span>
            Recientes:{' '}
            <strong>{recentTouchNames.length ? recentTouchNames.join(' | ') : 'Ninguno'}</strong>
          </span>
        </div>
      </div>

      <div className="sales-product-list">
        {productsForSale.map((product) => {
          const cartLine = cart.find((line) => line.productId === product.productId)
          return (
            <article key={product.productId} className="sales-product-card">
              <div className="sales-product-header">
                <div>
                  <h3>{product.name}</h3>
                  <div className="sales-product-meta">
                    <span>Stock: {formatNumber(product.stock)}</span>
                    <strong>{formatCurrency(product.price)}</strong>
                  </div>
                </div>
                {cartLine ? (
                  <span className="sales-qty-badge">x{formatNumber(cartLine.qty)}</span>
                ) : null}
              </div>

              <button
                type="button"
                className="sales-add-button"
                onClick={() => addToCart(product.productId)}
              >
                Agregar
              </button>
            </article>
          )
        })}

        {!productsForSale.length ? (
          <div className="panel">
            <p>Sin productos disponibles para vender.</p>
          </div>
        ) : null}
      </div>

      {isCartOpen ? (
        <section className="sales-cart-panel open">
          <div className="module-header">
            <h3>Carrito</h3>
            <button
              type="button"
              className="secondary"
              onClick={() => setIsCartOpen(false)}
            >
              Ocultar
            </button>
          </div>

          <>
            <div className="sales-cart-list">
              {cart.map((line) => (
                <article key={line.productId} className="sales-cart-line">
                  <div className="sales-cart-line-head">
                    <div>
                      <strong>{line.name}</strong>
                      <small>
                        {formatCurrency(line.price)} c/u | Stock {formatNumber(line.stock)}
                      </small>
                    </div>
                    <strong>{formatCurrency(line.qty * line.price)}</strong>
                  </div>

                  <div className="sales-cart-line-controls">
                    <label>
                      Cantidad
                      <input
                        type="number"
                        min="0"
                        max={line.stock}
                        value={line.qty}
                        onChange={(event) =>
                          updateQuantity(line.productId, Number(event.target.value))
                        }
                      />
                    </label>

                    <button
                      type="button"
                      className="secondary danger"
                      onClick={() => removeFromCart(line.productId)}
                    >
                      Eliminar
                    </button>
                  </div>
                </article>
              ))}

              {!cart.length ? <p>Carrito vacio.</p> : null}
            </div>
          </>
        </section>
      ) : null}

      <section className="panel sales-recent-section">
        <button
          type="button"
          className="sales-recent-toggle"
          onClick={() => setIsRecentSalesOpen((current) => !current)}
        >
          <span>Ventas recientes</span>
          <span>{isRecentSalesOpen ? 'Ocultar' : 'Mostrar'}</span>
        </button>

        {isRecentSalesOpen ? (
          <div className="sales-recent-cards">
            {recentSales.map((sale) => (
              <article key={sale.id} className="sales-recent-card">
                <div className="sales-recent-card-head">
                  <strong>{sale.folio ?? sale.id.slice(0, 8)}</strong>
                  <span>{sale.status === 'COMPLETED' ? 'Completada' : 'Cancelada'}</span>
                </div>

                <div className="sales-recent-card-meta">
                  <span>{sale.createdLabel}</span>
                  <span>{PAYMENT_METHOD_LABELS[sale.paymentMethod]}</span>
                </div>

                <div className="sales-recent-card-total">
                  <strong>{formatCurrency(sale.total)}</strong>
                  <small>Utilidad: {formatCurrency(sale.estimatedProfit)}</small>
                </div>

                {canCancel && sale.status === 'COMPLETED' ? (
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
              </article>
            ))}

            {!recentSales.length ? <p>Sin ventas recientes.</p> : null}
          </div>
        ) : null}
      </section>

      <div className="sales-cart-bar">
        <div className="sales-payment-buttons sales-payment-buttons--sticky">
          {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={
                paymentMethod === value
                  ? 'sales-payment-button is-active'
                  : 'sales-payment-button'
              }
              onClick={() => setPaymentMethod(value as PaymentMethod)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="sales-cart-bar-main">
          <div className="sales-cart-bar-summary">
            <strong>{formatNumber(cartPieces)} piezas</strong>
            <span>Total: {formatCurrency(cartSubtotal)}</span>
          </div>

          <button
            type="button"
            className="secondary"
            onClick={() => setIsCartOpen((current) => !current)}
          >
            {isCartOpen ? 'Cerrar carrito' : 'Editar carrito'}
          </button>
        </div>

        <button
          type="button"
          className="sales-confirm-button sales-confirm-button--sticky"
          disabled={isSaving || cart.length === 0}
          onClick={handleSale}
        >
          {isSaving ? 'Guardando...' : `Confirmar venta ${formatCurrency(cartSubtotal)}`}
        </button>
      </div>
    </section>
  )
}
