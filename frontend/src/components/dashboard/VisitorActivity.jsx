import { useTranslation } from 'react-i18next'

export default function VisitorActivity() {
  const { t } = useTranslation()

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 xl:col-span-2">
      <h3 className="font-semibold">{t('overview.visitorActivity')}</h3>
      <p className="mt-1 text-sm text-slate-500">
        {t('overview.visitorActivityDesc')}
      </p>
      <div className="mt-6 flex h-64 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-400">
        {t('overview.analyticsChartNext')}
      </div>
    </section>
  )
}
