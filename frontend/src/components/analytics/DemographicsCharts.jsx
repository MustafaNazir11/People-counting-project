import { useState } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  Baby,
  BarChart2,
  Mars,
  PieChart as PieChartIcon,
  Venus,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useTranslation } from 'react-i18next'
import { arNum } from '../../utils/arNum'
import {
  AGE_BUCKET_KEYS,
  AGE_PIE_COLORS,
  CHILD_COLOR,
  FEMALE_COLOR,
  GENDER_PIE_COLORS,
  MALE_COLOR,
  tooltipStyle,
} from './analyticsHelpers'
import SectionHeading from './SectionHeading'

// ─── Pictogram silhouettes ────────────────────────────────────────────────────
function MaleSilhouette() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="-5 -10 110 115" className="h-full w-full" aria-hidden="true">
      <path fill={MALE_COLOR} d="m59 24c5.5234 0 10 4.4766 10 10v20.75c0 1.793-1.457 3.25-3.25 3.25s-3.25-1.457-3.25-3.25v-20.75h-2.5v56.75c0 2.3477-1.9023 4.25-4.25 4.25s-4.25-1.9023-4.25-4.25v-32.75h-3v32.75c0 2.3477-1.9023 4.25-4.25 4.25s-4.25-1.9023-4.25-4.25v-56.75h-2.5v20.75c0 1.793-1.457 3.25-3.25 3.25s-3.25-1.457-3.25-3.25v-20.75c0-5.5234 4.4766-10 10-10z" />
      <path fill={MALE_COLOR} d="m50 5c4.6953 0 8.5 3.8047 8.5 8.5s-3.8047 8.5-8.5 8.5-8.5-3.8047-8.5-8.5 3.8047-8.5 8.5-8.5z" />
    </svg>
  )
}

function FemaleSilhouette() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="-5 -10 110 115" className="h-full w-full" aria-hidden="true">
      <path fill={FEMALE_COLOR} d="m50 10c-2.0508 0-4.0195 0.82031-5.4688 2.2695s-2.2695 3.4219-2.2695 5.4688c0 2.0508 0.82031 4.0195 2.2695 5.4688s3.4219 2.2695 5.4688 2.2695c2.0508 0 4.0195-0.82031 5.4688-2.2695s2.2695-3.4219 2.2695-5.4688c0-2.0508-0.82031-4.0195-2.2695-5.4688s-3.4219-2.2695-5.4688-2.2695zm-6.8516 19.352s-0.12109 0.03125-0.17188 0.039063h-0.070312c-0.80859 0-1.5195 0.37109-2 0.94922-0.19922 0.21094-0.37891 0.44141-0.51953 0.71094l-12.59 23.41c-0.82812 1.5391-0.26172 3.4492 1.2812 4.2812 1.5391 0.82812 3.4609 0.26172 4.2891-1.2891l10.238-19.031-0.87109 1.6289c0.10938-0.21094 0.32031-0.33984 0.53906-0.35938 0.12891-0.011718 0.26953 0.011719 0.39844 0.078125 0.33984 0.17969 0.46875 0.60156 0.28125 0.94141-2.8516 5.4102-7.6484 14.09-10.859 19.852-1.8086 3.2617-0.26953 5.8984 3.4688 5.8984h4.8984v20.328c0 1.7812 1.4414 3.2188 3.2188 3.2188 1.7812 0 3.2188-1.4297 3.2188-3.2188v-20.328h4.1797v20.328c0 1.7812 1.4297 3.2188 3.2188 3.2188s3.2188-1.4297 3.2188-3.2188v-20.328h4.9297c3.7305 0 5.2891-2.6406 3.4805-5.9102-3.1992-5.7812-7.9883-14.469-10.891-19.852-0.17969-0.33984-0.058594-0.76172 0.28125-0.94141 0.078125-0.050781 0.17188-0.070312 0.26172-0.078124 0.26172-0.019532 0.51953 0.10156 0.66016 0.33984l9.3789 17.43c0.82812 1.5391 2.7383 2.1211 4.2812 1.2891 1.5391-0.82812 2.1211-2.7383 1.2891-4.2812l-12.59-23.41c-0.12109-0.21875-0.26953-0.41016-0.42969-0.60156-0.46875-0.64062-1.2188-1.0586-2.0781-1.0586h-13.691c-0.078126 0-0.23047 0.070312-0.23047-0.011719 0-0.019531 0-0.019531-0.019531-0.019531z" />
    </svg>
  )
}

// ─── Gender Distribution ──────────────────────────────────────────────────────
export function GenderDistribution({ totals, loading }) {
  const { t } = useTranslation()
  const [chartView, setChartView] = useState('bar')

  const maleCount   = totals.maleIn
  const femaleCount = totals.femaleIn
  const total       = maleCount + femaleCount
  const hasData     = total > 0

  const malePercent   = hasData ? (maleCount   / total) * 100 : 0
  const femalePercent = hasData ? (femaleCount  / total) * 100 : 0

  const barData = [
    { label: t('analytics.male'),   value: maleCount,  color: MALE_COLOR },
    { label: t('analytics.female'), value: femaleCount, color: FEMALE_COLOR },
  ]
  const pieData = [
    { name: t('analytics.male'),   value: maleCount },
    { name: t('analytics.female'), value: femaleCount },
  ]

  return (
    <section className="rounded-2xl border border-[#ebebeb] bg-white p-5 shadow-[0px_1px_1px_rgba(0,0,0,0.04)] sm:p-6">
      <SectionHeading
        title={t('analytics.genderDistribution')}
        description={t('analytics.genderDistributionDesc')}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Male tile */}
        <div className="flex flex-col items-center gap-3 rounded-xl border border-[#e8f0ff] bg-[#f5f9ff] p-5">
          <div className="flex w-full items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#dbeafe]">
              <Mars size={14} color={MALE_COLOR} />
            </div>
            <span className="text-sm font-semibold text-[#0070f3]">{t('analytics.male')}</span>
          </div>
          <div className="flex h-24 w-12 items-center justify-center"><MaleSilhouette /></div>
          <div className="text-center">
            <p className="text-3xl font-semibold tabular-nums tracking-tight text-[#171717]">
              {loading ? '—' : arNum(maleCount)}
            </p>
            <p className="mt-0.5 text-lg font-medium tabular-nums text-[#0070f3]">
              {loading ? '—' : `${arNum(malePercent.toFixed(1))}%`}
            </p>
          </div>
          <div className="w-full">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#dbeafe]">
              <div className="h-full rounded-full bg-[#0070f3] transition-all duration-500" style={{ width: `${Math.min(100, malePercent)}%` }} />
            </div>
          </div>
        </div>

        {/* Female tile */}
        <div className="flex flex-col items-center gap-3 rounded-xl border border-[#ffe4f0] bg-[#fff5f9] p-5">
          <div className="flex w-full items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#fce7f3]">
              <Venus size={14} color={FEMALE_COLOR} />
            </div>
            <span className="text-sm font-semibold text-[#eb367f]">{t('analytics.female')}</span>
          </div>
          <div className="flex h-24 w-12 items-center justify-center"><FemaleSilhouette /></div>
          <div className="text-center">
            <p className="text-3xl font-semibold tabular-nums tracking-tight text-[#171717]">
              {loading ? '—' : arNum(femaleCount)}
            </p>
            <p className="mt-0.5 text-lg font-medium tabular-nums text-[#eb367f]">
              {loading ? '—' : `${arNum(femalePercent.toFixed(1))}%`}
            </p>
          </div>
          <div className="w-full">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#fce7f3]">
              <div className="h-full rounded-full bg-[#eb367f] transition-all duration-500" style={{ width: `${Math.min(100, femalePercent)}%` }} />
            </div>
          </div>
        </div>

        {/* Chart tile */}
        <div className="rounded-xl border border-[#ebebeb] bg-white p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[#171717]">{t('analytics.genderAnalytics')}</p>
            <div className="flex gap-0.5 rounded-lg border border-[#ebebeb] bg-[#fafafa] p-0.5">
              {[
                { key: 'bar', icon: <BarChart2 size={11} />, label: t('analytics.graph') },
                { key: 'pie', icon: <PieChartIcon size={11} />, label: t('analytics.pieChart') },
              ].map(({ key, icon, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setChartView(key)}
                  aria-pressed={chartView === key}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${chartView === key ? 'bg-white text-[#171717] shadow-[0_1px_2px_rgba(0,0,0,0.08)]' : 'text-[#8f8f8f] hover:text-[#4d4d4d]'}`}
                >
                  {icon}{label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex h-[180px] items-center justify-center text-sm text-[#8f8f8f]">{t('common.loading')}</div>
          ) : chartView === 'bar' ? (
            <div className="h-[180px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 8, right: 8, left: 16, bottom: 24 }}>
                  <CartesianGrid stroke="#f2f2f2" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#8f8f8f', fontSize: 11 }} label={{ value: t('analytics.gender'), position: 'insideBottom', offset: -12, fill: '#4d4d4d', fontSize: 12, fontWeight: 500 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: '#8f8f8f', fontSize: 10 }} tickFormatter={(v) => v >= 1000 ? `${arNum((v / 1000).toFixed(1))}k` : arNum(v)} allowDecimals={false} domain={hasData ? [0, 'auto'] : [0, 10]} label={{ value: t('analytics.visitorCount'), angle: -90, position: 'insideLeft', offset: 10, fill: '#4d4d4d', fontSize: 12, fontWeight: 500 }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => [arNum(v)]} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={52}>
                    {barData.map((entry, i) => <Cell key={i} fill={hasData ? entry.color : '#e5e7eb'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : hasData ? (
            <div className="h-[180px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={42} outerRadius={66} paddingAngle={3} dataKey="value">
                    {pieData.map((_, i) => <Cell key={i} fill={GENDER_PIE_COLORS[i % GENDER_PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [arNum(v), name]} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: '#8f8f8f' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-[180px] items-center justify-center">
              <div className="relative flex items-center justify-center">
                <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden="true">
                  <circle cx="60" cy="60" r="46" fill="none" stroke="#e5e7eb" strokeWidth="16" />
                </svg>
                <p className="absolute text-[11px] text-[#a1a1a1]">{t('common.noData')}</p>
              </div>
            </div>
          )}

          {!loading && (
            <p className="mt-2 text-[11px] text-[#a1a1a1]">
              {hasData ? t('analytics.basedOnEntries', { count: arNum(total) }) : t('analytics.noEntriesRange')}
            </p>
          )}
        </div>
      </div>
      <p className="mt-4 text-xs text-[#8f8f8f]">{t('analytics.genderPercentNote')}</p>
    </section>
  )
}

// ─── Age Distribution ─────────────────────────────────────────────────────────
export function AgeDistribution({ ageDist, loading }) {
  const { t } = useTranslation()
  const [chartView, setChartView] = useState('pie')

  const buckets = AGE_BUCKET_KEYS.map((key, i) => ({
    key,
    label: t(`analytics.ageBuckets.${key}`),
    value: ageDist[i] ?? 0,
    color: AGE_PIE_COLORS[i],
  }))

  const total = buckets.reduce((sum, b) => sum + b.value, 0)
  const hasData = total > 0
  const pieData = buckets.filter((b) => b.value > 0)

  return (
    <section className="rounded-2xl border border-[#ebebeb] bg-white p-5 shadow-[0px_1px_1px_rgba(0,0,0,0.04)] sm:p-6">
      <SectionHeading
        title={t('analytics.ageDistribution')}
        description={t('analytics.ageDistributionDesc')}
        action={
          <div className="flex gap-0.5 rounded-lg border border-[#ebebeb] bg-[#fafafa] p-0.5">
            {[
              { key: 'pie', icon: <PieChartIcon size={11} />, label: t('analytics.pieChart') },
              { key: 'bar', icon: <BarChart2 size={11} />, label: t('analytics.graph') },
            ].map(({ key, icon, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setChartView(key)}
                aria-pressed={chartView === key}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${chartView === key ? 'bg-white text-[#171717] shadow-[0_1px_2px_rgba(0,0,0,0.08)]' : 'text-[#8f8f8f] hover:text-[#4d4d4d]'}`}
              >
                {icon}{label}
              </button>
            ))}
          </div>
        }
      />

      {loading ? (
        <div className="flex h-[320px] items-center justify-center text-sm text-[#8f8f8f]">{t('common.loading')}</div>
      ) : !hasData ? (
        <div className="flex h-[320px] flex-col items-center justify-center gap-3">
          <div className="relative flex items-center justify-center">
            <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden="true">
              <circle cx="60" cy="60" r="46" fill="none" stroke="#e5e7eb" strokeWidth="16" />
            </svg>
            <p className="absolute text-[11px] text-[#a1a1a1]">{t('common.noData')}</p>
          </div>
          <p className="text-sm text-[#8f8f8f]">{t('analytics.noAgeDataRange')}</p>
        </div>
      ) : chartView === 'pie' ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={72} outerRadius={110} paddingAngle={2} dataKey="value">
                  {pieData.map((entry) => <Cell key={entry.key} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [`${arNum(v)} (${arNum(((v / total) * 100).toFixed(1))}%)`, name]} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: '#8f8f8f' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex w-[300px] flex-col justify-center">
            {/* Column headers */}
            <div className="mb-2 flex items-center gap-3 border-b border-[#ebebeb] pb-2">
              <span className="h-2.5 w-2.5 shrink-0 opacity-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-wide text-[#8f8f8f]">{t('analytics.ageGroup')}</span>
              <span className="w-12 text-right text-xs font-semibold uppercase tracking-wide text-[#8f8f8f]">{t('analytics.entries')}</span>
              <span className="w-10 text-right text-xs font-semibold uppercase tracking-wide text-[#8f8f8f]">%</span>
            </div>
            <div className="flex flex-col gap-2.5">
              {buckets.map((b) => (
                <div key={b.key} className="flex items-center gap-3">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: b.color }} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-sm text-[#4d4d4d]">{b.label}</span>
                  <span className="w-12 text-right tabular-nums text-sm font-medium text-[#171717]">{arNum(b.value)}</span>
                  <span className="w-10 text-right tabular-nums text-xs text-[#8f8f8f]">
                    {total > 0 ? `${arNum(((b.value / total) * 100).toFixed(0))}%` : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={buckets} margin={{ top: 8, right: 12, left: 4, bottom: 32 }}>
              <CartesianGrid stroke="#f2f2f2" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#8f8f8f', fontSize: 10 }} angle={-20} textAnchor="end" height={52} label={{ value: t('analytics.ageGroup'), position: 'insideBottom', offset: -20, fill: '#4d4d4d', fontSize: 12, fontWeight: 500 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: '#8f8f8f', fontSize: 10 }} tickFormatter={(v) => v >= 1000 ? `${arNum((v / 1000).toFixed(1))}k` : arNum(v)} allowDecimals={false} width={48} domain={hasData ? [0, 'auto'] : [0, 10]} label={{ value: t('analytics.visitorCount'), angle: -90, position: 'insideLeft', offset: 10, fill: '#4d4d4d', fontSize: 12, fontWeight: 500 }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [arNum(v), t('analytics.entries')]} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={48}>
                {buckets.map((entry) => <Cell key={entry.key} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {hasData && !loading && (
        <p className="mt-4 text-xs text-[#8f8f8f]">{t('analytics.ageDistNote', { count: arNum(total) })}</p>
      )}
    </section>
  )
}

// ─── Children Analytics ───────────────────────────────────────────────────────
export function ChildrenAnalytics({ loading, totals }) {
  const { t } = useTranslation()
  const hasData = (totals?.childrenIn ?? 0) > 0 || (totals?.childrenOut ?? 0) > 0

  return (
    <section className="rounded-2xl border border-[#ebebeb] bg-white p-5 shadow-[0px_1px_1px_rgba(0,0,0,0.04)] sm:p-6">
      <SectionHeading
        title={t('analytics.childrenAnalytics')}
        description={t('analytics.childrenAnalyticsDesc')}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          { label: t('analytics.childrenEntries'), icon: ArrowDownRight, value: totals?.childrenIn  ?? 0 },
          { label: t('analytics.childrenExits'),   icon: ArrowUpRight,   value: totals?.childrenOut ?? 0 },
        ].map(({ label, icon: Icon, value }) => (
          <div key={label} className="rounded-xl border border-[#f2f2f2] bg-[#fafafa] p-4">
            <div className="flex items-center gap-2">
              <Baby size={19} color={CHILD_COLOR} aria-hidden="true" />
              <h3 className="text-sm font-medium text-[#4d4d4d]">{label}</h3>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="text-2xl font-semibold text-[#171717] tabular-nums">
                {loading ? '—' : arNum(value)}
              </span>
              <Icon size={18} color={CHILD_COLOR} aria-hidden="true" />
            </div>
          </div>
        ))}
      </div>
      {!loading && !hasData && (
        <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-800">
          {t('analytics.noChildrenRange')}
        </p>
      )}
    </section>
  )
}

// ─── Store Comparison Chart ───────────────────────────────────────────────────
export function StoreComparisonChart({ data, loading }) {
  const { t } = useTranslation()

  const emptyState = (message) => (
    <section className="rounded-2xl border border-[#ebebeb] bg-white p-5 shadow-[0px_1px_1px_rgba(0,0,0,0.04)] sm:p-6">
      <SectionHeading title={t('analytics.storeComparison')} description={t('analytics.storeComparisonDesc')} />
      <div className="flex h-[300px] items-center justify-center rounded-xl border border-dashed border-[#ebebeb] text-sm text-[#8f8f8f]">
        {message}
      </div>
    </section>
  )

  if (loading) return emptyState(t('analytics.loadingStoreComparison'))
  if (!data.length) return emptyState(t('analytics.noStoreTraffic'))

  return (
    <section className="rounded-2xl border border-[#ebebeb] bg-white p-5 shadow-[0px_1px_1px_rgba(0,0,0,0.04)] sm:p-6">
      <SectionHeading title={t('analytics.storeComparison')} description={t('analytics.storeComparisonDesc')} />
      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 16, right: 12, left: 20, bottom: 40 }}>
            <CartesianGrid stroke="#f2f2f2" vertical={false} />
            <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: '#8f8f8f', fontSize: 11 }} angle={-18} textAnchor="end" height={56} label={{ value: t('common.store'), position: 'insideBottom', offset: -4, fill: '#4d4d4d', fontSize: 12, fontWeight: 500 }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: '#8f8f8f', fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${arNum((v / 1000).toFixed(1))}k` : arNum(v)} width={52} allowDecimals={false} label={{ value: t('analytics.visitorsEntered'), angle: -90, position: 'insideLeft', offset: 10, fill: '#4d4d4d', fontSize: 12, fontWeight: 500 }} />
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#4d4d4d', fontWeight: 600 }} formatter={(v) => [arNum(v), t('analytics.totalPeopleEntered')]} />
            <Bar dataKey="total" radius={[8, 8, 0, 0]} fill="#0070f3" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
