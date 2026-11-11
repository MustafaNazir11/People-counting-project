import { AlertCircle, ArrowDownRight, ArrowUpRight, Baby, Mars, Users, Venus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { arNum } from '../../utils/arNum'
import { ENTRY_COLOR, MALE_COLOR, FEMALE_COLOR, CHILD_COLOR, formatUpdatedAt } from './analyticsHelpers'

function TrendBadge({ value }) {
  if (value === undefined) return null
  const positive = value >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium ${positive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
      {positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
      {arNum(Math.abs(value))}%
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
        {loading ? '—' : unavailable ? 'N/A' : arNum(value)}
      </p>
    </div>
  )
}

export default function TrafficCards({ loading, totals, previousTotals, occupancyLoading, occupancyError, occupancy, occupancyUpdatedAt }) {
  const { t } = useTranslation()
  const growthIn = previousTotals.totalIn
    ? Math.round(((totals.totalIn - previousTotals.totalIn) / previousTotals.totalIn) * 100)
    : undefined
  const growthOut = previousTotals.totalOut
    ? Math.round(((totals.totalOut - previousTotals.totalOut) / previousTotals.totalOut) * 100)
    : undefined
  const shown = (value) => loading ? '—' : arNum(value)

  const occupancyValue = occupancyLoading
    ? '—'
    : occupancyError
    ? 'Error'
    : occupancy.total === null
    ? 'N/A'
    : arNum(occupancy.total)

  const cardClass = 'relative flex h-full min-h-[300px] flex-col overflow-hidden rounded-2xl border border-[#ebebeb] bg-white p-5 shadow-[0px_1px_1px_rgba(0,0,0,0.04)] sm:p-6'

  return (
    <section aria-label="Visitor totals" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-[0.1em] text-[#8f8f8f]">{t('analytics.trafficOverview')}</p>
        {occupancyUpdatedAt && (
          <span className="rounded-full border border-[#ebebeb] bg-[#fafafa] px-2.5 py-1 text-[11px] text-[#8f8f8f]">
            {t('common.snapshot')} · {formatUpdatedAt(occupancyUpdatedAt)}
          </span>
        )}
      </div>

      <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-4">
        {/* IN card */}
        <article className={cardClass}>
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#007cf0] to-[#00dfd8]" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-[#171717]">{t('analytics.cardIn')}</h2>
              <p className="mt-1 text-sm text-[#8f8f8f]">{t('analytics.totalEntries')}</p>
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
            <div className="flex justify-center"><Metric icon={Mars} label={t('analytics.male')} value={totals.maleIn} loading={loading} color={MALE_COLOR} /></div>
            <div className="flex justify-center border-x border-[#f2f2f2]"><Metric icon={Venus} label={t('analytics.female')} value={totals.femaleIn} loading={loading} color={FEMALE_COLOR} /></div>
            <div className="flex justify-center"><Metric icon={Baby} label={t('analytics.children')} value={totals.childrenIn} loading={loading} color={CHILD_COLOR} /></div>
          </div>
        </article>

        {/* OUT card */}
        <article className={cardClass}>
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#7928ca] to-[#ff0080]" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-[#171717]">{t('analytics.cardOut')}</h2>
              <p className="mt-1 text-sm text-[#8f8f8f]">{t('analytics.totalExits')}</p>
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
            <div className="flex justify-center"><Metric icon={Mars} label={t('analytics.male')} value={totals.maleOut} loading={loading} color={MALE_COLOR} /></div>
            <div className="flex justify-center border-x border-[#f2f2f2]"><Metric icon={Venus} label={t('analytics.female')} value={totals.femaleOut} loading={loading} color={FEMALE_COLOR} /></div>
            <div className="flex justify-center"><Metric icon={Baby} label={t('analytics.children')} value={totals.childrenOut} loading={loading} color={CHILD_COLOR} /></div>
          </div>
        </article>

        {/* GROUP card */}
        <article className={cardClass}>
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#ff4d4d] to-[#f9cb28]" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-[#171717]">{t('analytics.cardGroup')}</h2>
              <p className="mt-1 text-sm text-[#8f8f8f]">{t('analytics.groupCountedSeparately')}</p>
            </div>
            <Users size={20} color="#f5a623" aria-hidden="true" />
          </div>
          <div className="mt-4 flex flex-col items-center justify-center text-center">
            <p className="text-5xl font-semibold leading-none tracking-[-1.8px] text-[#171717] tabular-nums">{shown(totals.groupIn)}</p>
            <p className="mt-2 text-sm text-[#8f8f8f]">{t('analytics.groupIn')}</p>
          </div>
          <p className="mt-auto border-t border-[#ebebeb] pt-5 text-sm leading-relaxed text-[#8f8f8f]">
            {t('analytics.groupCountNote')}
          </p>
        </article>

        {/* NOW card */}
        <article className={`${cardClass} border-[#d3e5ff]`}>
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#0070f3] to-[#00dfd8]" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-[#171717]">{t('analytics.cardNow')}</h2>
              <p className="mt-1 text-sm text-[#8f8f8f]">{t('analytics.currentOccupancy')}</p>
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
          <div className="mt-4 flex flex-col items-center justify-center text-center">
            <p className="text-5xl font-semibold leading-none tracking-[-1.8px] text-[#171717] tabular-nums">
              {occupancyValue}
            </p>
          </div>
          <div className="mt-auto border-t border-[#ebebeb] pt-5">
            <p className="text-sm text-[#8f8f8f]">{t('analytics.sensorReportedOccupancy')}</p>
          </div>
        </article>
      </div>
    </section>
  )
}
