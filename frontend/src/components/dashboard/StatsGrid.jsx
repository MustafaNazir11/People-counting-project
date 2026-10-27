import { Activity, Camera, TrendingUp, Users } from 'lucide-react'
import StatCard from '../StatCard'

const stats = [
  {
    label: "Today's visitors",
    value: '1,284',
    change: '+12.8%',
    icon: Users,
  },
  {
    label: 'Active sensors',
    value: '8 / 10',
    change: '2 offline',
    icon: Camera,
  },
  {
    label: 'Store activity',
    value: 'Normal',
    change: 'All systems stable',
    icon: Activity,
  },
  {
    label: 'Weekly visitors',
    value: '8,492',
    change: '+8.2%',
    icon: TrendingUp,
  },
]

export default function StatsGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => (
        <StatCard key={stat.label} {...stat} />
      ))}
    </div>
  )
}
