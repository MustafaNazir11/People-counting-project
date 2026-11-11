import { CalendarDays, Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import CameraStatus from '../components/dashboard/CameraStatus'
import StatsGrid from '../components/dashboard/StatsGrid'
import VisitorActivity from '../components/dashboard/VisitorActivity'

export default function Overview() {
  const { t, i18n } = useTranslation()
  const isArabic = i18n.language === 'ar'

  function toggleLanguage() {
    const newLang = isArabic ? 'en' : 'ar'
    i18n.changeLanguage(newLang)
    localStorage.setItem('language', newLang)
    document.documentElement.dir = newLang === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.lang = newLang
  }

  return (
    <>
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-2xl font-semibold tracking-tight">
            {t('overview.goodMorning')}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {t('overview.subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Language toggle */}
          <button
            type="button"
            onClick={toggleLanguage}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            aria-label={t('common.switchLanguage')}
          >
            <Languages size={16} className="text-slate-500" />
            <span className={isArabic ? 'text-slate-400' : ''}>EN</span>
            <span className="text-slate-300">/</span>
            <span className={!isArabic ? 'text-slate-400' : ''}>AR</span>
          </button>

          <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium">
            <CalendarDays size={17} />
            {t('overview.today')}
          </button>
        </div>
      </div>

      <StatsGrid />

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <VisitorActivity />
        <CameraStatus />
      </div>

      <p className="mt-6 text-xs text-slate-400">
        {t('overview.demoNote')}
      </p>
    </>
  )
}
