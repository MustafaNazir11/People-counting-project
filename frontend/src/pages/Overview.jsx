import { CalendarDays } from 'lucide-react'
import CameraStatus from '../components/dashboard/CameraStatus'
import StatsGrid from '../components/dashboard/StatsGrid'
import VisitorActivity from '../components/dashboard/VisitorActivity'

export default function Overview() {
  return (
    <>
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-2xl font-semibold tracking-tight">
            Good morning
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Here's what's happening with your store today.
          </p>
        </div>

        <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium">
          <CalendarDays size={17} />
          Today
        </button>
      </div>

      <StatsGrid />

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <VisitorActivity />
        <CameraStatus />
      </div>

      <p className="mt-6 text-xs text-slate-400">
        Demo dashboard · Sample data only · Not connected to your backend yet
      </p>
    </>
  )
}