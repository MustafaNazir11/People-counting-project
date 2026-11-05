import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowDownToLine,
  BarChart2,
  CalendarRange,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Mail,
  Sparkles,
  TableProperties,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { apiFetch } from '../api'
import useStores from '../hooks/useStores'
import useSensors from '../hooks/useSensors'

// ─── Festival / event configuration ────────────────────────────────────────
// Edit dates here each year. startDate / endDate are ISO YYYY-MM-DD strings.
export const FESTIVAL_EVENTS = [
  { id: 'eid_fitr',       name: 'Eid al-Fitr',     startDate: '2026-03-20', endDate: '2026-03-22' },
  { id: 'eid_adha',       name: 'Eid al-Adha',     startDate: '2026-05-27', endDate: '2026-05-29' },
  { id: 'diwali',         name: 'Diwali',           startDate: '2026-11-08', endDate: '2026-11-12' },
  { id: 'holi',           name: 'Holi',             startDate: '2026-03-03', endDate: '2026-03-03' },
  { id: 'christmas',      name: 'Christmas',        startDate: '2026-12-24', endDate: '2026-12-26' },
  { id: 'independence',   name: 'Independence Day', startDate: '2026-08-15', endDate: '2026-08-15' },
  { id: 'republic',       name: 'Republic Day',     startDate: '2026-01-26', endDate: '2026-01-26' },
  { id: 'custom',         name: 'Custom Event',     startDate: '',           endDate: '' },
]

// ─── Metric definitions ─────────────────────────────────────────────────────
export const METRIC_GROUPS = [
  {
    group: 'People Count',
    metrics: [
      { id: 'total_in',       label: 'Total People In',          field: 'individuals_in' },
      { id: 'total_out',      label: 'Total People Out',         field: 'individuals_out' },
      { id: 'total_footfall', label: 'Total Footfall (In + Out)', field: null },
    ],
  },
  {
    group: 'Demographics',
    metrics: [
      { id: 'male',       label: 'Male Count',       field: 'male_in' },
      { id: 'female',     label: 'Female Count',     field: 'female_in' },
      { id: 'group',      label: 'Group Count',      field: 'group_in' },
      { id: 'individual', label: 'Individual Count', field: null },
    ],
  },
  {
    group: 'Performance',
    metrics: [
      { id: 'peak_hour',   label: 'Peak Hour',               field: null },
      { id: 'avg_hourly',  label: 'Avg Hourly Footfall',     field: null },
    ],
  },
  {
    group: 'Comparison',
    metrics: [
      { id: 'in_vs_out',         label: 'In vs Out',              field: null },
      { id: 'male_vs_female',    label: 'Male vs Female',         field: null },
      { id: 'individual_vs_group', label: 'Individual vs Group',  field: null },
    ],
  },
]

const ALL_METRICS = METRIC_GROUPS.flatMap((g) => g.metrics)
const COMPARISON_IDS = new Set(['in_vs_out', 'male_vs_female', 'individual_vs_group'])

// ─── Export options (unchanged) ────────────────────────────────────────────
const exportOptions = [
  { value: 'pdf',  label: 'PDF',  description: 'Executive summary',  icon: FileText },
  { value: 'xlsx', label: 'XLSX', description: 'Spreadsheet format', icon: FileSpreadsheet },
  { value: 'csv',  label: 'CSV',  description: 'Raw data export',    icon: TableProperties },
]

// ─── Static fallback rows (kept intact) ────────────────────────────────────
const STATIC_ROWS = [
  { timestamp: '2026-11-03T08:45:00Z', store: 'City Center', sensor: 'North Entry', entries: 188, exits: 104, male: 102, female: 86,  status: 'Healthy' },
  { timestamp: '2026-11-03T08:30:00Z', store: 'City Center', sensor: 'North Entry', entries: 176, exits: 109, male: 99,  female: 77,  status: 'Peak' },
  { timestamp: '2026-11-03T08:15:00Z', store: 'City Center', sensor: 'South Exit',  entries: 131, exits: 158, male: 76,  female: 55,  status: 'Stable' },
  { timestamp: '2026-11-03T08:00:00Z', store: 'City Center', sensor: 'North Entry', entries: 162, exits: 122, male: 88,  female: 74,  status: 'Healthy' },
  { timestamp: '2026-11-02T18:45:00Z', store: 'City Center', sensor: 'West Gate',   entries: 94,  exits: 87,  male: 52,  female: 42,  status: 'Low traffic' },
]

// ─── Helpers ────────────────────────────────────────────────────────────────
function today() {
  return new Date().toISOString().slice(0, 10)
}

function isoWeekBounds(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`)
  const day = d.getDay() // 0=Sun
  const mon = new Date(d)
  mon.setDate(d.getDate() - ((day + 6) % 7))
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  return [mon.toISOString().slice(0, 10), sun.toISOString().slice(0, 10)]
}

function monthBounds(year, month) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const last = new Date(year, month, 0).getDate()
  const end = `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`
  return [start, end]
}

function yearBounds(year) {
  return [`${year}-01-01`, `${year}-12-31`]
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value))
}

function formatDateShort(isoStr) {
  if (!isoStr) return ''
  const [y, m, d] = isoStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

function getStatusTone(status) {
  const l = status.toLowerCase()
  if (l.includes('peak'))   return 'bg-[#fff3d6] text-[#ab570a] border-[#f8ddb0]'
  if (l.includes('low'))    return 'bg-[#f3f4f6] text-[#4d4d4d] border-[#e5e7eb]'
  if (l.includes('stable')) return 'bg-[#e8f7ee] text-[#166534] border-[#bfe7cf]'
  return 'bg-[#e8f0ff] text-[#1d4ed8] border-[#bfd5ff]'
}

// Aggregate all paginated readings into metric totals
function aggregateReadings(rows) {
  const agg = {
    individuals_in:  0, individuals_out: 0,
    male_in:         0, male_out:        0,
    female_in:       0, female_out:      0,
    group_in:        0, group_out:       0,
  }
  for (const r of rows) {
    agg.individuals_in  += r.individuals_in  ?? 0
    agg.individuals_out += r.individuals_out ?? 0
    agg.male_in         += r.male_in         ?? 0
    agg.male_out        += r.male_out        ?? 0
    agg.female_in       += r.female_in       ?? 0
    agg.female_out      += r.female_out      ?? 0
    agg.group_in        += r.group_in        ?? 0
    agg.group_out       += r.group_out       ?? 0
  }
  return agg
}

// Find the hour (0-23) with highest combined in+out traffic
function peakHour(rows) {
  const buckets = Array(24).fill(0)
  for (const r of rows) {
    const ts = r.recorded_at || r.received_at
    if (!ts) continue
    const h = new Date(ts).getHours()
    buckets[h] += (r.individuals_in ?? 0) + (r.individuals_out ?? 0)
  }
  const max = Math.max(...buckets)
  if (max === 0) return null
  const h = buckets.indexOf(max)
  return `${String(h).padStart(2, '0')}:00–${String(h + 1).padStart(2, '0')}:00`
}

function avgHourly(rows) {
  if (!rows.length) return 0
  const hours = new Set(rows.map((r) => {
    const ts = r.recorded_at || r.received_at
    return ts ? new Date(ts).toISOString().slice(0, 13) : null
  }).filter(Boolean))
  const total = rows.reduce((s, r) => s + (r.individuals_in ?? 0) + (r.individuals_out ?? 0), 0)
  return hours.size ? Math.round(total / hours.size) : total
}

// Fetch ALL pages for a given query
async function fetchAllReadings(token, params, signal) {
  const allRows = []
  let offset = 0
  let hasMore = true
  while (hasMore) {
    const qp = new URLSearchParams({ ...params, limit: '1000', offset: String(offset) })
    const data = await apiFetch(`/sensors/vs125/readings?${qp}`, token, { signal })
    if (Array.isArray(data)) {
      allRows.push(...data)
      hasMore = false
    } else if (data && Array.isArray(data.readings)) {
      allRows.push(...data.readings)
      hasMore = data.has_more === true
      if (hasMore && data.readings.length === 0) break
      offset += data.readings.length
    } else {
      break
    }
  }
  return allRows
}

// Build CSV from report results
function buildReportCsv(meta, rows, agg, metricId) {
  const lines = []
  // Metadata header
  lines.push(['Report Metadata', ''])
  if (meta.store)     lines.push(['Store', meta.store])
  if (meta.sensor)    lines.push(['Sensor', meta.sensor])
  if (meta.line)      lines.push(['Counting Line', meta.line])
  lines.push(['Report Type', meta.reportType])
  lines.push(['Metric', meta.metricLabel])
  lines.push(['Date Range', `${meta.startDate} to ${meta.endDate}`])
  if (meta.eventName) lines.push(['Event', meta.eventName])
  lines.push(['Generated', new Date().toLocaleString()])
  lines.push([])

  if (COMPARISON_IDS.has(metricId)) {
    const pairs = getComparisonPairs(metricId, agg)
    lines.push(['Metric', 'Count'])
    for (const [label, value] of pairs) lines.push([label, value])
  } else {
    lines.push(['Metric', 'Value'])
    lines.push([meta.metricLabel, computeScalar(metricId, agg, rows)])
  }

  lines.push([])
  lines.push(['Timestamp', 'Store', 'Sensor', 'Entries', 'Exits', 'Male In', 'Male Out', 'Female In', 'Female Out', 'Group In', 'Group Out'])
  for (const r of rows) {
    lines.push([
      r.recorded_at || r.received_at || '',
      r.store_name || '',
      r.line_name  || '',
      r.individuals_in  ?? 0,
      r.individuals_out ?? 0,
      r.male_in    ?? 0, r.male_out   ?? 0,
      r.female_in  ?? 0, r.female_out ?? 0,
      r.group_in   ?? 0, r.group_out  ?? 0,
    ])
  }

  return lines
    .map((line) => line.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n')
}

function buildStaticCsv(rows) {
  const headers = ['Timestamp', 'Store', 'Sensor', 'Entries', 'Exits', 'Male', 'Female', 'Status']
  const csvRows = rows.map((r) => [r.timestamp, r.store, r.sensor, r.entries, r.exits, r.male, r.female, r.status])
  return [headers, ...csvRows]
    .map((line) => line.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n')
}

function getComparisonPairs(metricId, agg) {
  if (metricId === 'in_vs_out')
    return [['People In', agg.individuals_in], ['People Out', agg.individuals_out]]
  if (metricId === 'male_vs_female')
    return [['Male', agg.male_in], ['Female', agg.female_in]]
  if (metricId === 'individual_vs_group') {
    const ind = agg.individuals_in - agg.group_in
    return [['Individual', Math.max(0, ind)], ['Group', agg.group_in]]
  }
  return []
}

function computeScalar(metricId, agg, rows) {
  switch (metricId) {
    case 'total_in':       return agg.individuals_in
    case 'total_out':      return agg.individuals_out
    case 'total_footfall': return agg.individuals_in + agg.individuals_out
    case 'male':           return agg.male_in
    case 'female':         return agg.female_in
    case 'group':          return agg.group_in
    case 'individual':     return Math.max(0, agg.individuals_in - agg.group_in)
    case 'peak_hour':      return peakHour(rows) ?? 'N/A'
    case 'avg_hourly':     return avgHourly(rows)
    default:               return 0
  }
}

const CHART_COLORS = ['#0070f3', '#7928ca', '#eb367f', '#f5a623']

const tooltipStyle = {
  borderRadius: 12,
  border: '1px solid #ebebeb',
  boxShadow: '0 2px 2px rgba(0,0,0,0.04), 0 8px 16px -4px rgba(0,0,0,0.08)',
  fontSize: 13,
  fontFamily: 'Geist, Inter, Arial, sans-serif',
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SegmentedControl({ options, value, onChange }) {
  return (
    <div className="inline-flex rounded-lg border border-[#ebebeb] bg-[#fafafa] p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            value === opt.value
              ? 'bg-white text-[#171717] shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
              : 'text-[#8f8f8f] hover:text-[#4d4d4d]'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function FieldRow({ label, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-[#8f8f8f]">{label}</span>
      {children}
    </label>
  )
}

const inputCls = 'h-9 rounded-lg border border-[#ebebeb] bg-white px-3 text-sm text-[#171717] outline-none focus:border-[#171717] focus:ring-1 focus:ring-[#171717]/10 disabled:bg-[#fafafa] disabled:text-[#a1a1a1] disabled:cursor-not-allowed'
const selectCls = inputCls + ' appearance-none pr-8'

function SelectWrapper({ value, onChange, disabled, children }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={selectCls}
        style={{ minWidth: 0 }}
      >
        {children}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8f8f8f]" />
    </div>
  )
}

// Period date inputs ─────────────────────────────────────────────────────────

function PeriodInputs({ periodType, periodState, onChange }) {
  const { day, weekDate, month, monthYear, year, customStart, customEnd } = periodState

  if (periodType === 'day') return (
    <FieldRow label="Date">
      <input type="date" value={day} max={today()} onChange={(e) => onChange({ day: e.target.value })} className={inputCls} />
    </FieldRow>
  )

  if (periodType === 'week') return (
    <FieldRow label="Any date in the week">
      <input type="date" value={weekDate} max={today()} onChange={(e) => onChange({ weekDate: e.target.value })} className={inputCls} />
    </FieldRow>
  )

  if (periodType === 'month') return (
    <div className="flex flex-wrap gap-3">
      <FieldRow label="Month">
        <SelectWrapper value={month} onChange={(v) => onChange({ month: Number(v) })}>
          {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </SelectWrapper>
      </FieldRow>
      <FieldRow label="Year">
        <SelectWrapper value={monthYear} onChange={(v) => onChange({ monthYear: Number(v) })}>
          {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
        </SelectWrapper>
      </FieldRow>
    </div>
  )

  if (periodType === 'year') return (
    <FieldRow label="Year">
      <SelectWrapper value={year} onChange={(v) => onChange({ year: Number(v) })}>
        {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
      </SelectWrapper>
    </FieldRow>
  )

  if (periodType === 'custom') return (
    <div className="flex flex-wrap gap-3">
      <FieldRow label="From">
        <input type="date" value={customStart} max={customEnd || today()} onChange={(e) => onChange({ customStart: e.target.value })} className={inputCls} />
      </FieldRow>
      <FieldRow label="To">
        <input type="date" value={customEnd} min={customStart} max={today()} onChange={(e) => onChange({ customEnd: e.target.value })} className={inputCls} />
      </FieldRow>
    </div>
  )

  return null
}

// Metric selector ─────────────────────────────────────────────────────────────

function MetricSelector({ selected, onToggle }) {
  // First two groups (People Count + Demographics) sit side-by-side in a 2×2 grid.
  // Performance + Comparison flow below as usual.
  const topGroups  = METRIC_GROUPS.slice(0, 2)
  const restGroups = METRIC_GROUPS.slice(2)

  function GroupPills({ group }) {
    return (
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#a1a1a1]">{group.group}</p>
        <div className="flex flex-wrap gap-2">
          {group.metrics.map((m) => {
            const active = selected.has(m.id)
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onToggle(m.id)}
                aria-pressed={active}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                  active
                    ? 'border-[#171717] bg-[#171717] text-white'
                    : 'border-[#ebebeb] bg-white text-[#4d4d4d] hover:border-[#d8d8d8]'
                }`}
              >
                {m.label}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* People Count + Demographics — 2 columns */}
      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {topGroups.map((group) => (
          <div key={group.group} className="rounded-xl border border-[#f2f2f2] bg-[#fafafa] p-4">
            <GroupPills group={group} />
          </div>
        ))}
      </div>

      {/* Performance + Comparison — remaining groups */}
      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {restGroups.map((group) => (
          <div key={group.group} className="rounded-xl border border-[#f2f2f2] bg-[#fafafa] p-4">
            <GroupPills group={group} />
          </div>
        ))}
      </div>
    </div>
  )
}

// Event selector ──────────────────────────────────────────────────────────────

function EventSelector({ eventId, eventDates, customName, onEventChange, onDatesChange, onCustomNameChange }) {
  const event = FESTIVAL_EVENTS.find((e) => e.id === eventId)

  return (
    <div className="space-y-4">
      <FieldRow label="Event">
        <SelectWrapper value={eventId} onChange={onEventChange}>
          {FESTIVAL_EVENTS.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </SelectWrapper>
      </FieldRow>

      {eventId === 'custom' && (
        <FieldRow label="Event name">
          <input
            type="text"
            value={customName}
            onChange={(e) => onCustomNameChange(e.target.value)}
            placeholder="e.g. Eid Shopping"
            maxLength={80}
            className={inputCls}
          />
        </FieldRow>
      )}

      <div className="flex flex-wrap gap-3">
        <FieldRow label="Start date">
          <input
            type="date"
            value={eventDates.start}
            onChange={(e) => onDatesChange({ start: e.target.value })}
            className={inputCls}
          />
        </FieldRow>
        <FieldRow label="End date">
          <input
            type="date"
            value={eventDates.end}
            min={eventDates.start}
            onChange={(e) => onDatesChange({ end: e.target.value })}
            className={inputCls}
          />
        </FieldRow>
      </div>

      {event && event.id !== 'custom' && (
        <p className="text-xs text-[#8f8f8f]">
          Preset dates pre-filled. Edit to match your local festival period.
        </p>
      )}
    </div>
  )
}

// Report results ──────────────────────────────────────────────────────────────

function ComparisonTable({ pairs }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#ebebeb]">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-[#fafafa]">
          <tr>
            <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8f8f8f]">Metric</th>
            <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8f8f8f]">Count</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f2f2f2]">
          {pairs.map(([label, value]) => (
            <tr key={label}>
              <td className="px-4 py-3 text-[#171717]">{label}</td>
              <td className="px-4 py-3 text-right tabular-nums text-[#171717]">{Number(value).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ComparisonChart({ pairs }) {
  const data = pairs.map(([label, value], i) => ({ label, value, color: CHART_COLORS[i % CHART_COLORS.length] }))
  return (
    <div className="h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid stroke="#f2f2f2" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#8f8f8f', fontSize: 12 }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: '#8f8f8f', fontSize: 11 }}
            tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v} width={44} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => [Number(v).toLocaleString()]} />
          <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={64}>
            {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function ReportResultsCard({ result, onClearReport }) {
  const { agg, rows, metricIds, metricLabel, dateLabel, eventName, store, sensor, line } = result

  return (
    <div className="rounded-[20px] border border-[#0070f3]/20 bg-white p-5 shadow-[0px_1px_1px_rgba(0,0,0,0.04)] sm:p-6">
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-[#0070f3]" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0070f3]">Report Result</p>
          </div>
          <h2 className="mt-1.5 text-xl font-semibold tracking-[-0.03em] text-[#171717]">
            {eventName ? `${eventName} — ${metricLabel}` : metricLabel}
          </h2>
          <p className="mt-1 text-sm text-[#8f8f8f]">{dateLabel}</p>
          {(store || sensor || line) && (
            <p className="mt-0.5 text-xs text-[#a1a1a1]">
              {[store, sensor, line].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClearReport}
          className="rounded-full border border-[#ebebeb] px-3 py-1.5 text-xs text-[#8f8f8f] hover:border-[#d8d8d8] hover:text-[#4d4d4d]"
        >
          Clear
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {metricIds.map((id) => {
          const isComparison = COMPARISON_IDS.has(id)
          const label = ALL_METRICS.find((m) => m.id === id)?.label ?? id
          const pairs = isComparison ? getComparisonPairs(id, agg) : null
          const scalar = !isComparison ? computeScalar(id, agg, rows) : null
          const isPeakHour = id === 'peak_hour'

          return (
            <div key={id} className="rounded-2xl bg-[#fafafa] p-4">
              <p className="text-xs font-medium text-[#8f8f8f]">{label}</p>
              {isComparison ? (
                <div className="mt-3 space-y-1.5">
                  {pairs.map(([pairLabel, value]) => (
                    <div key={pairLabel} className="flex items-center justify-between gap-2">
                      <span className="text-xs text-[#4d4d4d]">{pairLabel}</span>
                      <span className="text-sm font-semibold tabular-nums text-[#171717]">{Number(value).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <p className={`mt-2 font-semibold tabular-nums tracking-tight text-[#171717] ${isPeakHour ? 'text-xl' : 'text-3xl'}`}>
                    {isPeakHour ? (scalar ?? 'N/A') : Number(scalar).toLocaleString()}
                  </p>
                  {!isPeakHour && id !== 'avg_hourly' && (
                    <p className="mt-1 text-[11px] text-[#a1a1a1]">{rows.length.toLocaleString()} reading{rows.length !== 1 ? 's' : ''}</p>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function Reports({ token, onOpenAnalytics }) {
  // ── Existing state ─────────────────────────────────────────────────────────
  const [selectedFormat, setSelectedFormat] = useState('csv')

  // ── Store / sensor / line ──────────────────────────────────────────────────
  const { stores, loading: storesLoading } = useStores(token)
  const { sensors, loading: sensorsLoading } = useSensors(token)
  const [selectedStoreId, setSelectedStoreId] = useState('all')
  const [selectedSensorId, setSelectedSensorId] = useState('all')
  const [selectedLine, setSelectedLine] = useState('all')
  const [knownLines, setKnownLines] = useState([]) // populated after first fetch

  // Filter sensors by selected store
  const filteredSensors = useMemo(() => {
    if (selectedStoreId === 'all') return sensors
    return sensors.filter((s) => String(s.store_id) === String(selectedStoreId))
  }, [sensors, selectedStoreId])

  // Filter lines by selected store + sensor
  const filteredLines = useMemo(() => {
    return knownLines.filter((line) =>
      (selectedStoreId === 'all' || String(line.store_id) === String(selectedStoreId)) &&
      (selectedSensorId === 'all' || String(line.sensor_id) === String(selectedSensorId)),
    )
  }, [knownLines, selectedStoreId, selectedSensorId])

  // Reset sensor + line when store changes
  useEffect(() => {
    setSelectedSensorId('all')
    setSelectedLine('all')
  }, [selectedStoreId])

  // Reset line when sensor changes
  useEffect(() => {
    setSelectedLine('all')
  }, [selectedSensorId])

  // ── Report mode ────────────────────────────────────────────────────────────
  // 'standard' or 'event'
  const [reportMode, setReportMode] = useState('standard')

  // ── Period state ───────────────────────────────────────────────────────────
  const [periodType, setPeriodType] = useState('month')
  const now = new Date()
  const [periodState, setPeriodStateRaw] = useState({
    day:         today(),
    weekDate:    today(),
    month:       now.getMonth() + 1,
    monthYear:   now.getFullYear(),
    year:        now.getFullYear(),
    customStart: today(),
    customEnd:   today(),
  })

  function mergePeriod(patch) {
    setPeriodStateRaw((prev) => ({ ...prev, ...patch }))
  }

  // ── Metric ─────────────────────────────────────────────────────────────────
  const [selectedMetrics, setSelectedMetrics] = useState(new Set(['total_in']))

  function toggleMetric(id) {
    setSelectedMetrics((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        if (next.size === 1) return prev // keep at least one selected
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // ── Event state ────────────────────────────────────────────────────────────
  const [eventId, setEventId] = useState('diwali')
  const [eventDates, setEventDatesRaw] = useState({
    start: FESTIVAL_EVENTS.find((e) => e.id === 'diwali')?.startDate ?? '',
    end:   FESTIVAL_EVENTS.find((e) => e.id === 'diwali')?.endDate   ?? '',
  })
  const [customEventName, setCustomEventName] = useState('')

  function handleEventIdChange(id) {
    setEventId(id)
    const ev = FESTIVAL_EVENTS.find((e) => e.id === id)
    if (ev) setEventDatesRaw({ start: ev.startDate, end: ev.endDate })
  }

  function mergeEventDates(patch) {
    setEventDatesRaw((prev) => ({ ...prev, ...patch }))
  }

  // ── Report generation ──────────────────────────────────────────────────────
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError]     = useState('')
  const [reportResult, setReportResult]   = useState(null)
  const abortRef = useRef(null)

  // Compute the date range for the current filter state
  function resolveDateRange() {
    if (reportMode === 'event') {
      return [eventDates.start, eventDates.end]
    }
    switch (periodType) {
      case 'day':    return [periodState.day, periodState.day]
      case 'week':   return isoWeekBounds(periodState.weekDate)
      case 'month':  return monthBounds(periodState.monthYear, periodState.month)
      case 'year':   return yearBounds(periodState.year)
      case 'custom': return [periodState.customStart, periodState.customEnd]
      default:       return [today(), today()]
    }
  }

  function resolveDateLabel([start, end]) {
    if (start === end) return formatDateShort(start)
    return `${formatDateShort(start)} – ${formatDateShort(end)}`
  }

  async function handleGenerateReport() {
    const [startDate, endDate] = resolveDateRange()

    if (!startDate || !endDate) {
      setReportError('Please select a valid date range.')
      return
    }
    if (startDate > endDate) {
      setReportError('Start date must be on or before end date.')
      return
    }

    // Abort any previous in-flight request
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setReportLoading(true)
    setReportError('')
    setReportResult(null)

    try {
      const params = { start_date: startDate, end_date: endDate }
      if (selectedSensorId !== 'all') params.sensor_id = selectedSensorId

      const allRows = await fetchAllReadings(token, params, controller.signal)

      // Discover lines from the fetched data and merge into knownLines
      setKnownLines((prev) => {
        const map = new Map(prev.map((l) => [`${l.sensor_id}:${l.line_id}`, l]))
        for (const r of allRows) {
          const key = `${r.sensor_id}:${r.line_id}`
          if (!map.has(key)) {
            map.set(key, {
              key,
              sensor_id: r.sensor_id,
              store_id:  r.store_id,
              line_id:   r.line_id,
              line_name: r.line_name || `Line ${r.line_id}`,
              sensor_name: sensors.find((s) => String(s.id) === String(r.sensor_id))?.name || `Sensor ${r.sensor_id}`,
            })
          }
        }
        return [...map.values()].sort((a, b) => a.line_name.localeCompare(b.line_name))
      })

      // Apply line filter client-side
      const rows = selectedLine === 'all'
        ? allRows
        : allRows.filter((r) => `${r.sensor_id}:${r.line_id}` === selectedLine)

      const agg  = aggregateReadings(rows)

      const metricIds   = [...selectedMetrics]
      const metricLabel = metricIds.map((id) => ALL_METRICS.find((m) => m.id === id)?.label ?? id).join(', ')

      const storeName  = selectedStoreId  !== 'all' ? stores.find((s)  => String(s.id)  === String(selectedStoreId))?.name  : null
      const sensorName = selectedSensorId !== 'all' ? sensors.find((s) => String(s.id) === String(selectedSensorId))?.name : null
      const lineName   = selectedLine     !== 'all' ? knownLines.find((l) => l.key === selectedLine)?.line_name : null

      let eventName = null
      if (reportMode === 'event') {
        if (eventId === 'custom') {
          eventName = customEventName.trim() || 'Custom Event'
        } else {
          eventName = FESTIVAL_EVENTS.find((e) => e.id === eventId)?.name ?? null
        }
      }

      setReportResult({
        agg, rows, metricIds, metricLabel,
        dateLabel: resolveDateLabel([startDate, endDate]),
        startDate, endDate,
        eventName,
        store:  storeName,
        sensor: sensorName,
        line:   lineName,
        generatedAt: new Date(),
      })
    } catch (err) {
      if (err.name !== 'AbortError') {
        setReportError(err.message || 'Failed to fetch report data.')
      }
    } finally {
      setReportLoading(false)
    }
  }

  // ── Summary (static fallback — kept intact) ────────────────────────────────
  const summary = useMemo(() => {
    const totalEntries = STATIC_ROWS.reduce((s, r) => s + r.entries, 0)
    const totalExits   = STATIC_ROWS.reduce((s, r) => s + r.exits, 0)
    return {
      totalEntries,
      totalExits,
      activeSensors: new Set(STATIC_ROWS.map((r) => r.sensor)).size,
    }
  }, [])

  // ── Export ─────────────────────────────────────────────────────────────────
  function handleExport() {
    if (selectedFormat === 'csv') {
      let csv
      if (reportResult) {
        const { agg, rows, metricIds, metricLabel, startDate, endDate, eventName, store, sensor } = reportResult
        const meta = {
          store, sensor, line,
          reportType:  reportMode === 'event' ? 'Event Report' : 'Standard Report',
          metricLabel,
          startDate, endDate,
          eventName,
        }
        csv = buildReportCsv(meta, rows, agg, metricIds[0])
      } else {
        csv = buildStaticCsv([...STATIC_ROWS].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)))
      }

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url  = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href     = url
      link.download = `visitor-report-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      return
    }
    window.alert(`${selectedFormat.toUpperCase()} export is ready for integration with the backend export route.`)
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <section className="space-y-6" style={{ fontFamily: 'Geist, Inter, Arial, sans-serif' }}>

      {/* ── Existing header (unchanged) ── */}
      <header className="rounded-[20px] border border-[#ebebeb] bg-white p-6 shadow-[0px_1px_1px_rgba(0,0,0,0.04)] sm:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#8f8f8f]">Reports</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.06em] text-[#171717]">Export visitor reports</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#4d4d4d]">
              Select a file format, review the latest store activity from the database, and export the most recent visitor readings in one click.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenAnalytics}
            className="inline-flex items-center justify-center rounded-full border border-[#171717] bg-[#171717] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#2b2b2b]"
          >
            Open Analytics
          </button>
        </div>
      </header>

      {/* ── Existing summary cards (unchanged) ── */}
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: 'Total entries',   value: summary.totalEntries.toLocaleString() },
          { label: 'Total exits',     value: summary.totalExits.toLocaleString() },
          { label: 'Active sensors',  value: String(summary.activeSensors) },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-[#ebebeb] bg-[#fafafa] p-5">
            <p className="text-sm text-[#8f8f8f]">{item.label}</p>
            <p className="mt-3 text-3xl font-semibold tracking-[-0.06em] text-[#171717] tabular-nums">{item.value}</p>
          </div>
        ))}
      </div>

      {/* ── NEW: Report Filters ── */}
      <div className="rounded-[20px] border border-[#ebebeb] bg-white p-5 shadow-[0px_1px_1px_rgba(0,0,0,0.04)] sm:p-6">
        {/* Card header */}
        <div className="mb-5 flex items-center gap-2">
          <BarChart2 size={18} className="text-[#8f8f8f]" />
          <div>
            <p className="text-sm font-semibold text-[#171717]">Report Filters</p>
            <p className="text-xs text-[#8f8f8f]">Configure what you want to analyze, then click Generate Report.</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* ── Top row: Scope left | Period right ── */}
          <div className="grid gap-x-8 gap-y-6 lg:grid-cols-2">

            {/* Left — Store / Sensor / Line */}
            <div className="flex flex-col gap-4 lg:border-r lg:border-[#f2f2f2] lg:pr-8">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a1a1a1]">Scope</p>
              <FieldRow label="Store">
                <SelectWrapper
                  value={selectedStoreId}
                  onChange={setSelectedStoreId}
                  disabled={storesLoading}
                >
                  <option value="all">All stores</option>
                  {stores.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                </SelectWrapper>
              </FieldRow>

              <FieldRow label="Sensor">
                <SelectWrapper
                  value={selectedSensorId}
                  onChange={setSelectedSensorId}
                  disabled={sensorsLoading || filteredSensors.length === 0}
                >
                  <option value="all">All sensors</option>
                  {filteredSensors.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                </SelectWrapper>
              </FieldRow>

              <FieldRow label="Counting line">
                <SelectWrapper
                  value={selectedLine}
                  onChange={setSelectedLine}
                  disabled={filteredLines.length === 0}
                >
                  <option value="all">All lines</option>
                  {filteredLines.map((l) => (
                    <option key={l.key} value={l.key}>
                      {selectedSensorId === 'all' ? `${l.sensor_name} · ${l.line_name}` : l.line_name}
                    </option>
                  ))}
                </SelectWrapper>
              </FieldRow>
            </div>

            {/* Right — Report type + period / event inputs */}
            <div className="flex flex-col gap-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a1a1a1]">Period</p>

              {/* Report mode toggle */}
              <div>
                <p className="mb-2 text-xs font-medium text-[#8f8f8f]">Report type</p>
                <SegmentedControl
                  options={[
                    { value: 'standard', label: 'Standard Period' },
                    { value: 'event',    label: 'Event / Festival' },
                  ]}
                  value={reportMode}
                  onChange={setReportMode}
                />
              </div>

              {/* Standard period inputs */}
              {reportMode === 'standard' && (
                <div className="flex flex-col gap-4">
                  <div>
                    <p className="mb-2 text-xs font-medium text-[#8f8f8f]">Time period</p>
                    <SegmentedControl
                      options={[
                        { value: 'day',    label: 'Day' },
                        { value: 'week',   label: 'Week' },
                        { value: 'month',  label: 'Month' },
                        { value: 'year',   label: 'Year' },
                        { value: 'custom', label: 'Custom' },
                      ]}
                      value={periodType}
                      onChange={setPeriodType}
                    />
                  </div>
                  <PeriodInputs
                    periodType={periodType}
                    periodState={periodState}
                    onChange={mergePeriod}
                  />
                </div>
              )}

              {/* Event inputs */}
              {reportMode === 'event' && (
                <EventSelector
                  eventId={eventId}
                  eventDates={eventDates}
                  customName={customEventName}
                  onEventChange={handleEventIdChange}
                  onDatesChange={mergeEventDates}
                  onCustomNameChange={setCustomEventName}
                />
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-[#f2f2f2]" />

          {/* ── Metric selector ── */}
          <div>
            <div className="mb-3 flex items-center gap-2">
              <p className="text-xs font-medium text-[#8f8f8f]">Report metric</p>
              {selectedMetrics.size > 1 && (
                <span className="rounded-full bg-[#171717] px-2 py-0.5 text-[10px] font-semibold text-white">
                  {selectedMetrics.size} selected
                </span>
              )}
            </div>
            <MetricSelector selected={selectedMetrics} onToggle={toggleMetric} />
          </div>

          {/* Divider */}
          <div className="border-t border-[#f2f2f2]" />

          {/* ── Generate button ── */}
          {reportError && (
            <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              <AlertCircle size={15} />
              {reportError}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleGenerateReport}
              disabled={reportLoading || !token}
              className="inline-flex items-center gap-2 rounded-full bg-[#171717] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#2b2b2b] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {reportLoading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {reportLoading ? 'Generating…' : 'Generate Report'}
            </button>

            <button
              type="button"
              disabled={!reportResult || reportLoading}
              onClick={() => window.alert('Email delivery will be available soon.')}
              className="inline-flex items-center gap-2 rounded-full border border-[#ebebeb] bg-white px-5 py-2.5 text-sm font-medium text-[#4d4d4d] transition hover:border-[#d8d8d8] hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Mail size={15} />
              Mail Report
            </button>

            {!token && (
              <p className="text-xs text-[#a1a1a1]">Sign in to generate live reports.</p>
            )}
          </div>
        </div>
      </div>

      {/* ── NEW: Report Results ── */}
      {reportResult && (
        <ReportResultsCard
          result={reportResult}
          onClearReport={() => setReportResult(null)}
        />
      )}

      {/* ── Existing: Export format card (unchanged) ── */}
      <div className="rounded-[20px] border border-[#ebebeb] bg-white p-5 shadow-[0px_1px_1px_rgba(0,0,0,0.04)] sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium text-[#171717]">Export format</p>
            <p className="mt-1 text-sm text-[#8f8f8f]">
              {reportResult
                ? 'Export will include your generated report data and all applied filters.'
                : 'Choose the file type for your report export.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {exportOptions.map(({ value, label, description, icon: Icon }) => {
              const active = selectedFormat === value
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSelectedFormat(value)}
                  className={`flex items-center gap-3 rounded-full border px-4 py-2.5 text-left transition-all ${
                    active
                      ? 'border-[#171717] bg-[#171717] text-white shadow-[0_8px_24px_rgba(23,23,23,0.12)]'
                      : 'border-[#ebebeb] bg-[#fafafa] text-[#171717] hover:border-[#d8d8d8]'
                  }`}
                >
                  <span className={`flex h-8 w-8 items-center justify-center rounded-full ${active ? 'bg-white/10' : 'bg-white'}`}>
                    <Icon size={15} />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">{label}</span>
                    <span className={`block text-[11px] ${active ? 'text-white/70' : 'text-[#8f8f8f]'}`}>{description}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-[#ebebeb] bg-[#fafafa] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-[#4d4d4d]">
            <CalendarRange size={16} className="text-[#8f8f8f]" />
            {reportResult
              ? `Report: ${reportResult.dateLabel}`
              : `Last sync: ${formatDateTime('2026-11-03T08:45:00Z')}`}
          </div>
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#171717] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#2b2b2b]"
          >
            <Download size={16} />
            Download {selectedFormat.toUpperCase()}
          </button>
        </div>
      </div>

      {/* ── Existing: Recent readings table (unchanged) ── */}
      <div className="rounded-[20px] border border-[#ebebeb] bg-white p-4 shadow-[0px_1px_1px_rgba(0,0,0,0.04)] sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.03em] text-[#171717]">Recent database readings</h2>
            <p className="mt-1 text-sm text-[#8f8f8f]">Latest records with timestamp and store activity data.</p>
          </div>
          <div className="rounded-full border border-[#ebebeb] bg-[#fafafa] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-[#4d4d4d]">
            {STATIC_ROWS.length} records
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[#ebebeb] bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#ebebeb] text-left">
              <thead className="bg-[#fafafa]">
                <tr>
                  {['Timestamp', 'Store', 'Sensor', 'Entries', 'Exits', 'Male', 'Female', 'Status'].map((h) => (
                    <th key={h} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8f8f8f]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f2f2f2] bg-white">
                {STATIC_ROWS.map((row) => (
                  <tr key={`${row.timestamp}-${row.sensor}`} className="transition-colors hover:bg-[#fafafa]">
                    <td className="px-4 py-3 text-sm text-[#171717]">{formatDateTime(row.timestamp)}</td>
                    <td className="px-4 py-3 text-sm text-[#171717]">{row.store}</td>
                    <td className="px-4 py-3 text-sm text-[#171717]">{row.sensor}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-[#171717]">{row.entries}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-[#171717]">{row.exits}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-[#171717]">{row.male}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-[#171717]">{row.female}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-medium ${getStatusTone(row.status)}`}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Existing: Bottom status strip (unchanged) ── */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-[#d9d9d9] bg-[#fafafa] p-4 text-sm text-[#4d4d4d]">
        <div className="flex items-center gap-2">
          <ArrowDownToLine size={16} className="text-[#8f8f8f]" />
          {reportResult
            ? `Report generated · ${reportResult.rows.length.toLocaleString()} reading${reportResult.rows.length !== 1 ? 's' : ''} fetched`
            : 'Ready to export the most recent readings from the database.'}
        </div>
        <span className="text-[11px] uppercase tracking-[0.12em] text-[#8f8f8f]">
          {reportResult ? 'Live data' : 'Database snapshot'}
        </span>
      </div>

    </section>
  )
}
