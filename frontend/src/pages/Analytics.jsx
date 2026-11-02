import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Baby,
  BarChart2,
  CalendarDays,
  Mars,
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
  { label: 'Today', range: () => {
    const today = inputDate(new Date())
    return { startDate: today, endDate: today }
  } },
  { label: 'Yesterday', range: () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const date = inputDate(yesterday)
    return { startDate: date, endDate: date }
  } },
  { label: 'Last 7 days', range: () => {
    const end = new Date()
    const start = new Date(end)
    start.setDate(start.getDate() - 6)
    return { startDate: inputDate(start), endDate: inputDate(end) }
  } },
  { label: 'Last 30 days', range: () => {
    const end = new Date()
    const start = new Date(end)
    start.setDate(start.getDate() - 29)
    return { startDate: inputDate(start), endDate: inputDate(end) }
  } },
  { label: 'This month', range: () => {
    const end = new Date()
    return {
      startDate: inputDate(new Date(end.getFullYear(), end.getMonth(), 1)),
      endDate: inputDate(end),
    }
  } },
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
    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium ${
      positive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
    }`}>
      {positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
      {Math.abs(value)}%
    </span>
  )
}

function Metric({ icon: Icon, label, value, color, loading, unavailable = false }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <Icon size={18} strokeWidth={1.8} style={{ color }} aria-hidden="true" />
        <p className="truncate text-sm font-medium text-[#4d4d4d]">{label}</p>
      </div>
      <p className={`mt-1.5 pl-[26px] font-semibold tabular-nums tracking-tight text-[#171717] ${
        unavailable ? 'text-sm' : 'text-xl'
      }`}>
        {loading ? '—' : unavailable ? 'Unavailable' : Number(value).toLocaleString()}
      </p>
    </div>
  )
}

function TrafficCards({ loading, totals, previousTotals }) {
  const growthIn = previousTotals.totalIn
    ? Math.round(((totals.totalIn - previousTotals.totalIn) / previousTotals.totalIn) * 100)
    : undefined
  const growthOut = previousTotals.totalOut
    ? Math.round(((totals.totalOut - previousTotals.totalOut) / previousTotals.totalOut) * 100)
    : undefined
  const shown = (value) => loading ? '—' : value.toLocaleString()

  const cardClass = 'relative flex h-full min-h-[300px] flex-col overflow-hidden rounded-2xl border border-[#ebebeb] bg-white p-5 shadow-[0px_1px_1px_rgba(0,0,0,0.04)] sm:p-6'

  return (
    <section aria-label="Visitor totals" className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
      <article className={cardClass}>
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#007cf0] to-[#00dfd8]" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-[#171717]">IN</h2>
            <p className="mt-1 text-sm text-[#8f8f8f]">Total Entries</p>
          </div>
          <TrendBadge value={growthIn} />
        </div>
        <p className="mt-4 text-5xl font-semibold leading-none tracking-[-1.8px] text-[#171717] tabular-nums">
          {shown(totals.totalIn)}
        </p>
        <div className="mt-auto grid grid-cols-3 gap-x-3 border-t border-[#ebebeb] pt-5">
          <Metric icon={Mars} label="Male" value={totals.maleIn} loading={loading} color={MALE_COLOR} />
          <Metric icon={Venus} label="Female" value={totals.femaleIn} loading={loading} color={FEMALE_COLOR} />
          <Metric icon={Baby} label="Children" loading={loading} unavailable color={CHILD_COLOR} />
        </div>
      </article>

      <article className={cardClass}>
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#7928ca] to-[#ff0080]" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-[#171717]">OUT</h2>
            <p className="mt-1 text-sm text-[#8f8f8f]">Total Exits</p>
          </div>
          <TrendBadge value={growthOut} />
        </div>
        <p className="mt-4 text-5xl font-semibold leading-none tracking-[-1.8px] text-[#171717] tabular-nums">
          {shown(totals.totalOut)}
        </p>
        <div className="mt-auto grid grid-cols-3 gap-x-3 border-t border-[#ebebeb] pt-5">
          <Metric icon={Mars} label="Male" value={totals.maleOut} loading={loading} color={MALE_COLOR} />
          <Metric icon={Venus} label="Female" value={totals.femaleOut} loading={loading} color={FEMALE_COLOR} />
          <Metric icon={Baby} label="Children" loading={loading} unavailable color={CHILD_COLOR} />
        </div>
      </article>

      <article className={`${cardClass} md:col-span-2 xl:col-span-1`}>
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#ff4d4d] to-[#f9cb28]" />
        <div className="flex items-center gap-2">
          <Users size={20} color="#f5a623" aria-hidden="true" />
          <h2 className="text-xl font-semibold tracking-tight text-[#171717]">GROUP</h2>
        </div>
        <p className="mt-1 text-sm text-[#8f8f8f]">Groups counted separately</p>
        <div className="mt-6 grid grid-cols-2 gap-4">
          <div>
            <p className="text-4xl font-semibold leading-none tracking-tight text-[#171717] tabular-nums">
              {shown(totals.groupIn)}
            </p>
            <p className="mt-2 text-sm text-[#8f8f8f]">Group IN</p>
          </div>
          <div>
            <p className="text-4xl font-semibold leading-none tracking-tight text-[#171717] tabular-nums">
              {shown(totals.groupOut)}
            </p>
            <p className="mt-2 text-sm text-[#8f8f8f]">Group OUT</p>
          </div>
        </div>
        <p className="mt-auto border-t border-[#ebebeb] pt-5 text-sm leading-relaxed text-[#8f8f8f]">
          Group counts are reported independently from individual visitors.
        </p>
      </article>
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

function GenderDistribution({ totals, loading }) {
  const malePercent = totals.totalIn
    ? (totals.maleIn / totals.totalIn) * 100
    : 0
  const femalePercent = totals.totalIn
    ? (totals.femaleIn / totals.totalIn) * 100
    : 0
  const genderData = [
    { name: 'Male', value: totals.maleIn, color: MALE_COLOR },
    { name: 'Female', value: totals.femaleIn, color: FEMALE_COLOR },
  ]

  return (
    <section className="rounded-2xl border border-[#ebebeb] bg-white p-5 shadow-[0px_1px_1px_rgba(0,0,0,0.04)] sm:p-6">
      <SectionHeading
        title="Gender Distribution"
        description="Male vs Female visitors — visitor count and percentage of total entries."
      />
      {totals.totalIn > 0 ? (
        <div className="grid items-center gap-4 sm:grid-cols-[minmax(200px,0.9fr)_1.1fr]">
          <div className="h-56 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={genderData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={62}
                  outerRadius={88}
                  paddingAngle={3}
                  stroke="white"
                  strokeWidth={3}
                >
                  {genderData.map((item) => <Cell key={item.name} fill={item.color} />)}
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value, name) => [Number(value).toLocaleString(), `${name} visitors`]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-4">
            {[
              { label: 'Male', value: totals.maleIn, percent: malePercent, icon: Mars, color: MALE_COLOR },
              { label: 'Female', value: totals.femaleIn, percent: femalePercent, icon: Venus, color: FEMALE_COLOR },
            ].map(({ label, value, percent, icon: Icon, color }) => (
              <div key={label} className="rounded-xl border border-[#f2f2f2] bg-[#fafafa] p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2 text-sm font-medium text-[#4d4d4d]">
                    <Icon size={18} color={color} aria-hidden="true" />
                    {label}
                  </span>
                  <span className="text-sm text-[#8f8f8f]">{percent.toFixed(1)}%</span>
                </div>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-[#171717]">
                  {value.toLocaleString()}
                  <span className="ml-2 text-sm font-normal text-[#8f8f8f]">visitors</span>
                </p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#ebebeb]">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.min(100, percent)}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            ))}
            <p className="text-xs text-[#8f8f8f]">
              Percentages use corrected aggregated gender counts divided by total entries.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-[#ebebeb] text-sm text-[#8f8f8f]">
          {loading ? 'Loading gender distribution…' : 'No entries are available for this date range.'}
        </div>
      )}
    </section>
  )
}

function ChildrenAnalytics({ loading }) {
  return (
    <section className="rounded-2xl border border-[#ebebeb] bg-white p-5 shadow-[0px_1px_1px_rgba(0,0,0,0.04)] sm:p-6">
      <SectionHeading
        title="Children Analytics"
        description="Children are kept separate from male and female visitor counts."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          { label: 'Children Entries', icon: ArrowDownRight },
          { label: 'Children Exits', icon: ArrowUpRight },
        ].map(({ label, icon: Icon }) => (
          <div key={label} className="rounded-xl border border-[#f2f2f2] bg-[#fafafa] p-4">
            <div className="flex items-center gap-2">
              <Baby size={19} color={CHILD_COLOR} aria-hidden="true" />
              <h3 className="text-sm font-medium text-[#4d4d4d]">{label}</h3>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="text-2xl font-semibold text-[#8f8f8f]">
                {loading ? '—' : 'Unavailable'}
              </span>
              <Icon size={18} color="#a1a1a1" aria-hidden="true" />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-800">
        The sensor stores children data as an untyped JSON object, but this integration does not define verified numeric entry and exit fields. Counts and trends are withheld to avoid reporting incorrect values.
      </p>
    </section>
  )
}

function formatUpdatedAt(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString()
}

function Occupancy({ loading, error, occupancy, updatedAt }) {
  return (
    <section className="rounded-2xl border border-[#d3e5ff] bg-white p-5 shadow-[0px_1px_1px_rgba(0,0,0,0.04)] sm:p-6">
      <SectionHeading
        title="Current Store Occupancy"
        description="Current count from the latest VS125 cumulative line snapshots."
        action={updatedAt && (
          <span className="text-xs text-[#8f8f8f]">Sensor snapshot · {formatUpdatedAt(updatedAt)}</span>
        )}
      />
      {error && (
        <div role="alert" className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <AlertCircle size={16} /> {error}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-xl bg-[#f5f9ff] p-4 sm:col-span-2 xl:col-span-1">
          <div className="flex items-center gap-2 text-sm font-medium text-[#4d4d4d]">
            <Users size={19} color={ENTRY_COLOR} aria-hidden="true" />
            Current people inside
          </div>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-[#171717] tabular-nums">
            {loading ? '—' : occupancy.total === null ? 'Unavailable' : occupancy.total.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-[#8f8f8f]">Sensor-reported occupancy</p>
        </div>
        {[
          { label: 'Male', icon: Mars, color: MALE_COLOR },
          { label: 'Female', icon: Venus, color: FEMALE_COLOR },
          { label: 'Children', icon: Baby, color: CHILD_COLOR },
          { label: 'Groups', icon: Users, color: '#f5a623' },
        ].map(({ label, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border border-[#f2f2f2] p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-[#4d4d4d]">
              <Icon size={18} color={color} aria-hidden="true" />
              {label}
            </div>
            <p className="mt-3 text-lg font-semibold text-[#8f8f8f]">
              {loading ? '—' : 'Unavailable'}
            </p>
            <p className="mt-1 text-xs text-[#8f8f8f]">Not reported as current occupancy</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs leading-relaxed text-[#8f8f8f]">
        Gender, children, and group occupancy are not inferred from historical entries and exits.
      </p>
    </section>
  )
}

function ChartToggle({ value, onChange }) {
  return (
    <div className="flex gap-0.5 rounded-lg border border-[#ebebeb] bg-[#fafafa] p-0.5">
      {[
        { key: 'bar', icon: <BarChart2 size={14} />, label: 'Bar' },
        { key: 'line', icon: <TrendingIcon />, label: 'Line' },
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

function TrendingIcon() {
  return <ArrowUpRight size={14} />
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
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#8f8f8f', fontSize: 11 }}
                  interval="preserveStartEnd"
                  label={{ value: 'Days', position: 'insideBottom', offset: -12, fill: '#8f8f8f', fontSize: 12 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#8f8f8f', fontSize: 11 }}
                  tickFormatter={tickFormatter}
                  width={48}
                  allowDecimals={false}
                  label={{ value: 'Visitor Count', angle: -90, position: 'insideLeft', fill: '#8f8f8f', fontSize: 12 }}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={{ color: '#4d4d4d', fontWeight: 600, marginBottom: 4 }}
                  formatter={(value, name) => [Number(value).toLocaleString(), name === 'entries' ? 'Entries' : 'Exits']}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(name) => name === 'entries' ? 'Entries' : 'Exits'}
                  wrapperStyle={{ fontSize: 12, color: '#8f8f8f', paddingTop: 12 }}
                />
                <Bar dataKey="entries" name="entries" fill={ENTRY_COLOR} radius={[4, 4, 0, 0]} maxBarSize={24} />
                <Bar dataKey="exits" name="exits" fill={EXIT_COLOR} radius={[4, 4, 0, 0]} maxBarSize={24} />
              </BarChart>
            ) : (
              <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 20 }}>
                <CartesianGrid stroke="#ebebeb" strokeDasharray="4 4" vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#8f8f8f', fontSize: 11 }}
                  interval="preserveStartEnd"
                  label={{ value: 'Days', position: 'insideBottom', offset: -12, fill: '#8f8f8f', fontSize: 12 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#8f8f8f', fontSize: 11 }}
                  tickFormatter={tickFormatter}
                  width={48}
                  allowDecimals={false}
                  label={{ value: 'Visitor Count', angle: -90, position: 'insideLeft', fill: '#8f8f8f', fontSize: 12 }}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={{ color: '#4d4d4d', fontWeight: 600, marginBottom: 4 }}
                  formatter={(value, name) => [Number(value).toLocaleString(), name === 'entries' ? 'Entries' : 'Exits']}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(name) => name === 'entries' ? 'Entries' : 'Exits'}
                  wrapperStyle={{ fontSize: 12, color: '#8f8f8f', paddingTop: 12 }}
                />
                <Line type="monotone" dataKey="entries" name="entries" stroke={ENTRY_COLOR} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="exits" name="exits" stroke={EXIT_COLOR} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
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
  const [readings, setReadings] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [totalsSnapshots, setTotalsSnapshots] = useState([])
  const [totalsLoading, setTotalsLoading] = useState(true)
  const [totalsError, setTotalsError] = useState('')
  const [snapshotsComplete, setSnapshotsComplete] = useState(true)
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
    const controller = new AbortController()

    async function loadTotals() {
      setTotalsLoading(true)
      setTotalsError('')
      try {
        const data = await apiFetch('/sensors/vs125/totals?limit=2000', token, {
          signal: controller.signal,
        })
        if (!data || !Array.isArray(data.snapshots) || !Number.isInteger(data.count)) {
          throw new Error('The server returned an unexpected sensor totals response.')
        }
        if (!controller.signal.aborted) {
          setTotalsSnapshots(data.snapshots)
          setSnapshotsComplete(data.count === data.snapshots.length)
          setTotalsError('')
        }
      } catch (error) {
        if (error.name !== 'AbortError' && !controller.signal.aborted) {
          setTotalsError(error.message || 'Could not load current sensor totals.')
          setTotalsSnapshots([])
          setSnapshotsComplete(false)
        }
      } finally {
        if (!controller.signal.aborted) setTotalsLoading(false)
      }
    }

    loadTotals()
    return () => controller.abort()
  }, [token, refreshKey])

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
    const scoped = [...readings, ...totalsSnapshots].filter((row) =>
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
  }, [readings, totalsSnapshots, sensors, storeId, sensorId])

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

    for (const row of selectedReadings) {
      individualIn += Number(row.individuals_in ?? 0)
      maleIn += Number(row.male_in ?? 0)
      femaleIn += Number(row.female_in ?? 0)
      individualOut += Number(row.individuals_out ?? 0)
      maleOut += Number(row.male_out ?? 0)
      femaleOut += Number(row.female_out ?? 0)
      groupIn += Number(row.group_in ?? 0)
      groupOut += Number(row.group_out ?? 0)
    }

    return {
      totalIn: individualIn,
      maleIn,
      femaleIn: femaleIn + Math.max(0, individualIn - maleIn - femaleIn),
      totalOut: individualOut,
      maleOut,
      femaleOut: femaleOut + Math.max(0, individualOut - maleOut - femaleOut),
      groupIn,
      groupOut,
    }
  }, [selectedReadings])

  const previousTotals = useMemo(() => {
    return previousReadings.reduce((result, row) => ({
      totalIn: result.totalIn + Number(row.individuals_in ?? 0),
      totalOut: result.totalOut + Number(row.individuals_out ?? 0),
    }), { totalIn: 0, totalOut: 0 })
  }, [previousReadings])

  const dailyData = useMemo(() => {
    const byDate = new Map()
    for (const row of selectedReadings) {
      const date = dateKeyOf(row)
      if (!date) continue
      const current = byDate.get(date) ?? { entries: 0, exits: 0 }
      current.entries += Number(row.individuals_in ?? 0)
      current.exits += Number(row.individuals_out ?? 0)
      byDate.set(date, current)
    }

    const result = []
    const day = new Date(`${dateRange.startDate}T00:00:00`)
    const last = new Date(`${dateRange.endDate}T00:00:00`)
    while (day <= last) {
      const date = inputDate(day)
      result.push({
        date,
        label: dateLabel(date),
        ...(byDate.get(date) ?? { entries: 0, exits: 0 }),
      })
      day.setDate(day.getDate() + 1)
    }
    return result
  }, [selectedReadings, dateRange])

  const filteredSnapshots = useMemo(
    () => totalsSnapshots.filter((snapshot) =>
      (storeId === 'all' || String(snapshot.store_id) === storeId) &&
      (sensorId === 'all' || String(snapshot.sensor_id) === sensorId) &&
      (selectedLine === 'all' || lineKey(snapshot) === selectedLine),
    ),
    [totalsSnapshots, storeId, sensorId, selectedLine],
  )

  const occupancy = useMemo(() => {
    if (!snapshotsComplete || filteredSnapshots.length === 0) return { total: null, updatedAt: null }
    const validSnapshots = filteredSnapshots.filter((snapshot) =>
      Number.isInteger(snapshot.capacity_counted) && snapshot.capacity_counted >= 0,
    )
    if (validSnapshots.length !== filteredSnapshots.length) return { total: null, updatedAt: null }
    return {
      total: validSnapshots.reduce((sum, snapshot) => sum + snapshot.capacity_counted, 0),
      updatedAt: filteredSnapshots.reduce((latest, snapshot) => {
        const timestamp = snapshot.recorded_at || snapshot.received_at
        return timestamp && (!latest || timestamp > latest) ? timestamp : latest
      }, null),
    }
  }, [filteredSnapshots, snapshotsComplete])

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
    const range = preset.range()
    setDraftRange(range)
    setDateRange(range)
    setRangeError('')
  }

  return (
    <div className="space-y-6" style={{ fontFamily: 'Geist, Inter, Arial, sans-serif' }}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-1.28px] text-[#171717]">Analytics</h1>
          <p className="mt-1 text-sm text-[#8f8f8f]">Visitor activity and current occupancy from your VS125 sensor.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-[#ebebeb] bg-white px-3 py-2 text-sm text-[#4d4d4d]">
          <span className={`h-2 w-2 rounded-full ${onlineCount > 0 ? 'bg-emerald-500' : 'bg-[#a1a1a1]'}`} />
          {statusDescription}
        </div>
      </header>

      <section className="rounded-2xl border border-[#ebebeb] bg-white p-4 shadow-[0px_1px_1px_rgba(0,0,0,0.04)] sm:p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-[#171717]">
          <Store size={17} color="#8f8f8f" aria-hidden="true" />
          Filters
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <FilterSelect
            label="Store"
            value={storeId}
            onChange={(value) => {
              setStoreId(value)
              setSensorId('all')
              setSelectedLine('all')
            }}
            disabled={storesLoading}
          >
            <option value="all">All stores</option>
            {stores.map((store) => <option key={store.id} value={String(store.id)}>{store.name}</option>)}
          </FilterSelect>
          <FilterSelect
            label="Sensor"
            value={sensorId}
            onChange={(value) => {
              setSensorId(value)
              setSelectedLine('all')
            }}
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
          <div className="flex min-w-0 flex-wrap items-end gap-1.5 sm:col-span-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset)}
                className="rounded-full border border-[#ebebeb] bg-white px-3 py-2 text-xs font-medium text-[#4d4d4d] transition-colors hover:bg-[#fafafa]"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-[#f2f2f2] pt-4">
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
          <button
            type="button"
            onClick={() => setRefreshKey((key) => key + 1)}
            disabled={loading || totalsLoading}
            aria-label="Refresh analytics"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-[#ebebeb] bg-white px-3 text-sm font-medium text-[#4d4d4d] shadow-[0px_1px_1px_rgba(0,0,0,0.04)] transition-colors hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading || totalsLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </section>

      {(loadError || storesError || sensorsError) && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle size={17} className="mt-0.5 shrink-0" />
          <div className="space-y-1">
            {loadError && <p>{loadError}</p>}
            {storesError && <p>Store filters: {storesError}</p>}
            {sensorsError && <p>Sensor filters: {sensorsError}</p>}
          </div>
        </div>
      )}

      <Occupancy
        loading={totalsLoading}
        error={totalsError}
        occupancy={occupancy}
        updatedAt={occupancy.updatedAt}
      />

      <TrafficCards loading={loading} totals={totals} previousTotals={previousTotals} />

      <GenderDistribution totals={totals} loading={loading} />

      <ChildrenAnalytics loading={loading} />

      <DailyTrafficChart
        data={dailyData}
        loading={loading}
        startDate={dateRange.startDate}
        endDate={dateRange.endDate}
      />
    </div>
  )
}
