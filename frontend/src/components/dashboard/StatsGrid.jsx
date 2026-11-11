import { Activity, Camera, TrendingUp, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import StatCard from '../StatCard'

export default function StatsGrid() {
  const { t } = useTranslation()

  const stats = [
    {
      label:  t('overview.statTodayVisitors'),
      value:  '1,284',
      change: '+12.8%',
      icon:   Users,
    },
    {
      label:  t('overview.statActiveSensors'),
      value:  '8 / 10',
      change: `2 ${t('overview.statSensorsOffline')}`,
      icon:   Camera,
    },
    {
      label:  t('overview.statStoreActivity'),
      value:  t('overview.statStoreActivityValue'),
      change: t('overview.statStoreActivityChange'),
      icon:   Activity,
    },
    {
      label:  t('overview.statWeeklyVisitors'),
      value:  '8,492',
      change: '+8.2%',
      icon:   TrendingUp,
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => (
        <StatCard key={stat.label} {...stat} />
      ))}
    </div>
  )
}
