import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  sensor,
  RefreshCw,
  Users,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
const READINGS_ENDPOINT = `${API_BASE_URL}/sensors/vs125/readings`
const COLORS = ['#0f766e', '#2563eb', '#7c3aed', '#ea580c']

function inputDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function defaultRange() {
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - 13)
  return { startDate: inputDate(start), endDate: inputDate(end) }
}

function dateLabel(value) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function countIn(row) {
  return Number(row.individuals_in ?? row.in ?? 0)
}

function countOut(row) {
  return Number(row.individuals_out ?? row.out ?? 0)
}

function timestampOf(row) {
  return row.recorded_at || row.received_at || row.timestamp || null
}

function dateKeyOf(row) {
  const timestamp = timestampOf(row)
  return timestamp ? timestamp.slice(0, 10) : null
}

function getPreviousRange({ startDate, endDate }) {
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  const periodLength = Math.round((end - start) / 86400000) + 1
  const previousEnd = new Date(start)
  previousEnd.setDate(previousEnd.getDate() - 1)
  const previousStart = new Date(previousEnd)
  previousStart.setDate(previousStart.getDate() - periodLength + 1)

  return {
    startDate: inputDate(previousStart),
    endDate: inputDate(previousEnd),
  }
}

function MetricCard({ label, value, detail, icon: Icon, trend }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className="rounded-xl bg-slate-50 p-2.5 text-slate-500"><Icon size={19} /></span>
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
      <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
        {trend !== undefined && (
          <span className={`inline-flex items-center font-semibold ${trend >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {trend >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{Math.abs(trend)}%
          </span>
        )}
        <span>{detail}</span>
      </div>
    </article>
  )
}

function ChartPanel({ title, detail, children, className = '' }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6 ${className}`}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{detail}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

const tooltipStyle = {
  borderRadius: 12,
  border: '1px solid #e2e8f0',
  boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
}

export default function Analytics({ token }) {
  const [draftRange, setDraftRange] = useState(defaultRange)
  const [dateRange, setDateRange] = useState(defaultRange)
  const [rangeError, setRangeError] = useState('')
  const [readings, setReadings] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const previousRange = useMemo(() => getPreviousRange(dateRange), [dateRange])

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({
      start_date: previousRange.startDate,
      end_date: dateRange.endDate,
    })

    async function loadReadings() {
      setLoading(true)
      setLoadError('')

      try {
        const response = await fetch(`${READINGS_ENDPOINT}?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        })
        const data = await response.json().catch(() => null)

        if (!response.ok) {
          throw new Error(
            response.status === 401
              ? 'Your session has expired. Please log in again.'
              : data?.detail || 'Could not load sensor readings.',
          )
        }
        const rows = Array.isArray(data) ? data : data?.readings
        if (!Array.isArray(rows)) {
          throw new Error('The server returned an unexpected readings response.')
        }

        setReadings(rows)
      } catch (error) {
        if (error.name !== 'AbortError') {
          setLoadError(error.message || 'Could not load sensor readings.')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    loadReadings()
    return () => controller.abort()
  }, [token, dateRange, previousRange, refreshKey])

  const selectedReadings = useMemo(
    () => readings.filter((row) => {
      const date = dateKeyOf(row)
      return date && date >= dateRange.startDate && date <= dateRange.endDate
    }),
    [readings, dateRange],
  )
  const previousReadings = useMemo(
    () => readings.filter((row) => {
      const date = dateKeyOf(row)
      return date && date >= previousRange.startDate && date <= previousRange.endDate
    }),
    [readings, previousRange],
  )
  const dailyTrend = useMemo(() => {
    const byDate = new Map()
    for (const row of selectedReadings) {
      const date = dateKeyOf(row)
      byDate.set(date, (byDate.get(date) || 0) + countIn(row))
    }

    const result = []
    const day = new Date(`${dateRange.startDate}T00:00:00`)
    const lastDay = new Date(`${dateRange.endDate}T00:00:00`)
    while (day <= lastDay) {
      const date = inputDate(day)
      result.push({
        date,
        label: dateLabel(date),
        visitors: byDate.get(date) || 0,
      })
      day.setDate(day.getDate() + 1)
    }
    return result
  }, [selectedReadings, dateRange])
  const totalVisitors = selectedReadings.reduce((sum, row) => sum + countIn(row), 0)
  const totalExits = selectedReadings.reduce((sum, row) => sum + countOut(row), 0)
  const averageVisitors = dailyTrend.length ? Math.round(totalVisitors / dailyTrend.length) : 0
  const previousVisitors = previousReadings.reduce((sum, row) => sum + countIn(row), 0)
  const growth = previousVisitors
    ? Math.round(((totalVisitors - previousVisitors) / previousVisitors) * 100)
    : undefined

  const storeStats = useMemo(() => {
    const stores = new Map()
    for (const row of selectedReadings) {
      const key = row.store_id ?? row.store_name ?? 'unknown'
      if (!stores.has(key)) {
        stores.set(key, {
          id: key,
          name: row.store_name || `Store ${key}`,
          visitors: 0,
          sensors: new Set(),
        })
      }
      const store = stores.get(key)
      store.visitors += countIn(row)
      if (row.sensor_id != null) store.sensors.add(row.sensor_id)
    }
    return [...stores.values()]
      .map((store) => ({ ...store, sensors: store.sensors.size }))
      .sort((a, b) => b.visitors - a.visitors)
  }, [selectedReadings])

  const hourlyActivity = useMemo(() => {
    const byHour = new Map()
    for (const row of selectedReadings) {
      const timestamp = timestampOf(row)
      if (!timestamp) continue
      const hour = new Date(timestamp).getHours()
      byHour.set(hour, (byHour.get(hour) || 0) + countIn(row))
    }
    return [...byHour.entries()]
      .sort(([hourA], [hourB]) => hourA - hourB)
      .map(([hour, visitors]) => ({
        hour: new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, {
          hour: 'numeric',
        }),
        visitors,
      }))
  }, [selectedReadings])
  const peakHour = hourlyActivity.reduce(
    (peak, item) => item.visitors > peak.visitors ? item : peak,
    { hour: '--', visitors: 0 },
  )
  const sensorsTracked = new Set(
    selectedReadings.map((row) => row.sensor_id).filter((id) => id != null),
  ).size

  function applyRange(event) {
    event.preventDefault()
    if (draftRange.endDate < draftRange.startDate) {
      setRangeError('The end date must be on or after the start date.')
      return
    }
    setRangeError('')
    setDateRange({ ...draftRange })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Analytics</h1>
          <p className="mt-1 text-sm text-slate-500">
            Visitor activity from your assigned VS125 sensor sensors.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <form
            onSubmit={applyRange}
            className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
          >
            <label className="grid gap-1 text-xs font-medium text-slate-500">
              From
              <input
                type="date"
                value={draftRange.startDate}
                onChange={(event) => setDraftRange((range) => ({ ...range, startDate: event.target.value }))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
                required
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-slate-500">
              To
              <input
                type="date"
                value={draftRange.endDate}
                onChange={(event) => setDraftRange((range) => ({ ...range, endDate: event.target.value }))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
                required
              />
            </label>
            <button
              type="submit"
              className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              <CalendarDays size={16} />
              Apply
            </button>
            {rangeError && <p className="basis-full text-xs text-red-600" role="alert">{rangeError}</p>}
          </form>
          <button
            type="button"
            onClick={() => setRefreshKey((key) => key + 1)}
            disabled={loading}
            aria-label="Refresh readings"
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {loadError && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
          <AlertCircle size={18} />
          <span>{loadError}</span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Visitors"
          value={loading ? '—' : totalVisitors.toLocaleString()}
          detail={growth === undefined ? `${totalExits.toLocaleString()} recorded exits` : 'compared with previous period'}
          icon={Users}
          trend={growth}
        />
        <MetricCard
          label="Daily average"
          value={loading ? '—' : averageVisitors.toLocaleString()}
          detail="visitors per calendar day"
          icon={Activity}
        />
        <MetricCard
          label="Peak hour"
          value={loading ? '—' : peakHour.hour}
          detail={`${peakHour.visitors.toLocaleString()} visitors`}
          icon={CalendarDays}
        />
        <MetricCard
          label="sensors reporting"
          value={loading ? '—' : sensorsTracked}
          detail={`${storeStats.length} stores with readings`}
          icon={sensor}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <ChartPanel
          title="Visitor trend"
          detail={`${dateLabel(dateRange.startDate)} – ${dateLabel(dateRange.endDate)}`}
          className="xl:col-span-2"
        >
          {dailyTrend.some((day) => day.visitors > 0) ? (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyTrend} margin={{ top: 12, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="visitorFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0f766e" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#0f766e" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#64748b', fontSize: 12 }}
                    tickFormatter={(value) => `${(value / 1000).toFixed(1)}k`}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: '#334155', fontWeight: 600 }}
                    formatter={(value) => [Number(value).toLocaleString(), 'Visitors']}
                  />
                  <Area
                    type="monotone"
                    dataKey="visitors"
                    stroke="#0f766e"
                    strokeWidth={3}
                    fill="url(#visitorFill)"
                    activeDot={{ r: 5, strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-72 items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-500">
              {loading ? 'Loading sensor readings…' : 'No sensor readings in this date range.'}
            </div>
          )}
        </ChartPanel>

        <ChartPanel title="Visitors by store" detail="Share of recorded entries by store">
          {storeStats.length ? (
            <>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={storeStats}
                      dataKey="visitors"
                      nameKey="name"
                      innerRadius={66}
                      outerRadius={98}
                      paddingAngle={4}
                      stroke="none"
                    >
                      {storeStats.map((store, index) => (
                        <Cell key={store.id} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value) => [Number(value).toLocaleString(), 'Visitors']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                {storeStats.map((store, index) => (
                  <div key={store.id} className="flex min-w-0 items-center gap-2 text-xs text-slate-600">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <span className="truncate">{store.name}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex h-72 items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-500">
              {loading ? 'Loading sensor readings…' : 'No store readings in this date range.'}
            </div>
          )}
        </ChartPanel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ChartPanel title="Hourly activity" detail="Recorded entries by hour of day">
          {hourlyActivity.length ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyActivity} margin={{ top: 12, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="hour" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value) => [Number(value).toLocaleString(), 'Visitors']}
                  />
                  <Bar dataKey="visitors" fill="#2563eb" radius={[5, 5, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-72 items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-500">
              {loading ? 'Loading sensor readings…' : 'No hourly readings in this date range.'}
            </div>
          )}
        </ChartPanel>

        <ChartPanel title="Store comparison" detail="Recorded entries by store">
          {storeStats.length ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={storeStats} layout="vertical" margin={{ top: 8, right: 20, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" horizontal={false} />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#64748b', fontSize: 12 }}
                    tickFormatter={(value) => `${value / 1000}k`}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={100}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#64748b', fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value) => [Number(value).toLocaleString(), 'Visitors']}
                  />
                  <Bar dataKey="visitors" fill="#7c3aed" radius={[0, 6, 6, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-72 items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-500">
              {loading ? 'Loading sensor readings…' : 'No store readings in this date range.'}
            </div>
          )}
        </ChartPanel>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4 md:px-6">
          <h2 className="font-semibold text-slate-900">Store snapshot</h2>
          <p className="mt-1 text-sm text-slate-500">Visitor entries and sensors reporting during this period.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-136 text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium md:px-6">Store</th>
                <th className="px-5 py-3 text-right font-medium">Visitors</th>
                <th className="px-5 py-3 text-right font-medium md:px-6">sensors reporting</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {storeStats.map((store) => (
                <tr key={store.id}>
                  <td className="px-5 py-4 font-medium text-slate-800 md:px-6">{store.name}</td>
                  <td className="px-5 py-4 text-right tabular-nums text-slate-600">{store.visitors.toLocaleString()}</td>
                  <td className="px-5 py-4 text-right tabular-nums text-slate-600 md:px-6">{store.sensors}</td>
                </tr>
              ))}
              {!storeStats.length && (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-center text-slate-500">
                    {loading ? 'Loading sensor readings…' : 'No sensor data available for this period.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
