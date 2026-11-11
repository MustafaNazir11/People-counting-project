// ─── Design-system colors ────────────────────────────────────────────────────
export const ENTRY_COLOR = '#0070f3'
export const EXIT_COLOR = '#7928ca'
export const MALE_COLOR = '#0070f3'
export const FEMALE_COLOR = '#eb367f'
export const CHILD_COLOR = '#f5a623'
export const GENDER_PIE_COLORS = ['#0070f3', '#eb367f']

// Age bucket order must match the backend INTEGER[] slot order:
// [0] age_4_12, [1] age_13_18, [2] age_19_27, [3] age_28_35,
// [4] age_36_45, [5] age_46_55, [6] age_gt_55, [7] age_unknown
export const AGE_BUCKET_KEYS = [
  'age_4_12', 'age_13_18', 'age_19_27', 'age_28_35',
  'age_36_45', 'age_46_55', 'age_gt_55', 'age_unknown',
]
export const AGE_PIE_COLORS = [
  '#0070f3', '#7928ca', '#eb367f', '#f5a623',
  '#50e3c2', '#ff4d4d', '#00dfd8', '#a1a1a1',
]

export const tooltipStyle = {
  borderRadius: 12,
  border: '1px solid #ebebeb',
  boxShadow: '0px 2px 2px rgba(0,0,0,0.04), 0px 8px 16px -4px rgba(0,0,0,0.08)',
  fontSize: 13,
  color: '#171717',
  fontFamily: 'Geist, Inter, Arial, sans-serif',
}

export const PRESETS = [
  {
    label: 'Today',
    labelKey: 'analytics.presets.today',
    range: () => { const d = inputDate(new Date()); return { startDate: d, endDate: d } },
  },
  {
    label: 'Yesterday',
    labelKey: 'analytics.presets.yesterday',
    range: () => {
      const y = new Date(); y.setDate(y.getDate() - 1)
      const d = inputDate(y); return { startDate: d, endDate: d }
    },
  },
  {
    label: 'Last 7 days',
    labelKey: 'analytics.presets.last7days',
    range: () => {
      const end = new Date(); const start = new Date(end)
      start.setDate(start.getDate() - 6)
      return { startDate: inputDate(start), endDate: inputDate(end) }
    },
  },
  {
    label: 'Last 30 days',
    labelKey: 'analytics.presets.last30days',
    range: () => {
      const end = new Date(); const start = new Date(end)
      start.setDate(start.getDate() - 29)
      return { startDate: inputDate(start), endDate: inputDate(end) }
    },
  },
  {
    label: 'This month',
    labelKey: 'analytics.presets.thisMonth',
    range: () => {
      const end = new Date()
      return {
        startDate: inputDate(new Date(end.getFullYear(), end.getMonth(), 1)),
        endDate: inputDate(end),
      }
    },
  },
  { label: 'Custom', labelKey: 'analytics.presets.custom', range: null },
]

// ─── Date helpers ─────────────────────────────────────────────────────────────
export function inputDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function defaultRange() {
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - 13)
  return { startDate: inputDate(start), endDate: inputDate(end) }
}

export function dateLabel(value) {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

export function timestampOf(row) {
  return row.recorded_at || row.received_at || row.timestamp || null
}

export function dateKeyOf(row) {
  const ts = timestampOf(row)
  return ts ? ts.slice(0, 10) : null
}

export function getPreviousRange({ startDate, endDate }) {
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  const length = Math.round((end - start) / 86400000) + 1
  const previousEnd = new Date(start)
  previousEnd.setDate(previousEnd.getDate() - 1)
  const previousStart = new Date(previousEnd)
  previousStart.setDate(previousStart.getDate() - length + 1)
  return { startDate: inputDate(previousStart), endDate: inputDate(previousEnd) }
}

export function lineKey(row) {
  return `${row.sensor_id}:${row.line_id}:${row.line_name || ''}`
}

export function formatUpdatedAt(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString()
}
