import { useState } from 'react'
import { CalendarDays, Languages } from 'lucide-react'
import CameraStatus from '../components/dashboard/CameraStatus'
import StatsGrid from '../components/dashboard/StatsGrid'
import VisitorActivity from '../components/dashboard/VisitorActivity'

export default function Overview() {
  const [showLangNotice, setShowLangNotice] = useState(false)

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

        <div className="flex items-center gap-2">
          {/* Language toggle */}
          <button
            type="button"
            onClick={() => setShowLangNotice(true)}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            aria-label="Switch language"
          >
            <Languages size={16} className="text-slate-500" />
            <span>EN</span>
            <span className="text-slate-300">/</span>
            <span className="text-slate-400">AR</span>
          </button>

          <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium">
            <CalendarDays size={17} />
            Today
          </button>
        </div>
      </div>

      {/* Arabic coming-soon notice */}
      {showLangNotice && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Language notice"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={() => setShowLangNotice(false)}
        >
          <div
            className="mx-4 w-full max-w-sm rounded-2xl border border-[#ebebeb] bg-white p-6 shadow-[0_8px_32px_rgba(0,0,0,0.12)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#f5f9ff]">
              <Languages size={20} color="#0070f3" />
            </div>
            <h2 className="text-base font-semibold text-[#171717]">Arabic coming soon</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#4d4d4d]">
              Arabic language support is currently in development and will be available in a future update. The interface will include full right-to-left layout support.
            </p>
            <button
              type="button"
              onClick={() => setShowLangNotice(false)}
              className="mt-5 w-full rounded-full bg-[#171717] py-2.5 text-sm font-medium text-white transition hover:bg-[#2b2b2b]"
            >
              Got it
            </button>
          </div>
        </div>
      )}

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
