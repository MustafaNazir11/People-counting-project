import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CalendarDays, RefreshCw, Store } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { apiFetch } from '../api'
import useSensors from '../hooks/useSensors'
import useStores from '../hooks/useStores'
import {
  PRESETS,
  dateKeyOf,
  dateLabel,
  defaultRange,
  getPreviousRange,
  inputDate,
  lineKey,
} from '../components/analytics/analyticsHelpers'
import TrafficCards from '../components/analytics/TrafficCards'
import {
  AgeDistribution,
  ChildrenAnalytics,
  GenderDistribution,
  StoreComparisonChart,
} from '../components/analytics/DemographicsCharts'
import DailyTrafficChart from '../components/analytics/DailyTrafficChart'

function FilterSelect({ label, value, onChange, children, disabled = false }) {
  return (
    <label className="grid min-w-0 gap-1.5 text-xs font-medium text-[#8f8f8f]">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="h-10 min-w-0 rounded-md border border-[#ebebeb] bg-white px-3 text-sm font-normal text-[#171717] outline-none focus:border-[#171717] disabled:cursor-not-allowed disabled:bg-[#fafafa] disabled:text-[#a1a1a1]"
      >
        {children}
      </select>
    </label>
  )
}

export default function Analytics({ token }) {
  const { t } = useTranslation()
  const [draftRange, setDraftRange]     = useState(defaultRange)
  const [dateRange, setDateRange]       = useState(defaultRange)
  const [rangeError, setRangeError]     = useState('')
  const [activePreset, setActivePreset] = useState(null)
  const [showCustom, setShowCustom]     = useState(false)
  const [readings, setReadings]         = useState([])
  const [loading, setLoading]           = useState(true)
  const [loadError, setLoadError]       = useState('')
  const [refreshKey, setRefreshKey]     = useState(0)

  const [storeId, setStoreId]           = useState('all')
  const [sensorId, setSensorId]         = useState('all')
  const [selectedLine, setSelectedLine] = useState('all')

  const { stores,  loading: storesLoading,  error: storesError  } = useStores(token)
  const { sensors, loading: sensorsLoading, error: sensorsError } = useSensors(token)
  const previousRange = useMemo(() => getPreviousRange(dateRange), [dateRange])

  // ── Data fetch ──────────────────────────────────────────────────────────────
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
            end_date:   dateRange.endDate,
            limit:  '1000',
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
      } catch (err) {
        if (err.name !== 'AbortError' && !controller.signal.aborted) {
          setLoadError(err.message || 'Could not load sensor readings.')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    loadReadings()
    return () => controller.abort()
  }, [token, dateRange, previousRange, refreshKey])

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const id = setInterval(() => setRefreshKey((k) => k + 1), 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  // ── Derived data ────────────────────────────────────────────────────────────
  const availableSensors = useMemo(
    () => storeId === 'all' ? sensors : sensors.filter((s) => String(s.store_id) === storeId),
    [sensors, storeId],
  )

  const lineOptions = useMemo(() => {
    const scoped = readings.filter((row) =>
      (storeId  === 'all' || String(row.store_id)  === storeId) &&
      (sensorId === 'all' || String(row.sensor_id) === sensorId),
    )
    const lines = new Map()
    for (const row of scoped) {
      const key = lineKey(row)
      if (!lines.has(key)) {
        lines.set(key, {
          key,
          name: row.line_name || `Line ${row.line_id}`,
          sensor: sensors.find((s) => String(s.id) === String(row.sensor_id))?.name || `Sensor ${row.sensor_id}`,
        })
      }
    }
    return [...lines.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [readings, sensors, storeId, sensorId])

  const filteredReadings = useMemo(
    () => readings.filter((row) =>
      (storeId      === 'all' || String(row.store_id)  === storeId) &&
      (sensorId     === 'all' || String(row.sensor_id) === sensorId) &&
      (selectedLine === 'all' || lineKey(row)          === selectedLine),
    ),
    [readings, storeId, sensorId, selectedLine],
  )

  const selectedReadings = useMemo(
    () => filteredReadings.filter((row) => {
      const d = dateKeyOf(row)
      return d && d >= dateRange.startDate && d <= dateRange.endDate
    }),
    [filteredReadings, dateRange],
  )

  const previousReadings = useMemo(
    () => filteredReadings.filter((row) => {
      const d = dateKeyOf(row)
      return d && d >= previousRange.startDate && d <= previousRange.endDate
    }),
    [filteredReadings, previousRange],
  )

  const totals = useMemo(() => {
    let individualIn = 0, maleIn = 0, femaleIn = 0
    let individualOut = 0, maleOut = 0, femaleOut = 0
    let groupIn = 0, groupOut = 0, childrenIn = 0, childrenOut = 0
    const ageDist = new Array(8).fill(0)

    for (const row of selectedReadings) {
      individualIn  += Number(row.individuals_in  ?? 0)
      maleIn        += Number(row.male_in         ?? 0)
      femaleIn      += Number(row.female_in       ?? 0)
      individualOut += Number(row.individuals_out ?? 0)
      maleOut       += Number(row.male_out        ?? 0)
      femaleOut     += Number(row.female_out      ?? 0)
      groupIn       += Number(row.group_in        ?? 0)
      groupOut      += Number(row.group_out       ?? 0)
      childrenIn    += Number(row.children_in     ?? 0)
      childrenOut   += Number(row.children_out    ?? 0)
      if (Array.isArray(row.age_dist)) {
        for (let i = 0; i < 8; i++) ageDist[i] += Number(row.age_dist[i] ?? 0)
      }
    }

    return {
      totalIn: individualIn,
      maleIn,
      femaleIn: femaleIn + Math.max(0, individualIn - maleIn - femaleIn),
      totalOut: individualOut,
      maleOut,
      femaleOut: femaleOut + Math.max(0, individualOut - maleOut - femaleOut),
      groupIn, groupOut, childrenIn, childrenOut, ageDist,
    }
  }, [selectedReadings])

  const previousTotals = useMemo(() =>
    previousReadings.reduce((acc, row) => ({
      totalIn:  acc.totalIn  + Number(row.individuals_in  ?? 0),
      totalOut: acc.totalOut + Number(row.individuals_out ?? 0),
    }), { totalIn: 0, totalOut: 0 }),
    [previousReadings],
  )

  const dailyData = useMemo(() => {
    const byDate = new Map()
    for (const row of selectedReadings) {
      const d = dateKeyOf(row)
      if (!d) continue
      const cur = byDate.get(d) ?? { entries: 0, exits: 0 }
      cur.entries += Number(row.individuals_in  ?? 0)
      cur.exits   += Number(row.individuals_out ?? 0)
      byDate.set(d, cur)
    }
    const result = []
    const day  = new Date(`${dateRange.startDate}T00:00:00`)
    const last = new Date(`${dateRange.endDate}T00:00:00`)
    while (day <= last) {
      const d = inputDate(day)
      result.push({ date: d, label: dateLabel(d), ...(byDate.get(d) ?? { entries: 0, exits: 0 }) })
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
      const sid = String(row.store_id ?? '')
      if (!sid) continue
      const cur = byStore.get(sid) ?? { name: `Store ${sid}`, total: 0 }
      cur.total += Number(row.individuals_in ?? 0)
      byStore.set(sid, cur)
    }
    return [...byStore.values()].sort((a, b) => b.total - a.total)
  }, [selectedReadings, stores])

  const occupancy = useMemo(() => {
    const todayUTC = new Date().toISOString().slice(0, 10)
    const todayRows = selectedReadings.filter((row) => {
      const ts = row.recorded_at || row.received_at
      return ts && ts.slice(0, 10) === todayUTC
    })
    if (!todayRows.length) return { total: null, updatedAt: null }
    const net = todayRows.reduce((sum, row) =>
      sum + Number(row.individuals_in ?? 0) - Number(row.individuals_out ?? 0), 0)
    const updatedAt = todayRows.reduce((latest, row) => {
      const ts = row.recorded_at || row.received_at
      return ts && (!latest || ts > latest) ? ts : latest
    }, null)
    return { total: Math.max(0, net), updatedAt }
  }, [selectedReadings])

  // ── Status indicator ────────────────────────────────────────────────────────
  const selectedSensors = availableSensors.filter(
    (s) => sensorId === 'all' || String(s.id) === sensorId,
  )
  const onlineCount = selectedSensors.filter(
    (s) => String(s.status || '').toLowerCase() === 'online',
  ).length

  // ── Handlers ────────────────────────────────────────────────────────────────
  function applyRange(e) {
    e.preventDefault()
    if (draftRange.endDate < draftRange.startDate) {
      setRangeError(t('common.endDateError'))
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

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6" style={{ fontFamily: 'Geist, Inter, Arial, sans-serif' }}>
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-1.28px] text-[#171717]">{t('analytics.title')}</h1>
          <p className="mt-1 text-sm text-[#8f8f8f]">{t('analytics.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-[#ebebeb] bg-white px-3 py-2 text-sm text-[#4d4d4d]">
          <span className={`h-2 w-2 shrink-0 rounded-full ${onlineCount > 0 ? 'bg-emerald-500' : 'bg-[#a1a1a1]'}`} />
          {loading
            ? t('common.loading')
            : occupancy.updatedAt
              ? t('analytics.lastUpdated', { time: new Date(occupancy.updatedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) })
              : t('analytics.noDataYet')}
        </div>
      </header>

      {/* Filters */}
      <section className="rounded-2xl border border-[#ebebeb] bg-white p-4 shadow-[0px_1px_1px_rgba(0,0,0,0.04)] sm:p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-[#171717]">
          <Store size={17} color="#8f8f8f" aria-hidden="true" />
          {t('common.filters')}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <FilterSelect label={t('common.store')} value={storeId} onChange={(v) => { setStoreId(v); setSensorId('all'); setSelectedLine('all') }} disabled={storesLoading}>
            <option value="all">{t('common.allStores')}</option>
            {stores.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
          </FilterSelect>
          <FilterSelect label={t('common.sensor')} value={sensorId} onChange={(v) => { setSensorId(v); setSelectedLine('all') }} disabled={sensorsLoading}>
            <option value="all">{t('common.allSensors')}</option>
            {availableSensors.map((s) => <option key={s.id} value={String(s.id)}>{s.name || `Sensor ${s.id}`}</option>)}
          </FilterSelect>
          <FilterSelect label={t('common.countingLine')} value={selectedLine} onChange={setSelectedLine} disabled={loading || lineOptions.length === 0}>
            <option value="all">{t('common.allLines')}</option>
            {lineOptions.map((line) => (
              <option key={line.key} value={line.key}>
                {sensorId === 'all' ? `${line.sensor} · ${line.name}` : line.name}
              </option>
            ))}
          </FilterSelect>
        </div>

        <div className="my-4 h-px bg-[#f2f2f2]" />

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
                {t(preset.labelKey)}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading}
            aria-label="Refresh analytics"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-[#ebebeb] bg-white px-3 text-sm font-medium text-[#4d4d4d] shadow-[0px_1px_1px_rgba(0,0,0,0.04)] transition-colors hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            {t('common.refresh')}
          </button>
        </div>

        {showCustom && (
          <div className="mt-4 border-t border-[#f2f2f2] pt-4">
            <form onSubmit={applyRange} className="flex flex-wrap items-end gap-3">
              <label className="grid gap-1 text-xs font-medium text-[#8f8f8f]">
                {t('common.from')}
                <input type="date" value={draftRange.startDate} onChange={(e) => setDraftRange((r) => ({ ...r, startDate: e.target.value }))} required className="h-10 rounded-md border border-[#ebebeb] bg-white px-3 text-sm text-[#171717] outline-none focus:border-[#171717]" />
              </label>
              <label className="grid gap-1 text-xs font-medium text-[#8f8f8f]">
                {t('common.to')}
                <input type="date" value={draftRange.endDate} onChange={(e) => setDraftRange((r) => ({ ...r, endDate: e.target.value }))} required className="h-10 rounded-md border border-[#ebebeb] bg-white px-3 text-sm text-[#171717] outline-none focus:border-[#171717]" />
              </label>
              <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-md bg-[#171717] px-3 text-sm font-medium text-white transition-opacity hover:opacity-80">
                <CalendarDays size={15} />
                {t('common.applyDates')}
              </button>
              {rangeError && <p role="alert" className="basis-full text-xs text-[#ee0000]">{rangeError}</p>}
            </form>
          </div>
        )}
      </section>

      {/* Errors */}
      {(loadError || storesError || sensorsError) && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle size={17} className="mt-0.5 shrink-0" />
          <div className="space-y-1">
            {loadError    && <p>{loadError}</p>}
            {storesError  && <p>{t('common.store')}  {storesError}</p>}
            {sensorsError && <p>{t('common.sensor')} {sensorsError}</p>}
          </div>
        </div>
      )}

      {/* Sections */}
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

      <AgeDistribution ageDist={totals.ageDist} loading={loading} />

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
