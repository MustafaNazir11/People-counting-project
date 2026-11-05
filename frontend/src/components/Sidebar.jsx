
import { useState } from 'react'
import {
  LayoutDashboard,
  Store,
  Camera,
  ChartNoAxesCombined,
  FileText,
  GitCompareArrows,
} from 'lucide-react'

const navigation = [
  { label: 'Overview',              icon: LayoutDashboard },
  { label: 'Analytics',             icon: ChartNoAxesCombined },
  { label: 'Store vs Store',        icon: GitCompareArrows, comingSoon: true },
  { label: 'Stores',                icon: Store },
  { label: 'Sensors',               icon: Camera },
  { label: 'Reports',               icon: FileText },
]

export default function Sidebar({ activePage, setActivePage }) {
  const [showComingSoon, setShowComingSoon] = useState(false)

  return (
    <>
      <aside className="flex min-h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white p-5">
        <div className="mb-10 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-sm font-bold text-white">
            HM
          </div>
          <div>
            <h1 className="font-semibold text-slate-900">People Counting </h1>
            <p className="text-xs text-slate-500">Store Management</p>
          </div>
        </div>

        <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Workspace
        </p>

        <nav className="flex-1 space-y-1">
          {navigation.map(({ label, icon: Icon, comingSoon }) => (
            <button
              key={label}
              onClick={() => comingSoon ? setShowComingSoon(true) : setActivePage(label)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm transition ${
                !comingSoon && activePage === label
                  ? 'bg-slate-900 font-medium text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon size={18} />
              <span className="flex-1 text-left">{label}</span>
              {comingSoon && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Soon
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="mt-8 rounded-xl bg-slate-50 p-4">
          <p className="text-sm font-medium">Store workspace</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Monitor your sensors and visitor activity in one place.
          </p>
        </div>
      </aside>

      {/* Coming-soon modal */}
      {showComingSoon && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Coming soon"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={() => setShowComingSoon(false)}
        >
          <div
            className="mx-4 w-full max-w-sm rounded-2xl border border-[#ebebeb] bg-white p-6 shadow-[0_8px_32px_rgba(0,0,0,0.12)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
              <GitCompareArrows size={20} className="text-slate-600" />
            </div>
            <h2 className="text-base font-semibold text-[#171717]">Store vs Store — coming soon</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#4d4d4d]">
              Side-by-side store comparison with traffic, demographics, and trend analysis across multiple locations will be available in a future update.
            </p>
            <button
              type="button"
              onClick={() => setShowComingSoon(false)}
              className="mt-5 w-full rounded-full bg-[#171717] py-2.5 text-sm font-medium text-white transition hover:bg-[#2b2b2b]"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  )
}
