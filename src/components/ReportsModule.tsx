import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'
import { Bar, Line } from 'react-chartjs-2'
import { PERIOD_PRESET_LABELS } from '../constants'
import { getPeriodReport } from '../services/reportService'
import type { PeriodPreset } from '../types'
import { resolvePeriodRange, todayInputValue } from '../utils/date'
import { formatCurrency, formatNumber } from '../utils/format'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
)

interface ReportsModuleProps {
  activeLocationId: string
}

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: true,
      position: 'bottom' as const,
    },
  },
}

export const ReportsModule = ({ activeLocationId }: ReportsModuleProps) => {
  const [period, setPeriod] = useState<PeriodPreset>('TODAY')
  const [startDate, setStartDate] = useState(todayInputValue())
  const [endDate, setEndDate] = useState(todayInputValue())
  const [locationScope, setLocationScope] = useState<string | 'ALL'>(
    activeLocationId,
  )

  const report = useLiveQuery(
    () =>
      getPeriodReport({
        period,
        startDate,
        endDate,
        locationId: locationScope,
      }),
    [period, startDate, endDate, locationScope],
    null,
  )

  const topQtyChart = useMemo(() => {
    const labels = report?.topByQty.map((row) => row.productName) ?? []
    const data = report?.topByQty.map((row) => row.qty) ?? []
    return {
      labels,
      datasets: [
        {
          label: 'Cantidad vendida',
          data,
          backgroundColor: '#2d6a4f',
        },
      ],
    }
  }, [report])

  const topRevenueChart = useMemo(() => {
    const labels = report?.topByRevenue.map((row) => row.productName) ?? []
    const data = report?.topByRevenue.map((row) => row.revenue) ?? []
    return {
      labels,
      datasets: [
        {
          label: 'Ingresos',
          data,
          backgroundColor: '#40916c',
        },
      ],
    }
  }, [report])

  const salesByDayChart = useMemo(() => {
    const labels = report?.salesByDay.map((row) => row.date) ?? []
    const data = report?.salesByDay.map((row) => row.total) ?? []
    return {
      labels,
      datasets: [
        {
          label: 'Ventas por dia',
          data,
          borderColor: '#1d3557',
          backgroundColor: '#457b9d',
          fill: false,
          tension: 0.2,
        },
      ],
    }
  }, [report])

  const profitByDayChart = useMemo(() => {
    const labels = report?.profitByDay.map((row) => row.date) ?? []
    const data = report?.profitByDay.map((row) => row.total) ?? []
    return {
      labels,
      datasets: [
        {
          label: 'Utilidad por dia',
          data,
          borderColor: '#9d0208',
          backgroundColor: '#d00000',
          fill: false,
          tension: 0.2,
        },
      ],
    }
  }, [report])

  return (
    <section className="module-card">
      <div className="module-header">
        <h2>Reportes y graficas</h2>
      </div>

      <div className="toolbar">
        <label>
          Periodo
          <select
            value={period}
            onChange={(event) => {
              const nextPeriod = event.target.value as PeriodPreset
              setPeriod(nextPeriod)
              if (nextPeriod !== 'CUSTOM') {
                const range = resolvePeriodRange(nextPeriod, startDate, endDate)
                setStartDate(range.startDate)
                setEndDate(range.endDate)
              }
            }}
          >
            {Object.entries(PERIOD_PRESET_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Inicio
          <input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </label>

        <label>
          Fin
          <input
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </label>

        <label>
          Alcance
          <select
            value={locationScope}
            onChange={(event) => setLocationScope(event.target.value)}
          >
            <option value={activeLocationId}>Sucursal activa</option>
            <option value="ALL">Todas las sucursales</option>
          </select>
        </label>
      </div>

      <div className="charts-grid">
        <article className="chart-card">
          <h3>Top productos por cantidad</h3>
          <div className="chart-wrap">
            <Bar options={chartOptions} data={topQtyChart} />
          </div>
        </article>
        <article className="chart-card">
          <h3>Top productos por ingresos</h3>
          <div className="chart-wrap">
            <Bar options={chartOptions} data={topRevenueChart} />
          </div>
        </article>
        <article className="chart-card">
          <h3>Ventas por dia</h3>
          <div className="chart-wrap">
            <Line options={chartOptions} data={salesByDayChart} />
          </div>
        </article>
        <article className="chart-card">
          <h3>Utilidad por dia</h3>
          <div className="chart-wrap">
            <Line options={chartOptions} data={profitByDayChart} />
          </div>
        </article>
      </div>

      <div className="panel">
        <h3>Top 20</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Producto</th>
                <th>Cantidad</th>
                <th>Ingresos</th>
                <th>Utilidad</th>
              </tr>
            </thead>
            <tbody>
              {report?.top20.map((row, index) => (
                <tr key={row.productId}>
                  <td>{index + 1}</td>
                  <td>{row.productName}</td>
                  <td>{formatNumber(row.qty)}</td>
                  <td>{formatCurrency(row.revenue)}</td>
                  <td>{formatCurrency(row.profit)}</td>
                </tr>
              ))}
              {!report?.top20.length ? (
                <tr>
                  <td colSpan={5}>Sin datos para el periodo seleccionado.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

