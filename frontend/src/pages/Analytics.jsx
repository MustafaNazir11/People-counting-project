import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Baby,
  BarChart2,
  CalendarDays,
  Mars,
  PieChart as PieChartIcon,
  RefreshCw,
  Store,
  Users,
  Venus,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { apiFetch } from '../api'
import useSensors from '../hooks/useSensors'
import useStores from '../hooks/useStores'

const ENTRY_COLOR = '#0070f3'
const EXIT_COLOR = '#7928ca'
const MALE_COLOR = '#0070f3'
const FEMALE_COLOR = '#eb367f'
const CHILD_COLOR = '#f5a623'
const GENDER_PIE_COLORS = ['#0070f3', '#eb367f']

function inputDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function defaultRange() {
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - 13)
  return { startDate: inputDate(start), endDate: inputDate(end) }
}

function dateLabel(value) {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
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
  const length = Math.round((end - start) / 86400000) + 1
  const previousEnd = new Date(start)
  previousEnd.setDate(previousEnd.getDate() - 1)
  const previousStart = new Date(previousEnd)
  previousStart.setDate(previousStart.getDate() - length + 1)
  return { startDate: inputDate(previousStart), endDate: inputDate(previousEnd) }
}

const PRESETS = [
  {
    label: 'Today', range: () => {
      const today = inputDate(new Date())
      return { startDate: today, endDate: today }
    }
  },
  {
    label: 'Yesterday', range: () => {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const date = inputDate(yesterday)
      return { startDate: date, endDate: date }
    }
  },
  {
    label: 'Last 7 days', range: () => {
      const end = new Date()
      const start = new Date(end)
      start.setDate(start.getDate() - 6)
      return { startDate: inputDate(start), endDate: inputDate(end) }
    }
  },
  {
    label: 'Last 30 days', range: () => {
      const end = new Date()
      const start = new Date(end)
      start.setDate(start.getDate() - 29)
      return { startDate: inputDate(start), endDate: inputDate(end) }
    }
  },
  {
    label: 'This month', range: () => {
      const end = new Date()
      return {
        startDate: inputDate(new Date(end.getFullYear(), end.getMonth(), 1)),
        endDate: inputDate(end),
      }
    }
  },
  { label: 'Custom', range: null },
]

const tooltipStyle = {
  borderRadius: 12,
  border: '1px solid #ebebeb',
  boxShadow: '0px 2px 2px rgba(0,0,0,0.04), 0px 8px 16px -4px rgba(0,0,0,0.08)',
  fontSize: 13,
  color: '#171717',
  fontFamily: 'Geist, Inter, Arial, sans-serif',
}

function lineKey(row) {
  return `${row.sensor_id}:${row.line_id}:${row.line_name || ''}`
}

function TrendBadge({ value }) {
  if (value === undefined) return null
  const positive = value >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium ${positive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
      {positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
      {Math.abs(value)}%
    </span>
  )
}

function Metric({ icon: Icon, label, value, color, loading, unavailable = false }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <Icon size={16} strokeWidth={1.8} style={{ color }} aria-hidden="true" className="shrink-0" />
        <p className="text-sm font-medium text-[#4d4d4d]">{label}</p>
      </div>
      <p className="mt-1.5 pl-[22px] text-xl font-semibold tabular-nums tracking-tight text-[#171717]">
        {loading ? '—' : unavailable ? 'N/A' : Number(value).toLocaleString()}
      </p>
    </div>
  )
}

function TrafficCards({ loading, totals, previousTotals, occupancyLoading, occupancyError, occupancy, occupancyUpdatedAt }) {
  const growthIn = previousTotals.totalIn
    ? Math.round(((totals.totalIn - previousTotals.totalIn) / previousTotals.totalIn) * 100)
    : undefined
  const growthOut = previousTotals.totalOut
    ? Math.round(((totals.totalOut - previousTotals.totalOut) / previousTotals.totalOut) * 100)
    : undefined
  const shown = (value) => loading ? '—' : value.toLocaleString()

  const occupancyValue = occupancyLoading
    ? '—'
    : occupancyError
    ? 'Error'
    : occupancy.total === null
    ? 'N/A'
    : occupancy.total.toLocaleString()

  const cardClass = 'relative flex h-full min-h-[300px] flex-col overflow-hidden rounded-2xl border border-[#ebebeb] bg-white p-5 shadow-[0px_1px_1px_rgba(0,0,0,0.04)] sm:p-6'

  return (
    <section aria-label="Visitor totals" className="space-y-3">
      {/* Row label + snapshot timestamp */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-[0.1em] text-[#8f8f8f]">Traffic overview</p>
        {occupancyUpdatedAt && (
          <span className="rounded-full border border-[#ebebeb] bg-[#fafafa] px-2.5 py-1 text-[11px] text-[#8f8f8f]">
            Snapshot · {formatUpdatedAt(occupancyUpdatedAt)}
          </span>
        )}
      </div>

      <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className={cardClass}>
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#007cf0] to-[#00dfd8]" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-[#171717]">IN</h2>
              <p className="mt-1 text-sm text-[#8f8f8f]">Total Entries</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#e8f9f0]">
                <ArrowDownRight size={15} color="#16a34a" strokeWidth={2.5} />
              </span>
              <TrendBadge value={growthIn} />
            </div>
          </div>
          <p className="mt-4 text-5xl font-semibold leading-none tracking-[-1.8px] text-[#171717] tabular-nums">
            {shown(totals.totalIn)}
          </p>
          <div className="mt-auto grid grid-cols-3 border-t border-[#ebebeb] pt-5">
            <div className="pr-3"><Metric icon={Mars} label="Male" value={totals.maleIn} loading={loading} color={MALE_COLOR} /></div>
            <div className="border-x border-[#f2f2f2] px-3"><Metric icon={Venus} label="Female" value={totals.femaleIn} loading={loading} color={FEMALE_COLOR} /></div>
            <div className="pl-3"><Metric icon={Baby} label="Children" loading={loading} unavailable color={CHILD_COLOR} /></div>
          </div>
        </article>

        <article className={cardClass}>
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#7928ca] to-[#ff0080]" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-[#171717]">OUT</h2>
              <p className="mt-1 text-sm text-[#8f8f8f]">Total Exits</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f3e8ff]">
                <ArrowUpRight size={15} color="#7928ca" strokeWidth={2.5} />
              </span>
              <TrendBadge value={growthOut} />
            </div>
          </div>
          <p className="mt-4 text-5xl font-semibold leading-none tracking-[-1.8px] text-[#171717] tabular-nums">
            {shown(totals.totalOut)}
          </p>
          <div className="mt-auto grid grid-cols-3 border-t border-[#ebebeb] pt-5">
            <div className="pr-3"><Metric icon={Mars} label="Male" value={totals.maleOut} loading={loading} color={MALE_COLOR} /></div>
            <div className="border-x border-[#f2f2f2] px-3"><Metric icon={Venus} label="Female" value={totals.femaleOut} loading={loading} color={FEMALE_COLOR} /></div>
            <div className="pl-3"><Metric icon={Baby} label="Children" loading={loading} unavailable color={CHILD_COLOR} /></div>
          </div>
        </article>

        <article className={cardClass}>
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#ff4d4d] to-[#f9cb28]" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-[#171717]">GROUP</h2>
              <p className="mt-1 text-sm text-[#8f8f8f]">Groups counted separately</p>
            </div>
            <Users size={20} color="#f5a623" aria-hidden="true" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <p className="text-5xl font-semibold leading-none tracking-[-1.8px] text-[#171717] tabular-nums">
                {shown(totals.groupIn)}
              </p>
              <p className="mt-2 text-sm text-[#8f8f8f]">Group IN</p>
            </div>
            <div>
              <p className="text-5xl font-semibold leading-none tracking-[-1.8px] text-[#171717] tabular-nums">
                {shown(totals.groupOut)}
              </p>
              <p className="mt-2 text-sm text-[#8f8f8f]">Group OUT</p>
            </div>
          </div>
          <p className="mt-auto border-t border-[#ebebeb] pt-5 text-sm leading-relaxed text-[#8f8f8f]">
            Group counts are reported independently from individual visitors.
          </p>
        </article>

        <article className={`${cardClass} border-[#d3e5ff]`}>
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#0070f3] to-[#00dfd8]" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-[#171717]">NOW</h2>
              <p className="mt-1 text-sm text-[#8f8f8f]">Current Occupancy</p>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#e8f0ff]">
              <Users size={16} color={ENTRY_COLOR} aria-hidden="true" />
            </div>
          </div>

          {occupancyError && (
            <div role="alert" className="mt-3 flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              <AlertCircle size={13} /> {occupancyError}
            </div>
          )}

          <p className="mt-4 text-5xl font-semibold leading-none tracking-[-1.8px] text-[#171717] tabular-nums">
            {occupancyValue}
          </p>
          <div className="mt-auto border-t border-[#ebebeb] pt-5">
            <p className="text-sm text-[#8f8f8f]">Sensor-reported occupancy</p>
          </div>
        </article>
      </div>
    </section>
  )
}

function SectionHeading({ title, description, action }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-[#171717]">{title}</h2>
        <p className="mt-1 text-sm text-[#8f8f8f]">{description}</p>
      </div>
      {action}
    </div>
  )
}

// ─── Male restroom-pictogram silhouette ──────────────────────────────────────
function MaleSilhouette() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="-5 -10 110 115" className="h-full w-full" aria-hidden="true">
      <path fill={MALE_COLOR} d="m59 24c5.5234 0 10 4.4766 10 10v20.75c0 1.793-1.457 3.25-3.25 3.25s-3.25-1.457-3.25-3.25v-20.75h-2.5v56.75c0 2.3477-1.9023 4.25-4.25 4.25s-4.25-1.9023-4.25-4.25v-32.75h-3v32.75c0 2.3477-1.9023 4.25-4.25 4.25s-4.25-1.9023-4.25-4.25v-56.75h-2.5v20.75c0 1.793-1.457 3.25-3.25 3.25s-3.25-1.457-3.25-3.25v-20.75c0-5.5234 4.4766-10 10-10z" />
      <path fill={MALE_COLOR} d="m50 5c4.6953 0 8.5 3.8047 8.5 8.5s-3.8047 8.5-8.5 8.5-8.5-3.8047-8.5-8.5 3.8047-8.5 8.5-8.5z" />
    </svg>
  )
}

// ─── Female restroom-pictogram silhouette ────────────────────────────────────
function FemaleSilhouette() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="-5 -10 110 115" className="h-full w-full" aria-hidden="true">
      <path fill={FEMALE_COLOR} d="m50 10c-2.0508 0-4.0195 0.82031-5.4688 2.2695s-2.2695 3.4219-2.2695 5.4688c0 2.0508 0.82031 4.0195 2.2695 5.4688s3.4219 2.2695 5.4688 2.2695c2.0508 0 4.0195-0.82031 5.4688-2.2695s2.2695-3.4219 2.2695-5.4688c0-2.0508-0.82031-4.0195-2.2695-5.4688s-3.4219-2.2695-5.4688-2.2695zm-6.8516 19.352s-0.12109 0.03125-0.17188 0.039063h-0.070312c-0.80859 0-1.5195 0.37109-2 0.94922-0.19922 0.21094-0.37891 0.44141-0.51953 0.71094l-12.59 23.41c-0.82812 1.5391-0.26172 3.4492 1.2812 4.2812 1.5391 0.82812 3.4609 0.26172 4.2891-1.2891l10.238-19.031-0.87109 1.6289c0.10938-0.21094 0.32031-0.33984 0.53906-0.35938 0.12891-0.011718 0.26953 0.011719 0.39844 0.078125 0.33984 0.17969 0.46875 0.60156 0.28125 0.94141-2.8516 5.4102-7.6484 14.09-10.859 19.852-1.8086 3.2617-0.26953 5.8984 3.4688 5.8984h4.8984v20.328c0 1.7812 1.4414 3.2188 3.2188 3.2188 1.7812 0 3.2188-1.4297 3.2188-3.2188v-20.328h4.1797v20.328c0 1.7812 1.4297 3.2188 3.2188 3.2188s3.2188-1.4297 3.2188-3.2188v-20.328h4.9297c3.7305 0 5.2891-2.6406 3.4805-5.9102-3.1992-5.7812-7.9883-14.469-10.891-19.852-0.17969-0.33984-0.058594-0.76172 0.28125-0.94141 0.078125-0.050781 0.17188-0.070312 0.26172-0.078124 0.26172-0.019532 0.51953 0.10156 0.66016 0.33984l9.3789 17.43c0.82812 1.5391 2.7383 2.1211 4.2812 1.2891 1.5391-0.82812 2.1211-2.7383 1.2891-4.2812l-12.59-23.41c-0.12109-0.21875-0.26953-0.41016-0.42969-0.60156-0.46875-0.64062-1.2188-1.0586-2.0781-1.0586h-13.691c-0.078126 0-0.23047 0.070312-0.23047-0.011719 0-0.019531 0-0.019531-0.019531-0.019531z" />
    </svg>
  )
}

// ─── Redesigned Gender Distribution ─────────────────────────────────────────
function GenderDistribution({ totals, loading }) {
  const [chartView, setChartView] = useState('bar') // 'bar' | 'pie'

  const maleCount   = totals.maleIn
  const femaleCount = totals.femaleIn
  const total       = maleCount + femaleCount
  const hasData     = total > 0

  const malePercent   = hasData ? (maleCount   / total) * 100 : 0
  const femalePercent = hasData ? (femaleCount  / total) * 100 : 0

  const barData = [
    { label: 'Male',   value: maleCount,   color: MALE_COLOR },
    { label: 'Female', value: femaleCount,  color: FEMALE_COLOR },
  ]

  const pieData = [
    { name: 'Male',   value: maleCount },
    { name: 'Female', value: femaleCount },
  ]

  return (
    <section className="rounded-2xl border border-[#ebebeb] bg-white p-5 shadow-[0px_1px_1px_rgba(0,0,0,0.04)] sm:p-6">
      <SectionHeading
        title="Gender Distribution"
        description="Male vs Female visitors — visitor count and percentage of total entries."
      />

      <div className="grid gap-4 lg:grid-cols-3">

        {/* ── Male tile ── */}
        <div className="flex flex-col items-center gap-3 rounded-xl border border-[#e8f0ff] bg-[#f5f9ff] p-5">
          <div className="flex w-full items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#dbeafe]">
              <Mars size={14} color={MALE_COLOR} />
            </div>
            <span className="text-sm font-semibold text-[#0070f3]">Male</span>
          </div>
          <div className="flex h-24 w-12 items-center justify-center">
            <MaleSilhouette />
          </div>
          <div className="text-center">
            <p className="text-3xl font-semibold tabular-nums tracking-tight text-[#171717]">
              {loading ? '—' : maleCount.toLocaleString()}
            </p>
            <p className="mt-0.5 text-lg font-medium tabular-nums text-[#0070f3]">
              {loading ? '—' : `${malePercent.toFixed(1)}%`}
            </p>
          </div>
          <div className="w-full">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#dbeafe]">
              <div
                className="h-full rounded-full bg-[#0070f3] transition-all duration-500"
                style={{ width: `${Math.min(100, malePercent)}%` }}
              />
            </div>
          </div>
        </div>

        {/* ── Female tile ── */}
        <div className="flex flex-col items-center gap-3 rounded-xl border border-[#ffe4f0] bg-[#fff5f9] p-5">
          <div className="flex w-full items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#fce7f3]">
              <Venus size={14} color={FEMALE_COLOR} />
            </div>
            <span className="text-sm font-semibold text-[#eb367f]">Female</span>
          </div>
          <div className="flex h-24 w-12 items-center justify-center">
            <FemaleSilhouette />
          </div>
          <div className="text-center">
            <p className="text-3xl font-semibold tabular-nums tracking-tight text-[#171717]">
              {loading ? '—' : femaleCount.toLocaleString()}
            </p>
            <p className="mt-0.5 text-lg font-medium tabular-nums text-[#eb367f]">
              {loading ? '—' : `${femalePercent.toFixed(1)}%`}
            </p>
          </div>
          <div className="w-full">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#fce7f3]">
              <div
                className="h-full rounded-full bg-[#eb367f] transition-all duration-500"
                style={{ width: `${Math.min(100, femalePercent)}%` }}
              />
            </div>
          </div>
        </div>

        {/* ── Gender Analytics tile ── */}
        <div className="rounded-xl border border-[#ebebeb] bg-white p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[#171717]">Gender Analytics</p>
            {/* Graph / Pie toggle */}
            <div className="flex gap-0.5 rounded-lg border border-[#ebebeb] bg-[#fafafa] p-0.5">
              <button
                type="button"
                onClick={() => setChartView('bar')}
                aria-pressed={chartView === 'bar'}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  chartView === 'bar'
                    ? 'bg-white text-[#171717] shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                    : 'text-[#8f8f8f] hover:text-[#4d4d4d]'
                }`}
              >
                <BarChart2 size={11} />
                Graph
              </button>
              <button
                type="button"
                onClick={() => setChartView('pie')}
                aria-pressed={chartView === 'pie'}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  chartView === 'pie'
                    ? 'bg-white text-[#171717] shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                    : 'text-[#8f8f8f] hover:text-[#4d4d4d]'
                }`}
              >
                <PieChartIcon size={11} />
                Pie Chart
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex h-[180px] items-center justify-center text-sm text-[#8f8f8f]">
              Loading…
            </div>
          ) : chartView === 'bar' ? (
            <div className="h-[180px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 8, right: 8, left: 16, bottom: 24 }}>
                  <CartesianGrid stroke="#f2f2f2" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#8f8f8f', fontSize: 11 }}
                    label={{ value: 'Gender', position: 'insideBottom', offset: -12, fill: '#4d4d4d', fontSize: 12, fontWeight: 500 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#8f8f8f', fontSize: 10 }}
                    tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}
                    allowDecimals={false}
                    domain={hasData ? [0, 'auto'] : [0, 10]}
                    label={{ value: 'Visitor Count', angle: -90, position: 'insideLeft', offset: 10, fill: '#4d4d4d', fontSize: 12, fontWeight: 500 }}
                  />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => [Number(v).toLocaleString()]} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={52}>
                    {barData.map((entry, i) => (
                      <Cell key={i} fill={hasData ? entry.color : '#e5e7eb'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : hasData ? (
            <div className="h-[180px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={42}
                    outerRadius={66}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={GENDER_PIE_COLORS[i % GENDER_PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v, name) => [Number(v).toLocaleString(), name]}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 11, color: '#8f8f8f' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            /* Placeholder donut when no data */
            <div className="flex h-[180px] items-center justify-center">
              <div className="relative flex items-center justify-center">
                <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden="true">
                  <circle cx="60" cy="60" r="46" fill="none" stroke="#e5e7eb" strokeWidth="16" />
                </svg>
                <p className="absolute text-[11px] text-[#a1a1a1]">No data</p>
              </div>
            </div>
          )}

          {!loading && (
            <p className="mt-2 text-[11px] text-[#a1a1a1]">
              {hasData
                ? `Based on ${total.toLocaleString()} total entries`
                : 'No entries available for this date range'}
            </p>
          )}
        </div>
      </div>

      <p className="mt-4 text-xs text-[#8f8f8f]">
        Percentages use corrected aggregated gender counts divided by total entries.
      </p>
    </section>
  )
}

function ChildrenAnalytics({ loading, totals }) {
  const hasData = (totals?.childrenIn ?? 0) > 0 || (totals?.childrenOut ?? 0) > 0

  return (
    <section className="rounded-2xl border border-[#ebebeb] bg-white p-5 shadow-[0px_1px_1px_rgba(0,0,0,0.04)] sm:p-6">
      <SectionHeading
        title="Children Analytics"
        description="Children are kept separate from male and female visitor counts."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          { label: 'Children Entries', icon: ArrowDownRight, value: totals?.childrenIn  ?? 0 },
          { label: 'Children Exits',   icon: ArrowUpRight,   value: totals?.childrenOut ?? 0 },
        ].map(({ label, icon: Icon, value }) => (
          <div key={label} className="rounded-xl border border-[#f2f2f2] bg-[#fafafa] p-4">
            <div className="flex items-center gap-2">
              <Baby size={19} color={CHILD_COLOR} aria-hidden="true" />
              <h3 className="text-sm font-medium text-[#4d4d4d]">{label}</h3>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="text-2xl font-semibold text-[#171717] tabular-nums">
                {loading ? '—' : Number(value).toLocaleString()}
              </span>
              <Icon size={18} color={CHILD_COLOR} aria-hidden="true" />
            </div>
          </div>
        ))}
      </div>
      {!loading && !hasData && (
        <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-800">
          No children detected in the selected date range.
        </p>
      )}
    </section>
  )
}

function formatUpdatedAt(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString()
}

// ─── Redesigned compact Occupancy card ───────────────────────────────────────
function Occupancy({ loading, error, occupancy, updatedAt }) {
  const displayValue = loading
    ? '—'
    : error
    ? 'Error'
    : occupancy.total === null
    ? 'N/A'
    : occupancy.total.toLocaleString()

  return (
    <section className="rounded-2xl border border-[#d3e5ff] bg-white p-5 shadow-[0px_1px_1px_rgba(0,0,0,0.04)] sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e8f0ff]">
            <Users size={18} color={ENTRY_COLOR} aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#171717]">Current Store Occupancy</p>
            <p className="text-xs text-[#8f8f8f]">Latest VS125 cumulative line snapshots</p>
          </div>
        </div>
        {updatedAt && (
          <span className="shrink-0 rounded-full border border-[#ebebeb] bg-[#fafafa] px-2.5 py-1 text-[11px] text-[#8f8f8f]">
            Snapshot · {formatUpdatedAt(updatedAt)}
          </span>
        )}
      </div>

      {error && (
        <div role="alert" className="mt-3 flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          <AlertCircle size={13} /> {error}
        </div>
      )}

      <div className="mt-4 flex items-end gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#8f8f8f]">Current people inside</p>
          <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight text-[#171717]">
            {displayValue}
          </p>
          <p className="mt-1 text-xs text-[#a1a1a1]">Sensor-reported occupancy</p>
        </div>
        <div className="mb-1 ml-auto flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#f5f9ff]">
          <Users size={22} color={ENTRY_COLOR} aria-hidden="true" />
        </div>
      </div>
    </section>
  )
}

function ChartToggle({ value, onChange }) {
  return (
    <div className="flex gap-0.5 rounded-lg border border-[#ebebeb] bg-[#fafafa] p-0.5">
      {[
        { key: 'bar',  icon: <BarChart2 size={14} />,    label: 'Bar' },
        { key: 'line', icon: <ArrowUpRight size={14} />, label: 'Line' },
      ].map(({ key, icon, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={value === key}
          className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
            value === key
              ? 'border-[#ebebeb] bg-white text-[#171717] shadow-[0px_1px_1px_rgba(0,0,0,0.04)]'
              : 'border-transparent text-[#8f8f8f]'
          }`}
        >
          {icon}{label}
        </button>
      ))}
    </div>
  )
}

function StoreComparisonChart({ data, loading }) {
  if (loading) {
    return (
      <section className="rounded-2xl border border-[#ebebeb] bg-white p-5 shadow-[0px_1px_1px_rgba(0,0,0,0.04)] sm:p-6">
        <SectionHeading title="Store Comparison" description="Total people who entered by store in the selected date range." />
        <div className="flex h-[300px] items-center justify-center rounded-xl border border-dashed border-[#ebebeb] text-sm text-[#8f8f8f]">
          Loading store comparison…
        </div>
      </section>
    )
  }
  if (!data.length) {
    return (
      <section className="rounded-2xl border border-[#ebebeb] bg-white p-5 shadow-[0px_1px_1px_rgba(0,0,0,0.04)] sm:p-6">
        <SectionHeading title="Store Comparison" description="Total people who entered by store in the selected date range." />
        <div className="flex h-[300px] items-center justify-center rounded-xl border border-dashed border-[#ebebeb] text-sm text-[#8f8f8f]">
          No store traffic is available for this range.
        </div>
      </section>
    )
  }
  return (
    <section className="rounded-2xl border border-[#ebebeb] bg-white p-5 shadow-[0px_1px_1px_rgba(0,0,0,0.04)] sm:p-6">
      <SectionHeading title="Store Comparison" description="Total people who entered by store in the selected date range." />
      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 16, right: 12, left: 20, bottom: 40 }}>
            <CartesianGrid stroke="#f2f2f2" vertical={false} />
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#8f8f8f', fontSize: 11 }}
              angle={-18}
              textAnchor="end"
              height={56}
              label={{ value: 'Store', position: 'insideBottom', offset: -4, fill: '#4d4d4d', fontSize: 12, fontWeight: 500 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#8f8f8f', fontSize: 11 }}
              tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}
              width={52}
              allowDecimals={false}
              label={{ value: 'Visitors Entered', angle: -90, position: 'insideLeft', offset: 10, fill: '#4d4d4d', fontSize: 12, fontWeight: 500 }}
            />
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#4d4d4d', fontWeight: 600 }} formatter={(v) => [Number(v).toLocaleString(), 'Total people entered']} />
            <Bar dataKey="total" radius={[8, 8, 0, 0]} fill="#0070f3" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

function DailyTrafficChart({ data, loading, startDate, endDate }) {
  const [chartType, setChartType] = useState('bar')
  const tickFormatter = (value) => value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value

  return (
    <section className="rounded-2xl border border-[#ebebeb] bg-white p-5 shadow-[0px_1px_1px_rgba(0,0,0,0.04)] sm:p-6">
      <SectionHeading
        title="Daily Traffic"
        description={`Entries and exits by day · ${dateLabel(startDate)} – ${dateLabel(endDate)}`}
        action={<ChartToggle value={chartType} onChange={setChartType} />}
      />
      {!loading && data.length > 0 ? (
        <div className="h-[360px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'bar' ? (
              <BarChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 20 }} barGap={3}>
                <CartesianGrid stroke="#ebebeb" strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#8f8f8f', fontSize: 11 }} interval="preserveStartEnd" label={{ value: 'Days', position: 'insideBottom', offset: -12, fill: '#4d4d4d', fontSize: 12, fontWeight: 500 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: '#8f8f8f', fontSize: 11 }} tickFormatter={tickFormatter} width={48} allowDecimals={false} label={{ value: 'Visitor Count', angle: -90, position: 'insideLeft', fill: '#4d4d4d', fontSize: 12, fontWeight: 500 }} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#4d4d4d', fontWeight: 600, marginBottom: 4 }} formatter={(value, name) => [Number(value).toLocaleString(), name === 'entries' ? 'Entries' : 'Exits']} />
                <Legend iconType="circle" iconSize={8} formatter={(name) => name === 'entries' ? 'Entries' : 'Exits'} wrapperStyle={{ fontSize: 12, color: '#8f8f8f', paddingTop: 12 }} />
                <Bar dataKey="entries" name="entries" fill={ENTRY_COLOR} radius={[4, 4, 0, 0]} maxBarSize={24} />
                <Bar dataKey="exits"   name="exits"   fill={EXIT_COLOR}  radius={[4, 4, 0, 0]} maxBarSize={24} />
              </BarChart>
            ) : (
              <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 20 }}>
                <CartesianGrid stroke="#ebebeb" strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#8f8f8f', fontSize: 11 }} interval="preserveStartEnd" label={{ value: 'Days', position: 'insideBottom', offset: -12, fill: '#4d4d4d', fontSize: 12, fontWeight: 500 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: '#8f8f8f', fontSize: 11 }} tickFormatter={tickFormatter} width={48} allowDecimals={false} label={{ value: 'Visitor Count', angle: -90, position: 'insideLeft', fill: '#4d4d4d', fontSize: 12, fontWeight: 500 }} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#4d4d4d', fontWeight: 600, marginBottom: 4 }} formatter={(value, name) => [Number(value).toLocaleString(), name === 'entries' ? 'Entries' : 'Exits']} />
                <Legend iconType="circle" iconSize={8} formatter={(name) => name === 'entries' ? 'Entries' : 'Exits'} wrapperStyle={{ fontSize: 12, color: '#8f8f8f', paddingTop: 12 }} />
                <Line type="monotone" dataKey="entries" name="entries" stroke={ENTRY_COLOR} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="exits"   name="exits"   stroke={EXIT_COLOR}  strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-[360px] items-center justify-center rounded-xl border border-dashed border-[#ebebeb] text-sm text-[#8f8f8f]">
          {loading ? 'Loading sensor readings…' : 'No dates are available to display.'}
        </div>
      )}
    </section>
  )
}

function FilterSelect({ label, value, onChange, children, disabled = false }) {
  return (
    <label className="grid min-w-0 gap-1.5 text-xs font-medium text-[#8f8f8f]">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="h-10 min-w-0 rounded-md border border-[#ebebeb] bg-white px-3 text-sm font-normal text-[#171717] outline-none focus:border-[#171717] disabled:cursor-not-allowed disabled:bg-[#fafafa] disabled:text-[#a1a1a1]"
      >
        {children}
      </select>
    </label>
  )
}

export default function Analytics({ token }) {
  const [draftRange, setDraftRange] = useState(defaultRange)
  const [dateRange, setDateRange] = useState(defaultRange)
  const [rangeError, setRangeError] = useState('')
  const [activePreset, setActivePreset] = useState(null)
  const [showCustom, setShowCustom] = useState(false)
  const [readings, setReadings] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const [storeId, setStoreId] = useState('all')
  const [sensorId, setSensorId] = useState('all')
  const [selectedLine, setSelectedLine] = useState('all')
  const { stores, loading: storesLoading, error: storesError } = useStores(token)
  const { sensors, loading: sensorsLoading, error: sensorsError } = useSensors(token)
  const previousRange = useMemo(() => getPreviousRange(dateRange), [dateRange])

  useEffect(() => {
    const controller = new AbortController()

    async function loadReadings() {
      setLoading(true)
      setLoadError('')
      try {
        const allRows = []
        let offset = 0
        let hasMore = true
        while (hasMore) {
          const params = new URLSearchParams({
            start_date: previousRange.startDate,
            end_date: dateRange.endDate,
            limit: '1000',
            offset: String(offset),
          })
          const data = await apiFetch(
            `/sensors/vs125/readings?${params}`,
            token,
            { signal: controller.signal },
          )
          if (Array.isArray(data)) {
            allRows.push(...data)
            hasMore = false
          } else if (data && Array.isArray(data.readings) && typeof data.has_more === 'boolean') {
            allRows.push(...data.readings)
            hasMore = data.has_more === true
            if (hasMore && data.readings.length === 0) {
              throw new Error('The server indicated more readings but returned an empty page.')
            }
            offset += data.readings.length
          } else {
            throw new Error('The server returned an unexpected readings response.')
          }
        }
        if (!controller.signal.aborted) setReadings(allRows)
      } catch (error) {
        if (error.name !== 'AbortError' && !controller.signal.aborted) {
          setLoadError(error.message || 'Could not load sensor readings.')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    loadReadings()
    return () => controller.abort()
  }, [token, dateRange, previousRange, refreshKey])



  useEffect(() => {
    const intervalId = setInterval(() => setRefreshKey((key) => key + 1), 5 * 60 * 1000)
    return () => clearInterval(intervalId)
  }, [])

  const availableSensors = useMemo(
    () => storeId === 'all'
      ? sensors
      : sensors.filter((sensor) => String(sensor.store_id) === storeId),
    [sensors, storeId],
  )

  const lineOptions = useMemo(() => {
    const scoped = readings.filter((row) =>
      (storeId === 'all' || String(row.store_id) === storeId) &&
      (sensorId === 'all' || String(row.sensor_id) === sensorId),
    )
    const lines = new Map()
    for (const row of scoped) {
      const key = lineKey(row)
      if (!lines.has(key)) {
        lines.set(key, {
          key,
          name: row.line_name || `Line ${row.line_id}`,
          sensor: sensors.find((item) => String(item.id) === String(row.sensor_id))?.name || `Sensor ${row.sensor_id}`,
        })
      }
    }
    return [...lines.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [readings, sensors, storeId, sensorId])

  const filteredReadings = useMemo(
    () => readings.filter((row) =>
      (storeId === 'all' || String(row.store_id) === storeId) &&
      (sensorId === 'all' || String(row.sensor_id) === sensorId) &&
      (selectedLine === 'all' || lineKey(row) === selectedLine),
    ),
    [readings, storeId, sensorId, selectedLine],
  )

  const selectedReadings = useMemo(
    () => filteredReadings.filter((row) => {
      const date = dateKeyOf(row)
      return date && date >= dateRange.startDate && date <= dateRange.endDate
    }),
    [filteredReadings, dateRange],
  )

  const previousReadings = useMemo(
    () => filteredReadings.filter((row) => {
      const date = dateKeyOf(row)
      return date && date >= previousRange.startDate && date <= previousRange.endDate
    }),
    [filteredReadings, previousRange],
  )

  const totals = useMemo(() => {
    let individualIn = 0
    let maleIn = 0
    let femaleIn = 0
    let individualOut = 0
    let maleOut = 0
    let femaleOut = 0
    let groupIn = 0
    let groupOut = 0
    let childrenIn = 0
    let childrenOut = 0

    for (const row of selectedReadings) {
      individualIn  += Number(row.individuals_in  ?? 0)
      maleIn        += Number(row.male_in          ?? 0)
      femaleIn      += Number(row.female_in        ?? 0)
      individualOut += Number(row.individuals_out  ?? 0)
      maleOut       += Number(row.male_out         ?? 0)
      femaleOut     += Number(row.female_out       ?? 0)
      groupIn       += Number(row.group_in         ?? 0)
      groupOut      += Number(row.group_out        ?? 0)
      childrenIn    += Number(row.children_in      ?? 0)
      childrenOut   += Number(row.children_out     ?? 0)
    }

    return {
      totalIn: individualIn,
      maleIn,
      // Preserve existing correction: remaining count assigned to female
      femaleIn: femaleIn + Math.max(0, individualIn - maleIn - femaleIn),
      totalOut: individualOut,
      maleOut,
      femaleOut: femaleOut + Math.max(0, individualOut - maleOut - femaleOut),
      groupIn,
      groupOut,
      childrenIn,
      childrenOut,
    }
  }, [selectedReadings])

  const previousTotals = useMemo(() => {
    return previousReadings.reduce((result, row) => ({
      totalIn:  result.totalIn  + Number(row.individuals_in  ?? 0),
      totalOut: result.totalOut + Number(row.individuals_out ?? 0),
    }), { totalIn: 0, totalOut: 0 })
  }, [previousReadings])

  const dailyData = useMemo(() => {
    const byDate = new Map()
    for (const row of selectedReadings) {
      const date = dateKeyOf(row)
      if (!date) continue
      const current = byDate.get(date) ?? { entries: 0, exits: 0 }
      current.entries += Number(row.individuals_in  ?? 0)
      current.exits   += Number(row.individuals_out ?? 0)
      byDate.set(date, current)
    }

    const result = []
    const day  = new Date(`${dateRange.startDate}T00:00:00`)
    const last = new Date(`${dateRange.endDate}T00:00:00`)
    while (day <= last) {
      const date = inputDate(day)
      result.push({ date, label: dateLabel(date), ...(byDate.get(date) ?? { entries: 0, exits: 0 }) })
      day.setDate(day.getDate() + 1)
    }
    return result
  }, [selectedReadings, dateRange])

  const storeComparisonData = useMemo(() => {
    const byStore = new Map()
    for (const store of stores) {
      byStore.set(String(store.id), { name: store.name || `Store ${store.id}`, total: 0 })
    }
    for (const row of selectedReadings) {
      const storeIdValue = String(row.store_id ?? '')
      if (!storeIdValue) continue
      const current = byStore.get(storeIdValue) ?? { name: `Store ${storeIdValue}`, total: 0 }
      current.total += Number(row.individuals_in ?? 0)
      byStore.set(storeIdValue, current)
    }
    return [...byStore.values()].sort((a, b) => b.total - a.total)
  }, [selectedReadings, stores])




  const occupancy = useMemo(() => {
    // Calculate occupancy by summing today's intervals across ALL lines.
    // individuals_in - individuals_out gives net people currently inside.
    const todayUTC = new Date().toISOString().slice(0, 10) // "YYYY-MM-DD"

    const todayReadings = selectedReadings.filter((row) => {
      const ts = row.recorded_at || row.received_at
      return ts && ts.slice(0, 10) === todayUTC
    })

    if (todayReadings.length === 0) return { total: null, updatedAt: null }

    const net = todayReadings.reduce((sum, row) => (
      sum + Number(row.individuals_in ?? 0) - Number(row.individuals_out ?? 0)
    ), 0)

    const updatedAt = todayReadings.reduce((latest, row) => {
      const ts = row.recorded_at || row.received_at
      return ts && (!latest || ts > latest) ? ts : latest
    }, null)

    return {
      total: Math.max(0, net), // can't have negative occupancy
      updatedAt,
    }
  }, [selectedReadings])

  const selectedSensors = availableSensors.filter(
    (sensor) => sensorId === 'all' || String(sensor.id) === sensorId,
  )
  const onlineCount = selectedSensors.filter(
    (sensor) => String(sensor.status || '').toLowerCase() === 'online',
  ).length
  const statusDescription = sensorsLoading
    ? 'Checking sensor status…'
    : selectedSensors.length === 0
      ? 'No sensors match the selected filters'
      : `${onlineCount} of ${selectedSensors.length} selected sensor${selectedSensors.length === 1 ? '' : 's'} online`

  function applyRange(event) {
    event.preventDefault()
    if (draftRange.endDate < draftRange.startDate) {
      setRangeError('The end date must be on or after the start date.')
      return
    }
    setRangeError('')
    setDateRange({ ...draftRange })
  }

  function applyPreset(preset) {
    if (preset.label === 'Custom') {
      setShowCustom(true)
      setActivePreset('Custom')
      return
    }
    const range = preset.range()
    setDraftRange(range)
    setDateRange(range)
    setRangeError('')
    setActivePreset(preset.label)
    setShowCustom(false)
  }

  return (
    <div className="space-y-6" style={{ fontFamily: 'Geist, Inter, Arial, sans-serif' }}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-1.28px] text-[#171717]">Analytics</h1>
          <p className="mt-1 text-sm text-[#8f8f8f]">Visitor activity and current occupancy from your VS125 sensor.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-[#ebebeb] bg-white px-3 py-2 text-sm text-[#4d4d4d]">
          <span className={`h-2 w-2 shrink-0 rounded-full ${onlineCount > 0 ? 'bg-emerald-500' : 'bg-[#a1a1a1]'}`} />
          {loading
            ? 'Loading…'
            : occupancy.updatedAt
              ? `Last updated · ${new Date(occupancy.updatedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
              : 'No data yet'}
        </div>
      </header>

      <section className="rounded-2xl border border-[#ebebeb] bg-white p-4 shadow-[0px_1px_1px_rgba(0,0,0,0.04)] sm:p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-[#171717]">
          <Store size={17} color="#8f8f8f" aria-hidden="true" />
          Filters
        </div>

        {/* Row 1 — Selection Filters */}
        <div className="grid gap-3 sm:grid-cols-3">
          <FilterSelect
            label="Store"
            value={storeId}
            onChange={(value) => { setStoreId(value); setSensorId('all'); setSelectedLine('all') }}
            disabled={storesLoading}
          >
            <option value="all">All stores</option>
            {stores.map((store) => <option key={store.id} value={String(store.id)}>{store.name}</option>)}
          </FilterSelect>
          <FilterSelect
            label="Sensor"
            value={sensorId}
            onChange={(value) => { setSensorId(value); setSelectedLine('all') }}
            disabled={sensorsLoading}
          >
            <option value="all">All sensors</option>
            {availableSensors.map((sensor) => (
              <option key={sensor.id} value={String(sensor.id)}>
                {sensor.name || `Sensor ${sensor.id}`}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            label="Counting line"
            value={selectedLine}
            onChange={setSelectedLine}
            disabled={loading || lineOptions.length === 0}
          >
            <option value="all">All counting lines</option>
            {lineOptions.map((line) => (
              <option key={line.key} value={line.key}>
                {sensorId === 'all' ? `${line.sensor} · ${line.name}` : line.name}
              </option>
            ))}
          </FilterSelect>
        </div>

        {/* Divider */}
        <div className="my-4 h-px bg-[#f2f2f2]" />

        {/* Row 2 — Date Filters + Refresh */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset)}
                className={`rounded-full border px-3 py-2 text-xs font-medium transition-colors ${
                  activePreset === preset.label
                    ? 'border-[#171717] bg-[#171717] text-white'
                    : 'border-[#ebebeb] bg-white text-[#4d4d4d] hover:bg-[#fafafa]'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setRefreshKey((key) => key + 1)}
            disabled={loading}
            aria-label="Refresh analytics"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-[#ebebeb] bg-white px-3 text-sm font-medium text-[#4d4d4d] shadow-[0px_1px_1px_rgba(0,0,0,0.04)] transition-colors hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Custom date pickers */}
        {showCustom && (
          <div className="mt-4 border-t border-[#f2f2f2] pt-4">
            <form onSubmit={applyRange} className="flex flex-wrap items-end gap-3">
              <label className="grid gap-1 text-xs font-medium text-[#8f8f8f]">
                From
                <input
                  type="date"
                  value={draftRange.startDate}
                  onChange={(event) => setDraftRange((range) => ({ ...range, startDate: event.target.value }))}
                  required
                  className="h-10 rounded-md border border-[#ebebeb] bg-white px-3 text-sm text-[#171717] outline-none focus:border-[#171717]"
                />
              </label>
              <label className="grid gap-1 text-xs font-medium text-[#8f8f8f]">
                To
                <input
                  type="date"
                  value={draftRange.endDate}
                  onChange={(event) => setDraftRange((range) => ({ ...range, endDate: event.target.value }))}
                  required
                  className="h-10 rounded-md border border-[#ebebeb] bg-white px-3 text-sm text-[#171717] outline-none focus:border-[#171717]"
                />
              </label>
              <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-md bg-[#171717] px-3 text-sm font-medium text-white transition-opacity hover:opacity-80">
                <CalendarDays size={15} />
                Apply dates
              </button>
              {rangeError && <p role="alert" className="basis-full text-xs text-[#ee0000]">{rangeError}</p>}
            </form>
          </div>
        )}
      </section>

      {(loadError || storesError || sensorsError) && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle size={17} className="mt-0.5 shrink-0" />
          <div className="space-y-1">
            {loadError   && <p>{loadError}</p>}
            {storesError  && <p>Store filters: {storesError}</p>}
            {sensorsError && <p>Sensor filters: {sensorsError}</p>}
          </div>
        </div>
      )}

      <TrafficCards
        loading={loading}
        totals={totals}
        previousTotals={previousTotals}
        occupancyLoading={loading}
        occupancyError={loadError}
        occupancy={occupancy}
        occupancyUpdatedAt={occupancy.updatedAt}
      />

      <GenderDistribution totals={totals} loading={loading} />

      <ChildrenAnalytics loading={loading} totals={totals} />

      <StoreComparisonChart data={storeComparisonData} loading={loading} />

      <DailyTrafficChart
        data={dailyData}
        loading={loading}
        startDate={dateRange.startDate}
        endDate={dateRange.endDate}
      />
    </div>
  )
}
