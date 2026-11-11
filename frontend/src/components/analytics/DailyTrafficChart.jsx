import { useState } from 'react'
import { ArrowUpRight, BarChart2 } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useTranslation } from 'react-i18next'
import { arNum } from '../../utils/arNum'
import { ENTRY_COLOR, EXIT_COLOR, tooltipStyle } from './analyticsHelpers'
import SectionHeading from './SectionHeading'

function ChartToggle({ value, onChange }) {
  const { t } = useTranslation()
  return (
    <div className="flex gap-0.5 rounded-lg border border-[#ebebeb] bg-[#fafafa] p-0.5">
      {[
        { key: 'bar',  icon: <BarChart2 size={14} />,    label: t('analytics.bar') },
        { key: 'line', icon: <ArrowUpRight size={14} />, label: t('analytics.line') },
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

export default function DailyTrafficChart({ data, loading, startDate, endDate }) {
  const { t } = useTranslation()
  const [chartType, setChartType] = useState('bar')
  const tickFormatter = (value) => value >= 1000 ? `${arNum((value / 1000).toFixed(1))}k` : arNum(value)

  function dateLabel(value) {
    const [y, m, d] = value.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  const sharedXAxis = <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#8f8f8f', fontSize: 11 }} interval="preserveStartEnd" label={{ value: t('analytics.days'), position: 'insideBottom', offset: -12, fill: '#4d4d4d', fontSize: 12, fontWeight: 500 }} />
  const sharedYAxis = <YAxis tickLine={false} axisLine={false} tick={{ fill: '#8f8f8f', fontSize: 11 }} tickFormatter={tickFormatter} width={48} allowDecimals={false} label={{ value: t('analytics.visitorCount'), angle: -90, position: 'insideLeft', fill: '#4d4d4d', fontSize: 12, fontWeight: 500 }} />
  const sharedTooltip = <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#4d4d4d', fontWeight: 600, marginBottom: 4 }} formatter={(value, name) => [arNum(value), name === 'entries' ? t('analytics.entries') : t('analytics.exits')]} />
  const sharedLegend = <Legend iconType="circle" iconSize={8} formatter={(name) => name === 'entries' ? t('analytics.entries') : t('analytics.exits')} wrapperStyle={{ fontSize: 12, color: '#8f8f8f', paddingTop: 12 }} />

  return (
    <section className="rounded-2xl border border-[#ebebeb] bg-white p-5 shadow-[0px_1px_1px_rgba(0,0,0,0.04)] sm:p-6">
      <SectionHeading
        title={t('analytics.dailyTraffic')}
        description={t('analytics.dailyTrafficDesc', { start: dateLabel(startDate), end: dateLabel(endDate) })}
        action={<ChartToggle value={chartType} onChange={setChartType} />}
      />
      {!loading && data.length > 0 ? (
        <div className="h-[360px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'bar' ? (
              <BarChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 20 }} barGap={3}>
                <CartesianGrid stroke="#ebebeb" strokeDasharray="4 4" vertical={false} />
                {sharedXAxis}{sharedYAxis}{sharedTooltip}{sharedLegend}
                <Bar dataKey="entries" name="entries" fill={ENTRY_COLOR} radius={[4, 4, 0, 0]} maxBarSize={24} />
                <Bar dataKey="exits"   name="exits"   fill={EXIT_COLOR}  radius={[4, 4, 0, 0]} maxBarSize={24} />
              </BarChart>
            ) : (
              <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 20 }}>
                <CartesianGrid stroke="#ebebeb" strokeDasharray="4 4" vertical={false} />
                {sharedXAxis}{sharedYAxis}{sharedTooltip}{sharedLegend}
                <Line type="monotone" dataKey="entries" name="entries" stroke={ENTRY_COLOR} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="exits"   name="exits"   stroke={EXIT_COLOR}  strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-[360px] items-center justify-center rounded-xl border border-dashed border-[#ebebeb] text-sm text-[#8f8f8f]">
          {loading ? t('analytics.loadingReadings') : t('analytics.noDatesAvailable')}
        </div>
      )}
    </section>
  )
}
